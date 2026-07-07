"""
Community Resale Marketplace router.
Peer-to-peer resale with location-based discovery, AI price suggestions,
Green Credits incentives, and e-waste impact tracking.
"""

import os
import json
import re
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

import boto3
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import (
    User, CommunityListing, CommunityAlert,
    CommunityNotification, GreenCreditTx, EWASTE_KG_BY_CATEGORY
)
from app.schemas import (
    CommunityListingCreate, CommunityListingOut,
    PriceSuggestRequest, PriceSuggestResponse,
    CommunityNotificationOut, LeaderboardEntry,
    InvoiceVerifyResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/community", tags=["community"])

MODEL_ID = "amazon.nova-lite-v1:0"

CONDITION_LABELS = {
    "like_new": "Like New",
    "good": "Good",
    "fair": "Fair",
    "poor": "Poor",
}

# Green Credits constants
CREDITS_LISTING_POST = 5
CREDITS_SELLER_SALE = 25
CREDITS_BUYER_ANY = 15
CREDITS_BUYER_LOCAL = 30       # same pincode
CREDITS_LOCAL_PICKUP_BONUS = 15
CREDITS_FIRST_LISTING = 50


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_bedrock_client():
    return boto3.client(
        "bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )


def _get_s3_client():
    return boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )


def _add_credits(db: Session, user: User, amount: int, action_type: str, description: str):
    """Award green credits to a user and update their totals."""
    user.green_credits += amount
    user.lifetime_credits += amount
    tx = GreenCreditTx(
        user_id=user.id,
        amount=amount,
        type="earned",
        action_type=action_type,
        description=description,
    )
    db.add(tx)
    _update_level(user)


def _update_level(user: User):
    lc = user.lifetime_credits
    if lc >= 500:
        user.level = "Circular Champion"
    elif lc >= 300:
        user.level = "Planet Protector"
    elif lc >= 150:
        user.level = "Green Hero"
    elif lc >= 50:
        user.level = "Sapling"
    else:
        user.level = "Seed"


def _seller_trust_score(db: Session, seller_id: int) -> float:
    """0-5 star trust score based on completed sales."""
    count = db.query(func.count(CommunityListing.id)).filter(
        CommunityListing.seller_id == seller_id,
        CommunityListing.status == "sold",
    ).scalar() or 0
    return min(5.0, round(1.0 + count * 0.5, 1))


def _notify_nearby_users(db: Session, listing: CommunityListing):
    """Create in-app notifications for users with matching category alerts."""
    alerts = db.query(CommunityAlert).filter(
        CommunityAlert.category.ilike(listing.category),
    ).all()
    for alert in alerts:
        if alert.user_id == listing.seller_id:
            continue  # don't notify yourself
        if alert.pincode and alert.pincode != listing.pincode:
            continue  # skip non-local alerts if pincode set
        locality = "near you" if alert.pincode == listing.pincode else "on Community Marketplace"
        notif = CommunityNotification(
            user_id=alert.user_id,
            listing_id=listing.id,
            message=f"New {listing.category} listing {locality}: \"{listing.title}\" at ₹{int(listing.asking_price):,}",
        )
        db.add(notif)


def _bedrock_price_suggest(category: str, brand: Optional[str], condition: str,
                            description: Optional[str], original_price: Optional[float]) -> dict:
    """Call Bedrock Nova Lite to get AI price suggestion."""
    prompt = f"""You are a pricing expert for second-hand goods in India.

Suggest a fair resale price for:
- Category: {category}
- Brand: {brand or 'Unknown'}
- Condition: {condition} ({CONDITION_LABELS.get(condition, condition)})
- Description: {description or 'No description provided'}
- Original/MRP Price: {'₹' + str(int(original_price)) if original_price else 'Unknown'}

Return ONLY valid JSON (no markdown):
{{
  "suggested_price": 0,
  "price_range_low": 0,
  "price_range_high": 0,
  "depreciation_pct": 0,
  "reasoning": ""
}}"""

    client = _get_bedrock_client()
    response = client.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 300, "temperature": 0.3},
    )
    raw = response["output"]["message"]["content"][0]["text"].strip()
    # Strip any markdown fences
    raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`")
    return json.loads(raw)


def _bedrock_image_check(image_bytes: bytes, content_type: str, category: str, title: str) -> dict:
    """Call Bedrock Nova Lite to verify image matches listing and check condition."""
    format_map = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif"
    }
    img_format = format_map.get(content_type, "jpeg")
    
    prompt = f"""You are an AI Quality Verifier for a community resale marketplace.
The user is listing a '{title}' in the '{category}' category.
1. Verify if the object in the image matches the category and title.
2. Assess its physical condition.
3. Decide if it's in acceptable condition to be resold.

Return ONLY valid JSON:
{{
  "is_valid": true,
  "condition_summary": "Short description of what you see and its condition",
  "reasoning": "Why it was accepted or rejected"
}}"""

    client = _get_bedrock_client()
    try:
        response = client.converse(
            modelId=MODEL_ID,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "image": {
                                "format": img_format,
                                "source": {"bytes": image_bytes}
                            }
                        },
                        {
                            "text": prompt
                        }
                    ]
                }
            ],
            inferenceConfig={"maxTokens": 300, "temperature": 0.3},
        )
        raw = response["output"]["message"]["content"][0]["text"].strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`")
        return json.loads(raw)
    except Exception as e:
        logger.error(f"Bedrock image check error: {e}")
        # Default to valid if AI fails so we don't block users due to AI downtime
        return {"is_valid": True, "condition_summary": "AI check bypassed due to service error", "reasoning": str(e)}


