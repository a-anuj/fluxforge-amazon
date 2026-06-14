"""
Pydantic v2 schemas for request/response validation.
"""

from pydantic import BaseModel
from typing import Optional


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

    model_config = {"from_attributes": True}


# ── Product Confidence ─────────────────────────────────────────────────

class ProductConfidenceOut(BaseModel):
    total_orders: int
    total_returns: int
    return_rate: float                 # 0-100 percentage
    return_frequency_score: float      # /10  (10 = never returned)
    return_label: str                  # "Rarely returned" | "Sometimes returned" | "Frequently returned"


# ── Orders ─────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    user_id: int
    product_id: int


class OrderOut(BaseModel):
    id: int
    user_id: int
    product_id: int
    status: str
    fit_score: Optional[float] = None
    return_risk: Optional[str] = None

    model_config = {"from_attributes": True}


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

    model_config = {"from_attributes": True}


class GreenCreditsResponse(BaseModel):
    balance: int
    transactions: list[GreenCreditTxOut]
