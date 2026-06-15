"""
Green Credits Redemption System

Allows users to redeem green credits for discounts, Prime benefits,
or environmental donations.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Redemption, GreenCreditTx
from app.schemas import RedemptionCreate, RedemptionOut, RedemptionOptionOut
from app.services.credit_engine import get_level

router = APIRouter(prefix="/redemptions", tags=["redemptions"])

# Available redemption options
REDEMPTION_OPTIONS = [
    {
        "type": "discount_50",
        "title": "₹50 Amazon Coupon",
        "description": "Get ₹50 off your next order",
        "credits_required": 500,
        "icon": "🏷️",
    },
    {
        "type": "discount_100",
        "title": "₹100 Amazon Coupon",
        "description": "Get ₹100 off your next order",
        "credits_required": 900,
        "icon": "🎫",
    },
    {
        "type": "prime_shipping",
        "title": "Free Shipping Upgrade",
        "description": "One-time free express shipping on any order",
        "credits_required": 200,
        "icon": "🚚",
    },
    {
        "type": "prime_trial",
        "title": "Prime Trial Extension",
        "description": "7-day Prime membership extension",
        "credits_required": 400,
        "icon": "⭐",
    },
    {
        "type": "plant_tree",
        "title": "Plant a Tree",
        "description": "Fund planting of one tree through our NGO partner",
        "credits_required": 300,
        "icon": "🌳",
    },
    {
        "type": "recycle_fund",
        "title": "Support Recycling Program",
        "description": "Donate to e-waste recycling initiatives",
        "credits_required": 250,
        "icon": "",
    },
]


@router.get("/options", response_model=list[RedemptionOptionOut])
def get_redemption_options():
    """List all available redemption options."""
    return REDEMPTION_OPTIONS


@router.post("/redeem", response_model=RedemptionOut)
def redeem_credits(body: RedemptionCreate, db: Session = Depends(get_db)):
    """Redeem green credits for a reward."""
    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.green_credits < body.credits:
        raise HTTPException(status_code=400, detail="Insufficient green credits")

    # Find the matching option for description
    option = next((o for o in REDEMPTION_OPTIONS if o["type"] == body.type), None)
    if not option:
        raise HTTPException(status_code=400, detail="Invalid redemption type")

    if body.credits < option["credits_required"]:
        raise HTTPException(
            status_code=400,
            detail=f"This reward requires {option['credits_required']} credits"
        )

    # Deduct credits
    user.green_credits -= body.credits

    # Create redemption record
    redemption = Redemption(
        user_id=body.user_id,
        type=body.type,
        credits_spent=body.credits,
        description=option["title"],
    )
    db.add(redemption)

    # Create debit transaction
    tx = GreenCreditTx(
        user_id=body.user_id,
        amount=body.credits,
        type="redeemed",
        action_type="redeem",
        description=f"Redeemed: {option['title']}",
    )
    db.add(tx)
    db.commit()
    db.refresh(redemption)

    return redemption


@router.get("/history", response_model=list[RedemptionOut])
def get_redemption_history(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get redemption history for a user."""
    return (
        db.query(Redemption)
        .filter(Redemption.user_id == user_id)
        .order_by(Redemption.created_at.desc())
        .all()
    )
