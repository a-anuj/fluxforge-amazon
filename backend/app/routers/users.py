from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, GreenCreditTx, GreenChallenge, Redemption
from app.schemas import (
    UserOut, UserUpdate, GreenCreditsResponse, GreenCreditTxOut,
    ImpactStatsOut, GreenChallengeOut,
)
from app.services.credit_engine import get_level, calculate_credits
from datetime import datetime, timezone

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    """List all users (for the profile-switcher dropdown)."""
    return db.query(User).all()


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, update_data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}/green-credits", response_model=GreenCreditsResponse)
def get_green_credits(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    txs = (
        db.query(GreenCreditTx)
        .filter(GreenCreditTx.user_id == user_id)
        .order_by(GreenCreditTx.created_at.desc())
        .all()
    )

    level_info = get_level(user.lifetime_credits)

    return GreenCreditsResponse(
        balance=user.green_credits,
        lifetime_credits=user.lifetime_credits,
        level=user.level,
        level_progress=level_info["progress"],
        next_level=level_info["next_level"],
        credits_to_next=level_info["credits_to_next"],
        transactions=[GreenCreditTxOut.model_validate(tx) for tx in txs],
    )


@router.get("/{user_id}/impact-stats", response_model=ImpactStatsOut)
def get_impact_stats(user_id: int, db: Session = Depends(get_db)):
    """Aggregated environmental impact stats for the sustainability dashboard."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    level_info = get_level(user.lifetime_credits)

    from app.models import Order
    total_orders = db.query(Order).filter(Order.user_id == user_id).count()
    circular_orders = db.query(Order).filter(
        Order.user_id == user_id,
        Order.is_refurbished == True
    ).count()

    circular_pct = round((circular_orders / total_orders * 100), 1) if total_orders > 0 else 0.0

    return ImpactStatsOut(
        co2_saved=user.co2_saved,
        ewaste_prevented=user.ewaste_prevented,
        water_saved=user.water_saved,
        products_reused=user.products_reused,
        products_repaired=user.products_repaired,
        products_resold=user.products_resold,
        level=user.level,
        lifetime_credits=user.lifetime_credits,
        level_progress=level_info["progress"],
        next_level=level_info["next_level"],
        credits_to_next=level_info["credits_to_next"],
        total_orders=total_orders,
        circular_orders=circular_orders,
        circular_percentage=circular_pct,
    )


@router.get("/{user_id}/challenges", response_model=list[GreenChallengeOut])
def get_challenges(user_id: int, db: Session = Depends(get_db)):
    """Get all challenges for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    challenges = (
        db.query(GreenChallenge)
        .filter(GreenChallenge.user_id == user_id)
        .order_by(GreenChallenge.created_at.desc())
        .all()
    )
    return challenges


@router.post("/{user_id}/challenges/{challenge_id}/complete")
def complete_challenge(user_id: int, challenge_id: int, db: Session = Depends(get_db)):
    """Mark a challenge as completed and award credits."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    challenge = db.query(GreenChallenge).filter(
        GreenChallenge.id == challenge_id,
        GreenChallenge.user_id == user_id,
    ).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if challenge.status != "active":
        raise HTTPException(status_code=400, detail="Challenge is not active")

    # Mark completed
    challenge.status = "completed"

    # Award credits
    credits = challenge.reward_credits
    user.green_credits += credits
    user.lifetime_credits += credits

    # Update level
    level_info = get_level(user.lifetime_credits)
    user.level = level_info["name"]

    # Create transaction
    tx = GreenCreditTx(
        user_id=user_id,
        amount=credits,
        type="earned",
        action_type="challenge",
        description=f"Challenge completed: {challenge.title}",
    )
    db.add(tx)
    db.commit()

    return {
        "message": "Challenge completed!",
        "green_credits_earned": credits,
        "new_balance": user.green_credits,
        "level": user.level,
    }
