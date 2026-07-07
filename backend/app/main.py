"""
Amazon Green Credits Ecosystem — FastAPI entry point.
"""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import users, products, orders, returns, listings, redemptions, media, sustainability, analytics
from app.routers import wishlist as wishlist_router, community, baseline, tryon

from contextlib import asynccontextmanager

# ── Safe column migrations for new features ────────────────────────────
from sqlalchemy import text as _sql_text

def _safe_add_column(db_engine, table, column, col_type, default=None):
    """Add a column to an existing table if it doesn't already exist."""
    try:
        with db_engine.connect() as conn:
            if default is not None:
                conn.execute(_sql_text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type} DEFAULT {default}"))
            else:
                conn.execute(_sql_text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            conn.commit()
    except Exception:
        pass  # column already exists or DB doesn't support it

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (idempotent)
    Base.metadata.create_all(bind=engine)
    
    try:
        # Original columns
        _safe_add_column(engine, "orders", "placed_at", "TIMESTAMP WITH TIME ZONE", "NOW()")
        _safe_add_column(engine, "orders", "return_period_days", "INTEGER", "30")
        _safe_add_column(engine, "orders", "no_return_credits", "INTEGER", "0")
        _safe_add_column(engine, "orders", "no_return_credits_status", "VARCHAR", "'pending'")
        _safe_add_column(engine, "orders", "baseline_scan_urls", "TEXT")
        _safe_add_column(engine, "orders", "baseline_scan_at", "TIMESTAMP WITH TIME ZONE")
        _safe_add_column(engine, "orders", "baseline_scan_employee_id", "INTEGER")
        _safe_add_column(engine, "users", "role", "VARCHAR", "'customer'")
        _safe_add_column(engine, "users", "employee_zone", "VARCHAR")
        _safe_add_column(engine, "products", "return_period_days", "INTEGER", "7")
        _safe_add_column(engine, "products", "has_no_return_policy", "BOOLEAN", "FALSE")
        # Multi-angle product images
        _safe_add_column(engine, "products", "image_urls", "TEXT")
        # ── Nova Pro assessment gate columns ───────────────────────
        _safe_add_column(engine, "returns", "condition_note", "TEXT")
        _safe_add_column(engine, "returns", "confidence", "FLOAT")
        _safe_add_column(engine, "returns", "assessment_source", "VARCHAR")
        _safe_add_column(engine, "returns", "original_recommended_action", "VARCHAR")
        _safe_add_column(engine, "returns", "gate_override", "BOOLEAN", "FALSE")
        # ── Refurbished listing tag ────────────────────────────────
        _safe_add_column(engine, "listings", "condition_note", "TEXT")
        # ── Community listing split-path provenance ────────────────
        _safe_add_column(engine, "community_listings", "purchase_source", "VARCHAR", "'non_amazon'")
        _safe_add_column(engine, "community_listings", "amazon_order_id", "INTEGER")
        _safe_add_column(engine, "community_listings", "invoice_image_url", "TEXT")
        _safe_add_column(engine, "community_listings", "invoice_verified", "BOOLEAN", "FALSE")
        _safe_add_column(engine, "community_listings", "invoice_product_name", "VARCHAR")
        _safe_add_column(engine, "community_listings", "invoice_store", "VARCHAR")
        _safe_add_column(engine, "community_listings", "invoice_date", "VARCHAR")
    except Exception:
        pass  # Non-critical — app can still run

    yield
    # Clean up resources if needed

app = FastAPI(
    title="Amazon Green Credits Ecosystem",
    description="Sustainability reward ecosystem — AI-powered assessment, green credits, impact tracking, and circular commerce.",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — allow any origin for network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all routers under /api
app.include_router(users.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(returns.router, prefix="/api")
app.include_router(listings.router, prefix="/api")
app.include_router(redemptions.router, prefix="/api")
app.include_router(media.router, prefix="/api")
app.include_router(sustainability.router, prefix="/api")
app.include_router(wishlist_router.router, prefix="/api")
app.include_router(community.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(baseline.router, prefix="/api")
app.include_router(tryon.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "Amazon Green Credits Ecosystem API — visit /docs for Swagger UI"}
