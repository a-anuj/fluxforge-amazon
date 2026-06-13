from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Return, Order, Listing
from app.schemas import ReturnCreate, ReturnOut
from app.services.ai_assessment import assess_condition
from app.services.matching import find_best_match

router = APIRouter(prefix="/returns", tags=["returns"])


@router.post("/", response_model=ReturnOut, status_code=201)
def create_return(body: ReturnCreate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == body.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # 🔌 STUB — calls mock assessment; swap assess_condition() for real AI later
    assessment = assess_condition(body.image_urls)

    return_item = Return(
        order_id=body.order_id,
        image_urls=",".join(body.image_urls) if body.image_urls else None,
        condition_score=assessment["condition_score"],
        defects=assessment["defects"],
        remaining_life_pct=assessment["remaining_life_pct"],
        recommended_action=assessment["recommended_action"],
        status="assessed",
    )
    db.add(return_item)
    db.commit()
    db.refresh(return_item)

    # Mark original order as returned
    order.status = "returned"
    db.commit()

    # If resellable, auto-create a listing and match to a shopping twin
    if assessment["recommended_action"] in ("resell", "refurbish"):
        product = order.product
        discount = 0.7 if assessment["recommended_action"] == "resell" else 0.5
        listing = Listing(
            return_id=return_item.id,
            product_id=order.product_id,
            price=round(product.price * discount, 2),
            status="available",
        )
        db.add(listing)
        db.commit()
        db.refresh(listing)

        # 🔌 STUB — calls heuristic matching; swap for ML model later
        matched_id = find_best_match(listing, db)
        if matched_id:
            listing.matched_user_id = matched_id
            listing.status = "matched"
            db.commit()

    return return_item
