# FluxForge - Amazon Circular Intelligence Platform

Amazon HackOn Season 6.0 | Problem Statement: Second Life Commerce - AI Powered Returns and Sustainable Resale

---

## Overview

FluxForge is a full-stack circular commerce platform built on top of Amazon retail infrastructure.
It addresses the core inefficiency in the returns pipeline: millions of perfectly usable products are
returned, warehoused, and eventually discarded at significant cost to sellers, customers, and the
environment.

The platform introduces an end-to-end intelligent lifecycle for every product - from order placement,
through delivery verification by warehouse staff, to AI-powered return assessment and second-life
resale. It uses real-time AI vision via AWS Bedrock (Nova Lite), a pincode-radius wishlist matching
engine, a gamified Green Credits reward system, a peer-to-peer community resale marketplace, and a
virtual try-on feature - all within a trusted, Amazon-native experience.

---

## Problem Statement

The Amazon HackOn 6.0 theme identifies systemic problems FluxForge is built to solve:

- Product returns are expensive for customers, sellers, and the environment.
- Returned products are hard to trust without verifiable, transparent quality grading.
- There is no intelligent routing to match returned goods with nearby buyers who want them.
- Buyers lack pre-purchase signals to make confident, return-proof decisions.
- Sustainable behaviours like eco-delivery and buying refurbished are not meaningfully rewarded.
- Return fraud - claiming refunds for damage caused after delivery - is difficult to detect and prove.

---

## System Architecture

The system is a three-tier architecture:

  Frontend  (React 19 + Vite 8 + TailwindCSS 4) deployed on Vercel
    communicates with the
  Backend   (FastAPI + SQLAlchemy 2 + Python 3.11+) deployed on AWS EC2
    which calls
  AWS Services: Bedrock (Nova Lite), S3, and PostgreSQL/SQLite

Backend registers 14 API routers:
  users, products, orders, returns, listings, redemptions, media,
  sustainability, wishlist, community, analytics, baseline, tryon

Backed by 8 service modules:
  media_validator, ai_assessment, product_verifier, wishlist_matcher,
  credit_engine, impact_calculator, sustainability_advisor, matching

### CI/CD Pipeline

Every push to main triggers a GitHub Actions workflow:
1. Runs the Pytest test suite.
2. On pass, SSHs into EC2 using a secrets-managed deploy key.
3. Pulls latest code via git reset --hard.
4. Updates Python dependencies only if requirements.txt has changed (hash-gated).
5. Restarts the fluxforge systemd service and validates it is active.
6. Shreds the SSH private key from the runner filesystem.

---

## Core Features

### 1. AI Return Assessment with Live Video Scanning

Returns use a six-phase guided live video scan rather than a static photo upload.

Scan phases:

| Phase ID     | Label        | Motion                            | Duration |
|---|---|---|---|
| front_anchor | Front Anchor | Hold steady at centre             | 6 s      |
| right_sweep  | Right Sweep  | Pan slowly to the right           | 6 s      |
| back_anchor  | Back Anchor  | Rotate to back panel              | 7 s      |
| left_sweep   | Left Sweep   | Pan slowly to the left            | 6 s      |
| top_detail   | Top / Ports  | Tilt upward                       | 6 s      |
| detail_mark  | Detail Mark  | Move closer for branding or serial| 6 s      |

Keyframes stream to /api/sustainability/fingerprint (Bedrock Nova Lite) in real time.
The AI returns adaptive coverage guidance and hard-rejects person/selfie frames and category mismatches.

On completion, /api/sustainability/assess performs a full assessment against the delivery baseline and returns:
  product_type, condition_score (0-100), damage_assessment, packaging_condition,
  estimated_recovery_value, sustainability_reasoning, baseline_comparison,
  new_damage_detected, damage_origin (none / manufacturing_defect / user_caused),
  damaged_angles, per-angle frame_analyses,
  classification (RESALE / REFURBISH / RECYCLE / DISPOSE), confidence (0-100)

### 2. Delivery Baseline Scan (Employee Portal)

