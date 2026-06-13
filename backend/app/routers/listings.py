from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Listing, User, GreenCreditTx
from app.schemas import ListingOut, PurchaseRequest

router = APIRouter(prefix="/listings", tags=["listings"])


@router.get("/feed", response_model=list[ListingOut])
def get_feed(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Second-life feed — listings matched to the given user."""
    listings = (
        db.query(Listing)
        .options(joinedload(Listing.product), joinedload(Listing.return_item))
        .filter(Listing.matched_user_id == user_id)
        .all()
    )
    return listings


@router.get("/all", response_model=list[ListingOut])
def list_all_listings(db: Session = Depends(get_db)):
    """All available listings (for browse page)."""
    listings = (
        db.query(Listing)
        .options(joinedload(Listing.product), joinedload(Listing.return_item))
        .filter(Listing.status.in_(["available", "matched"]))
        .all()
    )
    return listings


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

    # Mark as sold
    listing.status = "sold"

    # Award green credits
    GREEN_CREDIT_REWARD = 20
    user.green_credits += GREEN_CREDIT_REWARD
    tx = GreenCreditTx(
        user_id=body.user_id,
        amount=GREEN_CREDIT_REWARD,
        type="earned",
    )
    db.add(tx)
    db.commit()

    return {
        "message": "Purchase successful!",
        "green_credits_earned": GREEN_CREDIT_REWARD,
        "new_balance": user.green_credits,
    }
