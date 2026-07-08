"""
AI-powered condition assessment — Amazon Bedrock Nova Pro (single-image vision)

Integration point for real AI assessment using Amazon Nova Pro.

When AWS credentials are present:
  - Calls Nova Pro with the customer's return photo(s) (1-3 images)
  - Nova Pro inspects visible condition and recommends a circular outcome
  - Returns structured JSON with condition_score, defects, recommended_action, confidence, etc.

When AWS credentials are absent (local dev):
  - Falls back to the hardcoded mock assessment
  - assessment_source = "fallback"
  - Trivially clears every confidence gate since condition_score=90

Confidence gating is handled by `apply_confidence_gate()` in returns.py —
this module only produces the raw assessment.
"""

import base64
import json
import logging
import os

logger = logging.getLogger("ai_assessment")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("🤖 [%(levelname)s] %(message)s"))
    logger.addHandler(handler)


# ── Model Configuration ────────────────────────────────────────────────

NOVA_PRO_MODEL_ID = "amazon.nova-pro-v1:0"
AWS_REGION = (
    os.environ.get("AWS_REGION")
    or os.environ.get("S3_AWS_REGION")
    or os.environ.get("AWS_DEFAULT_REGION")
    or "us-east-1"
)

# ── Hardcoded fallback (local-dev / no-credentials path) ──────────────

FALLBACK_ASSESSMENT = {
    "condition_score": 90,
    "remaining_life_pct": 95,
    "defects": [
        {
            "type": "packaging_only",
            "severity": "minor",
            "location": "outer box",
        }
    ],
    "defects_summary": "Light retail packaging wear, product pristine.",
    "is_damaged": False,
    "refurbishable": False,
    "refurb_cost_estimate_pct": None,
    "recommended_action": "resell",
    "confidence": 0.95,
    "reasoning": "Product appears in like-new condition based on fallback assessment.",
    "assessment_source": "fallback",
    "gate_override": False,
    "original_recommended_action": None,
}


# ── Nova Pro prompt templates ──────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are a product condition inspector for an e-commerce circular-economy platform.\n"
    "You will be shown one or more photos of a returned product. Assess visible\n"
    "condition, damage, and the best circular-economy outcome based on the photo(s)\n"
    "alone — you have no reference image to compare against, so judge condition\n"
    "against what a product of this category would normally look like when new.\n\n"
    "Always respond with ONLY a single JSON object. No prose, no markdown fences,\n"
    "no explanation outside the JSON."
)

_USER_TEXT_TEMPLATE = """\
Product: {product_name}
Category: {product_category}
Customer's stated return reason: "{return_reason}"

Inspect the photo(s) of the returned item and return exactly this JSON schema:
{{
  "condition_score": <integer 0-100, 100 = pristine/like-new>,
  "remaining_life_pct": <integer 0-100, estimated remaining useful life>,
  "defects": [
    {{
      "type": "<scratch|dent|tear|stain|missing_part|broken_component|hole|discoloration|packaging_only|none>",
      "severity": "<none|minor|moderate|severe>",
      "location": "<short free-text location on the item>"
    }}
  ],
  "is_damaged": <true|false>,
  "refurbishable": <true|false>,
  "refurb_cost_estimate_pct": <integer 0-100, estimated repair cost as % of resale value, null if not damaged>,
  "recommended_action": "<resell|refurbish|donate|recycle>",
  "confidence": <float 0.0-1.0, your confidence in the recommended_action specifically>,
  "reasoning": "<one sentence explaining the recommended_action>"
}}

Decision guidance for recommended_action:
- "resell": not damaged, safe to send to another buyer as-is
- "refurbish": damaged but refurb_cost_estimate_pct < 40 and defects look repairable
- "donate": damaged, not economical to refurbish, but clearly safe and usable as-is
- "recycle": damaged beyond safe use, or you are not confident enough to certify it safe\
"""


# ── Bedrock client (lazy, cached) ────────────────────────────────────

_bedrock_client = None


def _get_bedrock_client():
    global _bedrock_client
    if _bedrock_client is None:
        try:
            import boto3
            _bedrock_client = boto3.client(
                "bedrock-runtime",
                region_name=AWS_REGION,
            )
        except Exception as exc:
            logger.warning("Could not create Bedrock client: %s", exc)
            _bedrock_client = None
    return _bedrock_client


