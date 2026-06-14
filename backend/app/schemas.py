"""
Pydantic v2 schemas for request/response validation.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ── Users ──────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: int
    name: str
    sizes: Optional[str] = None
    brand_prefs: Optional[str] = None
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    interests: Optional[str] = None
    green_credits: int = 0

    # Green Credits Ecosystem fields
    lifetime_credits: int = 0
    level: str = "Seed 🌱"
    co2_saved: float = 0.0
    ewaste_prevented: float = 0.0
    water_saved: float = 0.0
    products_reused: int = 0
    products_repaired: int = 0
    products_resold: int = 0

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: Optional[str] = None
    sizes: Optional[str] = None
    brand_prefs: Optional[str] = None
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    interests: Optional[str] = None


# ── Products ───────────────────────────────────────────────────────────

class ProductOut(BaseModel):
    id: int
    name: str
    category: str
    brand: str
    size: Optional[str] = None
    price: float
    description: Optional[str] = None
    image_url: Optional[str] = None

    # Environmental impact metrics
    co2_impact: float = 0.0
    ewaste_impact: float = 0.0
    water_impact: float = 0.0
    repair_cost_estimate: Optional[float] = None
    avg_lifespan_months: int = 24

    model_config = {"from_attributes": True}


# ── Product Confidence ─────────────────────────────────────────────────

class ProductConfidenceOut(BaseModel):
    total_orders: int
    total_returns: int
    return_rate: float                 # 0-100 percentage
    return_frequency_score: float      # /10  (10 = never returned)
    return_label: str                  # "Rarely returned" | "Sometimes returned" | "Frequently returned"


# ── Product Impact ─────────────────────────────────────────────────────

class ProductImpactOut(BaseModel):
    product_id: int
    product_name: str
    co2_footprint: float               # kg CO₂
    ewaste_potential: float            # kg e-waste
    water_footprint: float             # liters water
    repair_cost_estimate: Optional[float] = None
    avg_lifespan_months: int = 24
    circular_savings: dict = {}        # savings if bought refurbished


# ── Sustainability Advisor ─────────────────────────────────────────────

class SustainabilityAdvisorOut(BaseModel):
    advice_type: str                   # "purchase" | "return" | "lifecycle"
    title: str
    message: str
    stats: dict = {}                   # contextual stats
    green_credits_potential: int = 0   # credits user could earn


# ── Orders ─────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    user_id: int
    product_id: int
    is_refurbished: bool = False
    delivery_type: str = "standard"    # "express" | "standard" | "eco"


class OrderOut(BaseModel):
    id: int
    user_id: int
    product_id: int
    status: str
    fit_score: Optional[float] = None
    return_risk: Optional[str] = None
    is_refurbished: bool = False
    delivery_type: str = "standard"
    green_credits_earned: int = 0

    model_config = {"from_attributes": True}


# ── Delivery Options ──────────────────────────────────────────────────

class DeliveryOptionOut(BaseModel):
    type: str                          # "express" | "standard" | "eco"
    label: str
    days: int
    co2_kg: float
    green_credits: int
    description: str


# ── Returns ────────────────────────────────────────────────────────────

class ReturnCreate(BaseModel):
    order_id: int
    image_urls: list[str] = []


class AssessmentResult(BaseModel):
    condition_score: float
    defects: str
    remaining_life_pct: int
    recommended_action: str


class ReturnOut(BaseModel):
    id: int
    order_id: int
    image_urls: Optional[str] = None
    condition_score: Optional[float] = None
    defects: Optional[str] = None
    remaining_life_pct: Optional[int] = None
    recommended_action: Optional[str] = None
    status: str
    green_credits_earned: int = 0

    model_config = {"from_attributes": True}


# ── Listings ───────────────────────────────────────────────────────────

class ListingOut(BaseModel):
    id: int
    return_id: int
    product_id: int
    matched_user_id: Optional[int] = None
    price: float
    status: str
    # Joined data for trust report
    product: Optional[ProductOut] = None
    return_item: Optional[ReturnOut] = None

    model_config = {"from_attributes": True}


class PurchaseRequest(BaseModel):
    user_id: int


# ── Green Credits ──────────────────────────────────────────────────────

class GreenCreditTxOut(BaseModel):
    id: int
    user_id: int
    amount: int
    type: str
    action_type: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class GreenCreditsResponse(BaseModel):
    balance: int
    lifetime_credits: int = 0
    level: str = "Seed 🌱"
    level_progress: float = 0.0        # 0-100 percentage to next level
    next_level: Optional[str] = None
    credits_to_next: int = 0
    transactions: list[GreenCreditTxOut]


# ── Impact Stats ───────────────────────────────────────────────────────

class ImpactStatsOut(BaseModel):
    co2_saved: float
    ewaste_prevented: float
    water_saved: float
    products_reused: int
    products_repaired: int
    products_resold: int
    level: str
    lifetime_credits: int
    level_progress: float
    next_level: Optional[str] = None
    credits_to_next: int = 0
    total_orders: int = 0
    circular_orders: int = 0
    circular_percentage: float = 0.0


# ── Green Challenges ──────────────────────────────────────────────────

class GreenChallengeOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str] = None
    reward_credits: int
    status: str
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Redemptions ───────────────────────────────────────────────────────

class RedemptionOptionOut(BaseModel):
    type: str                          # "discount" | "prime" | "donation"
    title: str
    description: str
    credits_required: int
    icon: str


class RedemptionCreate(BaseModel):
    user_id: int
    type: str                          # "discount" | "prime" | "donation"
    credits: int


class RedemptionOut(BaseModel):
    id: int
    user_id: int
    type: str
    credits_spent: int
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
