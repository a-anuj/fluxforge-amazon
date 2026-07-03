"""
Product Identity Verifier

Uses AWS Bedrock (amazon.nova-lite-v1:0) multimodal vision to verify
that a scanned product snapshot matches the expected ordered product.
Prevents wrong items from being packaged and shipped.
"""

import json
import logging
import os
import re

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)

_BEDROCK_MODEL = "amazon.nova-lite-v1:0"

_MIME_TO_FORMAT = {
    "image/jpeg": "jpeg",
    "image/jpg":  "jpeg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/gif":  "gif",
}


def _bedrock_client():
    region = os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION", "us-east-1")
    return boto3.client(
        "bedrock-runtime",
        region_name=region,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )


def verify_product_identity(
    image_bytes: bytes,
    image_content_type: str,
    expected_product_name: str,
    expected_category: str,
) -> dict:
    """
    Verify that the item in the snapshot matches the ordered product.

    Returns:
        {
            "verified":         bool   – True if product matches the order.
            "detected_product": str    – What the model saw.
            "confidence":       str    – "high" | "medium" | "low"
            "reason":           str    – One-sentence model explanation.
            "ai_unavailable":   bool   – Present & True only when Bedrock is unreachable.
        }

    Fail-open policy: if Bedrock is unreachable the scan is allowed through
    (ai_unavailable=True) so warehouse operations are not halted. Only verified=False
    with confidence high/medium results in a hard block at the router layer.
    """
    fmt = _MIME_TO_FORMAT.get(image_content_type.lower(), "jpeg")

    prompt = (
        "You are a product-verification assistant for an e-commerce warehouse. "
        "A packaging employee has just scanned an item before packing it for delivery. "
        f"The order expects: product name = '{expected_product_name}', "
        f"category = '{expected_category}'. "
        "Examine the image carefully and decide whether the visible item matches "
        "the ordered product. Use the category as the primary match criterion "
        "(e.g. 'Nike Air Max' and 'Adidas Ultraboost' are both shoes — they match). "
        "Respond ONLY with valid JSON and no markdown:\n"
        '{"verified": <true|false>, '
        '"detected_product": "<brief name of what you see>", '
        '"confidence": "<high|medium|low>", '
        '"reason": "<one sentence explanation>"}'
    )

    try:
        client = _bedrock_client()
        response = client.converse(
            modelId=_BEDROCK_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": fmt, "source": {"bytes": image_bytes}}},
                    {"text": prompt},
                ],
            }],
        )

        raw = response["output"]["message"]["content"][0]["text"].strip()
        logger.info(f"Bedrock product verification raw response: {raw}")

        # Extract JSON block (model may wrap in markdown fences)
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise ValueError(f"No JSON in model response: {raw!r}")

        result = json.loads(match.group())
        return {
            "verified":         bool(result.get("verified", False)),
            "detected_product": str(result.get("detected_product", "Unknown")),
            "confidence":       str(result.get("confidence", "low")),
            "reason":           str(result.get("reason", "")),
        }

    except (BotoCoreError, ClientError) as exc:
        logger.warning(f"Bedrock unavailable for product verification: {exc}")
        return {
            "verified":         True,   # fail-open
            "detected_product": "Verification service unavailable",
            "confidence":       "low",
            "reason":           f"Bedrock unreachable — scan recorded without AI check.",
            "ai_unavailable":   True,
        }
    except Exception as exc:
        logger.error(f"Unexpected product verification error: {exc}", exc_info=True)
        return {
            "verified":         True,   # fail-open
            "detected_product": "Verification error",
            "confidence":       "low",
            "reason":           f"Unexpected error during verification — proceeding.",
            "ai_unavailable":   True,
        }