# ── JSON response helpers ──────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    """
    Pull the first JSON object out of a Nova Pro response.
    Handles cases where the model wraps JSON in markdown fences or adds prose.
    """
    text = text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        # Drop the opening fence line and the closing fence line
        inner = "\n".join(
            line for line in lines if not line.strip().startswith("```")
        )
        text = inner.strip()

    # Attempt direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fallback: find first { ... } block
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"No valid JSON object found in response: {text[:200]!r}")


def _normalize_result(raw: dict) -> dict:
    """
    Normalise the raw Nova Pro JSON to ensure all expected keys are present
    and types are correct. Missing keys get safe defaults.
    """
    defects_raw = raw.get("defects", [])
    if isinstance(defects_raw, list):
        defects_list = defects_raw
    else:
        # Occasionally the model may return a single dict
        defects_list = [defects_raw] if isinstance(defects_raw, dict) else []

    # Build a human-readable defects summary for the existing `defects` VARCHAR column
    defects_summary_parts = []
    for d in defects_list:
        if isinstance(d, dict):
            sev = d.get("severity", "none")
            typ = d.get("type", "none")
            loc = d.get("location", "")
            if sev not in ("none",) and typ not in ("none",):
                defects_summary_parts.append(
                    f"{sev.capitalize()} {typ.replace('_', ' ')} at {loc}" if loc else f"{sev.capitalize()} {typ.replace('_', ' ')}"
                )
    defects_summary = "; ".join(defects_summary_parts) if defects_summary_parts else "No visible defects."

    action = str(raw.get("recommended_action", "recycle")).lower().strip()
    if action == "exchange":
        action = "resell"
    if action not in ("resell", "refurbish", "donate", "recycle"):
        action = "recycle"

    confidence = float(raw.get("confidence", 0.0))
    confidence = max(0.0, min(1.0, confidence))

    refurb_pct = raw.get("refurb_cost_estimate_pct")
    if refurb_pct is not None:
        try:
            refurb_pct = int(refurb_pct)
        except (TypeError, ValueError):
            refurb_pct = None

    return {
        "condition_score": int(raw.get("condition_score", 50)),
        "remaining_life_pct": int(raw.get("remaining_life_pct", 50)),
        "defects": defects_list,
        "defects_summary": defects_summary,
        "is_damaged": bool(raw.get("is_damaged", False)),
        "refurbishable": bool(raw.get("refurbishable", False)),
        "refurb_cost_estimate_pct": refurb_pct,
        "recommended_action": action,
        "confidence": confidence,
        "reasoning": str(raw.get("reasoning", "")),
        "assessment_source": "nova_pro",
        "gate_override": False,
        "original_recommended_action": None,
    }


# ── Public API ────────────────────────────────────────────────────────

def assess_return_condition(
    return_photo_bytes: list[bytes],
    product_metadata: dict,
    return_reason: str = "no reason provided",
) -> dict:
    """
    Assess a returned product's condition using Amazon Nova Pro vision.

    Args:
        return_photo_bytes: List of raw image bytes (1-3 photos of the returned item).
        product_metadata: Dict with at minimum `name` and `category` keys.
        return_reason: Customer's stated reason for the return.

    Returns:
        Normalised assessment dict with keys:
            condition_score, remaining_life_pct, defects (list), defects_summary (str),
            is_damaged, refurbishable, refurb_cost_estimate_pct, recommended_action,
            confidence, reasoning, assessment_source, gate_override, original_recommended_action

    On any failure (no credentials, throttling, bad JSON) falls back to FALLBACK_ASSESSMENT.
    """
    if not return_photo_bytes:
        # No photos — skip Nova Pro, use fallback per Part 4 spec
        logger.info("No photos provided — using fallback assessment.")
        return dict(FALLBACK_ASSESSMENT)

    client = _get_bedrock_client()
    if client is None:
        logger.info("Bedrock client unavailable — using fallback assessment.")
        return dict(FALLBACK_ASSESSMENT)

    product_name = product_metadata.get("name", "Unknown product")
    product_category = product_metadata.get("category", "general")

    try:
        # ── Build the content blocks (images + text) ─────────────────
        content_blocks = []

        # Attach up to 3 images
        for img_bytes in return_photo_bytes[:3]:
            # Detect JPEG vs PNG by magic bytes; default to JPEG
            if img_bytes[:4] == b"\x89PNG":
                media_type = "image/png"
            elif img_bytes[:2] in (b"\xff\xd8", b"GIF"):
                media_type = "image/jpeg"
            else:
                media_type = "image/jpeg"

            b64_data = base64.standard_b64encode(img_bytes).decode("utf-8")
            content_blocks.append(
                {
                    "image": {
                        "format": media_type.split("/")[1],  # "jpeg" | "png"
                        "source": {
                            "bytes": img_bytes,  # Nova Pro Converse API accepts raw bytes
                        },
                    }
                }
            )

        # Append the text instruction
        user_text = _USER_TEXT_TEMPLATE.format(
            product_name=product_name,
            product_category=product_category,
            return_reason=return_reason,
        )
        content_blocks.append({"text": user_text})

        messages = [
            {
                "role": "user",
                "content": content_blocks,
            }
        ]

        logger.info(
            "[Nova Pro] STARTING assessment\n"
            "  Product  : %s\n"
            "  Category : %s\n"
            "  Photos   : %d image(s)\n"
            "  Model    : %s",
            product_name, product_category, len(return_photo_bytes), NOVA_PRO_MODEL_ID,
        )

        response = client.converse(
            modelId=NOVA_PRO_MODEL_ID,
            system=[{"text": _SYSTEM_PROMPT}],
            messages=messages,
            inferenceConfig={
                "maxTokens": 1024,
                "temperature": 0.1,  # low temperature for consistent structured output
            },
        )

        # ── Parse response ────────────────────────────────────────────
        output_message = response["output"]["message"]
        raw_text = ""
        for block in output_message.get("content", []):
            if "text" in block:
                raw_text += block["text"]

        logger.info(
            "📝 Nova Pro RAW response:\n%s", raw_text.strip()
        )

        raw_dict = _extract_json(raw_text)
        result = _normalize_result(raw_dict)

        # ── Rich structured log ───────────────────────────────────────
        defects_log = ""
        for i, d in enumerate(result.get("defects", []), 1):
            if isinstance(d, dict):
                defects_log += (
                    f"\n   Defect {i}: [{d.get('severity','?').upper()}] "
                    f"{d.get('type','?')} @ {d.get('location','?')}"
                )
        if not defects_log:
            defects_log = "\n   (none)"

        usage = response.get("usage", {})
        input_tokens  = usage.get("inputTokens", "?")
        output_tokens = usage.get("outputTokens", "?")

        logger.info(
            "[Nova Pro] COMPLETE ---\n"
            "  Condition score  : %d/100\n"
            "  Remaining life   : %d%%\n"
            "  Is damaged       : %s\n"
            "  Refurbishable    : %s\n"
            "  Refurb cost est  : %s\n"
            "  Defects          : %s\n"
            "  Defects summary  : %s\n"
            "  Recommended action: %s\n"
            "  Confidence       : %.0f%%\n"
            "  Reasoning        : %s\n"
            "  Tokens in/out    : %s / %s",
            result["condition_score"],
            result["remaining_life_pct"],
            "YES" if result["is_damaged"] else "NO",
            "YES" if result["refurbishable"] else "NO",
            f"{result['refurb_cost_estimate_pct']}% of resale value" if result["refurb_cost_estimate_pct"] is not None else "N/A",
            defects_log.strip() or "(none)",
            result["defects_summary"],
            result["recommended_action"].upper(),
            result["confidence"] * 100,
            result["reasoning"] or "(no reasoning returned)",
            input_tokens,
            output_tokens,
        )
        return result

    except Exception as exc:
        logger.warning(
            "[Nova Pro] FAILED - falling back to mock data\n"
            "  Error type : %s\n"
            "  Message    : %s",
            type(exc).__name__, exc,
        )
        return dict(FALLBACK_ASSESSMENT)



# ── Legacy compatibility shim ─────────────────────────────────────────
# The old `assess_condition(image_urls)` signature is retained so nothing
# else in the codebase breaks during the transition. It uses the fallback
# path (no actual image bytes are fetched here).

def assess_condition(image_urls: list[str]) -> dict:
    """
    Legacy shim — kept for backward compatibility.

    Delegates to assess_return_condition with an empty bytes list,
    which triggers the safe fallback path. Callers in returns.py should
    migrate to assess_return_condition() directly.
    """
    result = assess_return_condition(
        return_photo_bytes=[],  # no bytes → fallback
        product_metadata={"name": "Unknown", "category": "general"},
        return_reason="no reason provided",
    )
    # Return the old four-key shape expected by legacy callers
    return {
        "condition_score": result["condition_score"],
        "defects": result["defects_summary"],
        "remaining_life_pct": result["remaining_life_pct"],
        "recommended_action": result["recommended_action"],
    }
