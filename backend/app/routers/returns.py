"""
Returns router — Nova Pro single-image assessment + per-action confidence gate.

Flow:
    1. Customer submits return (one-click) — optionally attaches photo URLs.
    2. assess_return_condition() calls Nova Pro if photos + credentials exist,
       otherwise falls back to hardcoded mock (assessment_source="fallback").
    3. apply_confidence_gate() checks per-action confidence thresholds.
       If the model isn't confident enough for the proposed action it falls
       back to "recycle" and records the override for audit.
    4. The gate-cleared action is routed:
         exchange  → NearDrop wishlist match, no Listing created (if match found)
         resell    → Listing created, NearDrop called
         refurbish → Listing created (tagged "Certified Refurbished"), NearDrop called
         donate    → Donation row created, no Listing
         recycle   → RecycleLog row created, no Listing
    5. Green Credits awarded via credit_engine, environmental impact logged.
"""

import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
import boto3

from pydantic import BaseModel
from app.database import get_db
from app.models import (
    Donation, GreenCreditTx, Listing, Order, RecycleLog, Return, User,
)
from app.schemas import ReturnCreate, ReturnOut
from app.services.ai_assessment import assess_return_condition
from app.services.credit_engine import calculate_credits, get_level
from app.services.impact_calculator import calculate_action_impact
from app.services.matching import find_best_match
from app.services.sustainability_advisor import get_return_advice
from app.services.wishlist_matcher import find_wishlist_matches

logger = logging.getLogger("returns")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("📦 [%(levelname)s] %(message)s"))
    logger.addHandler(_h)

router = APIRouter(prefix="/returns", tags=["returns"])


# ── S3 photo upload helper ────────────────────────────────────────────

def _upload_return_photo_to_s3(image_bytes: bytes, content_type: str, return_id: int) -> str | None:
    """
    Uploads return photo bytes to S3 under returns/<return_id>/<uuid>.<ext>.
    Returns the public S3 URL, or None if S3 is not configured or upload fails.
    """
    try:
        bucket = os.getenv("AWS_S3_BUCKET_NAME")
        if not bucket:
            logger.info("S3 not configured — photo not persisted.")
            return None

        ext = "jpg"
        if "png" in content_type:
            ext = "png"
        elif "webp" in content_type:
            ext = "webp"

        key = f"returns/{return_id}/{uuid.uuid4().hex}.{ext}"
        region = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        s3 = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=image_bytes,
            ContentType=content_type,
        )
        url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
        logger.info("Return photo uploaded to S3: %s", url)
        return url
    except Exception as exc:
        logger.warning("S3 photo upload failed: %s", exc)
        return None



ACTION_CONFIDENCE_THRESHOLDS: dict[str, float] = {
    "exchange":  0.85,  # straight to another customer, no repackaging step
    "donate":    0.85,  # safety-critical — charity/trust must be certain
    "resell":    0.80,
    "refurbish": 0.75,  # gets a repair + re-check before reaching a buyer
    "recycle":   0.0,   # this IS the fail-safe, no gate needed
}


# ── Part 2.2 — Gate function ──────────────────────────────────────────

def apply_confidence_gate(result: dict) -> dict:
    """
    Check whether the model's confidence clears the threshold for the
    proposed action.  If not, override to 'recycle' (safe disposal).

    Must be called BEFORE any downstream routing (Listing / Donation / etc.).
    """
    action = result.get("recommended_action", "recycle")
    threshold = ACTION_CONFIDENCE_THRESHOLDS.get(action, 0.8)
    confidence = result.get("confidence", 0.0)

    if confidence < threshold:
        logger.info(
            "[Gate] TRIGGERED - action=%s  confidence=%.0f%%  required=%.0f%%  gap=%.0f%% below -> overriding to RECYCLE",
            action.upper(), confidence * 100, threshold * 100, (threshold - confidence) * 100,
        )
        result["original_recommended_action"] = action
        result["recommended_action"] = "recycle"
        result["gate_override"] = True
    else:
        result.setdefault("gate_override", False)
        result.setdefault("original_recommended_action", None)
        logger.info(
            "[Gate] CLEARED - action=%s  confidence=%.0f%%  threshold=%.0f%%  margin=+%.0f%% -> proceeding with AI recommendation",
            action.upper(), confidence * 100, threshold * 100, (confidence - threshold) * 100,
        )

    return result


def apply_damaged_product_rules(assessment: dict) -> dict:
    """
    Evaluates damaged products based on logistics and repair costs.
    If damage is slight, we check for refurbishment.
    If refurbishment isn't viable (logistics cost + repair cost > 40%), 
    we check if it can be donated (must be usable).
    """
    if assessment.get("is_damaged"):
        # Trust the AI's explicitly recommended action if it provided one
        ai_action = assessment.get("recommended_action")
        if ai_action in ["refurbish", "donate", "recycle", "resell"]:
            return assessment
            
        # Fallback rules if AI didn't provide a clear action
        logistics_cost_pct = 15
        repair_cost_pct = assessment.get("refurb_cost_estimate_pct") or 0
        total_cost_pct = logistics_cost_pct + repair_cost_pct
        
        if total_cost_pct <= 40 and assessment.get("refurbishable"):
            assessment["recommended_action"] = "refurbish"
        else:
            # If refurbishment not possible, donate if remaining life > 20%
            if assessment.get("remaining_life_pct", 0) > 20:
                assessment["recommended_action"] = "donate"
            else:
                assessment["recommended_action"] = "recycle"
                
    return assessment



