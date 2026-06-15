"""
Wishlist Radius Matching Engine

When a product is returned, this service:
1. Finds wishlist entries that match the returned product (category, brand, price, etc.)
2. Filters by radius (pincode-based proximity)
3. Scores each match using a composite algorithm
4. Calculates dynamic discounts based on logistics savings
5. Creates match records and triggers notifications

Algorithm:
    Match Score = (Product Match × 30) + (Price Fit × 25) + (Distance Bonus × 20)
                + (Condition Score × 15) + (Brand Match × 10)

Discount Formula:
    Discount = Base Category Discount + Logistics Savings Share + Wishlist Urgency Bonus
"""

import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models import (
    Wishlist, WishlistMatch, WishlistNotification,
    Listing, Return, Order, Product, User,
)

logger = logging.getLogger("wishlist_matcher")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("🎯 [%(levelname)s] %(message)s"))
    handler.setLevel(logging.DEBUG)
    logger.addHandler(handler)


# ── Pincode Distance Mapping (India-specific heuristic) ────────────────
# In a real system, use geocoding. For hackathon: same pincode prefix = closer.

def estimate_distance_km(pincode_a: str | None, pincode_b: str | None) -> float:
    """
    Estimate distance between two Indian pincodes using prefix matching.
    
    Indian pincodes are 6 digits. Matching logic:
    - Same pincode → 0-2 km (same locality)
    - Same first 4 digits → 2-5 km (same city area)
    - Same first 3 digits → 5-15 km (same city/district)
    - Same first 2 digits → 15-50 km (same region)
    - Same first digit → 50-200 km (same zone)
    - Different → 200+ km
    """
    if not pincode_a or not pincode_b:
        return 50.0  # Default: assume moderate distance if unknown

    a, b = pincode_a.strip(), pincode_b.strip()

    if a == b:
        return 1.0
    if a[:5] == b[:5]:
        return 3.0
    if a[:4] == b[:4]:
        return 5.0
    if a[:3] == b[:3]:
        return 10.0
    if a[:2] == b[:2]:
        return 30.0
    if a[:1] == b[:1]:
        return 100.0
    return 250.0


# ── Logistics Cost Estimates ───────────────────────────────────────────

# Average logistics cost per km for product categories (₹/km)
LOGISTICS_COST_PER_KM = {
    "electronics": 2.5,
    "running": 1.8,
    "backpacking": 2.0,
    "yoga": 1.5,
    "fitness": 1.8,
}
DEFAULT_LOGISTICS_COST_PER_KM = 2.0

# Average warehouse-to-customer distance (km) that local delivery replaces
AVG_WAREHOUSE_DISTANCE_KM = 150.0

# CO₂ per km for delivery vehicles (kg/km)
CO2_PER_KM = 0.12


# ── Discount Calculation ───────────────────────────────────────────────

# Base discount percentages by return condition
BASE_DISCOUNT_BY_CONDITION = {
    "resell": 20,      # Like-new → smaller discount needed
    "refurbish": 35,   # Needs work → bigger discount
    "repair": 40,
    "exchange": 30,
    "donate": 50,
}

# Urgency bonus: days in wishlist → extra discount
URGENCY_BRACKETS = [
    (30, 5),   # >30 days → +5%
    (14, 3),   # >14 days → +3%
    (7,  2),   # >7 days  → +2%
    (0,  0),   # recent   → no bonus
]


