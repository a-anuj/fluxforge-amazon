from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Return, Order, Listing, User, GreenCreditTx
from app.schemas import ReturnCreate, ReturnOut
from app.services.ai_assessment import assess_condition
from app.services.matching import find_best_match
from app.services.credit_engine import calculate_credits, get_level
from app.services.impact_calculator import calculate_action_impact
from app.services.sustainability_advisor import get_return_advice

router = APIRouter(prefix="/returns", tags=["returns"])


@router.post("/", status_code=201)
def create_return(body: ReturnCreate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == body.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # If AI assessment details are passed, use them; otherwise fall back to stub
    if body.recommended_action:
        condition_score = body.condition_score if body.condition_score is not None else 85.0
        defects = body.defects if body.defects is not None else "None detected"
        remaining_life_pct = body.remaining_life_pct if body.remaining_life_pct is not None else 90
        
        act_lower = body.recommended_action.lower()
        if "resale" in act_lower or "resell" in act_lower:
            action = "resell"
        elif "refurbish" in act_lower:
            action = "refurbish"
        elif "recycle" in act_lower:
            action = "recycle"
        elif "dispose" in act_lower:
            action = "dispose"
        else:
            action = act_lower
    else:
        assessment = assess_condition(body.image_urls)
        condition_score = assessment["condition_score"]
        defects = assessment["defects"]
        remaining_life_pct = assessment["remaining_life_pct"]
        action = assessment["recommended_action"]

    return_item = Return(
        order_id=body.order_id,
        image_urls=",".join(body.image_urls) if body.image_urls else None,
        condition_score=condition_score,
        defects=defects,
        remaining_life_pct=remaining_life_pct,
        recommended_action=action,
        status="assessed",
    )
    db.add(return_item)
    db.commit()
    db.refresh(return_item)

    # Mark original order as returned
    order.status = "returned"
    db.commit()

    # ── Award Green Credits for the return action ──
    product = order.product
    category = product.category.lower() if product and product.category else "electronics"
    # action is already defined above

    credits = calculate_credits(action, category)
    impact = calculate_action_impact(action, category)

    # Update return record
    return_item.green_credits_earned = credits

    # Update user stats
    user = db.query(User).filter(User.id == order.user_id).first()
    if user:
        user.green_credits += credits
        user.lifetime_credits += credits
        user.co2_saved += impact["co2_saved"]
        user.ewaste_prevented += impact["ewaste_prevented"]
        user.water_saved += impact["water_saved"]

        if action in ("resell", "refurbish"):
            user.products_resold += 1
        elif action == "repair":
            user.products_repaired += 1
        elif action == "donate":
            user.products_reused += 1

        # Update level
        level_info = get_level(user.lifetime_credits)
        user.level = level_info["name"]

        # Create credit transaction
        tx = GreenCreditTx(
            user_id=order.user_id,
            amount=credits,
            type="earned",
            action_type=action,
            description=f"Return action ({action}): {product.name if product else 'Product'}",
        )
        db.add(tx)

    db.commit()
    db.refresh(return_item)

    # If resellable, auto-create a listing and match to a shopping twin
    listing_id = None
    if assessment["recommended_action"] in ("resell", "refurbish"):
        discount = 0.7 if assessment["recommended_action"] == "resell" else 0.5
        listing = Listing(
            return_id=return_item.id,
            product_id=order.product_id,
            price=round(product.price * discount, 2) if product else 0,
            status="available",
        )
        db.add(listing)
        db.commit()
        db.refresh(listing)
        listing_id = listing.id

        # 🔌 STUB — calls heuristic matching; swap for ML model later
        matched_id = find_best_match(listing, db)
        if matched_id:
            listing.matched_user_id = matched_id
            listing.status = "matched"
            db.commit()

    # Get sustainability advice for response
    # NOTE: Order model has no created_at column yet — return_period_over defaults False
    # (ReLife listing hidden) until a timestamp migration is added to the orders table.
    advice = get_return_advice(product, assessment["condition_score"], return_period_over=False) if product else None

    return {
        "id": return_item.id,
        "order_id": return_item.order_id,
        "image_urls": return_item.image_urls,
        "condition_score": return_item.condition_score,
        "defects": return_item.defects,
        "remaining_life_pct": return_item.remaining_life_pct,
        "recommended_action": return_item.recommended_action,
        "status": return_item.status,
        "green_credits_earned": credits,
        "environmental_impact": impact,
        "sustainability_advice": advice,
        "listing_id": listing_id,
    }
