import random

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Order, User, Product
from app.schemas import OrderCreate, OrderOut

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

    order = Order(
        user_id=body.user_id,
        product_id=body.product_id,
        status="placed",
        fit_score=fit_score,
        return_risk=return_risk,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.get("/", response_model=list[OrderOut])
def list_orders(user_id: int = Query(...), db: Session = Depends(get_db)):
    return db.query(Order).filter(Order.user_id == user_id).all()
