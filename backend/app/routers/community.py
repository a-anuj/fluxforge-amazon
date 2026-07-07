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

    is_electronics = claimed_category.lower() in {
        "electronics", "laptops", "mobiles", "tablets", "mobile-accessories"
    }

    serial_note = (
        "For serial_number and imei: look carefully for any alphanumeric serial, "
        "IMEI, or model numbers on the invoice. These often appear in small print near the product line."
        if is_electronics else
        "serial_number and imei can be null for this category."
    )

    prompt = f"""You are a strict invoice verification system for a second-hand marketplace.
The seller claims to be selling: "{claimed_title}" (category: {claimed_category}{', brand: ' + claimed_brand if claimed_brand else ''}).

Carefully examine this invoice/receipt/bill image and extract ALL visible information.

Be STRICT. If the document is unclear, unreadable, or doesn't match, mark verified=false.

Return ONLY valid JSON (no markdown):
{{
  "verified": true,
  "product_name": "exact product name from invoice as written",
  "store": "store or retailer name",
  "purchase_date": "date as shown on invoice",
  "invoice_total": "total amount as shown including currency symbol",
  "invoice_total_numeric": 0.0,
  "match_confidence": "high",
  "mismatch_reason": null,
  "serial_number": null,
  "imei": null
}}

Rules for invoice_total_numeric: extract ONLY the final total/grand total as a plain float.
  Strip currency symbols, commas. E.g. "Rs.1,299.00" or "1299" -> 1299.0.
  If no clear total found, set 0.
match_confidence must be one of: "high", "medium", "low".
{serial_note}
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
            inferenceConfig={"maxTokens": 600, "temperature": 0.1},
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
            "invoice_total_numeric": 0,
            "match_confidence": "low",
            "mismatch_reason": f"Invoice verification service unavailable: {str(e)}",
            "serial_number": None,
            "imei": None,
        }


def _parse_amount(raw: Optional[str]) -> Optional[float]:
    """
    Parse a currency string like '₹1,299.00' or 'Rs. 45,000' into a float.
    Returns None if the string cannot be parsed.
    """
    if not raw:
        return None
    # Strip everything except digits, dots, commas, and minus
    cleaned = re.sub(r"[^\d.,\-]", "", str(raw)).replace(",", "")
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


ELECTRONICS_CATEGORIES = {"electronics", "laptops", "mobiles", "tablets", "mobile-accessories"}


def _bedrock_serial_cross_check(
    product_image_bytes: bytes,
    product_image_content_type: str,
    serial_number: Optional[str],
    imei: Optional[str],
) -> dict:
    """
    Second-pass Nova Pro call: given the serial/IMEI extracted from the invoice,
    look for that exact string in the product photo (on a label, sticker, or screen).

    Returns:
      {
        "match": True | False,
        "found_identifier": "the exact string spotted in the photo, or null",
        "confidence": "high" | "medium" | "low",
        "reasoning": "..."
      }
    """
    identifier = imei or serial_number
    if not identifier:
        return {"match": False, "found_identifier": None,
                "confidence": "low", "reasoning": "No identifier provided to check."}

    format_map = {"image/jpeg": "jpeg", "image/png": "png",
                  "image/webp": "webp", "image/gif": "gif"}
    img_format = format_map.get(product_image_content_type, "jpeg")

    prompt = f"""You are verifying physical ownership of a product.

The purchase invoice for this product contains the following identifier:
  {"IMEI: " + imei if imei else "Serial number: " + serial_number}

Carefully examine the product photo and look for this exact identifier anywhere:
- On a label or sticker on the device body
- On the back cover or base of the device
- On the box visible in the photo
- On a screen showing device info

Return ONLY valid JSON:
{{
  "match": false,
  "found_identifier": null,
  "confidence": "low",
  "reasoning": "What you found or did not find in the image"
}}

