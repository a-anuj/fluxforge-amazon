"""
SQLAlchemy ORM models for Amazon Green Credits Ecosystem.
All tables are defined here for hackathon simplicity.
"""

from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from app.database import Base



class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    sizes = Column(String, nullable=True)             # e.g. "shoes:9,top:M"
    brand_prefs = Column(String, nullable=True)        # comma-separated
    budget_min = Column(Integer, nullable=True)
    budget_max = Column(Integer, nullable=True)
    interests = Column(String, nullable=True)          # comma-separated
    green_credits = Column(Integer, default=0)

    # ── Green Credits Ecosystem fields ──
    lifetime_credits = Column(Integer, default=0)
    level = Column(String, default="Seed")
    co2_saved = Column(Float, default=0.0)             # kg
    ewaste_prevented = Column(Float, default=0.0)      # kg
    water_saved = Column(Float, default=0.0)            # liters
    products_reused = Column(Integer, default=0)
    products_repaired = Column(Integer, default=0)
    products_resold = Column(Integer, default=0)

    # ── Location fields ──
    city    = Column(String, nullable=True)          # e.g. "Mumbai"
    pincode = Column(String, nullable=True)          # e.g. "400001"
    is_admin = Column(Boolean, default=False)

    orders = relationship("Order", back_populates="user")
    green_credit_txs = relationship("GreenCreditTx", back_populates="user")
    challenges = relationship("GreenChallenge", back_populates="user")
    redemptions = relationship("Redemption", back_populates="user")
    community_listings_sold = relationship("CommunityListing", foreign_keys="CommunityListing.seller_id", back_populates="seller")
    community_alerts = relationship("CommunityAlert", back_populates="user")
    community_notifications = relationship("CommunityNotification", back_populates="user")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    brand = Column(String, nullable=False)
    size = Column(String, nullable=True)
    price = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    image_url = Column(String, nullable=True)

    # ── Environmental Impact metrics ──
    co2_impact = Column(Float, default=0.0)            # kg CO₂ footprint
    ewaste_impact = Column(Float, default=0.0)         # kg e-waste potential
    water_impact = Column(Float, default=0.0)           # liters water footprint
    repair_cost_estimate = Column(Float, nullable=True) # ₹ estimated repair cost
    avg_lifespan_months = Column(Integer, default=24)   # average product lifespan

    orders = relationship("Order", back_populates="product")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    status = Column(String, default="placed")
    fit_score = Column(Float, nullable=True)
    return_risk = Column(String, nullable=True)        # "low" | "medium" | "high"

    # ── Green Credits Ecosystem fields ──
    is_refurbished = Column(Boolean, default=False)
    delivery_type = Column(String, default="standard")  # "express" | "standard" | "eco"
    green_credits_earned = Column(Integer, default=0)

    # ── No-Return Loyalty Credits (pending until return window expires) ──
    placed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    return_period_days = Column(Integer, default=30)   # return window in days
    no_return_credits = Column(Integer, default=0)     # credits pending if not returned
    no_return_credits_status = Column(String, default="pending")  # "pending" | "vested" | "forfeited"

    user = relationship("User", back_populates="orders")
    product = relationship("Product", back_populates="orders")
    returns = relationship("Return", back_populates="order")


class Return(Base):
    __tablename__ = "returns"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    image_urls = Column(String, nullable=True)          # comma-separated
    condition_score = Column(Float, nullable=True)
    defects = Column(String, nullable=True)
    remaining_life_pct = Column(Integer, nullable=True)
    recommended_action = Column(String, nullable=True)  # "resell" | "refurbish" | "exchange" | "donate" | "recycle"
    status = Column(String, default="submitted")

    # ── Green Credits earned for this return action ──
    green_credits_earned = Column(Integer, default=0)

    order = relationship("Order", back_populates="returns")
    listing = relationship("Listing", back_populates="return_item", uselist=False)


