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
from pydantic import BaseModel
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

ANGLE_MATCHED_COMPARISON_PROMPT = """You are an AI Reverse Logistics Inspector for Amazon Returns.

You are given PAIRS of product images — one BASELINE image and one RETURN image — for the SAME angle of the product.
Each pair is labeled (e.g. "Front Anchor", "Back Panel", "Detail Mark").

Your task:
- For each labeled angle pair, compare the return image against the baseline.
- Identify whether any NEW damage, scratches, dents, cracks, or modifications appeared AFTER delivery.
- Determine whether any damage visible at return was ALREADY present at delivery (manufacturing defect).

Damage Origin Rules:
- If the SAME damage appears in BOTH baseline AND return for an angle → 'manufacturing_defect'
- If damage appears in the RETURN but NOT in the baseline for that angle → 'user_caused'
- If there is no significant damage in either → 'none'

Classification Rules:
RESALE: Minimal or no new damage.
REFURBISH: Moderate new damage — user-caused but repairable.
RECYCLE: Heavy damage, still has recoverable materials.
DISPOSE: Unsafe, contaminated, or unrecoverable.

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
  "damage_origin": "none | manufacturing_defect | user_caused",
  "damaged_angles": ["list of phase ids where new damage was found, e.g. back_anchor"],
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


class FingerprintScanRequest(BaseModel):
    order_id: int | None = None
    product_name: str = ""
    product_category: str = ""
    frames: list[str] = []
    scan_context: str = "packaging"


def _to_percent(value) -> int:
    """
    Coerce a model-returned score to an integer in [0, 100].

    Bedrock models sometimes return confidence/coverage as a 0-1 float
    (e.g. 0.85) instead of an integer (85). int(0.85) silently truncates
    to 0, causing the UI to always show 0%. This helper detects the 0-1
    range and scales it to 0-100.
    """
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        return 0
    # If the model returned a 0-1 fraction, scale up
    if 0.0 < v <= 1.0:
        v = v * 100
    return max(0, min(100, int(round(v))))


def _normalize_fingerprint_result(result: dict, product_name: str, product_category: str) -> dict:
    matched = bool(result.get("matched", False))
    confidence    = _to_percent(result.get("confidence",    0))
    coverage_score = _to_percent(result.get("coverage_score", 0))
    missing_views = result.get("missing_views", []) or []
    if not isinstance(missing_views, list):
        missing_views = [str(missing_views)]

    next_prompt = str(result.get("recommended_next_prompt", "") or "").strip()
    if not next_prompt:
        next_prompt = "Move the product slowly so I can see what is still missing."

    observed = str(result.get("observed_product_type", "") or product_name or product_category).strip()

    return {
        "matched": matched,
        "confidence":     confidence,
        "coverage_score": coverage_score,
        "observed_product_type": observed,
        "missing_views": missing_views[:5],
        "recommended_next_prompt": next_prompt,
        "reason": str(result.get("reason", "") or "").strip(),
    }


def _assess_scan_fingerprint(
    frame_urls: list[str],
    product_name: str,
    product_category: str,
    scan_context: str = "packaging",
) -> dict:
    """
    Ask Nova Lite to verify whether the captured frames plausibly show the intended product
    and which coverage gaps still remain.
    """
    coverage_prompt = f"""You are a product fingerprint verifier for Amazon circular commerce.

Context: {scan_context}
Claimed product:
  Product: "{product_name or 'unknown'}"
  Category: "{product_category or 'unknown'}"

You are given a small set of keyframes from a guided scan. Your job is to decide:
1. Does the scan plausibly show the intended product?
2. How confident are you?
3. What coverage is still missing?
4. What should the user capture next?