Before dispatch, a warehouse operator performs the same six-phase scan of the packaged product.
Frames are stored in S3 and linked to the order record.

The baseline is the authoritative product state at delivery. On return, the AI compares return
frames against baseline frames angle-by-angle to classify damage origin:
  - manufacturing_defect: damage in baseline and return (legitimate return)
  - user_caused: damage in return only (conservative disposition, fraud signal)

An order advances from placed to delivered only after a successful baseline scan.
Return submission is blocked on any unverified order.

### 3. Wishlist Radius Matching (NearDrop)

On return submission classified as RESALE or REFURBISH, the matching engine automatically:

1. Finds wishlist entries matching the product by category, brand, and attributes.
2. Estimates proximity via Indian pincode prefix heuristic (6 tiers, 1 km to 250 km).
3. Filters by each wishlist entry radius_km threshold.
4. Scores matches on a composite 0-100 scale:
     Product Match (0-30) + Price Fit (0-25) + Distance Bonus (0-20)
     + Condition (0-15) + Brand Match (0-10)
5. Calculates dynamic discount (15-50% clamped):
     Base Category Discount + 40% of Logistics Savings + Wishlist Urgency Bonus
6. Creates WishlistMatch and WishlistNotification records for each match.

Replaces a 150 km warehouse round-trip with a sub-10 km local transaction.
Saves approximately 17 kg CO2 per matched order.

### 4. Green Credits Ecosystem

Formula: Credits = Base Reward x Product Impact Score x Sustainability Multiplier

| Action                    | Base Credits |
|---|---|
| Donate                    | 100          |
| Resell                    | 80           |
| Refurbish                 | 60           |
| Purchase Refurbished      | 50           |
| Repair                    | 50           |
| Eco-Consolidated Delivery | 15           |

Product impact scores: Electronics 2.5x, Running 1.2x, Fitness 1.0x, Yoga 0.8x
Delivery multipliers: Eco 1.5x, Standard 1.0x, Express 0.5x

Level progression (lifetime credits):

| Level              | Threshold |
|---|---|
| Seed               | 0         |
| Sapling            | 101       |
| Green Hero         | 301       |
| Planet Protector   | 701       |
| Circular Champion  | 1501      |

Credits are redeemable for Amazon coupons, Prime benefits, tree planting, and recycling donations.
No-Return Loyalty: credits vest when the return window expires without a return.

### 5. Purchase Confidence Card

Displayed before checkout on every product page:
  - Return Frequency Score (0-10): historical return rate for this SKU
  - Personal Comfort Score: fit heuristic from buyer sizes, brands, and budget
  - Environmental Footprint: CO2 kg, e-waste kg, water litres per unit lifecycle
  - Refurbished Alternative: surfaced if a certified second-life option exists
  - AI Sustainability Advice: Bedrock-generated purchase and care tips

### 6. Eco-Delivery Options

| Option            | Days | CO2 (kg) | Credits Earned |
|---|---|---|---|
| Express           | 1    | 3.4      | 0              |
| Standard          | 3    | 1.2      | ~15            |
| Eco-Consolidated  | 5    | 0.0      | ~22            |

### 7. Community Resale Marketplace

Peer-to-peer resale with AI price suggestions (Bedrock Nova Lite), location-based
discovery, Green Credits incentives, e-waste impact tracking per transaction, and
category-pincode alert subscriptions.

### 8. Virtual Try-On

Users upload a body photo (stored in S3). The system calls IDM-VTON via Hugging Face
Gradio. Results are resized to match the body photo dimensions and cached per
user-product-photo triplet.

### 9. Analytics Dashboard (Admin)

Real-time KPIs from actual database queries:
  - Return rate vs. 20% industry baseline
  - AI inspection accuracy
  - Eco-delivery adoption rate
  - Products resold and CO2 saved
  - Cost savings in INR from diverted returns
  - Category, brand, region, and reason breakdowns
  - Monthly trend charts
  - Top 5 most-returned products

---

## Application Routes

