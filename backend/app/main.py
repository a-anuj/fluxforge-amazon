"""
Amazon Green Credits Ecosystem — FastAPI entry point.
"""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import users, products, orders, returns, listings, redemptions, media, sustainability, community

# Create tables on startup (idempotent)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Amazon Green Credits Ecosystem",
    description="Sustainability reward ecosystem — AI-powered assessment, green credits, impact tracking, and circular commerce.",
    version="0.2.0",
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
app.include_router(community.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "Amazon Green Credits Ecosystem API — visit /docs for Swagger UI"}