# ── Reason-based pre-routing ──────────────────────────────────────────

# Reasons that require a photo and trigger special routing
HUB_REVIEW_REASONS = {"size_mismatch", "wrong_item"}
QUALITY_REASONS    = {"quality", "defective"}

def _bedrock_identity_check(photo_bytes: bytes, product_name: str, product_category: str) -> dict:
    """
    Uses Nova Pro (via converse) to check if the photo matches the expected
    product name/category. Returns {\"matches\": bool, \"note\": str}.
    """
    import boto3
    region = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
    try:
        client = boto3.client(
            "bedrock-runtime",
            region_name=region,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
        response = client.converse(
            modelId="amazon.nova-pro-v1:0",
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": "jpeg", "source": {"bytes": photo_bytes}}},
                    {"text": (
                        f"The customer ordered: '{product_name}' (category: {product_category}).\n"
                        "Look at the photo carefully. Does the item in the photo appear to be "
                        "the same product (or a reasonable match for the same category)?\n"
                        "Return ONLY valid JSON:\n"
                        "{\"matches\": true_or_false, \"note\": \"one sentence explanation\"}"
                    )},
                ],
            }],
            inferenceConfig={"maxTokens": 256, "temperature": 0.1},
        )
        import json
        raw = ""
        for block in response["output"]["message"].get("content", []):
            if "text" in block:
                raw += block["text"]
        # extract JSON
        start = raw.find("{"); end = raw.rfind("}") + 1
        data = json.loads(raw[start:end]) if start >= 0 and end > start else {}
        return {"matches": bool(data.get("matches", True)), "note": data.get("note", "")}
    except Exception as exc:
        logger.warning("Identity check failed: %s — defaulting to match=True", exc)
        return {"matches": True, "note": "AI check unavailable"}


def apply_reason_routing(
    reason: str,
    photo_bytes: list[bytes],
    product_name: str,
    product_category: str,
) -> dict | None:
    """
    For the three special return reasons, apply pre-routing logic BEFORE the
    standard AI assessment pipeline. Returns a partial assessment dict if a
    special path was triggered, or None to fall through to standard logic.

    Reason logic:
    - size_mismatch  → Check photo for damage. If no damage → pending_hub_review
                       (hub manager decides resell vs exchange; NearDrop runs).
    - quality/defective → Fall through to standard AI assessment (refurb/donate/recycle).
    - wrong_item    → Identity-check: photo vs order title. If mismatch →
                       pending_hub_review; NearDrop runs regardless.
    """
    if reason == "size_mismatch":
        if not photo_bytes:
            # No photo → can't confirm damage-free; send to hub for manual check
            return {
                "recommended_action": "pending_hub_review",
                "hub_review_note": "No photo provided for size-mismatch return. Hub manager must verify condition before resell.",
                "confidence": 1.0,
                "assessment_source": "rule_based",
                "condition_score": 80,
                "remaining_life_pct": 85,
                "defects_summary": "No photo — assumed undamaged based on stated reason.",
                "is_damaged": False,
                "gate_override": False,
                "original_recommended_action": None,
            }
        # Run identity check to detect damage
        id_result = _bedrock_identity_check(photo_bytes[0], product_name, product_category)
        logger.info("[Reason: size_mismatch] Identity/damage check → %s", id_result)
        return {
            "recommended_action": "pending_hub_review",
            "hub_review_note": (
                f"Size mismatch return. AI photo note: {id_result['note']} "
                "Hub manager should verify condition and decide resell/exchange."
            ),
            "confidence": 1.0,
            "assessment_source": "rule_based",
            "condition_score": 85,
            "remaining_life_pct": 90,
            "defects_summary": id_result["note"],
            "is_damaged": False,
            "gate_override": False,
            "original_recommended_action": None,
        }

    elif reason == "wrong_item":
        if not photo_bytes:
            return {
                "recommended_action": "pending_hub_review",
                "hub_review_note": "Wrong item claimed but no photo provided. Hub must verify before processing.",
                "confidence": 1.0,
                "assessment_source": "rule_based",
                "condition_score": 80,
                "remaining_life_pct": 85,
                "defects_summary": "No photo — cannot verify item identity.",
                "is_damaged": False,
                "gate_override": False,
                "original_recommended_action": None,
            }
        id_result = _bedrock_identity_check(photo_bytes[0], product_name, product_category)
        logger.info("[Reason: wrong_item] Identity check → matches=%s, note=%s", id_result["matches"], id_result["note"])
        if id_result["matches"]:
            # Photo matches — customer may be mistaken; still flag for hub
            hub_note = f"Customer claims wrong item, but AI sees a likely match: {id_result['note']}. Hub should verify."
        else:
            hub_note = f"AI confirmed item mismatch: {id_result['note']}. Process as wrong-item return and run NearDrop."
        return {
            "recommended_action": "pending_hub_review",
            "hub_review_note": hub_note,
            "confidence": 1.0,
            "assessment_source": "rule_based",
            "condition_score": 80,
            "remaining_life_pct": 85,
            "defects_summary": id_result["note"],
            "is_damaged": False,
            "gate_override": False,
            "original_recommended_action": None,
        }

    # quality / defective / changed_mind / other → fall through to standard AI assessment
    return None