| Route            | Page                | Role           | Description                                           |
|---|---|---|---|
| /                | Home                | All            | Catalogue, category filters, hero slideshow, impact   |
| /products/:id    | Product Detail      | Customer       | Confidence card, eco-delivery, try-on, cart           |
| /orders          | Orders              | Customer       | History, return risk flags, no-return credit vesting  |
| /returns/new     | New Return          | Customer       | Six-phase live scan, AI assessment, community listing |
| /feed            | Second Life Feed    | Customer       | Matched items and all second-life listings            |
| /listings/:id    | Listing Detail      | Customer       | Trust report, product journey, purchase               |
| /neardrop        | NearDrop            | Customer       | Wishlist management and radius-matched notifications  |
| /profile         | Profile             | Customer       | Impact stats, wallet, challenges, redemptions         |
| /cart            | Cart                | Customer       | Checkout with delivery option selection               |
| /employee-scan   | Employee Scan       | Employee/Admin | Baseline scan for deliveries and return pickups       |
| /delivery        | Delivery Dashboard  | Employee       | Work queue of pending scans and return pickups        |
| /dashboard       | Analytics Dashboard | Admin          | Platform KPI charts and breakdowns                    |

---

## Complete API Reference

All routes prefixed with /api.

### Users and Profiles
- GET /api/users/
- GET /api/users/{id}
- PUT /api/users/{id}
- GET /api/users/{id}/green-credits
- GET /api/users/{id}/impact-stats
- GET /api/users/{id}/challenges
- POST /api/users/{id}/challenges/{cid}/complete

### Products
- GET /api/products/
- GET /api/products/{id}
- GET /api/products/{id}/confidence
- GET /api/products/{id}/impact
- GET /api/products/{id}/refurbished-alternative
- GET /api/products/{id}/sustainability-advice

### Orders
- POST /api/orders/
- GET /api/orders/?user_id=
- GET /api/orders/delivery-options
- POST /api/orders/{id}/vest-credits

### Returns
- POST /api/returns/
- POST /api/returns/{id}/pickup-scan

### Listings and Second Life
- GET /api/listings/feed?user_id=
- GET /api/listings/all
- GET /api/listings/{id}
- POST /api/listings/{id}/purchase

### Wishlist and NearDrop
- POST /api/wishlist/
- GET /api/wishlist/?user_id=
- DELETE /api/wishlist/{id}
- GET /api/wishlist/matches?user_id=
- GET /api/wishlist/notifications?user_id=
- POST /api/wishlist/notifications/read
- GET /api/wishlist/journey/{listing_id}
- POST /api/wishlist/matches/{id}/purchase

### Sustainability and AI Assessment
- POST /api/sustainability/verify
- POST /api/sustainability/fingerprint
- POST /api/sustainability/verify_live_match
- POST /api/sustainability/assess

### Baseline Scan
- POST /api/baseline/{order_id}/scan
- GET /api/baseline/{order_id}
- GET /api/baseline/pending/list

### Media Validation
- POST /api/media/validate/image
- POST /api/media/validate/video
- POST /api/media/validate/batch
- GET /api/media/guidelines

### Community Marketplace
- GET /api/community/listings
- POST /api/community/listings
- GET /api/community/listings/nearby?user_id=
- GET /api/community/listings/{id}
- PUT /api/community/listings/{id}/buy
- POST /api/community/price-suggest
- GET /api/community/notifications?user_id=
- GET /api/community/leaderboard

### Virtual Try-On
- POST /api/tryon/upload-photo
- GET /api/tryon/photos?user_id=
- POST /api/tryon/generate

### Redemptions and Analytics
- GET /api/redemptions/options
- POST /api/redemptions/redeem
- GET /api/redemptions/history?user_id=
- GET /api/analytics/dashboard

---

## Data Model (16 Tables)