def calculate_dynamic_discount(
    product: Product,
    condition_score: float,
    recommended_action: str,
    distance_km: float,
    wishlist_age_days: int,
    category: str,
) -> dict:
    """
    Calculate a dynamic discount that reflects:
    - Product condition (higher = less discount needed)
    - Logistics savings from local delivery (shared with buyer)
    - Wishlist urgency (longer wait = bigger incentive)
    - Category-specific base rates
    """
    # 1. Base discount from condition/action
    base_discount = BASE_DISCOUNT_BY_CONDITION.get(recommended_action, 25)

    # 2. Condition adjustment: better condition = less discount
    # Scale: 100 score → -5%, 50 score → +5%
    condition_adjustment = round((70 - condition_score) / 10, 1)

    # 3. Logistics savings calculation
    cost_per_km = LOGISTICS_COST_PER_KM.get(category.lower(), DEFAULT_LOGISTICS_COST_PER_KM)
    # Normal route: warehouse distance. Local route: direct distance
    normal_logistics_cost = AVG_WAREHOUSE_DISTANCE_KM * cost_per_km
    local_logistics_cost = distance_km * cost_per_km
    logistics_saved = max(0, normal_logistics_cost - local_logistics_cost)

    # Share 40% of logistics savings with buyer as discount
    logistics_discount_amount = logistics_saved * 0.4
    logistics_discount_pct = min(10, round((logistics_discount_amount / product.price) * 100, 1))

    # 4. Urgency bonus
    urgency_bonus = 0
    for days_threshold, bonus in URGENCY_BRACKETS:
        if wishlist_age_days >= days_threshold:
            urgency_bonus = bonus
            break

    # 5. Total discount (clamped)
    total_discount_pct = round(
        base_discount + condition_adjustment + logistics_discount_pct + urgency_bonus, 1
    )
    total_discount_pct = max(15.0, min(50.0, total_discount_pct))  # Clamp: 15-50%

    # 6. Final price
    discounted_price = round(product.price * (1 - total_discount_pct / 100), 2)

    # 7. CO₂ saved from local delivery
    co2_saved = round((AVG_WAREHOUSE_DISTANCE_KM - distance_km) * CO2_PER_KM, 2)
    co2_saved = max(0, co2_saved)

    return {
        "discount_pct": total_discount_pct,
        "discounted_price": discounted_price,
        "original_price": product.price,
        "savings_amount": round(product.price - discounted_price, 2),
        "logistics_saved": round(logistics_saved, 2),
        "co2_saved_delivery": co2_saved,
        "breakdown": {
            "base_discount": base_discount,
            "condition_adjustment": condition_adjustment,
            "logistics_bonus": logistics_discount_pct,
            "urgency_bonus": urgency_bonus,
        },
    }


# ── Match Scoring ──────────────────────────────────────────────────────

def score_wishlist_match(
    wishlist: Wishlist,
    product: Product,
    condition_score: float,
    distance_km: float,
    listing_price: float,
) -> float:
    """
    Compute a 0-100 match score for a wishlist entry against a returned product.
    
    Weights:
        Product Match:   30 points (exact product > category > brand)
        Price Fit:       25 points (listing price within user's max_price)
        Distance Bonus:  20 points (closer = better)
        Condition:       15 points (higher condition = better)
        Brand Match:     10 points (brand preference alignment)
    """
    score = 0.0

    # 1. Product match (30 pts)
    if wishlist.product_id and wishlist.product_id == product.id:
        score += 30  # Exact product match
    elif wishlist.category and wishlist.category.lower() == product.category.lower():
        score += 20  # Category match
        if wishlist.brand and wishlist.brand.lower() == product.brand.lower():
            score += 10  # Category + brand
    elif wishlist.brand and wishlist.brand.lower() == product.brand.lower():
        score += 15  # Brand-only match

    # Keyword boost
    if wishlist.keywords:
        keywords = [k.strip().lower() for k in wishlist.keywords.split(",")]
        product_text = f"{product.name} {product.category} {product.brand} {product.description or ''}".lower()
        keyword_hits = sum(1 for k in keywords if k in product_text)
        score += min(10, keyword_hits * 5)  # Up to 10 bonus points

    # 2. Price fit (25 pts)
    if wishlist.max_price:
        if listing_price <= wishlist.max_price:
            # Perfect fit — closer to max_price = still good (not "too cheap to be real")
            price_ratio = listing_price / wishlist.max_price
            score += 25 * min(1.0, price_ratio + 0.2)  # Gentle penalty for being way under
        else:
            # Over budget — penalize proportionally
            overage = (listing_price - wishlist.max_price) / wishlist.max_price
            score += max(0, 25 * (1 - overage * 2))
    else:
        score += 15  # No max_price set — neutral

    # 3. Distance bonus (20 pts) — closer = higher score
    if distance_km <= 2:
        score += 20
    elif distance_km <= 5:
        score += 17
    elif distance_km <= 10:
        score += 14
    elif distance_km <= 25:
        score += 10
    elif distance_km <= 50:
        score += 5
    else:
        score += 0

    # 4. Condition (15 pts)
    score += (condition_score / 100) * 15

    # 5. Brand preference from user profile (10 pts) — already covered in product match
    # Extra boost if user's brand_prefs include this brand
    user = wishlist.user
    if user and user.brand_prefs:
        prefs = [b.strip().lower() for b in user.brand_prefs.split(",")]
        if product.brand.lower() in prefs:
            score += 5

    return min(100, round(score, 1))


