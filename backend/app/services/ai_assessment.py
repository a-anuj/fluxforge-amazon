"""
AI-powered condition assessment — STUB

This module is the single integration point for AI-based product assessment.
Currently returns mock data. To integrate a real model:
  1. Replace the body of `assess_condition()` with a call to
     AWS Bedrock / Claude Vision / any multimodal LLM.
  2. Parse the LLM response into the same dict shape.
  3. No changes needed in the route layer.
"""

import random


def assess_condition(image_urls: list[str]) -> dict:
    """
    🔌 STUB — swap this for a real Bedrock/Claude Vision call later.

    Accepts a list of image URLs of the returned product and returns
    a structured assessment.

    Returns:
        dict with keys:
            condition_score   (float 0-100)
            defects           (str)
            remaining_life_pct (int 0-100)
            recommended_action (str: "resell" | "refurbish" | "exchange" | "donate" | "recycle")
    """
    # Simulate different assessment outcomes based on number of images provided
    num_images = len(image_urls) if image_urls else 1

    # More images → slightly better assessment (mock logic)
    base_score = random.uniform(55, 95)
    condition_score = round(min(100, base_score + num_images * 2), 1)

    defect_options = [
        "Minor surface scratches on the left side",
        "Slight color fading on the exterior",
        "Small scuff marks near the base",
        "Minimal wear on handle/strap area",
        "No visible defects detected",
    ]

    remaining_life = random.randint(40, 95)

    # Determine action based on condition
    if condition_score >= 80:
        action = "resell"
    elif condition_score >= 65:
        action = random.choice(["resell", "refurbish"])
    elif condition_score >= 50:
        action = random.choice(["refurbish", "exchange"])
    else:
        action = random.choice(["donate", "recycle"])

    return {
        "condition_score": condition_score,
        "defects": random.choice(defect_options),
        "remaining_life_pct": remaining_life,
        "recommended_action": action,
    }
