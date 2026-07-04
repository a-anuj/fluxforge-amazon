"""
Smart Green Credit Engine

Calculates green credits dynamically using the formula:
    Credits = Base Reward × Product Impact Score × Sustainability Multiplier

Also manages sustainability level progression.

 Core logic — no AI dependency. Ready for production.
"""

# ── Level Tiers ────────────────────────────────────────────────────────
LEVEL_TIERS = [
    {"name": "Seed",               "min": 0,    "max": 100},
    {"name": "Sapling",            "min": 101,  "max": 300},
    {"name": "Green Hero",         "min": 301,  "max": 700},
    {"name": "Planet Protector",   "min": 701,  "max": 1500},
    {"name": "Circular Champion",  "min": 1501, "max": 999999},
]

# ── Base Rewards per Action ────────────────────────────────────────────
BASE_REWARDS = {
    "purchase_refurbished": 50,
    "resell": 80,
    "repair": 50,
    "donate": 100,
    "recycle": 30,
    "eco_delivery": 15,
    "challenge": 0,  # set per challenge
    "refurbish": 60,
}

# ── Product Impact Scores by Category ─────────────────────────────────
PRODUCT_IMPACT_SCORES = {
    "electronics": 2.5,
    "running": 1.2,
    "backpacking": 1.0,
    "yoga": 0.8,
    "fitness": 1.0,
}

# ── Sustainability Multipliers ────────────────────────────────────────
SUSTAINABILITY_MULTIPLIERS = {
    "express": 0.5,     # lowest reward — high carbon delivery
    "standard": 1.0,    # baseline
    "eco": 1.5,         # highest reward — consolidated delivery
}


def calculate_credits(
    action_type: str,
    category: str = "electronics",
    multiplier: float = 1.0,
    override_base: int | None = None,
) -> int:
    """
    Calculate green credits for an action.

    Formula: Base Reward × Product Impact Score × Sustainability Multiplier

    Args:
        action_type: e.g. "purchase_refurbished", "resell", "repair"
        category: product category for impact score lookup
        multiplier: sustainability multiplier (e.g. delivery type)
        override_base: override the base reward (for challenges)

    Returns:
        Calculated credits (rounded to int)
    """
    base = override_base if override_base is not None else BASE_REWARDS.get(action_type, 20)
    impact = PRODUCT_IMPACT_SCORES.get(category.lower(), 1.0)
    credits = base * impact * multiplier
    return max(1, round(credits))


def get_delivery_credits(delivery_type: str, category: str = "electronics") -> int:
    """Calculate bonus credits for eco-friendly delivery choices."""
    if delivery_type == "eco":
        return calculate_credits("eco_delivery", category, SUSTAINABILITY_MULTIPLIERS["eco"])
    elif delivery_type == "standard":
        return calculate_credits("eco_delivery", category, SUSTAINABILITY_MULTIPLIERS["standard"])
    return 0  # express gets no bonus


def get_level(lifetime_credits: int) -> dict:
    """
    Determine the user's sustainability level based on lifetime credits.

    Returns:
        dict with: name, emoji, progress (0-100), next_level, credits_to_next
    """
    current_tier = LEVEL_TIERS[0]
    next_tier = LEVEL_TIERS[1] if len(LEVEL_TIERS) > 1 else None

    for i, tier in enumerate(LEVEL_TIERS):
        if tier["min"] <= lifetime_credits <= tier["max"]:
            current_tier = tier
            next_tier = LEVEL_TIERS[i + 1] if i + 1 < len(LEVEL_TIERS) else None
            break

    # Calculate progress to next level
    if next_tier:
        range_size = current_tier["max"] - current_tier["min"] + 1
        progress_in_tier = lifetime_credits - current_tier["min"]
        progress = min(100.0, round((progress_in_tier / range_size) * 100, 1))
        credits_to_next = next_tier["min"] - lifetime_credits
    else:
        progress = 100.0
        credits_to_next = 0

    return {
        "name": current_tier["name"],
        "progress": progress,
        "next_level": next_tier["name"] if next_tier else None,
        "credits_to_next": max(0, credits_to_next),
    }


def get_delivery_options(category: str = "electronics") -> list[dict]:
    """Return all delivery options with their CO₂ and credit details."""
    return [
        {
            "type": "express",
            "label": "Express Delivery",
            "days": 1,
            "co2_kg": 3.4,
            "green_credits": 0,
            "description": "Next day delivery — higher carbon footprint",
        },
        {
            "type": "standard",
            "label": "Standard Delivery",
            "days": 3,
            "co2_kg": 1.2,
            "green_credits": get_delivery_credits("standard", category),
            "description": f"3-day delivery — earn {get_delivery_credits('standard', category)} Green Credits",
        },
        {
            "type": "eco",
            "label": "Eco-Consolidated",
            "days": 5,
            "co2_kg": 0.0,
            "green_credits": get_delivery_credits("eco", category),
            "description": f"5-day consolidated delivery — earn {get_delivery_credits('eco', category)} Green Credits + zero carbon",
        },
    ]