Be precise. If the identifier is partially visible or partially obscured, note that in reasoning.
Only set match=true if you can confidently see the same number or a clear substring match."""

    client = _get_bedrock_client()
    try:
        response = client.converse(
            modelId="amazon.nova-pro-v1:0",
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": img_format, "source": {"bytes": product_image_bytes}}},
                    {"text": prompt},
                ],
            }],
            inferenceConfig={"maxTokens": 300, "temperature": 0.1},
        )
        raw = response["output"]["message"]["content"][0]["text"].strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`")
        return json.loads(raw)
    except Exception as e:
        logger.error(f"Bedrock serial cross-check error: {e}")
        return {
            "match": False,
            "found_identifier": None,
            "confidence": "low",
            "reasoning": f"Cross-check unavailable: {e}",
        }


def _validate_price(
    asking_price: float,
    invoice_total: Optional[float],
) -> dict:
    """
    Cross-validate asking price against the invoice total.

    Returns a dict with:
      flag: bool       — True if the price looks suspicious
      severity: str    — "none" | "warn" | "block"
      reason: str      — human-readable explanation
    """
    if not invoice_total or invoice_total <= 0:
        return {"flag": False, "severity": "none",
                "reason": "Invoice total not available for price cross-validation."}
    if asking_price <= 0:
        return {"flag": False, "severity": "none", "reason": "Asking price not provided."}

    ratio = asking_price / invoice_total

    if ratio > 5.0:
        return {
            "flag": True,
            "severity": "block",
            "reason": (
                f"Asking price (₹{asking_price:,.0f}) is more than 5× the invoice total "
                f"(₹{invoice_total:,.0f}). This is not permitted — you can only list a "
                f"second-hand item below its original purchase price."
            ),
        }
    if ratio > 1.1:
        return {
            "flag": True,
            "severity": "warn",
            "reason": (
                f"Asking price (₹{asking_price:,.0f}) is higher than the invoice total "
                f"(₹{invoice_total:,.0f}). Second-hand items are typically priced below "
                f"their original cost. You can continue, but buyers may question the price."
            ),
        }
    if ratio < 0.05:
        return {
            "flag": True,
            "severity": "warn",
            "reason": (
                f"Asking price (₹{asking_price:,.0f}) is very low compared to the invoice "
                f"total (₹{invoice_total:,.0f}). Please confirm this price is correct."
            ),
        }

    return {"flag": False, "severity": "none", "reason": "Price looks reasonable."}

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
    asking_price: float = Form(0.0),
    product_photo: Optional[UploadFile] = File(None),  # optional: for serial cross-check
):
    """
    Multi-gate invoice verification using Nova Pro.

    Gates applied in order:
    1. File type + size check (synchronous)
    2. Nova Pro OCR + semantic match — extract product, store, date, total,
       serial/IMEI; validate against claimed listing
    3. Confidence gate — low confidence → blocked, medium → warning surfaced
    4. Price cross-validation — asking price vs extracted invoice total
    5. Serial/IMEI cross-check — for electronics: if serial found in invoice,
       attempt to spot it in the product photo (optional pass)

    All extracted data is returned so the UI can show exactly what the AI read.
    Invoice image is uploaded to S3 for audit trail regardless of outcome.
    """
    content_type = invoice.content_type or "image/jpeg"

    # ── Gate 1: File type ──────────────────────────────────────────────────
    allowed_types = {"image/jpeg", "image/png", "image/webp",
                     "image/gif", "application/pdf"}
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Invoice must be an image (JPEG/PNG/WebP) or PDF."
        )

    raw = await invoice.read()

    # ── Gate 1b: Size ─────────────────────────────────────────────────────
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Invoice file too large (max 15 MB).")

    # ── PDF → JPEG conversion ─────────────────────────────────────────────
    if content_type == "application/pdf":
        try:
            import io
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

    # ── Gate 2: Nova Pro OCR + semantic match ─────────────────────────────
    ai = _bedrock_invoice_check(
        raw, content_type,
        claimed_title, claimed_category, claimed_brand or None
    )
    logger.info(
        "Invoice check result: verified=%s confidence=%s product='%s'",
        ai.get("verified"), ai.get("match_confidence"), ai.get("product_name")
    )

    # ── S3 audit upload (always — before any gate blocks the response) ────
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
                    "confidence": ai.get("match_confidence", "low"),
                },
            )
        except Exception as e:
            logger.warning(f"Invoice S3 upload failed (non-fatal): {e}")

    # ── Gate 3: Confidence hard gate ──────────────────────────────────────
    confidence = ai.get("match_confidence", "low")
    confidence_gate_passed = True
    confidence_gate_reason = None

    if confidence == "low":
        confidence_gate_passed = False
        confidence_gate_reason = (
            "The AI could not read the invoice clearly or could not confidently "
            "match it to the product you're listing. Please upload a clearer, "
            "well-lit photo of your original purchase receipt."
        )
    elif confidence == "medium":
        # Medium passes but is surfaced as a warning — buyers will see it
        confidence_gate_reason = (
            "The AI matched your invoice with medium confidence. Your listing will "
            "show a 'Partially Verified' badge. For a stronger 'Invoice Verified' "
            "badge, upload a clearer photo showing the product name and total."
        )

    # If low confidence, verified is forced False regardless of AI output
    if not confidence_gate_passed:
        ai["verified"] = False
        ai["mismatch_reason"] = confidence_gate_reason

    verified = bool(ai.get("verified", False))

    # ── Gate 4: Price cross-validation ───────────────────────────────────
    # Prefer the numeric value the model extracted; fall back to parsing the string
    invoice_total_numeric = ai.get("invoice_total_numeric") or None
    if not invoice_total_numeric:
        invoice_total_numeric = _parse_amount(ai.get("invoice_total"))

    price_result = _validate_price(asking_price, invoice_total_numeric)
    logger.info(
        "Price validation: asking=%.0f invoice=%.0f flag=%s severity=%s",
        asking_price, invoice_total_numeric or 0,
        price_result["flag"], price_result["severity"]
    )

    # "block" severity forces verified=False — listing cannot proceed
    if price_result["severity"] == "block":
        verified = False
        ai["mismatch_reason"] = price_result["reason"]

    # ── Gate 5: Serial / IMEI cross-check (electronics only) ─────────────
    serial_number = ai.get("serial_number") or None
    imei = ai.get("imei") or None
    serial_cross_checked = False
    serial_match = None

    is_electronics = claimed_category.lower() in ELECTRONICS_CATEGORIES
    has_identifier = bool(serial_number or imei)

    if is_electronics and has_identifier and product_photo and verified:
        try:
            photo_bytes = await product_photo.read()
            photo_ct = product_photo.content_type or "image/jpeg"
            cross = _bedrock_serial_cross_check(
                photo_bytes, photo_ct,
                serial_number, imei
            )
            serial_cross_checked = True
            serial_match = bool(cross.get("match", False))
            logger.info(
                "Serial cross-check: match=%s confidence=%s found='%s'",
                serial_match, cross.get("confidence"), cross.get("found_identifier")
            )
            # Serial mismatch is a warning, not a block — not all photos show serial
            if not serial_match:
                logger.info("Serial not found in product photo — not blocking, surfacing as warning")
        except Exception as e:
            logger.warning(f"Serial cross-check failed (non-fatal): {e}")

    return InvoiceVerifyResponse(
        verified=verified,
        product_name=ai.get("product_name"),
        store=ai.get("store"),
        purchase_date=ai.get("purchase_date"),
        invoice_total=ai.get("invoice_total"),
        invoice_total_numeric=invoice_total_numeric,
        match_confidence=confidence,
        mismatch_reason=ai.get("mismatch_reason") if not verified else None,
        s3_key=s3_key,
        # Gate results
        confidence_gate_passed=confidence_gate_passed,
        confidence_gate_reason=confidence_gate_reason,
        price_flag=price_result["flag"],
        price_flag_reason=price_result["reason"] if price_result["flag"] else None,
        price_flag_severity=price_result["severity"],
        serial_number=serial_number,
        imei=imei,
        serial_cross_checked=serial_cross_checked,
        serial_match=serial_match,
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