def _bedrock_invoice_check(
    image_bytes: bytes,
    content_type: str,
    claimed_title: str,
    claimed_category: str,
    claimed_brand: Optional[str],
) -> dict:
    """
    Use Nova Pro to extract invoice data and validate it matches the listing.
    Returns structured data so the frontend can show what the AI read.
    Strict: if the invoice cannot be read or doesn't match, verified=False.
    """
    format_map = {"image/jpeg": "jpeg", "image/png": "png",
                  "image/webp": "webp", "image/gif": "gif"}
    img_format = format_map.get(content_type, "jpeg")

    prompt = f"""You are a strict invoice verification system for a second-hand marketplace.
The seller claims to be selling: "{claimed_title}" (category: {claimed_category}{', brand: ' + claimed_brand if claimed_brand else ''}).

Carefully examine this invoice/receipt/bill image and:
1. Extract all readable text — product name, store/retailer, purchase date, total amount.
2. Verify whether the product on the invoice plausibly matches what the seller is listing.
3. Confirm this is a genuine purchase document (not a screenshot of a listing, not a blank page, not a product photo).

Be STRICT. If the document is unclear, unreadable, or doesn't match, mark verified=false.

Return ONLY valid JSON:
{{
  "verified": true,
  "product_name": "exact product name from invoice",
  "store": "store or retailer name",
  "purchase_date": "date as shown on invoice",
  "invoice_total": "total amount as shown",
  "match_confidence": "high",
  "mismatch_reason": null
}}

match_confidence must be one of: "high", "medium", "low".
If not verified, set verified=false and explain in mismatch_reason."""

    client = _get_bedrock_client()
    try:
        response = client.converse(
            modelId="amazon.nova-pro-v1:0",   # use Nova Pro for document reading
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": img_format, "source": {"bytes": image_bytes}}},
                    {"text": prompt},
                ],
            }],
            inferenceConfig={"maxTokens": 500, "temperature": 0.1},
        )
        raw = response["output"]["message"]["content"][0]["text"].strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`")
        return json.loads(raw)
    except Exception as e:
        logger.error(f"Bedrock invoice check error: {e}")
        # If Bedrock is unavailable, be conservative — reject rather than silently pass
        return {
            "verified": False,
            "product_name": None,
            "store": None,
            "purchase_date": None,
            "invoice_total": None,
            "match_confidence": "low",
            "mismatch_reason": f"Invoice verification service unavailable: {str(e)}",
        }

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/listings", response_model=CommunityListingOut)
def create_listing(payload: CommunityListingCreate, db: Session = Depends(get_db)):
    """Create a new community resale listing."""
    seller = db.query(User).filter(User.id == payload.seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    # E-waste impact
    cat_key = payload.category.lower()
    ewaste = EWASTE_KG_BY_CATEGORY.get(cat_key, EWASTE_KG_BY_CATEGORY.get("other", 0.5))

    # Trust score
    trust = _seller_trust_score(db, seller.id)

    listing = CommunityListing(
        seller_id=payload.seller_id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        brand=payload.brand,
        asking_price=payload.asking_price,
        condition=payload.condition,
        city=payload.city or seller.city,
        pincode=payload.pincode or seller.pincode,
        allows_local_pickup=payload.allows_local_pickup,
        ewaste_kg_saved=ewaste,
        seller_trust_score=trust,
        # ── Provenance ──
        purchase_source=payload.purchase_source,
        amazon_order_id=payload.amazon_order_id,
        invoice_image_url=payload.invoice_image_url,
        invoice_verified=payload.invoice_verified,
        invoice_product_name=payload.invoice_product_name,
        invoice_store=payload.invoice_store,
        invoice_date=payload.invoice_date,
    )
    db.add(listing)
    db.flush()  # get listing.id

    # Award credits for posting
    is_first = db.query(func.count(CommunityListing.id)).filter(
        CommunityListing.seller_id == seller.id
    ).scalar() == 1
    if is_first:
        _add_credits(db, seller, CREDITS_FIRST_LISTING, "community_first_listing",
                     "First community listing bonus!")
    _add_credits(db, seller, CREDITS_LISTING_POST, "community_listing_posted",
                 f"Listed \"{payload.title}\" on Community Marketplace")

    # Update environmental impact on seller
    seller.ewaste_prevented = (seller.ewaste_prevented or 0) + ewaste

    # Notify nearby users
    _notify_nearby_users(db, listing)

    db.commit()
    db.refresh(listing)

    out = CommunityListingOut.model_validate(listing)
    out.seller = listing.seller
    return out


@router.get("/listings", response_model=list[CommunityListingOut])
def get_all_listings(
    user_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Browse all active listings, newest first."""
    q = db.query(CommunityListing).filter(CommunityListing.status == "active")
    if category:
        q = q.filter(CommunityListing.category.ilike(f"%{category}%"))
    listings = q.order_by(CommunityListing.created_at.desc()).all()

    user_pincode = None
    if user_id:
        u = db.query(User).filter(User.id == user_id).first()
        user_pincode = u.pincode if u else None

    result = []
    for l in listings:
        out = CommunityListingOut.model_validate(l)
        out.seller = l.seller
        out.is_local = bool(user_pincode and l.pincode and user_pincode == l.pincode)
        result.append(out)
    return result


@router.get("/listings/nearby", response_model=list[CommunityListingOut])
def get_nearby_listings(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Return listings in the same pincode first, then same city."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    all_active = db.query(CommunityListing).filter(
        CommunityListing.status == "active",
        CommunityListing.seller_id != user_id,
    ).order_by(CommunityListing.created_at.desc()).all()

    same_pincode, same_city, rest = [], [], []
    for l in all_active:
        if user.pincode and l.pincode == user.pincode:
            same_pincode.append(l)
        elif user.city and l.city and l.city.lower() == user.city.lower():
            same_city.append(l)
        else:
            rest.append(l)

    result = []
    for l in same_pincode + same_city + rest:
        out = CommunityListingOut.model_validate(l)
        out.seller = l.seller
        out.is_local = bool(user.pincode and l.pincode and user.pincode == l.pincode)
        result.append(out)
    return result


@router.get("/listings/{listing_id}", response_model=CommunityListingOut)
def get_listing(listing_id: int, user_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    listing = db.query(CommunityListing).filter(CommunityListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    user_pincode = None
    if user_id:
        u = db.query(User).filter(User.id == user_id).first()
        user_pincode = u.pincode if u else None

    out = CommunityListingOut.model_validate(listing)
    out.seller = listing.seller
    out.is_local = bool(user_pincode and listing.pincode and user_pincode == listing.pincode)
    return out

@router.get("/purchases", response_model=List[CommunityListingOut])
def get_community_purchases(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Fetch community listings bought by this user."""
    listings = db.query(CommunityListing).filter(CommunityListing.buyer_id == user_id).order_by(CommunityListing.sold_at.desc()).all()
    user = db.query(User).filter(User.id == user_id).first()
    user_pincode = user.pincode if user else None
    
    results = []
    for l in listings:
        out = CommunityListingOut.model_validate(l)
        out.seller = l.seller
        out.is_local = bool(user_pincode and l.pincode and user_pincode == l.pincode)
        results.append(out)
    return results

@router.put("/listings/{listing_id}/buy", response_model=CommunityListingOut)
def buy_listing(listing_id: int, buyer_id: int = Query(...), db: Session = Depends(get_db)):
    """Purchase a listing — award Green Credits to both buyer and seller."""
    listing = db.query(CommunityListing).filter(CommunityListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status != "active":
        raise HTTPException(status_code=400, detail="Listing is no longer available")
    if listing.seller_id == buyer_id:
        raise HTTPException(status_code=400, detail="You cannot buy your own listing")

    buyer = db.query(User).filter(User.id == buyer_id).first()
    seller = listing.seller
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")

    is_local = bool(buyer.pincode and listing.pincode and buyer.pincode == listing.pincode)
    is_pickup = listing.allows_local_pickup and is_local

    # Award credits — buyer
    buyer_credits = CREDITS_BUYER_LOCAL if is_local else CREDITS_BUYER_ANY
    _add_credits(db, buyer, buyer_credits, "community_purchase",
                 f"Bought \"{listing.title}\" {'locally ' if is_local else ''}via Community Marketplace")
    if is_pickup:
        _add_credits(db, buyer, CREDITS_LOCAL_PICKUP_BONUS, "local_pickup_bonus",
                     "Local pickup bonus — zero delivery emissions!")

    # Award credits — seller
    _add_credits(db, seller, CREDITS_SELLER_SALE, "community_sale",
                 f"Sold \"{listing.title}\" on Community Marketplace")
    if is_pickup:
        _add_credits(db, seller, CREDITS_LOCAL_PICKUP_BONUS, "local_pickup_bonus",
                     "Local pickup bonus — zero delivery emissions!")

    # Update seller impact stats
    seller.products_resold = (seller.products_resold or 0) + 1
    seller.ewaste_prevented = (seller.ewaste_prevented or 0) + listing.ewaste_kg_saved

    # Mark listing sold
    listing.status = "sold"
    listing.buyer_id = buyer_id
    listing.sold_at = datetime.now(timezone.utc)
    listing.seller_trust_score = _seller_trust_score(db, seller.id)

    db.commit()
    db.refresh(listing)

    out = CommunityListingOut.model_validate(listing)
    out.seller = listing.seller
    out.is_local = is_local
    return out


@router.post("/verify-image")
async def verify_community_image(
    image: UploadFile = File(...),
    category: str = Form(""),
    title: str = Form("")
):
    """Pre-flight AI verification for a community listing image."""
    content_type = image.content_type or "image/jpeg"
    raw = await image.read()
    
    ai_result = _bedrock_image_check(raw, content_type, category, title)
    if not ai_result.get("is_valid", True):
        raise HTTPException(status_code=400, detail=f"{ai_result.get('reasoning', 'Image rejected.')}")
        
    return {"condition_summary": ai_result.get("condition_summary", "")}


@router.post("/verify-invoice", response_model=InvoiceVerifyResponse)
async def verify_invoice(
    invoice: UploadFile = File(...),
    claimed_title: str = Form(...),
    claimed_category: str = Form(...),
    claimed_brand: str = Form(""),
):
    """
    Strict invoice/bill verification using Nova Pro.

    The seller uploads a photo of their purchase invoice/receipt.
    Nova Pro extracts the product name, store, date and total, then checks
    whether the document plausibly supports the listing claim.

    Rules enforced:
    - Document must be a recognisable invoice / receipt / bill.
    - Product name on invoice must match claimed category/brand.
    - Only verified=True listings receive the 'Invoice Verified' trust badge.
    - Image is uploaded to S3 for audit trail regardless of outcome.

    Returns structured extraction data so the UI can show the seller exactly
    what the AI read — building transparency in both directions.
    """
    content_type = invoice.content_type or "image/jpeg"

    # --- File type gate -------------------------------------------------
    allowed_types = {"image/jpeg", "image/png", "image/webp",
                     "image/gif", "application/pdf"}
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Invoice must be an image (JPEG/PNG/WebP) or PDF."
        )

    raw = await invoice.read()

    # --- Size gate: 15 MB max -------------------------------------------
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Invoice file too large (max 15 MB).")

    # --- PDF: convert first page to JPEG for Bedrock vision -------------
    if content_type == "application/pdf":
        try:
            from PIL import Image as PILImage
            import io
            # Try pdf2image if available, else tell user to upload image
            try:
                from pdf2image import convert_from_bytes
                pages = convert_from_bytes(raw, dpi=150, first_page=1, last_page=1)
                buf = io.BytesIO()
                pages[0].save(buf, format="JPEG")
                raw = buf.getvalue()
                content_type = "image/jpeg"
            except ImportError:
                raise HTTPException(
                    status_code=400,
                    detail="PDF invoices are not supported yet. Please upload a photo of your invoice instead."
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not process PDF: {e}")

    # --- AI invoice extraction ------------------------------------------
    ai = _bedrock_invoice_check(
        raw, content_type,
        claimed_title, claimed_category, claimed_brand or None
    )

    # --- Upload to S3 for audit trail (regardless of outcome) -----------
    s3_key = None
    bucket = os.getenv("AWS_S3_BUCKET_NAME")
    if bucket:
        try:
            ext = "jpg" if "jpeg" in content_type else content_type.split("/")[-1]
            s3_key = f"invoices/{uuid.uuid4().hex}.{ext}"
            s3 = _get_s3_client()
            s3.put_object(
                Bucket=bucket, Key=s3_key, Body=raw,
                ContentType=content_type,
                Metadata={
                    "claimed_title": claimed_title[:200],
                    "verified": str(ai.get("verified", False)),
                },
            )
        except Exception as e:
            logger.warning(f"Invoice S3 upload failed (non-fatal): {e}")

    verified = bool(ai.get("verified", False))

    return InvoiceVerifyResponse(
        verified=verified,
        product_name=ai.get("product_name"),
        store=ai.get("store"),
        purchase_date=ai.get("purchase_date"),
        invoice_total=ai.get("invoice_total"),
        match_confidence=ai.get("match_confidence", "low"),
        mismatch_reason=ai.get("mismatch_reason") if not verified else None,
        s3_key=s3_key,
    )


@router.post("/listings/{listing_id}/image")
async def upload_listing_image(listing_id: int, image: UploadFile = File(...),
                                db: Session = Depends(get_db)):
    """Upload an image for a community listing to S3."""
    listing = db.query(CommunityListing).filter(CommunityListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    content_type = image.content_type or "image/jpeg"
    raw = await image.read()
    
    # 1. AI Image Verification
    ai_result = _bedrock_image_check(raw, content_type, listing.category, listing.title)
    if not ai_result.get("is_valid", True):
        # Image is invalid, delete the pending listing and return error
        db.delete(listing)
        db.commit()
        raise HTTPException(status_code=400, detail=f"AI Verification Failed: {ai_result.get('reasoning', 'Image rejected.')}")
        
    # Save the AI condition summary
    listing.ai_condition_summary = ai_result.get("condition_summary", "")

    # 2. Upload to S3
    bucket = os.getenv("AWS_S3_BUCKET_NAME")
    if not bucket:
        raise HTTPException(status_code=500, detail="S3 not configured")

    key = f"community/{listing_id}/{uuid.uuid4()}-{image.filename}"
    try:
        s3 = _get_s3_client()
        s3.put_object(Bucket=bucket, Key=key, Body=raw, ContentType=content_type)
    except Exception as e:
        logger.error(f"S3 upload failed: {e}")
        raise HTTPException(status_code=500, detail="Image upload failed")

    existing = listing.image_urls or ""
    keys = [k for k in existing.split(",") if k]
    keys.append(key)
    listing.image_urls = ",".join(keys)
    db.commit()

    region = os.getenv("AWS_REGION", "us-east-1")
    url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    return {"key": key, "url": url, "condition_summary": listing.ai_condition_summary}

from fastapi.responses import RedirectResponse

@router.get("/image/{key:path}")
def get_image(key: str):
    """Proxy redirect to a signed S3 URL for community images."""
    s3 = _get_s3_client()
    bucket = os.getenv("AWS_S3_BUCKET_NAME")
    try:
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=3600
        )
        return RedirectResponse(url)
    except Exception as e:
        logger.error(f"Failed to generate presigned URL: {e}")
        raise HTTPException(status_code=404, detail="Image not found")


@router.post("/price-suggest", response_model=PriceSuggestResponse)
def suggest_price(payload: PriceSuggestRequest):
    """Use AWS Bedrock AI to suggest a fair resale price."""
    try:
        result = _bedrock_price_suggest(
            payload.category, payload.brand, payload.condition,
            payload.description, payload.original_price,
        )
        return PriceSuggestResponse(
            suggested_price=float(result.get("suggested_price", 0)),
            price_range_low=float(result.get("price_range_low", 0)),
            price_range_high=float(result.get("price_range_high", 0)),
            reasoning=result.get("reasoning", ""),
            depreciation_pct=float(result.get("depreciation_pct", 0)),
        )
    except Exception as e:
        logger.error(f"Price suggestion failed: {e}")
        raise HTTPException(status_code=500, detail="AI price suggestion failed")


@router.get("/notifications", response_model=list[CommunityNotificationOut])
def get_notifications(user_id: int = Query(...), db: Session = Depends(get_db)):
    notifs = db.query(CommunityNotification).filter(
        CommunityNotification.user_id == user_id
    ).order_by(CommunityNotification.created_at.desc()).limit(50).all()
    return notifs


@router.get("/notifications/unread-count")
def get_unread_count(user_id: int = Query(...), db: Session = Depends(get_db)):
    count = db.query(func.count(CommunityNotification.id)).filter(
        CommunityNotification.user_id == user_id,
        CommunityNotification.is_read == False,
    ).scalar() or 0
    return {"unread_count": count}


@router.put("/notifications/read")
def mark_notifications_read(user_id: int = Query(...), db: Session = Depends(get_db)):
    db.query(CommunityNotification).filter(
        CommunityNotification.user_id == user_id,
        CommunityNotification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db)):
    """Top users ranked by total e-waste prevented through community sales."""
    rows = (
        db.query(
            User.id,
            User.name,
            User.city,
            User.ewaste_prevented,
            User.products_resold,
            User.green_credits,
            User.level,
        )
        .filter(User.products_resold > 0)
        .order_by(User.ewaste_prevented.desc())
        .limit(20)
        .all()
    )
    return [
        LeaderboardEntry(
            user_id=r.id,
            name=r.name,
            city=r.city,
            ewaste_kg_saved=r.ewaste_prevented or 0,
            listings_sold=r.products_resold or 0,
            green_credits=r.green_credits or 0,
            level=r.level or "Seed",
        )
        for r in rows
    ]


@router.post("/alerts")
def create_alert(user_id: int, category: str, pincode: Optional[str] = None,
                 db: Session = Depends(get_db)):
    """Subscribe to new listing alerts for a category."""
    # Check not duplicate
    existing = db.query(CommunityAlert).filter(
        CommunityAlert.user_id == user_id,
        CommunityAlert.category.ilike(category),
    ).first()
    if existing:
        return {"ok": True, "message": "Already subscribed"}
    alert = CommunityAlert(user_id=user_id, category=category, pincode=pincode)
    db.add(alert)
    db.commit()
    return {"ok": True, "message": f"Subscribed to {category} alerts"}


@router.get("/alerts")
def get_alerts(user_id: int = Query(...), db: Session = Depends(get_db)):
    alerts = db.query(CommunityAlert).filter(CommunityAlert.user_id == user_id).all()
    return [{"id": a.id, "category": a.category, "pincode": a.pincode} for a in alerts]
