from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product, Order, Return
from app.schemas import ProductOut, ProductConfidenceOut

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    return db.query(Product).all()


@router.get("/{product_id}/confidence", response_model=ProductConfidenceOut)
def get_product_confidence(product_id: int, db: Session = Depends(get_db)):
    """
    Computes the Return Frequency Score (/10) for a product based on
    how many times it has historically been returned by all buyers.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Count all orders for this product
    orders = db.query(Order).filter(Order.product_id == product_id).all()
    total_orders = len(orders)

    # Count how many of those orders have at least one return
    total_returns = 0
    for order in orders:
        if db.query(Return).filter(Return.order_id == order.id).first():
            total_returns += 1

    # Compute return rate and score
    if total_orders == 0:
        return_rate = 0.0
        return_frequency_score = 9.0   # No data → optimistic default
    else:
        return_rate = round((total_returns / total_orders) * 100, 1)
        raw_score = (1 - total_returns / total_orders) * 10
        return_frequency_score = round(max(1.0, min(10.0, raw_score)), 1)

    # Human-readable label
    if return_frequency_score >= 8:
        return_label = "Rarely returned"
    elif return_frequency_score >= 5:
        return_label = "Sometimes returned"
    else:
        return_label = "Frequently returned"

    return ProductConfidenceOut(
        total_orders=total_orders,
        total_returns=total_returns,
        return_rate=return_rate,
        return_frequency_score=return_frequency_score,
        return_label=return_label,
    )


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}/alternatives", response_model=list[ProductOut])
def get_alternatives(product_id: int, db: Session = Depends(get_db)):
    """
    Stub: returns 2-3 products in the same category, excluding the current one.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    alternatives = (
        db.query(Product)
        .filter(Product.category == product.category, Product.id != product_id)
        .limit(3)
        .all()
    )
    return alternatives
