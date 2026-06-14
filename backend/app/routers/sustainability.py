"""
Sustainability Assessment — AI-powered reverse logistics inspector.
Accepts an image upload, verifies it matches the ordered product,
then returns a structured disposition recommendation (RESALE / REFURBISH / RECYCLE / DISPOSE).
"""

import json
import os
import re

import boto3
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/sustainability", tags=["sustainability"])

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
  "condition_score": 0,
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
    """
    prompt = f"""You are a product identity verifier for Amazon Returns.

The customer claims they are returning:
  Product: "{product_name}"
  Category: "{product_category or 'unknown'}"

Examine the image carefully and decide whether it plausibly shows this product.

Rules:
- Answer YES if the image shows the same product or the same category/type as claimed.
- Answer NO if the image shows a completely different product, a person, a blank wall, random objects, or anything clearly unrelated.
- Be lenient — the photo may be from a different angle, without packaging, or slightly worn.

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
        response = client.converse(
            modelId=MODEL_ID,
            messages=[message],
            inferenceConfig={"maxTokens": 120, "temperature": 0.0},
        )
        text = _extract_text(response)
    except Exception as exc:
        # If verification itself fails, skip the check (don't block the user)
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
    content_type = (image.content_type or "").lower()
    if content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported image type '{content_type}'. Use JPEG, PNG, WebP, or GIF.",
        )

    raw = await image.read()
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image exceeds the 5 MB size limit.",
        )
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
        return {"matched": True, "reason": "No product name provided for verification."}

    is_match, reason = _verify_product_match(raw, img_format, product_name, product_category)
    if not is_match:
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

    return {"matched": True, "reason": reason}


@router.post("/assess")
async def assess_return(
    image: UploadFile = File(...),
    product_name: str = Form(""),
    product_category: str = Form(""),
):
    """
    Accept a product image and return an AI sustainability assessment.
    - Optionally verifies the image matches the claimed product before assessing.
    - Supported formats: JPEG, PNG, WebP, GIF (≤ 5 MB).
    """

    # ── Validate image ────────────────────────────────────────────────────────
    content_type = (image.content_type or "").lower()
    if content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported image type '{content_type}'. Use JPEG, PNG, WebP, or GIF.",
        )

    raw = await image.read()
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image exceeds the 5 MB size limit.",
        )
    if not raw:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    fmt_map = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    img_format = fmt_map[content_type]

    # ── Step 1: Verify the image matches the ordered product ──────────────────
    if product_name.strip():
        is_match, reason = _verify_product_match(raw, img_format, product_name, product_category)
        if not is_match:
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

    # ── Step 2: Run full sustainability assessment ────────────────────────────
    message = {
        "role": "user",
        "content": [
            {
                "image": {
                    "format": img_format,
                    "source": {"bytes": raw},   # raw bytes — boto3 handles encoding
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
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Bedrock call failed: {exc}",
        ) from exc

    # ── Parse & return ────────────────────────────────────────────────────────
    try:
        result = _parse_json_response(response)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Normalise classification to uppercase for consistent badge rendering
    result["classification"] = str(result.get("classification", "")).upper()

    return JSONResponse(content=result)
