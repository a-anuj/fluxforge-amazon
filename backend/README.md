# FluxForge Backend

FastAPI service powering the Amazon Circular Intelligence Platform.

---

## Overview

This is the backend for FluxForge, a circular commerce platform built for Amazon HackOn Season 6.0.
It exposes a REST API consumed by the React frontend and handles all business logic: AI-powered
product assessment via AWS Bedrock, wishlist radius matching, Green Credits computation, environmental
impact tracking, virtual try-on orchestration, and community resale.

The application is built with FastAPI 0.111, SQLAlchemy 2, and Pydantic v2. It supports SQLite for
local development and PostgreSQL for production. All AI vision calls go to AWS Bedrock
(amazon.nova-lite-v1:0).

---

## Project Structure

  backend/
    app/
      __init__.py
      database.py          - SQLAlchemy engine and session factory
      main.py              - FastAPI application, middleware, routers, startup migrations
      models.py            - SQLAlchemy ORM models (16 tables)
      schemas.py           - Pydantic v2 request/response schemas

      routers/
        users.py           - Profiles, credit history, impact stats, challenges
        products.py        - Catalogue, confidence scores, environmental impact
        orders.py          - Creation, fit scoring, delivery credit calculation
        returns.py         - Return submission, wishlist matching, pickup scan
        listings.py        - Second-life listing feed and purchase
        redemptions.py     - Green Credits redemption options and history
        media.py           - Image and video quality guardrail (Pillow-based)
        sustainability.py  - AWS Bedrock AI endpoints (verify, fingerprint, assess)
        wishlist.py        - Wishlist CRUD, radius matching, notifications
        community.py       - Peer-to-peer resale marketplace with AI pricing
        analytics.py       - Admin KPI dashboard (real DB queries)
        baseline.py        - Employee delivery baseline scan + AI verification
        tryon.py           - Virtual try-on via IDM-VTON (Hugging Face)

      services/
        media_validator.py       - Image quality checks (blur, brightness, resolution)
        ai_assessment.py         - Condition scoring stub (Bedrock-upgradeable)
        product_verifier.py      - Nova Lite identity verification at packaging
        wishlist_matcher.py      - Pincode-radius match engine + discount calculator
        credit_engine.py         - Green Credits formula, delivery credits, level progression
        impact_calculator.py     - CO2, e-waste, water metrics per category
        sustainability_advisor.py - Contextual purchase and return advice
        matching.py              - Shopping Twin buyer-item heuristic scoring

    tests/
      conftest.py          - Pytest fixtures and test database setup
      test_users.py        - User API tests
      test_returns.py      - Return submission flow tests
      test_baseline.py     - Baseline scan tests (role enforcement, AI gate, transitions)

    seed.py                - Database seeder (users, products, orders, wishlists)
    add_column.py          - Standalone safe column migration utility
    migrate_ai.py          - AI field migration helper
    requirements.txt       - Python dependencies
    Dockerfile             - Container image for EC2 or Docker Compose

---

## Setup and Running

### Prerequisites

- Python 3.11+
- AWS credentials with Bedrock and S3 access (optional, degrades gracefully)

### Installation

  python -m venv venv
  source venv/bin/activate      # Windows: venv\\Scripts\\activate
  pip install -r requirements.txt

### Environment Configuration

Create .env in backend directory:

  AWS_ACCESS_KEY_ID=your_access_key_id
  AWS_SECRET_ACCESS_KEY=your_secret_access_key
  AWS_REGION=us-east-1
  AWS_S3_BUCKET_NAME=your-s3-bucket-name
  DATABASE_URL=sqlite:///./circular_intelligence.db
  VTON_HF_SPACE=yisol/IDM-VTON

### Database Seeding

  python seed.py

### Starting the Server

  uvicorn app.main:app --reload

API base URL: http://localhost:8000
Swagger UI: http://localhost:8000/docs

---

## Core Modules

### sustainability.py (AI Assessment Router)

Exposes four endpoints backed by AWS Bedrock Nova Lite:

1. POST /api/sustainability/verify: Single-image product identity check.
2. POST /api/sustainability/fingerprint: Real-time keyframe product coverage check.
   Returns coverage score, missing views, and adaptive prompts.
3. POST /api/sustainability/verify_live_match: Fast fail-fast check during scan to
   hard-block person/selfie frames and obvious category mismatches.
4. POST /api/sustainability/assess: Full condition assessment. Passes both baseline frames
   and return frames to Nova Lite. Returns damage origin (user_caused vs manufacturing_defect)
   and per-angle frame analyses.

### baseline.py (Employee Baseline Scan Router)

- POST /api/baseline/{order_id}/scan
Accepts a snapshot and frames map. Validates employee role. Runs verify_product_identity (Nova Lite)
on the snapshot. If verified, uploads frames to S3 and advances order status to delivered.

### wishlist_matcher.py (Radius Matching Engine)

On RESALE/REFURBISH classification, automatically:
1. Matches wishlist entries by category/brand.
2. Estimates distance via 6-tier pincode prefix heuristic.
3. Filters by radius_km.
4. Scores 0-100 (Product Match + Price Fit + Distance Bonus + Condition + Brand Match).
5. Calculates dynamic discount (Base + 40% Logistics Savings + Urgency Bonus, clamped 15-50%).

### credit_engine.py (Green Credits Engine)

Formula: Credits = Base Reward x Product Impact Score x Sustainability Multiplier
Calculates lifetime progression across 5 levels (Seed to Circular Champion).

---

## Dependencies

  fastapi>=0.111.0
  uvicorn[standard]>=0.30.0
  sqlalchemy>=2.0.0
  pydantic>=2.0.0
  boto3>=1.34.0
  Pillow>=10.0.0
  python-multipart>=0.0.9
  python-dotenv>=1.0.0
  pytest>=8.0.0
  httpx>=0.27.0
  psycopg2-binary>=2.9.9
  gradio_client>=1.3.0

---

## Testing

  pytest tests/ -v

Uses in-memory SQLite fixture and mocked Bedrock/S3 calls.
test_baseline.py covers role enforcement, AI gate logic, file validation, and state transitions.