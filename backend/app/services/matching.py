"""
Shopping-twin matching — STUB

Matches a listing to the user most likely to want it, based on
size overlap, budget fit, and interest/category alignment.

🔌 STUB — replace the scoring heuristic with a real ML model or
   embedding-based similarity search when ready.
"""

from sqlalchemy.orm import Session
from app.models import Listing, User, Product


def find_best_match(listing: Listing, db: Session) -> int | None:
    """
    Given a listing, score all users and return the user_id of the best match.
    Excludes the user who originally ordered (and returned) the item.

    Scoring heuristic (simple for hackathon):
        +30  if product size appears in user.sizes
        +30  if product price within user budget range
        +20  if product category appears in user.interests
        +20  if product brand appears in user.brand_prefs

    Returns:
        user_id of the best match, or None if no users exist.
    """
    product = db.query(Product).filter(Product.id == listing.product_id).first()
    if not product:
        return None

    # Find the original buyer so we can exclude them
    from app.models import Order, Return
    return_item = db.query(Return).filter(Return.id == listing.return_id).first()
    original_user_id = None
    if return_item:
        order = db.query(Order).filter(Order.id == return_item.order_id).first()
        if order:
            original_user_id = order.user_id

    users = db.query(User).all()
    best_score = -1
    best_user_id = None

    for user in users:
        # Don't re-match to the person who returned it
        if user.id == original_user_id:
            continue

        score = 0

        # Size match
        if user.sizes and product.size:
            size_pairs = [s.strip() for s in user.sizes.split(",")]
            for pair in size_pairs:
                if ":" in pair:
                    _, val = pair.split(":", 1)
                    if val.strip().lower() == product.size.strip().lower():
                        score += 30
                        break

        # Budget match
        if user.budget_min is not None and user.budget_max is not None:
            if user.budget_min <= product.price <= user.budget_max:
                score += 30

        # Interest/category match
        if user.interests and product.category:
            interests = [i.strip().lower() for i in user.interests.split(",")]
            if product.category.lower() in interests:
                score += 20

        # Brand preference match
        if user.brand_prefs and product.brand:
            prefs = [b.strip().lower() for b in user.brand_prefs.split(",")]
            if product.brand.lower() in prefs:
                score += 20

        if score > best_score:
            best_score = score
            best_user_id = user.id

    return best_user_id