# ── Helper: fetch bytes from a URL (best-effort) ───────────────────────

def _fetch_image_bytes(url: str) -> bytes | None:
    """Attempt to download image bytes from a URL. Returns None on any error."""
    try:
        import urllib.request
        with urllib.request.urlopen(url, timeout=5) as resp:
            return resp.read()
    except Exception as exc:
        logger.debug("Could not fetch image from %r: %s", url, exc)
        return None


# ── Part 3 — Action routing helpers ───────────────────────────────────

def _create_listing(
    return_item: Return,
    order: Order,
    action: str,
    condition_note: str | None,
    db: Session,
) -> tuple[Listing | None, int | None]:
    """Create a Listing and run NearDrop matching. Returns (listing, listing_id)."""
    product = order.product
    discount = 0.7 if action == "resell" else 0.5
    listing = Listing(
        return_id=return_item.id,
        product_id=order.product_id,
        price=round(product.price * discount, 2) if product else 0.0,
        status="available",
        condition_note=condition_note,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)

    # NearDrop + legacy matcher
    matched_id = find_best_match(listing, db)
    if matched_id:
        listing.matched_user_id = matched_id
        listing.status = "matched"
        db.commit()

    find_wishlist_matches(return_item, listing, db)

    return listing, listing.id


def _route_exchange(
    return_item: Return,
    order: Order,
    db: Session,
) -> int | None:
    """
    For 'exchange': run NearDrop directly without creating a Listing first.
    If a wishlist match is found, a WishlistMatch row is created (NearDrop
    handles that internally).  If no match found, fall back to 'resell'
    (which already cleared the higher exchange bar).
    """
    product = order.product
    # We still need a listing object for NearDrop scoring — create it but
    # keep status="available" so it enters the marketplace if no match found.
    listing = Listing(
        return_id=return_item.id,
        product_id=order.product_id,
        price=round(product.price * 0.7, 2) if product else 0.0,
        status="available",
        condition_note="Exchange — wrong variant, product undamaged.",
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)

    matched_id = find_best_match(listing, db)
    if matched_id:
        listing.matched_user_id = matched_id
        listing.status = "matched"
        db.commit()

    wishlist_matches = find_wishlist_matches(return_item, listing, db)

    if wishlist_matches or matched_id:
        logger.info("Exchange: NearDrop match found for return %d.", return_item.id)
    else:
        logger.info(
            "Exchange: no NearDrop match found for return %d — listing remains available (resell fallback).",
            return_item.id,
        )

    return listing.id


def _route_donate(return_item: Return, category: str, db: Session) -> None:
    """Insert a Donation record."""
    donation = Donation(
        return_id=return_item.id,
        partner_org="GiveIndia",          # default partner; extendable
        status="pending",
    )
    db.add(donation)
    db.commit()
    logger.info("Donation record created for return %d.", return_item.id)


def _route_recycle(
    return_item: Return,
    category: str,
    gate_override: bool,
    db: Session,
) -> None:
    """Insert a RecycleLog record with appropriate disposed_reason."""
    disposed_reason = "low_confidence" if gate_override else "unrepairable"
    log = RecycleLog(
        return_id=return_item.id,
        material_category=category,
        status="pending",
        disposed_reason=disposed_reason,
    )
    db.add(log)
    db.commit()
    logger.info(
        "RecycleLog created for return %d — disposed_reason='%s'.",
        return_item.id,
        disposed_reason,
    )


# ── Main endpoint ─────────────────────────────────────────────────────

