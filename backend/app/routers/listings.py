from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Listing, User, GreenCreditTx, Product, Order
from app.schemas import ListingOut, PurchaseRequest
from app.services.credit_engine import calculate_credits, get_level
from app.services.impact_calculator import calculate_action_impact

router = APIRouter(prefix="/listings", tags=["listings"])


@router.get("/feed", response_model=list[ListingOut])
def get_feed(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Second-life feed — listings matched to the given user."""
    return (
        db.query(Listing)
        .options(joinedload(Listing.product), joinedload(Listing.return_item))
        .filter(Listing.matched_user_id == user_id)
        .all()
    )


@router.get("/all", response_model=list[ListingOut])
def list_all_listings(db: Session = Depends(get_db)):
    """All available listings (for browse page)."""
    return (
        db.query(Listing)
        .options(joinedload(Listing.product), joinedload(Listing.return_item))
        .filter(Listing.status.in_(["available", "matched"]))
        .all()
    )


@router.get("/{listing_id}", response_model=ListingOut)
def get_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = (
        db.query(Listing)
        .options(joinedload(Listing.product), joinedload(Listing.return_item))
        .filter(Listing.id == listing_id)
        .first()
    )
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


@router.post("/{listing_id}/purchase")
def purchase_listing(listing_id: int, body: PurchaseRequest, db: Session = Depends(get_db)):
    listing = db.query(Listing).filter(Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status == "sold":
        raise HTTPException(status_code=400, detail="Listing already sold")

    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    product = db.query(Product).filter(Product.id == listing.product_id).first()
    category = product.category.lower() if product and product.category else "electronics"

    listing.status = "sold"

    # Dynamic Green Credits via Smart Credit Engine
    credits = calculate_credits("purchase_refurbished", category)
    impact = calculate_action_impact("purchase_refurbished", category)

    user.green_credits += credits
    user.lifetime_credits += credits
    user.co2_saved += impact["co2_saved"]
    user.ewaste_prevented += impact["ewaste_prevented"]
    user.water_saved += impact["water_saved"]
    user.products_reused += 1

    level_info = get_level(user.lifetime_credits)
    user.level = level_info["name"]

    tx = GreenCreditTx(
        user_id=body.user_id, amount=credits, type="earned",
        action_type="purchase_refurbished",
        description=f"Purchased second-life: {product.name if product else 'Product'}",
    )
    db.add(tx)
    
    new_order = Order(
        user_id=body.user_id,
        product_id=listing.product_id,
        status="placed",
        is_refurbished=True,
    )
    db.add(new_order)
    
    db.commit()

    return {
        "message": "Purchase successful!",
        "green_credits_earned": credits,
        "new_balance": user.green_credits,
        "level": user.level,
        "environmental_impact": impact,
    }