class Listing(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    return_id = Column(Integer, ForeignKey("returns.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    matched_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    price = Column(Float, nullable=False)
    status = Column(String, default="available")        # "available" | "matched" | "sold"

    return_item = relationship("Return", back_populates="listing")
    product = relationship("Product")
    matched_user = relationship("User")


class GreenCreditTx(Base):
    __tablename__ = "green_credit_tx"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)
    type = Column(String, nullable=False)               # "earned" | "redeemed"

    # ── Enhanced tracking ──
    action_type = Column(String, nullable=True)         # "purchase_refurbished" | "resell" | "repair" | "donate" | "recycle" | "eco_delivery" | "challenge" | "redeem"
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="green_credit_txs")


class GreenChallenge(Base):
    __tablename__ = "green_challenges"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    reward_credits = Column(Integer, nullable=False)
    status = Column(String, default="active")           # "active" | "completed" | "expired"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="challenges")


class Redemption(Base):
    __tablename__ = "redemptions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)               # "discount" | "prime" | "donation"
    credits_spent = Column(Integer, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="redemptions")


# ── Community Resale Marketplace ───────────────────────────────

EWASTE_KG_BY_CATEGORY = {
    "electronics": 1.5,
    "laptops": 2.2,
    "mobiles": 0.5,
    "clothing": 0.3,
    "furniture": 5.0,
    "appliances": 3.5,
    "books": 0.1,
    "sports": 0.8,
    "toys": 0.4,
    "other": 0.5,
}


class CommunityListing(Base):
    __tablename__ = "community_listings"

    id                   = Column(Integer, primary_key=True, index=True, autoincrement=True)
    seller_id            = Column(Integer, ForeignKey("users.id"), nullable=False)
    title                = Column(String, nullable=False)
    description          = Column(Text, nullable=True)
    category             = Column(String, nullable=False)        # "Electronics" | "Clothing" etc.
    brand                = Column(String, nullable=True)
    asking_price         = Column(Float, nullable=False)
    suggested_price      = Column(Float, nullable=True)          # AI-generated
    condition            = Column(String, nullable=False)        # "like_new" | "good" | "fair" | "poor"
    ai_condition_summary = Column(Text, nullable=True)           # AI verification output
    image_urls           = Column(String, nullable=True)         # comma-separated S3 keys
    city                 = Column(String, nullable=True)
    pincode              = Column(String, nullable=True)
    allows_local_pickup  = Column(Boolean, default=False)
    status               = Column(String, default="active")     # "active" | "sold" | "removed"
    ai_condition_summary = Column(Text, nullable=True)           # AI-generated condition text
    ai_price_reasoning   = Column(Text, nullable=True)           # AI price rationale
    ewaste_kg_saved      = Column(Float, default=0.0)
    buyer_id             = Column(Integer, ForeignKey("users.id"), nullable=True)
    seller_trust_score   = Column(Float, default=0.0)            # computed on sale completion
    created_at           = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    sold_at              = Column(DateTime, nullable=True)

    seller = relationship("User", foreign_keys=[seller_id], back_populates="community_listings_sold")
    buyer  = relationship("User", foreign_keys=[buyer_id])


class CommunityAlert(Base):
    """User subscriptions — notify me when a listing in my category+area appears."""
    __tablename__ = "community_alerts"

    id         = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    category   = Column(String, nullable=False)
    pincode    = Column(String, nullable=True)    # notify only if listing pincode matches
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="community_alerts")


class CommunityNotification(Base):
    """In-app notification bell items."""
    __tablename__ = "community_notifications"

    id         = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    listing_id = Column(Integer, ForeignKey("community_listings.id"), nullable=True)
    message    = Column(String, nullable=False)
    is_read    = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user    = relationship("User", back_populates="community_notifications")
    listing = relationship("CommunityListing")


# ── Wishlist & Radius Matching ─────────────────────────────────────────

class Wishlist(Base):
    """User wishlist items — products they want, used for radius matching on returns."""
    __tablename__ = "wishlists"

    id         = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)   # exact product match
    category   = Column(String, nullable=True)          # category-level interest (e.g., "running")
    brand      = Column(String, nullable=True)          # brand preference (e.g., "Nike")
    keywords   = Column(String, nullable=True)          # comma-separated keywords
    max_price  = Column(Float, nullable=True)           # max price willing to pay
    radius_km  = Column(Float, default=10.0)            # matching radius in km
    status     = Column(String, default="active")       # "active" | "fulfilled" | "removed"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user    = relationship("User")
    product = relationship("Product")


class WishlistMatch(Base):
    """Records when a return matches a wishlist entry — triggers notification."""
    __tablename__ = "wishlist_matches"

    id            = Column(Integer, primary_key=True, index=True, autoincrement=True)
    wishlist_id   = Column(Integer, ForeignKey("wishlists.id"), nullable=False)
    listing_id    = Column(Integer, ForeignKey("listings.id"), nullable=False)
    return_id     = Column(Integer, ForeignKey("returns.id"), nullable=False)
    buyer_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    returner_id   = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Match quality metrics
    match_score       = Column(Float, nullable=False)       # 0-100 composite score
    distance_km       = Column(Float, nullable=True)        # distance between users
    discount_pct      = Column(Float, nullable=False)       # calculated dynamic discount
    discounted_price  = Column(Float, nullable=False)       # final price after discount
    logistics_saved   = Column(Float, default=0.0)          # ₹ saved in logistics
    co2_saved_delivery = Column(Float, default=0.0)         # kg CO₂ saved via local delivery

    # Status tracking
    status     = Column(String, default="notified")         # "notified" | "viewed" | "purchased" | "expired"
    notified_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    purchased_at = Column(DateTime, nullable=True)

    wishlist = relationship("Wishlist")
    listing  = relationship("Listing")
    return_item = relationship("Return")
    buyer    = relationship("User", foreign_keys=[buyer_id])
    returner = relationship("User", foreign_keys=[returner_id])


class WishlistNotification(Base):
    """Notifications sent to wishlist users when a match is found."""
    __tablename__ = "wishlist_notifications"

    id         = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    match_id   = Column(Integer, ForeignKey("wishlist_matches.id"), nullable=False)
    title      = Column(String, nullable=False)
    message    = Column(String, nullable=False)
    is_read    = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user  = relationship("User")
    match = relationship("WishlistMatch")
