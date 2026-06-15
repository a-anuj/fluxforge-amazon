"""
Wishlist & Radius Matching API

Endpoints:
- CRUD for user wishlist items
- View matches (products returned near you that match your wishlist)
- Product journey/provenance for full transparency
- Purchase matched items with dynamic discount
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    Wishlist, WishlistMatch, WishlistNotification,
    Listing, Product, User, GreenCreditTx, Return, Order,
)
from app.services.wishlist_matcher import (
    get_product_journey,
    find_wishlist_matches,
    estimate_distance_km,
    calculate_dynamic_discount,
)
from app.services.credit_engine import calculate_credits, get_level
from app.services.impact_calculator import calculate_action_impact
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


# ── Schemas ────────────────────────────────────────────────────────────

class WishlistCreate(BaseModel):
    user_id: int
    product_id: Optional[int] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    keywords: Optional[str] = None
    max_price: Optional[float] = None
    radius_km: float = 10.0


class WishlistOut(BaseModel):
    id: int
    user_id: int
    product_id: Optional[int] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    keywords: Optional[str] = None
    max_price: Optional[float] = None
    radius_km: float
    status: str
    created_at: Optional[datetime] = None
    # Joined product info
    product_name: Optional[str] = None
    product_image: Optional[str] = None

    model_config = {"from_attributes": True}


class WishlistMatchOut(BaseModel):
    id: int
    wishlist_id: int
    listing_id: int
    match_score: float
    distance_km: Optional[float] = None
    discount_pct: float
    discounted_price: float
    logistics_saved: float
    co2_saved_delivery: float
    status: str
    notified_at: Optional[datetime] = None
    # Product info
    product_name: Optional[str] = None
    product_brand: Optional[str] = None
    product_category: Optional[str] = None
    product_image: Optional[str] = None
    original_price: Optional[float] = None
    condition_score: Optional[float] = None
    remaining_life_pct: Optional[int] = None
    recommended_action: Optional[str] = None


class PurchaseMatchRequest(BaseModel):
    user_id: int


# ── Wishlist CRUD ──────────────────────────────────────────────────────

@router.post("/", status_code=201)
def add_to_wishlist(body: WishlistCreate, db: Session = Depends(get_db)):
    """Add an item/preference to the user's wishlist."""
    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate at least one search criterion is provided
    if not body.product_id and not body.category and not body.brand and not body.keywords:
        raise HTTPException(
            status_code=400,
            detail="At least one of product_id, category, brand, or keywords is required",
        )

    # Check for existing duplicate
    existing = db.query(Wishlist).filter(
        Wishlist.user_id == body.user_id,
        Wishlist.product_id == body.product_id,
        Wishlist.category == body.category,
        Wishlist.brand == body.brand,
        Wishlist.status == "active",
    ).first()
    if existing:
        return {"message": "Already in wishlist", "wishlist_id": existing.id}

    wl = Wishlist(
        user_id=body.user_id,
        product_id=body.product_id,
        category=body.category,
        brand=body.brand,
        keywords=body.keywords,
        max_price=body.max_price,
        radius_km=body.radius_km,
    )
    db.add(wl)
    db.commit()
    db.refresh(wl)

    # Check for existing listings that match this new wishlist entry
    _check_existing_listings_for_wishlist(wl, db)

    return {
        "message": "Added to wishlist",
        "wishlist_id": wl.id,
        "radius_km": wl.radius_km,
    }