@router.post("/", status_code=201)
def create_return(body: ReturnCreate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == body.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status == "returned":
        raise HTTPException(status_code=409, detail="This order has already been returned.")

    product = order.product
    category = product.category.lower() if product and product.category else "electronics"

    # ── Step 1: AI Assessment ─────────────────────────────────────────
    if body.recommended_action:
        # Caller supplied explicit assessment (e.g. from sustainability router)
        condition_score = body.condition_score if body.condition_score is not None else 85.0
        raw_defects = body.defects if body.defects is not None else "None detected"
        remaining_life_pct = body.remaining_life_pct if body.remaining_life_pct is not None else 90

        act_lower = body.recommended_action.lower()
        if "resale" in act_lower or "resell" in act_lower:
            action = "resell"
        elif "refurbish" in act_lower:
            action = "refurbish"
        elif "exchange" in act_lower:
            action = "exchange"
        elif "donate" in act_lower:
            action = "donate"
        elif "recycle" in act_lower or "dispose" in act_lower:
            action = "recycle"
        else:
            action = act_lower

        assessment = {
            "condition_score": condition_score,
            "defects_summary": raw_defects,
            "remaining_life_pct": remaining_life_pct,
            "recommended_action": action,
            "confidence": 1.0,   # caller-supplied — treat as fully confident
            "assessment_source": "caller_supplied",
            "gate_override": False,
            "original_recommended_action": None,
        }
    else:
        # ── Part 4: fetch image bytes (best-effort) ───────────────────
        photo_bytes: list[bytes] = []
        for url in (body.image_urls or []):
            raw = _fetch_image_bytes(url)
            if raw:
                photo_bytes.append(raw)

        product_meta = {
            "name": product.name if product else "Unknown",
            "category": category,
        }
        assessment = assess_return_condition(
            return_photo_bytes=photo_bytes,
            product_metadata=product_meta,
            return_reason="no reason provided",
        )
        
        assessment = apply_damaged_product_rules(assessment)

        # ── Step 2: Confidence gate ───────────────────────────────────
        assessment = apply_confidence_gate(assessment)

    action = assessment["recommended_action"]
    condition_score = assessment.get("condition_score", 90)
    raw_defects = assessment.get("defects_summary", "No defects noted.")
    remaining_life_pct = assessment.get("remaining_life_pct", 95)
    confidence = assessment.get("confidence", 0.0)
    assessment_source = assessment.get("assessment_source", "fallback")
    gate_override = assessment.get("gate_override", False)
    original_recommended_action = assessment.get("original_recommended_action")

    # ── Step 3: Persist Return row ────────────────────────────────────
    return_item = Return(
        order_id=body.order_id,
        image_urls=",".join(body.image_urls) if body.image_urls else None,
        condition_score=condition_score,
        defects=raw_defects,
        remaining_life_pct=remaining_life_pct,
        recommended_action=action,
        condition_note=raw_defects if action in ("refurbish",) else None,
        status="completed",
        confidence=confidence,
        assessment_source=assessment_source,
        original_recommended_action=original_recommended_action,
        gate_override=gate_override,
    )
    db.add(return_item)
    db.commit()
    db.refresh(return_item)

    # Mark order returned and forfeit pending loyalty credits
    order.status = "returned"
    if order.no_return_credits_status == "pending":
        order.no_return_credits_status = "forfeited"
    db.commit()

    # ── Step 4: Action routing (all branches already gate-cleared) ────
    listing_id: int | None = None

    if action == "exchange":
        listing_id = _route_exchange(return_item, order, db)

    elif action == "resell":
        # Restock into inventory for future replacement feature. No listing created.
        pass

    elif action == "refurbish":
        condition_note = raw_defects if raw_defects else "Minor defects — certified refurbished."
        _, listing_id = _create_listing(return_item, order, "refurbish", condition_note, db)

    elif action == "donate":
        _route_donate(return_item, category, db)

    elif action == "recycle":
        _route_recycle(return_item, category, gate_override, db)

    # ── Step 5: Green Credits ─────────────────────────────────────────
    credits = calculate_credits(action, category)
    impact = calculate_action_impact(action, category)

    return_item.green_credits_earned = credits
    db.commit()
    db.refresh(return_item)

    # ── Award credits immediately to user's wallet ────────────────────
    user = db.query(User).filter(User.id == order.user_id).first()
    if user:
        user.green_credits += credits
        user.lifetime_credits += credits
        user.co2_saved += impact["co2_saved"]
        user.ewaste_prevented += impact["ewaste_prevented"]
        user.water_saved += impact["water_saved"]

        if action in ("resell", "refurbish", "exchange"):
            user.products_resold += 1
        elif action == "donate":
            user.products_reused += 1

        level_info = get_level(user.lifetime_credits)
        user.level = level_info["name"]

        tx = GreenCreditTx(
            user_id=order.user_id,
            amount=credits,
            type="earned",
            action_type=action,
            description=(
                f"Return action ({action}): {product.name if product else 'Product'}"
                + (" [gate overridden from " + original_recommended_action + "]" if gate_override and original_recommended_action else "")
            ),
        )
        db.add(tx)
        db.commit()

    # ── Sustainability advice (best-effort) ───────────────────────────
    advice = (
        get_return_advice(product, condition_score, return_period_over=False)
        if product
        else None
    )

    logger.info(
        "Return %d: action=%s, source=%s, gate_override=%s, credits=%d",
        return_item.id,
        action,
        assessment_source,
        gate_override,
        credits,
    )

    return {
        "id": return_item.id,
        "order_id": return_item.order_id,
        "image_urls": return_item.image_urls,
        "condition_score": return_item.condition_score,
        "defects": return_item.defects,
        "remaining_life_pct": return_item.remaining_life_pct,
        "recommended_action": return_item.recommended_action,
        "status": return_item.status,
        "confidence": return_item.confidence,
        "assessment_source": return_item.assessment_source,
        "gate_override": return_item.gate_override,
        "original_recommended_action": return_item.original_recommended_action,
        "green_credits_earned": credits,
        "environmental_impact": impact,
        "sustainability_advice": advice,
        "listing_id": listing_id,
    }


# ── Legacy pickup-scan endpoint ───────────────────────────────────────
# Retained for backward-compatibility. In the new one-click flow the order
# is marked returned immediately, so this endpoint will rarely be called.

@router.post("/{return_id}/pickup-scan")
def pickup_scan(return_id: int, db: Session = Depends(get_db)):
    """Called by the employee when they scan the return item at pickup (legacy)."""
    return_item = db.query(Return).filter(Return.id == return_id).first()
    if not return_item:
        raise HTTPException(status_code=404, detail="Return not found")

    if return_item.status == "completed":
        return {"success": True, "listing_id": None, "credits_awarded": 0, "note": "already completed"}

    if return_item.status != "pending_pickup":
        raise HTTPException(status_code=400, detail="Return is not pending pickup")

    order = return_item.order
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return_item.status = "completed"
    order.status = "returned"

    action = return_item.recommended_action or "recycle"
    credits = return_item.green_credits_earned or 0
    product = order.product
    category = product.category.lower() if product and product.category else "electronics"
    impact = calculate_action_impact(action, category)

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

        level_info = get_level(user.lifetime_credits)
        user.level = level_info["name"]

        tx = GreenCreditTx(
            user_id=order.user_id,
            amount=credits,
            type="earned",
            action_type=action,
            description=f"Pickup scan ({action}): {product.name if product else 'Product'}",
        )
        db.add(tx)

    listing_id = None
    if action in ("resell", "refurbish"):
        discount = 0.7 if action == "resell" else 0.5
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

        matched_id = find_best_match(listing, db)
        if matched_id:
            listing.matched_user_id = matched_id
            listing.status = "matched"
            db.commit()

        find_wishlist_matches(return_item, listing, db)

    db.commit()
    return {"success": True, "listing_id": listing_id, "credits_awarded": credits}


# ── Hub: fetch return AI details by order ─────────────────────────────

@router.get("/by-order/{order_id}")
def get_return_by_order(order_id: int, db: Session = Depends(get_db)):
    """
    Hub employee lookup — returns the AI assessment details for a completed
    return on a given order.  Returns 404 if no return exists yet.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return_item = (
        db.query(Return)
        .filter(Return.order_id == order_id)
        .order_by(Return.id.desc())
        .first()
    )
    if not return_item:
        raise HTTPException(status_code=404, detail="No return found for this order")

    product = order.product
    return {
        "id": return_item.id,
        "order_id": order_id,
        "condition_score": return_item.condition_score,
        "defects": return_item.defects,
        "remaining_life_pct": return_item.remaining_life_pct,
        "recommended_action": return_item.recommended_action,
        "status": return_item.status,
        "confidence": return_item.confidence,
        "assessment_source": return_item.assessment_source,
        "gate_override": return_item.gate_override,
        "original_recommended_action": return_item.original_recommended_action,
        "green_credits_earned": return_item.green_credits_earned,
        "condition_note": return_item.condition_note,
        "return_reason": return_item.return_reason,
        "hub_review_note": return_item.hub_review_note,
        "product_name": product.name if product else None,
        "product_category": product.category if product else None,
    }


# ── Customer: submit return with a single photo upload ─────────────────

@router.post("/with-photo", status_code=201)
async def create_return_with_photo(
    order_id: int = Form(...),
    reason: str = Form(None),
    photo: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    """
    Customer-facing endpoint. Applies reason-aware routing:
    - size_mismatch / wrong_item → pending_hub_review + NearDrop
    - quality / defective → Standard Nova Pro (refurb/donate/recycle)
    - other reasons → Standard Nova Pro assessment
    """

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "returned":
        raise HTTPException(status_code=409, detail="This order has already been returned.")

    product = order.product
    category = product.category.lower() if product and product.category else "electronics"
    product_name = product.name if product else "Unknown"

    # Read photo bytes if supplied
    photo_bytes: list[bytes] = []
    if photo and photo.content_type and photo.content_type.startswith("image/"):
        data = await photo.read()
        if data:
            photo_bytes.append(data)

    # ── Step 1: Reason-aware pre-routing ──────────────────────────────
    normalized_reason = (reason or "other").lower().strip()
    special_assessment = apply_reason_routing(
        reason=normalized_reason,
        photo_bytes=photo_bytes,
        product_name=product_name,
        product_category=category,
    )

    if special_assessment is not None:
        assessment = special_assessment
        logger.info(
            "[Reason: %s] Pre-routed → %s | hub_note: %s",
            normalized_reason,
            assessment["recommended_action"],
            assessment.get("hub_review_note", ""),
        )
    else:
        # ── Step 2: Standard Nova Pro assessment ─────────────────────
        product_meta = {"name": product_name, "category": category}
        assessment = assess_return_condition(
            return_photo_bytes=photo_bytes,
            product_metadata=product_meta,
            return_reason=reason or "customer return",
        )
        assessment = apply_damaged_product_rules(assessment)
        assessment = apply_confidence_gate(assessment)

    action = assessment["recommended_action"]
    condition_score = assessment.get("condition_score", 90)
    raw_defects = assessment.get("defects_summary", "No defects noted.")
    remaining_life_pct = assessment.get("remaining_life_pct", 95)
    confidence = assessment.get("confidence", 0.0)
    assessment_source = assessment.get("assessment_source", "fallback")
    gate_override = assessment.get("gate_override", False)
    original_recommended_action = assessment.get("original_recommended_action")
    hub_review_note = assessment.get("hub_review_note")

    # pending_hub_review keeps order "in review" — not fully returned yet
    is_hub_review = action == "pending_hub_review"
    order_status = "return_pending" if is_hub_review else "returned"
    return_status = "pending_hub_review" if is_hub_review else "completed"

    # ── Step 3: Persist Return row ─────────────────────────────────────
    return_item = Return(
        order_id=order_id,
        image_urls=None,
        condition_score=condition_score,
        defects=raw_defects,
        remaining_life_pct=remaining_life_pct,
        recommended_action=action,
        condition_note=raw_defects if action == "refurbish" else None,
        status=return_status,
        confidence=confidence,
        assessment_source=assessment_source,
        original_recommended_action=original_recommended_action,
        gate_override=gate_override,
        return_reason=normalized_reason,
        hub_review_note=hub_review_note,
    )
    db.add(return_item)
    db.commit()
    db.refresh(return_item)

    # ── Upload photo to S3 ─────────────────────────────────────────────
    if photo_bytes:
        photo_url = _upload_return_photo_to_s3(
            photo_bytes[0],
            photo.content_type if photo and photo.content_type else "image/jpeg",
            return_item.id,
        )
        if photo_url:
            return_item.image_urls = photo_url
            db.commit()

    order.status = order_status
    if order.no_return_credits_status == "pending" and not is_hub_review:
        order.no_return_credits_status = "forfeited"
    db.commit()

    # ── Step 4: Circular action routing ───────────────────────────────
    listing_id = None
    if is_hub_review:
        # For hub-review cases, run NearDrop proactively so wishlist users
        # get notified early. Listing stays "available" pending hub confirmation.
        try:
            temp_listing = Listing(
                return_id=return_item.id,
                product_id=order.product_id,
                price=round(product.price * 0.7, 2) if product else 0.0,
                status="available",
                condition_note=f"Pending hub review ({normalized_reason}). {raw_defects}",
            )
            db.add(temp_listing)
            db.commit()
            db.refresh(temp_listing)
            listing_id = temp_listing.id
            # Run NearDrop wishlist matching
            find_wishlist_matches(return_item, temp_listing, db)
            matched_id = find_best_match(temp_listing, db)
            if matched_id:
                temp_listing.matched_user_id = matched_id
                db.commit()
            logger.info("NearDrop ran for hub-review return %d", return_item.id)
        except Exception as exc:
            logger.warning("NearDrop setup failed for hub-review return: %s", exc)
    elif action == "exchange":
        listing_id = _route_exchange(return_item, order, db)
    elif action == "resell":
        # Restock into inventory. No community listing.
        pass
    elif action == "refurbish":
        _, listing_id = _create_listing(return_item, order, "refurbish", raw_defects, db)
    elif action == "donate":
        _route_donate(return_item, category, db)
    elif action == "recycle":
        _route_recycle(return_item, category, gate_override, db)

    # ── Step 5: Green Credits (not awarded for hub-review; awarded on hub confirmation) ──
    credits = 0
    impact = {"co2_saved": 0.0, "ewaste_prevented": 0.0, "water_saved": 0.0}
    if not is_hub_review:
        credits = calculate_credits(action, category)
        impact = calculate_action_impact(action, category)
        return_item.green_credits_earned = credits
        db.commit()

        user = db.query(User).filter(User.id == order.user_id).first()
        if user:
            user.green_credits += credits
            user.lifetime_credits += credits
            user.co2_saved += impact["co2_saved"]
            user.ewaste_prevented += impact["ewaste_prevented"]
            user.water_saved += impact["water_saved"]
            if action in ("resell", "refurbish", "exchange"):
                user.products_resold += 1
            elif action == "donate":
                user.products_reused += 1
            level_info = get_level(user.lifetime_credits)
            user.level = level_info["name"]
            db.add(GreenCreditTx(
                user_id=order.user_id,
                amount=credits,
                type="earned",
                action_type=action,
                description=f"Return ({action}): {product_name}",
            ))
            db.commit()

    logger.info(
        "Return (photo) %d: reason=%s, action=%s, source=%s, hub_review=%s, credits=%d",
        return_item.id, normalized_reason, action, assessment_source, is_hub_review, credits,
    )

    # ── Customer response ──────────────────────────────────────────────
    action_label = {
        "resell":             "Restocked",
        "refurbish":          "Certified Refurbish",
        "exchange":           "Exchange",
        "donate":             "Donate",
        "recycle":            "Recycle",
        "pending_hub_review": "Under Review",
    }.get(action, action.replace("_", " ").title())

    return {
        "return_id": return_item.id,
        "green_credits_earned": credits,
        "action_label": action_label,
        "co2_saved": impact["co2_saved"],
        "order_id": order_id,
        "is_hub_review": is_hub_review,
        "hub_review_note": hub_review_note,
        "return_reason": normalized_reason,
    }

# ── Hub: list all circular returns (with zone filtering if employee_id provided) ──

@router.get("/list")
def list_returns(employee_id: int = None, db: Session = Depends(get_db)):
    """
    List returns in the system. If employee_id is specified and they have a zone,
    filter to show only returns where the customer is in the same city/zone.
    """
    query = db.query(Return)
    if employee_id is not None:
        employee = db.query(User).filter(User.id == employee_id).first()
        if employee and employee.role in {"employee", "admin"} and employee.employee_zone:
            query = query.join(Order).join(User, Order.user_id == User.id).filter(
                User.city == employee.employee_zone
            )
            logger.info("Filtering returns for hub zone: %s", employee.employee_zone)
    
    returns = query.order_by(Return.id.desc()).all()
    result = []
    for r in returns:
        order = r.order
        if not order:
            continue
        product = order.product
        customer = order.user
        result.append({
            "id": r.id,
            "order_id": r.order_id,
            "product_id": product.id if product else None,
            "product_name": product.name if product else "Unknown Product",
            "product_image": product.image_url if product else None,
            "product_category": product.category if product else "Unknown",
            "product_price": product.price if product else 0.0,
            "customer_name": customer.name if customer else "Unknown Customer",
            "customer_pincode": customer.pincode if customer else "",
            "customer_city": customer.city if customer else "",
            "condition_score": r.condition_score,
            "defects": r.defects,
            "remaining_life_pct": r.remaining_life_pct,
            "recommended_action": r.recommended_action,
            "status": r.status,
            "confidence": r.confidence,
            "assessment_source": r.assessment_source,
            "gate_override": r.gate_override,
            "original_recommended_action": r.original_recommended_action,
            "green_credits_earned": r.green_credits_earned,
            "image_url": _presign_return_photo(r.image_urls.split(",")[0] if r.image_urls else None),
        })
    return result


# ── Replacement flow: check hub inventory ─────────────────────────────

@router.get("/check-inventory")
def check_hub_inventory(product_id: int, city: str, db: Session = Depends(get_db)):
    """
    Check if there is a verified, restocked (resell-action) return for a given
    product in the same city. Used before customer chooses replacement vs refund.
    """
    # Find any verified return for this product whose customer is in the same city
    restocked = (
        db.query(Return)
        .join(Order, Return.order_id == Order.id)
        .join(User, Order.user_id == User.id)
        .filter(
            Order.product_id == product_id,
            Return.recommended_action == "resell",
            Return.status == "verified",
            User.city.ilike(city),
        )
        .first()
    )

    return {
        "available": restocked is not None,
        "return_id": restocked.id if restocked else None,
    }



@router.post("/request-replacement", status_code=200)
async def request_replacement(
    order_id: int = Form(...),
    mode: str = Form(...),           # "refund" | "replacement"
    reason: str = Form(None),
    photo: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    """
    Called after the customer picks Return vs Replace.

    mode='refund'      → behaves like the standard return submission; no special logic here
                         (the /with-photo endpoint already handles refund returns).
    mode='replacement' →
        1. Check hub inventory (same city).
           FOUND  → place a new Order from hub stock, mark source return as 'replacement_fulfilled',
                    award Green Credits to the customer.
           NOT FOUND → place a new Order from Amazon (root seller, non-refurbished),
                       no Green Credits.
        2. Return enough context for the frontend to show the correct confirmation screen.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    user = db.query(User).filter(User.id == order.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    product = order.product
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if mode == "refund":
        # Nothing special — caller will proceed to /with-photo for the return.
        return {"mode": "refund", "message": "Proceed with standard return flow."}

    # ── Replacement mode ──────────────────────────────────────────────
    # Guard: don't allow duplicate replacements
    if order.status == "returned":
        raise HTTPException(status_code=409, detail="This order has already been returned or replaced.")

    customer_city = user.city or ""
    product_name = product.name if product else "Unknown"
    category = product.category.lower() if product and product.category else "other"

    # ── Read photo bytes ──────────────────────────────────────────────
    photo_bytes: list[bytes] = []
    if photo and photo.content_type and photo.content_type.startswith("image/"):
        data = await photo.read()
        if data:
            photo_bytes.append(data)

    # ── Run AI assessment on the returned item ────────────────────────
    normalized_reason = (reason or "replacement_request").lower().strip()
    if photo_bytes:
        product_meta = {"name": product_name, "category": category}
        assessment = assess_return_condition(
            return_photo_bytes=photo_bytes,
            product_metadata=product_meta,
            return_reason=normalized_reason,
        )
        assessment = apply_damaged_product_rules(assessment)
        assessment = apply_confidence_gate(assessment)
    else:
        assessment = {
            "condition_score": None,
            "defects_summary": None,
            "remaining_life_pct": None,
            "recommended_action": "resell",
            "confidence": None,
            "assessment_source": "no_photo",
            "gate_override": False,
            "original_recommended_action": None,
        }

    ai_action = assessment.get("recommended_action", "resell")

    # Mark original order as returned
    order.status = "returned"
    if order.no_return_credits_status == "pending":
        order.no_return_credits_status = "forfeited"

    # Create a Return record so the returned item appears in the Hub
    return_item = Return(
        order_id=order.id,
        recommended_action=ai_action,
        status="completed",
        return_reason=normalized_reason,
        condition_score=assessment.get("condition_score"),
        defects=assessment.get("defects_summary"),
        remaining_life_pct=assessment.get("remaining_life_pct"),
        condition_note=assessment.get("defects_summary") if ai_action == "refurbish" else
                       "Returned for replacement — awaiting hub assessment.",
        assessment_source=assessment.get("assessment_source", "replacement_flow"),
        confidence=assessment.get("confidence"),
        gate_override=assessment.get("gate_override", False),
        original_recommended_action=assessment.get("original_recommended_action"),
    )
    db.add(return_item)
    db.commit()
    db.refresh(return_item)

    # ── Upload photo to S3 ────────────────────────────────────────────
    if photo_bytes:
        photo_url = _upload_return_photo_to_s3(
            photo_bytes[0],
            photo.content_type if photo and photo.content_type else "image/jpeg",
            return_item.id,
        )
        if photo_url:
            return_item.image_urls = photo_url
            db.commit()

    logger.info(
        "Replacement return created: order=%d, return=%d, ai_action=%s, source=%s, photo=%s",
        order.id, return_item.id, ai_action,
        assessment.get("assessment_source"), bool(photo_bytes),
    )

    restocked_return = (
        db.query(Return)
        .join(Order, Return.order_id == Order.id)
        .join(User, Order.user_id == User.id)
        .filter(
            Order.product_id == product.id,
            Return.recommended_action == "resell",
            Return.status == "verified",
            User.city.ilike(customer_city),
            Return.id != return_item.id,   # exclude the one we just created
        )
        .first()
    )

    from app.services.credit_engine import calculate_credits, get_level

    if restocked_return:
        # ── Hub-stock path: place order from inventory ────────────────
        new_order = Order(
            user_id=order.user_id,
            product_id=product.id,
            status="placed",
            is_refurbished=True,   # it is a returned/restocked item
            delivery_type="standard",
            return_period_days=product.return_period_days,
        )
        db.add(new_order)

        # Mark the source return as fulfilled so it can't be used again
        restocked_return.status = "replacement_fulfilled"
        db.commit()
        db.refresh(new_order)

        # Award Green Credits for circular replacement
        credits = calculate_credits("resell", product.category.lower() if product.category else "other")
        user.green_credits += credits
        user.lifetime_credits += credits
        user.products_resold += 1
        level_info = get_level(user.lifetime_credits)
        user.level = level_info["name"]

        db.add(GreenCreditTx(
            user_id=order.user_id,
            amount=credits,
            type="earned",
            action_type="replacement_hub",
            description=f"Replacement from hub inventory: {product.name}",
        ))
        db.commit()

        logger.info(
            "Replacement (hub) for order %d → new order %d, credits=%d",
            order.id, new_order.id, credits,
        )

        return {
            "mode": "replacement",
            "source": "hub",
            "new_order_id": new_order.id,
            "product_name": product.name,
            "green_credits_earned": credits,
            "message": "Replacement placed from hub inventory. Green Credits awarded!",
        }

    else:
        # ── Amazon-root path: place fresh order ────────────────────────
        new_order = Order(
            user_id=order.user_id,
            product_id=product.id,
            status="placed",
            is_refurbished=False,
            delivery_type="standard",
            return_period_days=product.return_period_days,
        )
        db.add(new_order)
        db.commit()
        db.refresh(new_order)

        logger.info(
            "Replacement (Amazon root) for order %d → new order %d",
            order.id, new_order.id,
        )

        return {
            "mode": "replacement",
            "source": "amazon",
            "new_order_id": new_order.id,
            "product_name": product.name,
            "green_credits_earned": 0,
            "message": "No hub stock available. Replacement ordered fresh from Amazon.",
        }



def _presign_return_photo(raw_url: str | None) -> str | None:
    """Generate a 1-hour presigned URL for an S3 key, falling back to the raw URL."""
    if not raw_url:
        return None
    try:
        bucket = os.getenv("AWS_S3_BUCKET_NAME")
        if not bucket or ".amazonaws.com/" not in raw_url:
            return raw_url  # Not an S3 URL — return as-is
        # Extract key from URL: https://<bucket>.s3.<region>.amazonaws.com/<key>
        key = raw_url.split(".amazonaws.com/", 1)[1]
        region = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        s3 = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=3600,
        )
    except Exception as exc:
        logger.warning("Presign failed for %s: %s", raw_url, exc)
        return raw_url



class OverrideRequest(BaseModel):
    recommended_action: str
    justification: str


@router.post("/{return_id}/override")
def override_return_disposition(return_id: int, body: OverrideRequest, db: Session = Depends(get_db)):
    """
    Override the AI's return routing recommendation.
    Update the Return record, clean up previous circular outcomes (e.g. Listings, RecycleLogs),
    and establish the new outcome.
    """
    return_item = db.query(Return).filter(Return.id == return_id).first()
    if not return_item:
        raise HTTPException(status_code=404, detail="Return not found")

    old_action = return_item.recommended_action
    new_action = body.recommended_action.lower()

    if new_action not in {"resell", "refurbish", "donate", "recycle"}:
        raise HTTPException(status_code=400, detail="Invalid action")

    # Update return details
    return_item.recommended_action = new_action
    return_item.defects = f"[Manual Override: {body.justification}] {return_item.defects or ''}"
    return_item.status = "verified"  # mark as verified by hub
    db.commit()

    order = return_item.order
    product = order.product if order else None
    category = product.category.lower() if product and product.category else "electronics"

    # Clean up previous outcomes
    if old_action in ("resell", "refurbish"):
        listing = db.query(Listing).filter(Listing.return_id == return_item.id).first()
        if listing:
            db.delete(listing)
            db.commit()

    # Apply new outcome
    if new_action == "resell":
        # Restock into inventory. No community listing.
        pass
    elif new_action == "refurbish":
        _create_listing(return_item, order, "refurbish", return_item.defects, db)
    elif new_action == "donate":
        _route_donate(return_item, category, db)
    elif new_action == "recycle":
        _route_recycle(return_item, category, gate_override=True, db=db)

    db.commit()
    logger.info("Manual Override applied on Return %d: %s -> %s", return_id, old_action, new_action)
    return {"success": True, "new_action": new_action}


@router.post("/{return_id}/verify")
def verify_return_disposition(return_id: int, db: Session = Depends(get_db)):
    """
    Verify/Confirm the AI recommended circular outcome as is.
    """
    return_item = db.query(Return).filter(Return.id == return_id).first()
    if not return_item:
        raise HTTPException(status_code=404, detail="Return not found")
    
    return_item.status = "verified"
    db.commit()
    logger.info("Disposition verified for Return %d: %s", return_id, return_item.recommended_action)
    return {"success": True}


