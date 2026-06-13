"""
Amazon Circular Intelligence — FastAPI entry point.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import users, products, orders, returns, listings

# Create tables on startup (idempotent)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Amazon Circular Intelligence",
    description="Sustainability-focused e-commerce API — return prediction, AI grading, shopping twins, and trust reports.",
    version="0.1.0",
)

# CORS — allow the Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


@app.get("/")
def root():
    return {"message": "Amazon Circular Intelligence API — visit /docs for Swagger UI"}
