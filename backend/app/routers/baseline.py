"""
Delivery Baseline Scan Router

Allows Amazon delivery employees to capture a multi-angle baseline scan
of a product at the moment of delivery. This scan is stored against the
Order and later used by the AI to compare against return photos — detecting
damage that occurred after delivery.

Endpoints:
  POST /baseline/{order_id}/scan     — employee uploads baseline scan images
  GET  /baseline/{order_id}          — get baseline scan info for an order
  GET  /baseline/pending?employee_id — list orders pending a baseline scan
"""

import os
import json
import logging
import uuid
import base64
from datetime import datetime, timezone
from typing import List, Optional

import boto3
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order, User, Product

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
def submit_baseline_scan(
    order_id: int,
    employee_id: int = Body(...),
    images: List[str] = Body(..., description="List of base64 data URLs, one per scan angle"),
    db: Session = Depends(get_db),
):
    """
    Employee submits a multi-angle baseline scan at delivery time.
    Expects 4–7 base64 image data URLs (one per guided angle).
    """
    # Validate order
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Validate employee
    employee = db.query(User).filter(User.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if employee.role != "employee":
        raise HTTPException(status_code=403, detail="Only delivery employees can submit baseline scans")

    # Validate images
    if not images or len(images) < 2:
        raise HTTPException(status_code=400, detail="Minimum 2 scan angles required")
    if len(images) > 7:
        raise HTTPException(status_code=400, detail="Maximum 7 scan angles allowed")

    # Check if baseline already exists
    if order.baseline_scan_urls:
        raise HTTPException(
            status_code=409,
            detail="Baseline scan already recorded for this order. Cannot overwrite."
        )

    # Upload images (S3 if configured, else store data URLs)
    stored_urls = []
    for i, img_data in enumerate(images):
        key = f"baseline-scans/order-{order_id}/angle-{i+1}-{uuid.uuid4().hex[:8]}.jpg"
        url = _try_upload_to_s3(img_data, key)
        stored_urls.append(url)

    # Save to order
    order.baseline_scan_urls = ",".join(stored_urls)
    order.baseline_scan_at = datetime.now(timezone.utc)
    order.baseline_scan_employee_id = employee_id

    # Mark order as delivered (if not already)
    if order.status == "placed":
        order.status = "delivered"

    db.commit()

    product = db.query(Product).filter(Product.id == order.product_id).first()

    return {
        "success": True,
        "order_id": order_id,
        "angles_recorded": len(stored_urls),
        "baseline_scan_at": order.baseline_scan_at.isoformat(),
        "employee": employee.name,
        "product": product.name if product else f"Product #{order.product_id}",
        "message": f"Baseline scan recorded successfully — {len(stored_urls)} angles captured.",
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
    Employee sees these on their dashboard to know which deliveries need scanning.
    """
    employee = db.query(User).filter(User.id == employee_id).first()
    if not employee or employee.role != "employee":
        raise HTTPException(status_code=403, detail="Employee access required")

    # Orders without baseline scan (status placed or delivered, no baseline_scan_urls)
    pending = db.query(Order).filter(
        Order.baseline_scan_urls.is_(None),
        Order.status.in_(["placed", "delivered"]),
    ).order_by(Order.id.desc()).limit(20).all()

    result = []
    for order in pending:
        product = db.query(Product).filter(Product.id == order.product_id).first()
        customer = db.query(User).filter(User.id == order.user_id).first()
        result.append({
            "order_id": order.id,
            "product_name": product.name if product else f"Product #{order.product_id}",
            "product_image": product.image_url if product else None,
            "customer_name": customer.name if customer else "Unknown",
            "customer_pincode": customer.pincode if customer else None,
            "return_period_days": product.return_period_days if product else 7,
            "has_no_return_policy": product.has_no_return_policy if product else False,
            "placed_at": order.placed_at.isoformat() if order.placed_at else None,
        })

    return result
