"""
Product Impact Calculator

Calculates environmental impact metrics per product category.
Used for the Product Impact Calculator card and user sustainability dashboard.

🔌 Static lookup data — replace with real LCA (Life Cycle Assessment) data when available.
"""

# ── Per-Category Environmental Impact ─────────────────────────────────
# Based on approximate lifecycle assessment data
CATEGORY_IMPACT = {
    "electronics": {
        "co2_kg": 50.0,        # kg CO₂ per unit lifecycle
        "ewaste_kg": 0.8,     # kg e-waste potential
        "water_liters": 400.0, # liters water in manufacturing
    },
    "running": {
        "co2_kg": 14.0,
        "ewaste_kg": 0.3,
        "water_liters": 100.0,
    },
    "backpacking": {
        "co2_kg": 8.0,
        "ewaste_kg": 0.2,
        "water_liters": 60.0,
    },
    "yoga": {
        "co2_kg": 5.0,
        "ewaste_kg": 0.1,
        "water_liters": 30.0,
    },
    "fitness": {
        "co2_kg": 12.0,
        "ewaste_kg": 0.3,
        "water_liters": 80.0,
    },
}

# Default fallback for unknown categories
DEFAULT_IMPACT = {
    "co2_kg": 10.0,
    "ewaste_kg": 0.2,
    "water_liters": 50.0,
}


def get_product_impact(product) -> dict:
    """
    Calculate environmental impact metrics for a single product.

    Args:
        product: Product ORM object with category, co2_impact, etc.

    Returns:
        dict with co2_footprint, ewaste_potential, water_footprint
    """
    # Use product-level overrides if set, else fall back to category defaults
    category = product.category.lower() if product.category else "electronics"
    defaults = CATEGORY_IMPACT.get(category, DEFAULT_IMPACT)

    co2 = product.co2_impact if product.co2_impact and product.co2_impact > 0 else defaults["co2_kg"]
    ewaste = product.ewaste_impact if product.ewaste_impact and product.ewaste_impact > 0 else defaults["ewaste_kg"]
    water = product.water_impact if product.water_impact and product.water_impact > 0 else defaults["water_liters"]

    # Circular savings — what's saved when buying refurbished instead of new
    circular_savings = {
        "co2_saved_kg": round(co2 * 0.7, 1),       # ~70% of lifecycle CO₂ saved
        "ewaste_prevented_kg": round(ewaste, 2),    # full e-waste prevented
        "water_saved_liters": round(water * 0.6, 1), # ~60% of water saved
        "money_saved_pct": 30,                        # typical refurb discount
    }

    return {
        "co2_footprint": round(co2, 1),
        "ewaste_potential": round(ewaste, 2),
        "water_footprint": round(water, 1),
        "repair_cost_estimate": product.repair_cost_estimate,
        "avg_lifespan_months": product.avg_lifespan_months or 24,
        "circular_savings": circular_savings,
    }


def calculate_action_impact(action_type: str, category: str) -> dict:
    """
    Calculate the environmental impact of a sustainability action.

    Returns how much CO₂, e-waste, and water is saved by the action.
    """
    defaults = CATEGORY_IMPACT.get(category.lower(), DEFAULT_IMPACT)

    # Different actions save different percentages
    impact_multipliers = {
        "resell": {"co2": 0.7, "ewaste": 1.0, "water": 0.6},
        "refurbish": {"co2": 0.6, "ewaste": 0.9, "water": 0.5},
        "repair": {"co2": 0.5, "ewaste": 0.8, "water": 0.4},
        "donate": {"co2": 0.7, "ewaste": 1.0, "water": 0.6},
        "recycle": {"co2": 0.3, "ewaste": 0.7, "water": 0.3},
        "purchase_refurbished": {"co2": 0.7, "ewaste": 1.0, "water": 0.6},
    }

    mult = impact_multipliers.get(action_type, {"co2": 0.5, "ewaste": 0.5, "water": 0.5})

    return {
        "co2_saved": round(defaults["co2_kg"] * mult["co2"], 1),
        "ewaste_prevented": round(defaults["ewaste_kg"] * mult["ewaste"], 2),
        "water_saved": round(defaults["water_liters"] * mult["water"], 1),
    }
