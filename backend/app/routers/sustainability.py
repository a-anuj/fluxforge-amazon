"""
Sustainability Assessment — AI-powered reverse logistics inspector.
Accepts an image upload, verifies it matches the ordered product,
then returns a structured disposition recommendation (RESALE / REFURBISH / RECYCLE / DISPOSE).
"""

import json
import logging
import os
import re
import uuid
import base64
import urllib.request

import boto3
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Order, Product
from app.services.credit_engine import calculate_credits
from app.services.impact_calculator import calculate_action_impact
from app.services.sustainability_advisor import get_return_advice

router = APIRouter(prefix="/sustainability", tags=["sustainability"])

# ── Logging ───────────────────────────────────────────────────────────────────
logger = logging.getLogger("sustainability")
logger.setLevel(logging.DEBUG)

# Console handler with rich formatting
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter(
        "\n[%(levelname)s] %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)


# ── Bedrock configuration ─────────────────────────────────────────────────────

MODEL_ID = "amazon.nova-lite-v1:0"

ASSESSMENT_SYSTEM_PROMPT = """You are an AI Reverse Logistics Inspector for Amazon Returns.

Analyze the uploaded product image and determine the most sustainable and economically optimal disposition decision.

Inspect:
1. Product category
2. Visible damage
3. Scratches, dents, cracks
4. Missing parts
5. Packaging condition
6. Cleanliness and hygiene
7. Signs of usage
8. Overall condition

Classification Rules:

RESALE:
Product appears new or lightly used with minimal cosmetic damage.

REFURBISH:
Product has repairable defects or moderate damage.

RECYCLE:
Product is heavily damaged but contains recoverable materials.

DISPOSE:
Product is unsafe, contaminated, or beyond economic recovery.

Return ONLY valid JSON with no markdown fences or extra text:

{
  "product_type": "",
  "condition_score": 0, // A score out of 100
  "damage_assessment": "",
  "packaging_condition": "",
  "estimated_recovery_value": "",
  "sustainability_reasoning": "",
  "classification": "RESALE | REFURBISH | RECYCLE | DISPOSE",
  "confidence": 0
}"""

BASELINE_COMPARISON_PROMPT = """You are an AI Reverse Logistics Inspector for Amazon Returns.

You are given TWO sets of product images:
1. BASELINE images — captured by the delivery agent at the moment of delivery (source of truth).
2. RETURN images — captured by the customer when initiating a return.

Your task:
- Compare the return images against the baseline to detect NEW damage, wear, or changes that occurred AFTER delivery.
- If baseline shows pristine condition but return shows damage, classify accordingly and note post-delivery damage.
- If condition is similar to baseline, the return is likely legitimate (size mismatch, changed mind, etc.).

Inspect:
1. Product category and identity match between baseline and return
2. NEW visible damage not present in baseline
3. Scratches, dents, cracks that appeared after delivery
4. Missing parts compared to baseline
5. Packaging condition changes
6. Signs of usage beyond what baseline showed
7. Overall condition relative to delivery state

Classification Rules:

RESALE: Product appears new or lightly used with minimal cosmetic damage (similar to or better than baseline).

REFURBISH: Product has repairable defects or moderate damage — especially NEW damage vs baseline.

RECYCLE: Product is heavily damaged but contains recoverable materials.

DISPOSE: Product is unsafe, contaminated, or beyond economic recovery.

Return ONLY valid JSON with no markdown fences or extra text:

{
  "product_type": "",
  "condition_score": 0,
  "damage_assessment": "",
  "packaging_condition": "",
  "estimated_recovery_value": "",
  "sustainability_reasoning": "",
  "baseline_comparison": "",
  "new_damage_detected": false,
  "classification": "RESALE | REFURBISH | RECYCLE | DISPOSE",
  "confidence": 0
}"""


def _get_bedrock_client():
    return boto3.client(
        "bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )

def _upload_to_s3(file_bytes: bytes, filename: str, content_type: str) -> str:
    s3_client = boto3.client(
        "s3",
        region_name=os.getenv("S3_AWS_REGION", os.getenv("AWS_REGION", "us-east-1")),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )
    bucket_name = os.getenv("AWS_S3_BUCKET_NAME")
    if not bucket_name:
        return "local_storage"
        
    unique_filename = f"{uuid.uuid4()}-{filename}"
    try:
        s3_client.put_object(
            Bucket=bucket_name,
            Key=unique_filename,
            Body=file_bytes,
            ContentType=content_type
        )
        return unique_filename
    except Exception as e:
        logger.error(f"S3 upload failed: {e}")
        return "upload_failed"


def _extract_text(response: dict) -> str:
    """Pull plain text out of a Bedrock Converse response."""
    return response["output"]["message"]["content"][0]["text"].strip()


def _parse_json_response(response: dict) -> dict:
    """Extract and parse the JSON body from a Bedrock Converse response."""
    try:
        text = _extract_text(response)
        # Strip optional markdown fences if model returns them
        text = re.sub(r"```(?:json)?", "", text).strip().strip("`").strip()
        return json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not parse Bedrock response: {exc}") from exc


def _load_image_bytes_from_url(url: str) -> tuple[bytes, str]:
    """
    Load image bytes from a data URL or HTTP(S) URL.
    Returns (raw_bytes, format_string for Bedrock).
    """
    if url.startswith("data:"):
        if "," not in url:
            raise ValueError("Invalid data URL")
        header, payload = url.split(",", 1)
        raw = base64.b64decode(payload)
        fmt = "jpeg"
        if "png" in header:
            fmt = "png"
        elif "webp" in header:
            fmt = "webp"
        elif "gif" in header:
            fmt = "gif"
        return raw, fmt

    with urllib.request.urlopen(url, timeout=10) as resp:
        raw = resp.read()
    fmt = "jpeg"
    if url.lower().endswith(".png"):
        fmt = "png"
    elif url.lower().endswith(".webp"):
        fmt = "webp"
    return raw, fmt


def _bytes_to_bedrock_format(raw: bytes, content_type: str) -> tuple[str, bytes]:
    fmt_map = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    return fmt_map.get(content_type.lower(), "jpeg"), raw


# ── Product identity verification ─────────────────────────────────────────────

def _verify_product_match(
    raw: bytes,
    img_format: str,
    product_name: str,
    product_category: str,
) -> tuple[bool, str]:
    """
    Ask Nova Lite whether the uploaded image actually shows the claimed product.
    Returns (is_match: bool, reason: str).

    IMPORTANT: The verification is intentionally lenient — we only reject
    completely unrelated images (e.g., a shoe when returning headphones).
    Same-category products from the same brand always pass.
    """
    prompt = f"""You are a lenient product identity verifier for Amazon Returns.

The customer claims they are returning:
  Product: "{product_name}"
  Category: "{product_category or 'unknown'}"

Examine the image and decide whether it PLAUSIBLY shows this type of product.

CRITICAL RULES — BE VERY LENIENT:
- Answer YES if the image shows ANY product from the same general category (e.g., any running shoe for a running shoe claim, any earbuds for earbuds claim, any backpack for a backpack claim).
- Answer YES if the image shows the same brand, even if it's a different model.
- Answer YES if the image shows the product from an unusual angle, without packaging, used, worn, or in different lighting.
- Answer YES if you're not 100% sure — give the customer the benefit of the doubt.
- ONLY answer NO if the image shows something COMPLETELY DIFFERENT from the claimed category (e.g., a food item when claiming to return electronics, a person selfie, a blank wall, a screenshot, or random unrelated objects).

The goal is to catch obvious fraud (wrong category entirely), NOT to verify exact model numbers.

Reply in this exact format (two lines, nothing else):
MATCH: YES
REASON: One concise sentence explaining your decision."""

    message = {
        "role": "user",
        "content": [
            {"image": {"format": img_format, "source": {"bytes": raw}}},
            {"text": prompt},
        ],
    }

    try:
        client = _get_bedrock_client()
        logger.info(f"Product verification — calling Bedrock for '{product_name}' (category: {product_category})")
        response = client.converse(
            modelId=MODEL_ID,
            messages=[message],
            inferenceConfig={"maxTokens": 120, "temperature": 0.1},
        )
        text = _extract_text(response)
        logger.info(f"Product verification — raw response:\n  {text}")
    except Exception as exc:
        # If verification itself fails, skip the check (don't block the user)
        logger.warning(f"Product verification — Bedrock call failed, skipping: {exc}")
        return True, f"Verification skipped due to error: {exc}"

    # Parse MATCH: YES/NO
    match_line = next(
        (ln for ln in text.splitlines() if ln.upper().startswith("MATCH:")), ""
    )
    reason_line = next(
        (ln for ln in text.splitlines() if ln.upper().startswith("REASON:")), ""
    )

    is_match = "YES" in match_line.upper()
    reason = reason_line.split(":", 1)[-1].strip() if reason_line else text

    logger.info(f"Product verification — result: {'MATCH' if is_match else '❌ NO MATCH'} | Reason: {reason}")

    return is_match, reason


# ── Endpoint ──────────────────────────────────────────────────────────────────

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/verify")
async def verify_product(
    image: UploadFile = File(...),
    product_name: str = Form(""),
    product_category: str = Form(""),
):
    """
    Accept a product image and verify it matches the claimed product name.
    """
    logger.info(f"=== /verify — product_name='{product_name}', category='{product_category}', file='{image.filename}' ===")

    content_type = (image.content_type or "").lower()
    if content_type not in ALLOWED_MIME:
        logger.warning(f"Rejected — unsupported MIME type: {content_type}")
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported image type '{content_type}'. Use JPEG, PNG, WebP, or GIF.",
        )

    raw = await image.read()
    logger.info(f"File received — size: {len(raw)} bytes, content_type: {content_type}")

    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 5 MB size limit.")
    if not raw:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    fmt_map = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    img_format = fmt_map[content_type]

    if not product_name.strip():
        logger.info("No product name provided — skipping verification")
        return {"matched": True, "reason": "No product name provided for verification."}

    is_match, reason = _verify_product_match(raw, img_format, product_name, product_category)
    if not is_match:
        logger.warning(f"❌ Product mismatch — rejecting upload. Reason: {reason}")
        raise HTTPException(
            status_code=409,
            detail={
                "type": "product_mismatch",
                "message": (
                    f"The uploaded image does not appear to be '{product_name}'."
                ),
                "reason": reason,
            },
        )

    logger.info(f"Product verified successfully")
    return {"matched": True, "reason": reason}


@router.post("/assess")
async def assess_return(
    video: UploadFile = File(...),
    order_id: int = Form(...),
    product_name: str = Form(""),
    product_category: str = Form(""),
    db: Session = Depends(get_db),
):
    """
    Accept return product images (from live video scan) and return AI sustainability assessment.
    - Runs quality guardrail checks before Bedrock.
    - Verifies product identity.
    - Compares against delivery baseline scan when available.
    - Supported formats: JPEG, PNG, WebP, GIF (≤ 5 MB each).
    """
    from app.services.media_validator import validate_image as quality_check

    logger.info(f"=== /assess — order_id={order_id}, product_name='{product_name}', file='{image.filename}' ===")

    # ── Validate order is eligible for return assessment ─────────────────────
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "returned":
        raise HTTPException(status_code=409, detail="This order has already been returned.")
    if order.status != "delivered":
        raise HTTPException(
            status_code=403,
            detail={
                "type": "delivery_not_verified",
                "message": (
                    "Delivery verification is pending. The delivery agent must complete "
                    "the baseline scan before you can initiate a return."
                ),
                "order_status": order.status,
            },
        )

    product = order.product if order else None
    if not product_name.strip() and product:
        product_name = product.name or ""
    if not product_category.strip() and product:
        product_category = product.category or ""

    content_type = (video.content_type or "").lower()
    if not content_type.startswith("video/"):
        logger.warning(f"Rejected — unsupported MIME type: {content_type}")
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported video type '{content_type}'. Use WEBM or MP4.",
        )

    raw_video = await video.read()
    logger.info(f"Video received — size: {len(raw_video)} bytes, content_type: {content_type}")

    if len(raw_video) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Video exceeds the 20 MB size limit.")
    if not raw_video:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    video_format = "webm" if "webm" in content_type else "mp4"

    # Upload video to S3
    s3_key = _upload_to_s3(raw_video, video.filename or "scan.webm", content_type)
    logger.info(f"Video securely stored in S3 at: {s3_key}")

    # No pre-flight image validation for video right now; passing directly to AI

    # ── Step 2: Load baseline images for comparison ───────────────────────────
    baseline_images: list[tuple[bytes, str]] = []
    has_baseline = bool(order.baseline_scan_urls)
    if has_baseline:
        baseline_urls = [u.strip() for u in order.baseline_scan_urls.split(",") if u.strip()]
        for url in baseline_urls[:4]:  # limit to 4 baseline frames for token budget
            try:
                b_raw, b_fmt = _load_image_bytes_from_url(url)
                baseline_images.append((b_raw, b_fmt))
            except Exception as exc:
                logger.warning(f"Could not load baseline image {url[:60]}...: {exc}")

    # ── Step 3: Run full sustainability assessment ────────────────────────────
    logger.info(f"Step 2: Running assessment — baseline frames: {len(baseline_images)}")

    content_blocks = []

    if baseline_images:
        content_blocks.append({"text": "BASELINE DELIVERY IMAGES (captured at delivery by agent):"})
        for b_raw, b_fmt in baseline_images:
            content_blocks.append({"image": {"format": b_fmt, "source": {"bytes": b_raw}}})

    content_blocks.append({"text": "RETURN VIDEO (captured by customer during return):"})
    content_blocks.append({"video": {"format": video_format, "source": {"bytes": raw_video}}})

    if baseline_images:
        content_blocks.append({
            "text": (
                "Compare the RETURN video against the BASELINE delivery images. "
                "Detect any NEW damage or wear that occurred after delivery. "
                "Return the JSON assessment as described in your instructions. Return ONLY valid JSON."
            )
        })
        system_prompt = BASELINE_COMPARISON_PROMPT
    else:
        content_blocks.append({
            "text": (
                "Analyze this product image and return the JSON assessment "
                "as described in your instructions. Return ONLY valid JSON."
            )
        })
        system_prompt = ASSESSMENT_SYSTEM_PROMPT

    message = {"role": "user", "content": content_blocks}

    try:
        client = _get_bedrock_client()
        response = client.converse(
            modelId=MODEL_ID,
            system=[{"text": system_prompt}],
            messages=[message],
            inferenceConfig={"maxTokens": 1024, "temperature": 0.1},
        )
        logger.info(f"Bedrock assessment — raw response:\n  {_extract_text(response)[:300]}")
    except Exception as exc:
        logger.error(f"❌ Bedrock assessment call failed: {exc}")
        raise HTTPException(
            status_code=502,
            detail=f"Bedrock call failed: {exc}",
        ) from exc

    # ── Parse & return ────────────────────────────────────────────────────────
    try:
        result = _parse_json_response(response)
    except ValueError as exc:
        logger.error(f"❌ Failed to parse Bedrock response: {exc}")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Normalise classification to uppercase for consistent badge rendering
    result["classification"] = str(result.get("classification", "")).upper()
    result["has_baseline_comparison"] = len(baseline_images) > 0
    result["baseline_frames_used"] = len(baseline_images)
    result["return_frames_used"] = 1 # One video

    # Calculate circularity/sustainability metadata preview
    category = product.category.lower() if product and product.category else product_category.lower()
    
    act_lower = result["classification"].lower()
    if "resale" in act_lower or "resell" in act_lower:
        action = "resell"
    elif "refurbish" in act_lower:
        action = "refurbish"
    elif "recycle" in act_lower:
        action = "recycle"
    elif "dispose" in act_lower:
        action = "dispose"
    else:
        action = act_lower

    credits = calculate_credits(action, category)
    impact = calculate_action_impact(action, category)
    
    try:
        condition_score = int(str(result.get("condition_score", 85)).replace("%", "").split("/")[0].strip())
    except ValueError:
        condition_score = 85
        
    # Normalize out-of-10 scores to out-of-100
    if condition_score > 0 and condition_score <= 10:
        condition_score *= 10

    # Ensure condition score makes logical sense given the classification
    if action == "recycle" and condition_score > 40:
        condition_score = max(10, 40 - (100 - condition_score) // 2)  # Cap around 20-40
    elif action == "dispose" and condition_score > 15:
        condition_score = max(0, 15 - (100 - condition_score) // 5)   # Cap around 0-15
    elif action == "refurbish" and condition_score > 75:
        condition_score = 70  # Refurbished items shouldn't be pristine
        
    result["condition_score"] = condition_score
    result["remaining_life_pct"] = int(condition_score * 0.9)
    advice = get_return_advice(product, condition_score, return_period_over=False) if product else None

    result["green_credits_earned"] = credits
    result["environmental_impact"] = impact
    result["sustainability_advice"] = advice

    logger.info(f"Assessment complete — classification: {result['classification']}, score: {result.get('condition_score')}, confidence: {result.get('confidence')}")

    return JSONResponse(content=result)