@router.get("/", response_model=list[WishlistOut])
def get_user_wishlist(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get all active wishlist items for a user."""
    items = (
        db.query(Wishlist)
        .filter(Wishlist.user_id == user_id, Wishlist.status == "active")
        .order_by(Wishlist.created_at.desc())
        .all()
    )

    results = []
    for item in items:
        product = db.query(Product).filter(Product.id == item.product_id).first() if item.product_id else None
        results.append(WishlistOut(
            id=item.id,
            user_id=item.user_id,
            product_id=item.product_id,
            category=item.category,
            brand=item.brand,
            keywords=item.keywords,
            max_price=item.max_price,
            radius_km=item.radius_km,
            status=item.status,
            created_at=item.created_at,
            product_name=product.name if product else None,
            product_image=product.image_url if product else None,
        ))

    return results


@router.delete("/{wishlist_id}")
def remove_from_wishlist(wishlist_id: int, db: Session = Depends(get_db)):
    """Remove an item from wishlist."""
    wl = db.query(Wishlist).filter(Wishlist.id == wishlist_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Wishlist item not found")

    wl.status = "removed"
    db.commit()
    return {"message": "Removed from wishlist"}


# ── Matches & Notifications ────────────────────────────────────────────

@router.get("/matches")
def get_wishlist_matches(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get all current matches for a user's wishlist — items available near them."""
    matches = (
        db.query(WishlistMatch)
        .filter(
            WishlistMatch.buyer_id == user_id,
            WishlistMatch.status.in_(["notified", "viewed"]),
        )
        .order_by(WishlistMatch.match_score.desc())
        .all()
    )

    results = []
    for m in matches:
        listing = db.query(Listing).filter(Listing.id == m.listing_id).first()
        product = db.query(Product).filter(Product.id == listing.product_id).first() if listing else None
        return_item = db.query(Return).filter(Return.id == m.return_id).first()

        results.append(WishlistMatchOut(
            id=m.id,
            wishlist_id=m.wishlist_id,
            listing_id=m.listing_id,
            match_score=m.match_score,
            distance_km=m.distance_km,
            discount_pct=m.discount_pct,
            discounted_price=m.discounted_price,
            logistics_saved=m.logistics_saved,
            co2_saved_delivery=m.co2_saved_delivery,
            status=m.status,
            notified_at=m.notified_at,
            product_name=product.name if product else None,
            product_brand=product.brand if product else None,
            product_category=product.category if product else None,
            product_image=product.image_url if product else None,
            original_price=product.price if product else None,
            condition_score=return_item.condition_score if return_item else None,
            remaining_life_pct=return_item.remaining_life_pct if return_item else None,
            recommended_action=return_item.recommended_action if return_item else None,
        ))

    return results


@router.get("/notifications")
def get_wishlist_notifications(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get unread wishlist match notifications."""
    notifications = (
        db.query(WishlistNotification)
        .filter(WishlistNotification.user_id == user_id)
        .order_by(WishlistNotification.created_at.desc())
        .limit(20)
        .all()
    )

    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "is_read": n.is_read,
            "match_id": n.match_id,
            "created_at": n.created_at,
        }
        for n in notifications
    ]


@router.post("/notifications/read")
def mark_notifications_read(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Mark all wishlist notifications as read."""
    db.query(WishlistNotification).filter(
        WishlistNotification.user_id == user_id,
        WishlistNotification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"message": "Notifications marked as read"}


# ── Product Journey ────────────────────────────────────────────────────

@router.get("/journey/{listing_id}")
def product_journey(listing_id: int, db: Session = Depends(get_db)):
    """
    Get full product journey/provenance for a listing.
    Shows transparent history: purchase → return → assessment → offer.
    """
    journey = get_product_journey(listing_id, db)
    if "error" in journey:
        raise HTTPException(status_code=404, detail=journey["error"])
    return journey


# ── Purchase a Matched Item ────────────────────────────────────────────

@router.post("/matches/{match_id}/purchase")
def purchase_match(match_id: int, body: PurchaseMatchRequest, db: Session = Depends(get_db)):
    """
    Purchase a wishlist-matched item at the dynamic discount price.
    Awards extra Green Credits for local/circular purchase.
    """
    match = db.query(WishlistMatch).filter(WishlistMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.status == "purchased":
        raise HTTPException(status_code=400, detail="Already purchased")
    if match.buyer_id != body.user_id:
        raise HTTPException(status_code=403, detail="This match is not for you")

    listing = db.query(Listing).filter(Listing.id == match.listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status == "sold":
        raise HTTPException(status_code=400, detail="Listing already sold")

    user = db.query(User).filter(User.id == body.user_id).first()
    product = db.query(Product).filter(Product.id == listing.product_id).first()
    category = product.category.lower() if product else "electronics"

    # Mark as purchased
    match.status = "purchased"
    match.purchased_at = datetime.now(timezone.utc)
    listing.status = "sold"

    # Mark wishlist as fulfilled
    wishlist = db.query(Wishlist).filter(Wishlist.id == match.wishlist_id).first()
    if wishlist:
        wishlist.status = "fulfilled"

    # Award Green Credits (bonus for local circular purchase)
    base_credits = calculate_credits("purchase_refurbished", category)
    local_bonus = 25  # Extra credits for reducing logistics
    total_credits = base_credits + local_bonus

    impact = calculate_action_impact("purchase_refurbished", category)

    user.green_credits += total_credits
    user.lifetime_credits += total_credits
    user.co2_saved += impact["co2_saved"] + match.co2_saved_delivery
    user.ewaste_prevented += impact["ewaste_prevented"]
    user.water_saved += impact["water_saved"]
    user.products_reused += 1

    level_info = get_level(user.lifetime_credits)
    user.level = level_info["name"]

    # Create credit transaction
    tx = GreenCreditTx(
        user_id=body.user_id,
        amount=total_credits,
        type="earned",
        action_type="wishlist_local_purchase",
        description=f"Wishlist match purchased locally: {product.name if product else 'Product'} ({match.distance_km:.0f}km away, saved ₹{match.logistics_saved:.0f} in logistics)",
    )
    db.add(tx)
    db.commit()

    return {
        "message": "Purchase successful!",
        "match_id": match.id,
        "listing_id": listing.id,
        "price_paid": match.discounted_price,
        "discount_pct": match.discount_pct,
        "savings": round(product.price - match.discounted_price) if product else 0,
        "green_credits_earned": total_credits,
        "new_balance": user.green_credits,
        "level": user.level,
        "environmental_impact": {
            "co2_saved": round(impact["co2_saved"] + match.co2_saved_delivery, 2),
            "ewaste_prevented": impact["ewaste_prevented"],
            "logistics_saved": match.logistics_saved,
            "delivery_distance_km": match.distance_km,
        },
    }


# ── Helper: Check existing listings for a new wishlist entry ───────────

def _check_existing_listings_for_wishlist(wishlist: Wishlist, db: Session):
    """When a user adds something to wishlist, check if there's already a match."""
    from app.services.wishlist_matcher import score_wishlist_match, estimate_distance_km

    available_listings = (
        db.query(Listing)
        .filter(Listing.status.in_(["available", "matched"]))
        .all()
    )

    buyer = db.query(User).filter(User.id == wishlist.user_id).first()
    buyer_pincode = buyer.pincode if buyer else None

    for listing in available_listings:
        product = db.query(Product).filter(Product.id == listing.product_id).first()
        if not product:
            continue

        return_item = db.query(Return).filter(Return.id == listing.return_id).first()
        if not return_item:
            continue

        order = db.query(Order).filter(Order.id == return_item.order_id).first()
        returner = db.query(User).filter(User.id == order.user_id).first() if order else None
        returner_pincode = returner.pincode if returner else None

        distance = estimate_distance_km(buyer_pincode, returner_pincode)
        if distance > wishlist.radius_km:
            continue

        score = score_wishlist_match(wishlist, product, return_item.condition_score or 70, distance, listing.price)
        if score < 30:
            continue

        # Create match
        from app.services.wishlist_matcher import calculate_dynamic_discount
        wishlist_age_days = 0  # Just created
        discount_info = calculate_dynamic_discount(
            product=product,
            condition_score=return_item.condition_score or 70,
            recommended_action=return_item.recommended_action or "resell",
            distance_km=distance,
            wishlist_age_days=wishlist_age_days,
            category=product.category,
        )

        match = WishlistMatch(
            wishlist_id=wishlist.id,
            listing_id=listing.id,
            return_id=return_item.id,
            buyer_id=wishlist.user_id,
            returner_id=order.user_id if order else 0,
            match_score=score,
            distance_km=distance,
            discount_pct=discount_info["discount_pct"],
            discounted_price=discount_info["discounted_price"],
            logistics_saved=discount_info["logistics_saved"],
            co2_saved_delivery=discount_info["co2_saved_delivery"],
            status="notified",
        )
        db.add(match)
        db.flush()

        notification = WishlistNotification(
            user_id=wishlist.user_id,
            match_id=match.id,
            title="🎁 A match already exists!",
            message=(
                f"{product.name} is already available at ₹{discount_info['discounted_price']:.0f} "
                f"({discount_info['discount_pct']}% off) — {distance:.0f}km from you!"
            ),
        )
        db.add(notification)

    db.commit()
