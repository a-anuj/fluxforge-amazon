"""
Sustainability Assessment — AI-powered reverse logistics inspector.
Accepts an image upload, verifies it matches the ordered product,
then returns a structured disposition recommendation (RESALE / REFURBISH / RECYCLE / DISPOSE).
"""

import json
import logging
import os
import re

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
        "\n🔬 [%(levelname)s] %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)


# ── Bedrock configuration ─────────────────────────────────────────────────────

MODEL_ID = "us.amazon.nova-lite-v1:0"

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


def _get_bedrock_client():
    return boto3.client(
        "bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )


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

    logger.info(f"Product verification — result: {'✅ MATCH' if is_match else '❌ NO MATCH'} | Reason: {reason}")

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

    logger.info(f"✅ Product verified successfully")
    return {"matched": True, "reason": reason}


@router.post("/assess")
async def assess_return(
    image: UploadFile = File(...),
    order_id: int = Form(...),
    product_name: str = Form(""),
    product_category: str = Form(""),
    db: Session = Depends(get_db),
):
    """
    Accept a product image and return an AI sustainability assessment.
    - Runs quality guardrail checks (blur, brightness, resolution) before Bedrock.
    - Optionally verifies the image matches the claimed product before assessing.
    - Supported formats: JPEG, PNG, WebP, GIF (≤ 5 MB).
    """
    from app.services.media_validator import validate_image as quality_check

    logger.info(f"=== /assess — product_name='{product_name}', category='{product_category}', file='{image.filename}' ===")

    # ── Validate image ────────────────────────────────────────────────────────
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

    # ── Quality Guardrail — validate before expensive Bedrock call ────────────
    logger.info("Running quality guardrail checks...")
    quality_result = quality_check(raw, filename=image.filename or "image.jpg")
    logger.info(f"Quality guardrail — status: {quality_result.status.value} | metadata: {quality_result.metadata}")

    if not quality_result.passed:
        # Only BLOCK on truly fatal issues — corrupt file or no content at all
        fatal_codes = {"corrupt_file", "no_content_detected", "invalid_format"}
        fatal_issues = [i for i in quality_result.issues if i.code in fatal_codes]

        if fatal_issues:
            for issue in fatal_issues:
                logger.warning(f"  ❌ FATAL quality issue [{issue.code}]: {issue.message}")
            raise HTTPException(
                status_code=422,
                detail={
                    "type": "quality_check_failed",
                    "message": "Image quality is insufficient for AI analysis.",
                    "issues": [
                        {"code": i.code, "message": i.message, "suggestion": i.suggestion}
                        for i in fatal_issues
                    ],
                    "metadata": quality_result.metadata,
                },
            )
        else:
            # Non-fatal issues (blur, brightness, size) — log warning but proceed
            for issue in quality_result.issues:
                logger.info(f"  ⚠️ Non-blocking quality warning [{issue.code}]: {issue.message}")
            logger.info("Quality guardrail — proceeding despite minor issues")

    fmt_map = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    img_format = fmt_map[content_type]

    # ── Step 1: Verify the image matches the ordered product ──────────────────
    if product_name.strip():
        logger.info(f"Step 1: Verifying product identity...")
        is_match, reason = _verify_product_match(raw, img_format, product_name, product_category)
        if not is_match:
            logger.warning(f"❌ Product mismatch — rejecting. Reason: {reason}")
            raise HTTPException(
                status_code=409,
                detail={
                    "type": "product_mismatch",
                    "message": (
                        f"The uploaded image does not appear to be '{product_name}'. "
                        "Please upload a clear photo of the actual item you ordered."
                    ),
                    "reason": reason,
                },
            )
        logger.info(f"✅ Product verified — proceeding to assessment")
    else:
        logger.info("No product name provided — skipping verification step")

    # ── Step 2: Run full sustainability assessment ────────────────────────────
    logger.info("Step 2: Running full sustainability assessment via Bedrock...")
    message = {
        "role": "user",
        "content": [
            {
                "image": {
                    "format": img_format,
                    "source": {"bytes": raw},
                }
            },
            {
                "text": (
                    "Analyze this product image and return the JSON assessment "
                    "as described in your instructions. Return ONLY valid JSON."
                )
            },
        ],
    }

    try:
        client = _get_bedrock_client()
        response = client.converse(
            modelId=MODEL_ID,
            system=[{"text": ASSESSMENT_SYSTEM_PROMPT}],
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

    # Calculate circularity/sustainability metadata preview
    order = db.query(Order).filter(Order.id == order_id).first()
    product = order.product if order else None
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

    logger.info(f"✅ Assessment complete — classification: {result['classification']}, score: {result.get('condition_score')}, confidence: {result.get('confidence')}")

    return JSONResponse(content=result)