| Table                    | Description                                                          |
|---|---|
| users                    | Accounts with credit balance, impact totals, location, and role      |
| products                 | Catalogue with environmental impact and return policy fields         |
| orders                   | Orders with delivery type, fit score, and baseline scan linkage      |
| returns                  | Return submissions with AI assessment output                         |
| listings                 | Second-life listings auto-created on return submission               |
| green_credit_tx          | Audit log of all credit earn and redemption events                   |
| green_challenges         | Time-limited sustainability challenges per user                      |
| redemptions              | Credit redemption records                                            |
| wishlists                | Wishlist entries with category, brand, price ceiling, and radius     |
| wishlist_matches         | Match records created by the radius matching engine                  |
| wishlist_notifications   | In-app notifications for matched buyers                              |
| community_listings       | Peer-to-peer resale with AI condition summary and price reasoning    |
| community_alerts         | Category-pincode subscription alerts                                 |
| community_notifications  | In-app notifications triggered by alert subscriptions               |
| user_body_photos         | S3 object keys for body photos used in virtual try-on               |
| tryon_cache              | Cached try-on results per user-product-photo triplet                |

---

## Tech Stack

| Layer           | Technology                                                     |
|---|---|
| Frontend        | React 19, Vite 8, TailwindCSS 4, React Router 7,              |
|                 | Recharts, Lucide React, Redux Toolkit                          |
| Backend         | FastAPI 0.111, SQLAlchemy 2, Pydantic v2, Python 3.11+        |
| AI / Vision     | AWS Bedrock amazon.nova-lite-v1:0, Pillow                      |
| Try-On          | IDM-VTON via Hugging Face Gradio Client                        |
| Database        | SQLite (dev), PostgreSQL via psycopg2-binary (prod)            |
| Object Storage  | AWS S3 via boto3                                               |
| Deployment      | AWS EC2 + systemd (backend), Vercel (frontend)                 |
| CI/CD           | GitHub Actions                                                 |
| Containerisation| Docker, Docker Compose                                         |
| Testing         | Pytest, HTTPX, FastAPI TestClient                              |

---

## Quick Start

### Prerequisites
  - Python 3.11+
  - Node.js 18+
  - AWS credentials with Bedrock and S3 access (optional; system degrades gracefully)

### Backend

  cd backend
  python -m venv venv && source venv/bin/activate
  pip install -r requirements.txt

  Create backend/.env:
    AWS_ACCESS_KEY_ID=...
    AWS_SECRET_ACCESS_KEY=...
    AWS_REGION=us-east-1
    AWS_S3_BUCKET_NAME=...
    DATABASE_URL=sqlite:///./circular_intelligence.db
    VTON_HF_SPACE=yisol/IDM-VTON

  python seed.py
  uvicorn app.main:app --reload

  API: http://localhost:8000
  Swagger: http://localhost:8000/docs

### Frontend

  cd frontend
  npm install
  npm run dev

  Application: http://localhost:5173

### Docker Compose (Full Stack)

  docker-compose up --build

  Backend on port 8000, frontend on port 80.

### Running Tests

  cd backend
  pytest tests/ -v

---

## Business Impact

| Metric                | Mechanism                                                         |
|---|---|
| Return cost reduction | AI disposition replaces manual warehouse inspection at scale      |
| Logistics saving      | NearDrop avg 5 km vs warehouse round-trip avg 150 km             |
| Carbon saving         | ~17 kg CO2 saved per local NearDrop transaction                  |
| Fraud prevention      | Baseline vs return angle comparison detects post-delivery damage  |
| Wrong item prevention | Employee baseline AI gate blocks incorrect packaging              |
| Customer confidence   | Confidence Card reduces uninformed purchase decisions             |
| Sustainable adoption  | Green Credits gamification drives eco-delivery and refurb uptake  |

---

## Team

| Name | GitHub |
|------|--------|
| Anuj A | [@a-anuj](https://github.com/a-anuj) |
| Harish J | [@harish1604](https://github.com/harish1604) |
| Hari Prasath K | [@hariPrasathK-Dev](https://github.com/hariPrasathK-Dev) |

Qualified as a top-30 finalist at Amazon HackOn Season 6.0