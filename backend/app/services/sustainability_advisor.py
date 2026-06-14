"""
AI Sustainability Advisor — STUB

Provides contextual sustainability advice before purchase, return, or disposal.
Currently returns curated static advice. To integrate with real AI:
  1. Replace the body of each function with a call to AWS Bedrock / Claude.
  2. Parse the LLM response into the same dict shape.
  3. No changes needed in the route layer.

🔌 STUB — swap for AWS Bedrock integration later.
"""

import random


def get_purchase_advice(product, user=None) -> dict:
    """
    Pre-purchase sustainability advice.
    
    🔌 STUB — replace with Bedrock call for personalized advice.
    """
    keep_rate = random.randint(88, 97)
    category = product.category.lower() if product.category else "general"

    tips = {
        "electronics": {
            "title": "🔋 Smart Electronics Buyer",
            "message": f"Customers like you kept this product {keep_rate}% of the time. "
                       f"This {product.brand} product has an estimated lifespan of {product.avg_lifespan_months or 24} months.",
            "stats": {
                "keep_rate": keep_rate,
                "avg_lifespan": product.avg_lifespan_months or 24,
                "repair_available": product.repair_cost_estimate is not None,
            },
        },
        "running": {
            "title": "👟 Fit Matters for Running Shoes",
            "message": f"{keep_rate}% of buyers in your size kept this shoe. "
                       f"Proper sizing prevents returns and reduces waste by up to 2 kg CO₂.",
            "stats": {"keep_rate": keep_rate, "co2_per_return": 2.0},
        },
    }

    advice = tips.get(category, {
        "title": "🌿 Sustainable Choice",
        "message": f"Customers like you kept this product {keep_rate}% of the time. "
                   f"Keeping products longer is the #1 way to reduce environmental impact.",
        "stats": {"keep_rate": keep_rate},
    })

    # Add refurbished credits potential
    from app.services.credit_engine import calculate_credits
    credits = calculate_credits("purchase_refurbished", category)

    return {
        "advice_type": "purchase",
        "title": advice["title"],
        "message": advice["message"],
        "stats": advice["stats"],
        "green_credits_potential": credits,
    }


def get_return_advice(product, condition_score: float, return_period_over: bool = False) -> dict:
    """
    Post-return sustainability advice — only shows 'List on Amazon ReLife'
    and only when the 7-day return window has elapsed.

    🔌 STUB — replace with Bedrock call for context-aware suggestions.
    """
    from app.services.credit_engine import calculate_credits
    from app.services.impact_calculator import calculate_action_impact

    suggestions = []

    # List on Amazon ReLife — only if return window is over AND condition is good
    if return_period_over and condition_score >= 60:
        resell_credits = calculate_credits("resell", "general")
        resell_impact = calculate_action_impact("resell", "general")
        suggestions.append({
            "action": "resell",
            "title": "🔄 List on Amazon ReLife",
            "message": f"Your item qualifies for resale. Earn {resell_credits} Green Credits "
                       f"and save {resell_impact['co2_saved']} kg CO₂.",
            "credits": resell_credits,
            "impact": resell_impact,
        })

    return {
        "advice_type": "return",
        "title": "♻️ Second Chance Options",
        "message": "Your item may qualify for a second life:" if suggestions else "No second-chance options available yet — check back after the 7-day return window.",
        "stats": {"condition_score": condition_score},
        "suggestions": suggestions,
        "green_credits_potential": max([s["credits"] for s in suggestions]) if suggestions else 0,
    }


def get_lifecycle_advice(product) -> dict:
    """
    Product lifecycle tips and maintenance advice.
    
    🔌 STUB — replace with Bedrock call for product-specific tips.
    """
    category = product.category.lower() if product.category else "general"

    lifecycle_tips = {
        "electronics": [
            "Keep firmware updated for optimal battery life",
            "Store in a cool, dry place when not in use",
            "Use the original charger to prevent battery degradation",
        ],
        "running": [
            "Rotate between 2 pairs to extend lifespan by 40%",
            "Air dry after runs — never machine dry",
            "Replace insoles every 6 months for continued support",
        ],
        "backpacking": [
            "Clean and dry thoroughly after each trip",
            "Store uncompressed to maintain insulation loft",
            "Apply water-repellent treatment annually",
        ],
        "yoga": [
            "Wipe down after each session with mild soap",
            "Roll loosely to prevent permanent creases",
            "Keep away from direct sunlight to prevent fading",
        ],
        "fitness": [
            "Clean after every workout to prevent odor buildup",
            "Replace cushioning inserts every 300 hours of use",
            "Store in a well-ventilated area",
        ],
    }

    tips = lifecycle_tips.get(category, [
        "Follow manufacturer care instructions",
        "Keep in original packaging when not in use",
        "Clean regularly to maintain condition",
    ])

    return {
        "advice_type": "lifecycle",
        "title": "📋 Care Tips to Extend Product Life",
        "message": f"Follow these tips to maximize the lifespan of your {product.brand} product:",
        "stats": {"tips": tips, "avg_lifespan_months": product.avg_lifespan_months or 24},
        "green_credits_potential": 0,
    }
