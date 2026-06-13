"""
SQLAlchemy ORM models for Amazon Circular Intelligence.
All tables are defined here for hackathon simplicity.
"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey
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

    orders = relationship("Order", back_populates="user")
    green_credit_txs = relationship("GreenCreditTx", back_populates="user")


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

    orders = relationship("Order", back_populates="product")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    status = Column(String, default="placed")
    fit_score = Column(Float, nullable=True)
    return_risk = Column(String, nullable=True)        # "low" | "medium" | "high"

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

    user = relationship("User", back_populates="green_credit_txs")