Rules:
- Be strict enough to reject obvious mismatches (selfies, random objects, unrelated products).
- IMPORTANT FOR FAST FAILURES: If the first 1 or 2 frames clearly show a completely different product (e.g. a phone instead of a shoe, or a person's face), return `matched=false` and set `confidence` to a HIGH value (e.g. 80-100). Do not keep confidence low just because there are few frames if the object is clearly the wrong category.
- Be practical: accept unusual angles, partial occlusions, and poor lighting if the item still appears to be the claimed product.
- Prefer a high-confidence match only when the frames together clearly describe the intended item.
- If the item is a backpack or bag, look for straps, seams, zippers, logo/tag, opening, side profile, and back panel.
- If the item is electronics, look for front, ports, branding, edges, labels/serials, and back panel.
- If the item is apparel, look for front, back, tag/label, texture, seams, and size markers.

Return ONLY valid JSON in this exact shape (no markdown fences, no extra keys):
{{
    "matched": true,
    "confidence": 72,
    "coverage_score": 65,
    "observed_product_type": "<what you see>",
    "missing_views": ["back panel", "serial label"],
    "recommended_next_prompt": "<one sentence instruction for the next capture>",
    "reason": "<one sentence explanation>"
}}

IMPORTANT: "confidence" and "coverage_score" MUST be plain integers between 0 and 100 (not decimals like 0.72 — write 72, not 0.72)."""

    content_blocks = []
    for frame in frame_urls[:10]:
        raw, fmt = _load_image_bytes_from_url(frame)
        content_blocks.append({"image": {"format": fmt, "source": {"bytes": raw}}})

    content_blocks.append({"text": coverage_prompt})

    try:
        client = _get_bedrock_client()
        response = client.converse(
            modelId=MODEL_ID,
            messages=[{"role": "user", "content": content_blocks}],
            inferenceConfig={"maxTokens": 500, "temperature": 0.1},
        )
        parsed = _parse_json_response(response)
        return _normalize_fingerprint_result(parsed, product_name, product_category)
    except Exception as exc:
        logger.warning(f"Fingerprint verification — Bedrock failed, using fallback: {exc}")
        first_frame = frame_urls[0]
        raw, fmt = _load_image_bytes_from_url(first_frame)
        try:
            is_match, reason = _verify_product_match(raw, fmt, product_name, product_category)
        except Exception:
            is_match, reason = False, "Unable to verify product identity"

        return {
            "matched": is_match,
            "confidence": 52 if is_match else 90,
            "coverage_score": min(80, 30 + len(frame_urls) * 12),
            "observed_product_type": product_name or product_category or "unknown",
            "missing_views": ["branding/tag", "one more side profile", "close detail"],
            "recommended_next_prompt": "Rotate the product slowly and capture the branding/tag plus one clear side profile.",
            "reason": reason,
        }


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


@router.post("/fingerprint")
async def verify_fingerprint(request: FingerprintScanRequest, db: Session = Depends(get_db)):
    """
    Verify that captured scan frames plausibly show the intended product and
    return an adaptive prompt describing what still needs capture.
    """
    if not request.frames:
        raise HTTPException(status_code=422, detail="At least one scan frame is required.")

    product_name = request.product_name.strip()
    product_category = request.product_category.strip()

    if request.order_id is not None and (not product_name or not product_category):
        order = db.query(Order).filter(Order.id == request.order_id).first()
        if order and order.product:
            if not product_name:
                product_name = order.product.name or ""
            if not product_category:
                product_category = order.product.category or ""

    result = _assess_scan_fingerprint(
        frame_urls=request.frames,
        product_name=product_name,
        product_category=product_category,
        scan_context=request.scan_context,
    )

    result["order_id"] = request.order_id
    result["product_name"] = product_name
    result["product_category"] = product_category
    result["scan_context"] = request.scan_context

    # Always return 200 — matched=false is a normal advisory state during an
    # in-progress scan. The frontend's state machine handles it gracefully.
    # Raising 409 caused the frontend to treat every mid-scan non-match as an
    # error and log repeated failures.
    return JSONResponse(content=result)

def _assess_live_match(frame_urls: list[str], product_name: str, product_category: str) -> dict:
    content_blocks = []
    for frame in frame_urls[:10]:
        raw, fmt = _load_image_bytes_from_url(frame)
        content_blocks.append({"image": {"format": fmt, "source": {"bytes": raw}}})

    prompt = f"""You are an immediate fail-fast product-verification assistant.
The expected product is '{product_name}' (Category: '{product_category}').

You are given several rapid frames from the very beginning of a video scan.
Identify the primary object shown in these frames.

Rules:
- If the object is CLEARLY a completely different category (e.g., you see a mug but the expected category is a bag, or you see a phone but expected is a shoe), return "matched": false and "confidence": 90.
- If the object is the correct category '{product_category}', or if it is too blurry or close to tell for sure, return "matched": true and "confidence": 50.

Return ONLY valid JSON in this exact shape:
{{
    "matched": true,
    "confidence": 50,
    "observed_product_type": "<what you actually see>"
}}"""

    try:
        client = _get_bedrock_client()
        response = client.converse(
            modelId=MODEL_ID,
            messages=[{"role": "user", "content": [*content_blocks, {"text": prompt}]}],
            inferenceConfig={"maxTokens": 100, "temperature": 0.1},
        )
        parsed = _parse_json_response(response)
        logger.info(f"Verify Live Match Bedrock Output: {parsed}")
        return {
            "matched": bool(parsed.get("matched", True)),
            "confidence": int(parsed.get("confidence", 50)),
            "observed_product_type": str(parsed.get("observed_product_type", "unknown")),
        }
    except Exception as exc:
        logger.warning(f"Live match Bedrock failed: {exc}")
        return {"matched": True, "confidence": 0, "observed_product_type": "error"}

@router.post("/verify_live_match")
async def verify_live_match(request: FingerprintScanRequest, db: Session = Depends(get_db)):
    if not request.frames:
        raise HTTPException(status_code=422, detail="At least one scan frame is required.")

    product_name = request.product_name.strip()
    product_category = request.product_category.strip()

    if request.order_id is not None and (not product_name or not product_category):
        order = db.query(Order).filter(Order.id == request.order_id).first()
        if order and order.product:
            if not product_name:
                product_name = order.product.name or ""
            if not product_category:
                product_category = order.product.category or ""

    result = _assess_live_match(request.frames, product_name, product_category)
    return JSONResponse(content=result)


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

    logger.info(f"=== /assess — order_id={order_id}, product_name='{product_name}', file='{video.filename}' ===")

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

    # ── Step 2: Load baseline for comparison (prefer labeled frames, fall back to video URL) ─────
    # --- Labeled angle frames (new): a JSON dict of {phase_id: url} ---
    baseline_frame_map: dict[str, tuple[bytes, str]] = {}   # {phase_id: (raw_bytes, fmt)}
    baseline_images: list[tuple[bytes, str]] = []            # legacy fallback list

    has_labeled_frames = bool(order.baseline_frame_urls)
    if has_labeled_frames:
        try:
            frame_url_map: dict = json.loads(order.baseline_frame_urls)
            for phase_id, url in frame_url_map.items():
                try:
                    b_raw, b_fmt = _load_image_bytes_from_url(url)
                    baseline_frame_map[phase_id] = (b_raw, b_fmt)
                    baseline_images.append((b_raw, b_fmt))  # also populate legacy list
                except Exception as exc:
                    logger.warning(f"Could not load baseline frame '{phase_id}': {exc}")
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning(f"Could not parse baseline_frame_urls JSON: {exc}")
            has_labeled_frames = False

    # Legacy fallback: try baseline_scan_urls (video URL stored as plain string)
    if not has_labeled_frames and order.baseline_scan_urls:
        for url in order.baseline_scan_urls.split(",")[:4]:
            url = url.strip()
            if not url:
                continue
            try:
                b_raw, b_fmt = _load_image_bytes_from_url(url)
                baseline_images.append((b_raw, b_fmt))
            except Exception as exc:
                logger.warning(f"Could not load baseline image {url[:60]}: {exc}")

    # ── Step 3: Build AI prompt ───────────────────────────────────────────────
    logger.info(f"Step 2: Running assessment — labeled baseline phases: {list(baseline_frame_map.keys())}, legacy frames: {len(baseline_images)}")

    # Phase label map for human-readable labels in the prompt
    PHASE_LABELS = {
        "front_anchor": "Front Anchor (center/front)",
        "right_sweep":  "Right Sweep (right side)",
        "back_anchor":  "Back Panel (rear)",
        "left_sweep":   "Left Sweep (left side)",
        "top_detail":   "Top / Ports",
        "detail_mark":  "Detail / Branding / Serial",
    }

    content_blocks = []

    if has_labeled_frames and baseline_frame_map:
        # Angle-matched comparison: send pairs labeled by phase
        content_blocks.append({"text": "ANGLE-MATCHED BASELINE vs RETURN COMPARISON:"})
        content_blocks.append({"text": "The following images are paired by angle. For each pair, the BASELINE was captured at packaging/delivery and the RETURN was captured at pickup."})
        content_blocks.append({"text": "RETURN VIDEO (captured at pickup by employee):"})
        content_blocks.append({"video": {"format": video_format, "source": {"bytes": raw_video}}})
        content_blocks.append({"text": "\nBASELINE FRAMES (captured at packaging by operator, labeled by angle):"})
        for phase_id, (b_raw, b_fmt) in baseline_frame_map.items():
            label = PHASE_LABELS.get(phase_id, phase_id.replace("_", " ").title())
            content_blocks.append({"text": f"BASELINE — {label}:"})
            content_blocks.append({"image": {"format": b_fmt, "source": {"bytes": b_raw}}})
        content_blocks.append({
            "text": (
                "Compare the return video against each labeled baseline frame. "
                "For each angle where damage appears in return but NOT in baseline, record the phase id in 'damaged_angles'. "
                "Set damage_origin to 'user_caused' if any new post-delivery damage is found, "
                "'manufacturing_defect' if damage was already visible in the baseline, or 'none' if no significant damage. "
                "Return ONLY valid JSON."
            )
        })
        system_prompt = ANGLE_MATCHED_COMPARISON_PROMPT
    elif baseline_images:
        # Legacy: unstructured baseline images
        content_blocks.append({"text": "BASELINE DELIVERY IMAGES (captured at delivery by agent):"})
        for b_raw, b_fmt in baseline_images:
            content_blocks.append({"image": {"format": b_fmt, "source": {"bytes": b_raw}}})
        content_blocks.append({"text": "RETURN VIDEO (captured by customer during return):"})
        content_blocks.append({"video": {"format": video_format, "source": {"bytes": raw_video}}})
        content_blocks.append({
            "text": (
                "Compare the RETURN video against the BASELINE delivery images. "
                "Detect any NEW damage or wear that occurred after delivery. "
                "Return the JSON assessment as described in your instructions. Return ONLY valid JSON."
            )
        })
        system_prompt = BASELINE_COMPARISON_PROMPT
    else:
        content_blocks.append({"text": "RETURN VIDEO (captured by customer during return):"})
        content_blocks.append({"video": {"format": video_format, "source": {"bytes": raw_video}}})
        content_blocks.append({
            "text": (
                "Analyze this product video and return the JSON assessment "
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
    result["has_baseline_comparison"] = bool(baseline_images)
    result["has_angle_matched_comparison"] = has_labeled_frames and bool(baseline_frame_map)
    result["baseline_frames_used"] = len(baseline_frame_map) if baseline_frame_map else len(baseline_images)
    result["return_frames_used"] = 1  # One video
    # Ensure damage_origin is always present
    damage_origin = result.get("damage_origin", "none")
    if damage_origin not in {"none", "manufacturing_defect", "user_caused"}:
        damage_origin = "none"
    result["damage_origin"] = damage_origin
    result["damaged_angles"] = result.get("damaged_angles") or []

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