# ── Main Matching Function ─────────────────────────────────────────────

def find_wishlist_matches(
    return_item: Return,
    listing: Listing,
    db: Session,
) -> list[WishlistMatch]:
    """
    Find all matching wishlist entries for a newly created listing from a return.
    
    Steps:
    1. Get the returned product details
    2. Find active wishlists that could match (category, brand, product, keywords)
    3. Filter by radius (pincode proximity)
    4. Score each match
    5. Calculate dynamic discount for each
    6. Create WishlistMatch records and notifications
    
    Returns list of created WishlistMatch objects.
    """
    order = db.query(Order).filter(Order.id == return_item.order_id).first()
    if not order:
        logger.warning("No order found for return — skipping wishlist matching")
        return []

    product = db.query(Product).filter(Product.id == listing.product_id).first()
    if not product:
        logger.warning("No product found for listing — skipping wishlist matching")
        return []

    returner = db.query(User).filter(User.id == order.user_id).first()
    returner_pincode = returner.pincode if returner else None

    logger.info(f"🎯 Finding wishlist matches for: {product.name} (category: {product.category}, price: ₹{product.price})")
    logger.info(f"   Returner pincode: {returner_pincode}, Condition: {return_item.condition_score}")

    # Find all active wishlists (exclude the returner themselves)
    wishlists = (
        db.query(Wishlist)
        .filter(
            Wishlist.status == "active",
            Wishlist.user_id != order.user_id,  # Don't match to the person returning
        )
        .all()
    )

    if not wishlists:
        logger.info("   No active wishlists found")
        return []

    matches: list[WishlistMatch] = []

    for wl in wishlists:
        # Check basic relevance (at least one of: product, category, or brand must match)
        is_relevant = False
        if wl.product_id and wl.product_id == product.id:
            is_relevant = True
        elif wl.category and wl.category.lower() == product.category.lower():
            is_relevant = True
        elif wl.brand and wl.brand.lower() == product.brand.lower():
            is_relevant = True
        elif wl.keywords:
            keywords = [k.strip().lower() for k in wl.keywords.split(",")]
            product_text = f"{product.name} {product.category} {product.brand}".lower()
            if any(k in product_text for k in keywords):
                is_relevant = True

        if not is_relevant:
            continue

        # Check radius
        buyer = db.query(User).filter(User.id == wl.user_id).first()
        buyer_pincode = buyer.pincode if buyer else None
        distance = estimate_distance_km(returner_pincode, buyer_pincode)

        if distance > wl.radius_km:
            logger.debug(f"   Skipping wishlist #{wl.id} (user {wl.user_id}) — distance {distance}km > radius {wl.radius_km}km")
            continue

        # Score the match
        match_score = score_wishlist_match(wl, product, return_item.condition_score or 70, distance, listing.price)

        if match_score < 30:
            logger.debug(f"   Skipping wishlist #{wl.id} — score too low ({match_score})")
            continue

        # Calculate dynamic discount
        wishlist_age_days = 0
        if wl.created_at:
            wl_created = wl.created_at
            if wl_created.tzinfo is None:
                wl_created = wl_created.replace(tzinfo=timezone.utc)
            wishlist_age_days = (datetime.now(timezone.utc) - wl_created).days
        discount_info = calculate_dynamic_discount(
            product=product,
            condition_score=return_item.condition_score or 70,
            recommended_action=return_item.recommended_action or "resell",
            distance_km=distance,
            wishlist_age_days=wishlist_age_days,
            category=product.category,
        )

        # Create the match record
        match = WishlistMatch(
            wishlist_id=wl.id,
            listing_id=listing.id,
            return_id=return_item.id,
            buyer_id=wl.user_id,
            returner_id=order.user_id,
            match_score=match_score,
            distance_km=distance,
            discount_pct=discount_info["discount_pct"],
            discounted_price=discount_info["discounted_price"],
            logistics_saved=discount_info["logistics_saved"],
            co2_saved_delivery=discount_info["co2_saved_delivery"],
            status="notified",
        )
        db.add(match)
        db.flush()  # Get the ID

        # Create notification for the buyer
        notification = WishlistNotification(
            user_id=wl.user_id,
            match_id=match.id,
            title=f"🎁 Your wishlisted item is available nearby!",
            message=(
                f"{product.name} by {product.brand} is now available "
                f"at ₹{discount_info['discounted_price']:.0f} ({discount_info['discount_pct']}% off) — "
                f"just {distance:.0f}km away. "
                f"Condition: {return_item.condition_score}/100. "
                f"You save {discount_info['co2_saved_delivery']:.1f} kg CO₂ with local delivery!"
            ),
        )
        db.add(notification)
        matches.append(match)

        logger.info(
            f"   ✅ MATCH: wishlist #{wl.id} → user {wl.user_id} "
            f"(score: {match_score}, distance: {distance}km, discount: {discount_info['discount_pct']}%)"
        )

    db.commit()
    logger.info(f"🎯 Found {len(matches)} wishlist matches for {product.name}")
    return matches


