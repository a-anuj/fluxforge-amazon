from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, GreenCreditTx
from app.schemas import UserOut, GreenCreditsResponse, GreenCreditTxOut

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


@router.get("/{user_id}/green-credits", response_model=GreenCreditsResponse)
def get_green_credits(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    txs = db.query(GreenCreditTx).filter(GreenCreditTx.user_id == user_id).all()
    return GreenCreditsResponse(
        balance=user.green_credits,
        transactions=[GreenCreditTxOut.model_validate(tx) for tx in txs],
    )
