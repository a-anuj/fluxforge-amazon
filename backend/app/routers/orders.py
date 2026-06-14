import random

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Order, User, Product, GreenCreditTx
from app.schemas import OrderCreate, OrderOut, DeliveryOptionOut
from app.services.credit_engine import calculate_credits, get_delivery_credits, get_level, get_delivery_options
from app.services.impact_calculator import calculate_action_impact

router = APIRouter(prefix="/orders", tags=["orders"])


def compute_fit(user: User, product: Product) -> tuple[float, str]:
    """
    Simple rule-based fit scoring:
    - Parse user.sizes into a dict (e.g. "shoes:9,top:M" -> {"shoes":"9","top":"M"})
    - If any user size value matches product.size -> good fit
    - Otherwise -> poor fit
    """
    fit_score = round(random.uniform(40, 60), 1)
    return_risk = "high"

    if user.sizes and product.size:
        size_map = {}
        for pair in user.sizes.split(","):
            if ":" in pair:
                k, v = pair.split(":", 1)
                size_map[k.strip().lower()] = v.strip().lower()

        product_size = product.size.strip().lower()
        if product_size in size_map.values():
            fit_score = round(random.uniform(90, 100), 1)
            return_risk = "low"

    return fit_score, return_risk


@router.post("/", response_model=OrderOut, status_code=201)
def create_order(body: OrderCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    product = db.query(Product).filter(Product.id == body.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    fit_score, return_risk = compute_fit(user, product)

    # ── Calculate Green Credits ──
    total_credits = 0
    category = product.category.lower() if product.category else "electronics"

    # Credits for buying refurbished
    if body.is_refurbished:
        refurb_credits = calculate_credits("purchase_refurbished", category)
        total_credits += refurb_credits

        # Update user impact stats
        impact = calculate_action_impact("purchase_refurbished", category)
        user.co2_saved += impact["co2_saved"]
        user.ewaste_prevented += impact["ewaste_prevented"]
        user.water_saved += impact["water_saved"]
        user.products_reused += 1

    # Credits for eco-friendly delivery
    delivery_credits = get_delivery_credits(body.delivery_type, category)
    total_credits += delivery_credits

    # Award credits
    if total_credits > 0:
        user.green_credits += total_credits
        user.lifetime_credits += total_credits

        # Update level
        level_info = get_level(user.lifetime_credits)
        user.level = level_info["name"]

        # Create transaction(s)
        if body.is_refurbished:
            tx = GreenCreditTx(
                user_id=body.user_id,
                amount=refurb_credits,
                type="earned",
                action_type="purchase_refurbished",
                description=f"Purchased refurbished: {product.name}",
            )
            db.add(tx)

        if delivery_credits > 0:
            tx = GreenCreditTx(
                user_id=body.user_id,
                amount=delivery_credits,
                type="earned",
                action_type="eco_delivery",
                description=f"Eco-friendly {body.delivery_type} delivery",
            )
            db.add(tx)

    order = Order(
        user_id=body.user_id,
        product_id=body.product_id,
        status="placed",
        fit_score=fit_score,
        return_risk=return_risk,
        is_refurbished=body.is_refurbished,
        delivery_type=body.delivery_type,
        green_credits_earned=total_credits,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.get("/", response_model=list[OrderOut])
def list_orders(user_id: int = Query(...), db: Session = Depends(get_db)):
    return db.query(Order).filter(Order.user_id == user_id).all()


@router.get("/delivery-options", response_model=list[DeliveryOptionOut])
def list_delivery_options(category: str = Query("electronics")):
    """Return available delivery options with CO₂ and credit details."""
    return get_delivery_options(category)