# ── Product Journey / Provenance ───────────────────────────────────────

def get_product_journey(listing_id: int, db: Session) -> dict:
    """
    Build the full product journey/provenance for a listing.
    Shows transparent history from original purchase → return → current offer.
    """
    listing = db.query(Listing).filter(Listing.id == listing_id).first()
    if not listing:
        return {"error": "Listing not found"}

    return_item = db.query(Return).filter(Return.id == listing.return_id).first()
    if not return_item:
        return {"error": "Return not found"}

    order = db.query(Order).filter(Order.id == return_item.order_id).first()
    product = db.query(Product).filter(Product.id == listing.product_id).first()
    returner = db.query(User).filter(User.id == order.user_id).first() if order else None

    journey = {
        "product": {
            "id": product.id if product else None,
            "name": product.name if product else "Unknown",
            "brand": product.brand if product else "Unknown",
            "category": product.category if product else "Unknown",
            "original_price": product.price if product else 0,
            "image_url": product.image_url if product else None,
            "avg_lifespan_months": product.avg_lifespan_months if product else 24,
        },
        "timeline": [
            {
                "step": 1,
                "event": "original_purchase",
                "title": "Originally Purchased",
                "description": f"Bought new by a verified Amazon customer",
                "location": returner.city if returner else "Unknown",
                "icon": "🛒",
            },
            {
                "step": 2,
                "event": "return_initiated",
                "title": "Return Initiated",
                "description": f"Customer initiated return process",
                "icon": "📦",
            },
            {
                "step": 3,
                "event": "ai_assessment",
                "title": "AI Quality Assessment",
                "description": f"Condition score: {return_item.condition_score}/100. {return_item.defects or 'No major defects found.'}",
                "condition_score": return_item.condition_score,
                "remaining_life_pct": return_item.remaining_life_pct,
                "defects": return_item.defects,
                "recommended_action": return_item.recommended_action,
                "icon": "🔬",
            },
            {
                "step": 4,
                "event": "listed",
                "title": f"Listed as {(return_item.recommended_action or 'resell').title()}",
                "description": f"Available at ₹{listing.price:.0f} ({round((1 - listing.price/product.price)*100)}% off original)",
                "listing_price": listing.price,
                "discount_pct": round((1 - listing.price / product.price) * 100) if product else 0,
                "icon": "♻️",
            },
        ],
        "trust_metrics": {
            "condition_score": return_item.condition_score,
            "remaining_life_pct": return_item.remaining_life_pct,
            "ai_verified": True,
            "recommended_action": return_item.recommended_action,
            "original_price": product.price if product else 0,
            "listing_price": listing.price,
            "discount_pct": round((1 - listing.price / product.price) * 100) if product else 0,
        },
        "environmental_impact": {
            "co2_saved_kg": round((product.co2_impact or 10) * 0.7, 1) if product else 7.0,
            "ewaste_prevented_kg": round(product.ewaste_impact or 0.5, 2) if product else 0.5,
            "water_saved_liters": round((product.water_impact or 50) * 0.6, 1) if product else 30.0,
            "lifespan_extended_months": return_item.remaining_life_pct * (product.avg_lifespan_months or 24) // 100 if return_item.remaining_life_pct else 12,
        },
    }

    return journey
