"""
Packaging Baseline Scan Router

Allows an admin packaging operator to capture a multi-angle baseline scan
of a product before it is packed for delivery. This scan is stored against
the Order and later used by the AI to compare against return photos —
detecting damage that occurred after the product left packaging.

Endpoints:
    POST /baseline/{order_id}/scan     — operator uploads baseline scan video + snapshot image.
                                         AI verifies the snapshot matches the ordered product
                                         before the scan is accepted.
    GET  /baseline/{order_id}          — get baseline scan info for an order
    GET  /baseline/pending/list        — list orders pending a baseline scan
"""

import os
import json
import logging
import uuid
import base64
from datetime import datetime, timezone
from typing import List, Optional

import boto3
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order, User, Product
from app.services.product_verifier import verify_product_identity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/baseline", tags=["baseline-scan"])


# ── S3 helper (optional — falls back to storing data URLs directly) ──────────

def _try_upload_to_s3(data_url: str, key: str) -> str:
    """
    Upload a base64 data URL to S3. Returns S3 URL on success,
    or the original data URL as fallback if S3 is not configured.
    """
    try:
        bucket = os.getenv("AWS_S3_BUCKET_NAME")
        if not bucket:
            return data_url  # No S3 configured — store data URL directly

        # Parse data URL: "data:image/jpeg;base64,<payload>"
        if "," not in data_url:
            return data_url
        header, payload = data_url.split(",", 1)
        image_bytes = base64.b64decode(payload)

        s3 = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )

        # Determine content type
        content_type = "image/jpeg"
        if "png" in header:
            content_type = "image/png"
        elif "webp" in header:
            content_type = "image/webp"

        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=image_bytes,
            ContentType=content_type,
        )
        region = os.getenv("AWS_REGION", "us-east-1")
        return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"

    except Exception as e:
        logger.warning(f"S3 upload failed, using data URL fallback: {e}")
        return data_url


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/{order_id}/scan")
async def submit_baseline_scan(
    order_id: int,
    employee_id: int = Form(...),
    video: UploadFile = File(...),
    snapshot: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Operator submits a packaging baseline scan before the item is packed.

    Accepts:
        video    — full live-scan video recording (webm/mp4)
        snapshot — a still-frame image captured from the live scan.
                   This snapshot is passed to Bedrock vision to verify the
                   scanned product matches the ordered product before the
                   scan is accepted.
    """
    # ── Validate order ─────────────────────────────────────────────────
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # ── Validate employee ──────────────────────────────────────────────
    employee = db.query(User).filter(User.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if employee.role not in {"employee", "admin"}:
        raise HTTPException(status_code=403, detail="Only operators can submit baseline scans")

    # ── Validate file types ────────────────────────────────────────────
    if not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type for 'video'. Video expected.")
    if not snapshot.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type for 'snapshot'. Image (JPEG/PNG/WebP) expected.")

    # ── Check for duplicate scan ───────────────────────────────────────
    if order.baseline_scan_urls:
        raise HTTPException(
            status_code=409,
            detail="Baseline scan already recorded for this order. Cannot overwrite."
        )

    # ── AI Product Identity Verification ──────────────────────────────
    product = db.query(Product).filter(Product.id == order.product_id).first()

    snapshot_bytes = await snapshot.read()
    verification = {"verified": True, "ai_unavailable": True}  # default: pass if product unknown

    if product:
        verification = verify_product_identity(
            image_bytes=snapshot_bytes,
            image_content_type=snapshot.content_type,
            expected_product_name=product.name,
            expected_category=product.category or "General",
        )
        logger.info(
            f"Product verification for order {order_id}: "
            f"verified={verification['verified']}, "
            f"detected='{verification.get('detected_product')}', "
            f"confidence={verification.get('confidence')}"
        )

        # Block the scan when AI is confident the WRONG product is being packed
        confident_mismatch = (
            not verification["verified"]
            and verification.get("confidence") in {"high", "medium"}
            and not verification.get("ai_unavailable")
        )
        if confident_mismatch:
            raise HTTPException(
                status_code=422,
                detail={
                    "type": "product_mismatch",
                    "message": (
                        f"The scanned item does not match the ordered product. "
                        f"Expected: '{product.name}' (category: {product.category}). "
                        f"Detected: '{verification.get('detected_product')}'. "
                        f"Reason: {verification.get('reason')}"
                    ),
                    "expected_product": product.name,
                    "expected_category": product.category,
                    "detected_product": verification.get("detected_product"),
                    "confidence": verification.get("confidence"),
                    "reason": verification.get("reason"),
                },
            )

    # ── Upload video to S3 (or local fallback) ─────────────────────────
    raw_bytes = await video.read()
    key = f"baseline-scans/order-{order_id}/video-{uuid.uuid4().hex[:8]}.webm"

    try:
        bucket = os.getenv("AWS_S3_BUCKET_NAME")
        if bucket:
            s3 = boto3.client(
                "s3",
                region_name=os.getenv("AWS_REGION", "us-east-1"),
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            )
            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=raw_bytes,
                ContentType=video.content_type,
            )
            region = os.getenv("AWS_REGION", "us-east-1")
            url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
        else:
            url = f"/local-video/{key}"
    except Exception as e:
        logger.warning(f"S3 upload failed: {e}")
        url = f"/local-video/{key}"

    # ── Persist scan ───────────────────────────────────────────────────
    order.baseline_scan_urls = url
    order.baseline_scan_at = datetime.now(timezone.utc)
    order.baseline_scan_employee_id = employee_id

    if order.status == "placed":
        order.status = "delivered"

    db.commit()

    ai_note = None
    if verification.get("ai_unavailable"):
        ai_note = "AI product verification was unavailable; scan recorded without identity check."

    return {
        "success": True,
        "order_id": order_id,
        "baseline_scan_at": order.baseline_scan_at.isoformat(),
        "employee": employee.name,
        "product": product.name if product else f"Product #{order.product_id}",
        "product_verified": verification.get("verified"),
        "detected_product": verification.get("detected_product"),
        "verification_confidence": verification.get("confidence"),
        "message": "Live video baseline scan recorded successfully.",
        **(  {"ai_warning": ai_note} if ai_note else {}  ),
    }


@router.get("/{order_id}")
def get_baseline_scan(order_id: int, db: Session = Depends(get_db)):
    """
    Get the baseline scan info for a given order.
    Returns scan metadata and image count (not the raw images, for bandwidth).
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    product = db.query(Product).filter(Product.id == order.product_id).first()
    customer = db.query(User).filter(User.id == order.user_id).first()

    has_scan = bool(order.baseline_scan_urls)
    scan_urls = order.baseline_scan_urls.split(",") if has_scan else []

    employee = None
    if order.baseline_scan_employee_id:
        emp = db.query(User).filter(User.id == order.baseline_scan_employee_id).first()
        if emp:
            employee = {"id": emp.id, "name": emp.name, "zone": emp.employee_zone}

    return {
        "order_id": order_id,
        "has_baseline_scan": has_scan,
        "angles_count": len(scan_urls),
        "scan_urls": scan_urls,          # actual URLs for AI comparison
        "baseline_scan_at": order.baseline_scan_at.isoformat() if order.baseline_scan_at else None,
        "employee": employee,
        "product": {
            "id": product.id if product else None,
            "name": product.name if product else f"Product #{order.product_id}",
            "return_period_days": product.return_period_days if product else 7,
            "has_no_return_policy": product.has_no_return_policy if product else False,
        },
        "customer": {
            "id": customer.id if customer else None,
            "name": customer.name if customer else "Unknown",
        },
    }


@router.get("/pending/list")
def get_pending_baseline_orders(employee_id: int, db: Session = Depends(get_db)):
    """
    Returns orders that have been placed but not yet received a baseline scan.
    Admin operators see these on their dashboard to know which packages need scanning.
    """
    employee = db.query(User).filter(User.id == employee_id).first()
    if not employee or employee.role not in {"employee", "admin"}:
        raise HTTPException(status_code=403, detail="Operator access required")

    # Admin packaging flow: only orders waiting for the initial scan.
    if employee.role == "admin":
        pending = db.query(Order).filter(
            Order.baseline_scan_urls.is_(None),
            Order.status == "placed",
        ).order_by(Order.id.desc()).limit(20).all()
    else:
        pending = db.query(Order).filter(
            (Order.baseline_scan_urls.is_(None) & Order.status.in_(["placed", "delivered"])) |
            (Order.status == "return_pending")
        ).order_by(Order.id.desc()).limit(20).all()

    result = []
    from app.models import Return
    for order in pending:
        product = db.query(Product).filter(Product.id == order.product_id).first()
        customer = db.query(User).filter(User.id == order.user_id).first()
        
        is_return = order.status == "return_pending"
        return_id = None
        if is_return:
            ret = db.query(Return).filter(Return.order_id == order.id, Return.status == "pending_pickup").first()
            if ret:
                return_id = ret.id
            else:
                continue # Skip if return not found in expected state
                
        result.append({
            "order_id": order.id,
            "product_name": product.name if product else f"Product #{order.product_id}",
            "product_image": product.image_url if product else None,
            "customer_name": customer.name if customer else "Unknown",
            "customer_pincode": customer.pincode if customer else None,
            "return_period_days": product.return_period_days if product else 7,
            "has_no_return_policy": product.has_no_return_policy if product else False,
            "placed_at": order.placed_at.isoformat() if order.placed_at else None,
            "is_return": is_return,
            "return_id": return_id,
        })

    return result
