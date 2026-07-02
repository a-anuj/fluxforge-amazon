import random
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Order, User, Product, GreenCreditTx, Return
from app.schemas import OrderCreate, OrderOut, DeliveryOptionOut
from app.services.credit_engine import calculate_credits, get_delivery_credits, get_level, get_delivery_options
from app.services.impact_calculator import calculate_action_impact

router = APIRouter(prefix="/orders", tags=["orders"])

# Return window configuration per category (in days)
RETURN_WINDOW_DAYS = {
    "electronics": 7,
    "clothing": 7,
    "running": 7,
    "sports": 7,
    "books": 7,
    "furniture": 7,
    "appliances": 7,
    "other": 7,
}

# No-return loyalty credits base reward
NO_RETURN_CREDIT_BASE = 20  # base credits for keeping the product


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

    # ── Calculate No-Return Loyalty Credits (pending) ──
    return_period = RETURN_WINDOW_DAYS.get(category, 30)
    no_return_credits = calculate_credits("purchase_refurbished", category, multiplier=0.4, override_base=NO_RETURN_CREDIT_BASE)

    order = Order(
        user_id=body.user_id,
        product_id=body.product_id,
        status="placed",
        fit_score=fit_score,
        return_risk=return_risk,
        is_refurbished=body.is_refurbished,
        delivery_type=body.delivery_type,
        green_credits_earned=total_credits,
        placed_at=datetime.now(timezone.utc),
        return_period_days=return_period,
        no_return_credits=no_return_credits,
        no_return_credits_status="pending",
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.get("/", response_model=list[OrderOut])
def list_orders(user_id: int = Query(...), db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.user_id == user_id).order_by(Order.id.desc()).all()
    result = []
    for order in orders:
        out = OrderOut.model_validate(order)
        out.has_baseline_scan = bool(order.baseline_scan_urls)
        result.append(out)
    return result


@router.get("/delivery-options", response_model=list[DeliveryOptionOut])
def list_delivery_options(category: str = Query("electronics")):
    """Return available delivery options with CO₂ and credit details."""
    return get_delivery_options(category)


@router.post("/{order_id}/vest-credits", response_model=dict)
def vest_no_return_credits(order_id: int, db: Session = Depends(get_db)):
    """
    Check if the return window has passed for an order without any returns.
    If so, vest the pending no-return loyalty credits to the user.
    Called by the frontend when user visits the orders page.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.no_return_credits_status != "pending":
        return {
            "status": order.no_return_credits_status,
            "message": "Credits already processed",
            "credits_vested": 0,
        }

    # If order was returned — forfeit
    has_return = db.query(Return).filter(Return.order_id == order_id).first()
    if has_return:
        order.no_return_credits_status = "forfeited"
        db.commit()
        return {
            "status": "forfeited",
            "message": "Order was returned — loyalty credits forfeited",
            "credits_vested": 0,
        }

    # Check if return window has elapsed
    now = datetime.now(timezone.utc)
    placed_at = order.placed_at
    if placed_at and placed_at.tzinfo is None:
        placed_at = placed_at.replace(tzinfo=timezone.utc)

    if placed_at is None:
        return {"status": "pending", "message": "Order date unavailable", "credits_vested": 0}

    vest_date = placed_at + timedelta(days=order.return_period_days)

    if now < vest_date:
        days_remaining = max(1, (vest_date - now).days)
        return {
            "status": "pending",
            "message": f"Return window active — {days_remaining} day(s) remaining",
            "credits_vested": 0,
            "days_remaining": days_remaining,
        }

    # Vest the credits!
    order.no_return_credits_status = "vested"
    user = db.query(User).filter(User.id == order.user_id).first()
    credits_vested = 0
    if user:
        credits_vested = order.no_return_credits
        user.green_credits += credits_vested
        user.lifetime_credits += credits_vested
        level_info = get_level(user.lifetime_credits)
        user.level = level_info["name"]

        product = db.query(Product).filter(Product.id == order.product_id).first()
        product_name = product.name if product else f"Product #{order.product_id}"

        tx = GreenCreditTx(
            user_id=order.user_id,
            amount=credits_vested,
            type="earned",
            action_type="no_return_loyalty",
            description=f"Loyalty reward: kept '{product_name}' past the return window",
        )
        db.add(tx)

    db.commit()
    return {
        "status": "vested",
        "message": "Green Credits vested 🌱 Thank you for keeping your product!",
        "credits_vested": credits_vested,
    }
