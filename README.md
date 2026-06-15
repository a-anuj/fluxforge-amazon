# FluxForge — Amazon Circular Commerce Platform

> **Amazon HackOn Season 6.0** | Problem Statement: *Reimagining Urgent Shopping*

## The Idea

Quick-commerce customers expect to discover, decide, and purchase in seconds. We reimagine this by making **returned products instantly available to nearby buyers** who already want them — eliminating search, reducing decision time, and enabling same-day hyperlocal delivery.

**FluxForge** is a sustainability-first circular commerce platform that:
- Uses **AI-powered quality assessment** (AWS Bedrock Nova Lite) to grade returned products instantly
- Matches returned items to **nearby wishlist holders** within a configurable radius
- Offers **dynamic discounts** based on logistics savings from local delivery
- Rewards every sustainable action with **Green Credits** (gamified progression system)
- Provides **full product journey transparency** — buyers see the complete provenance before purchasing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend — React 19 + Vite + TailwindCSS                   │
│  localhost:5173                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────┐
│  Backend — FastAPI + SQLAlchemy + Pydantic v2               │
│  localhost:8000                                             │
├─────────────────────────────────────────────────────────────┤
│  Services:                                                  │
│  • Media Validator (quality guardrail)                      │
│  • AI Assessment (Bedrock Nova Lite — condition scoring)    │
│  • Wishlist Matcher (radius-based matching+dynamic pricing)│
│  • Credit Engine (Green Credits calculation)                │
│  • Impact Calculator (CO₂, e-waste, water metrics)          │
│  • Sustainability Advisor (contextual tips)                 │
│  • Shopping Twin Matching (buyer-item heuristics)           │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  AWS Services                                               │
│  • Bedrock (Nova Lite v1) — product verification + grading  │
│  • S3 — return image storage                                │
│  • RDS PostgreSQL — production database                     │
│  • SQLite — local development fallback                      │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- AWS credentials (for Bedrock AI features)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file:
```env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket    # optional
DATABASE_URL=sqlite:///./circular_intelligence.db   # or postgresql://...
```

Seed and run:
```bash
python seed.py
uvicorn app.main:app --reload
```

API: **http://localhost:8000** | Swagger: **http://localhost:8000/docs**

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: **http://localhost:5173**

## Key Features

### 1. AI-Powered Return Assessment
- **Quality Guardrail** — validates image quality (blur, brightness, resolution) before sending to AI
- **Product Verification** — confirms uploaded image matches the ordered product (Bedrock Nova Lite)
- **Condition Scoring** — 0-100 score with defect detection and remaining life estimation
- **Disposition Decision** — RESALE / REFURBISH / RECYCLE / DISPOSE classification

### 2. Wishlist Radius Matching ⭐
When a product is returned, the system automatically:
1. Finds nearby users who have that item (or similar) in their wishlist
2. Calculates a **dynamic discount** based on logistics savings
3. Sends a proactive notification: *"Your wishlisted Nike shoes are available 5km away at 34% off!"*
4. Shows full **product journey** (provenance, AI condition report, transparent pricing)

**Matching Algorithm:**
```
Match Score = Product Match (30) + Price Fit (25) + Distance Bonus (20)
            + Condition (15) + Brand Match (10)
```

**Dynamic Discount Formula:**
```
Discount = Base (by condition) + Logistics Share (40% of saved transport)
         + Urgency Bonus (longer in wishlist → bigger incentive)
         Clamped: 15% – 50%
```

### 3. Green Credits Ecosystem
- **Earn** credits for: buying refurbished, returning responsibly, eco-delivery, completing challenges
- **Spend** credits on: Amazon coupons, Prime benefits, tree planting, recycling donations
- **Level up**: Seed 🌱 → Sapling 🌿 → Green Hero 🌎 → Planet Protector 🌍 → Circular Champion ♻️
- **Formula**: `Credits = Base Reward × Product Impact Score × Sustainability Multiplier`

### 4. Purchase Confidence Card
Pre-purchase intelligence showing:
- **Return Frequency Score** — how often this product gets returned (/10)
- **Personal Comfort Score** — how well it fits your profile (size, budget, brand)
- **Environmental Footprint** — CO₂, e-waste, water impact
- **Refurbished Alternative Banner** — "Buy Certified Refurbished & save ₹X"

### 5. Eco-Delivery Options
| Option | Days | CO₂ | Credits |
|--------|------|-----|---------|
| Express | 1 | 3.4 kg | 0 |
| Standard | 3 | 1.2 kg | +15 |
| Eco-Consolidated | 5 | 0 kg | +22 |

### 6. Trust & Transparency Report
Full product lifecycle visualization on every second-life listing:
- Original purchase → Return → AI Assessment → Listed → You (buyer)
- Condition score, remaining lifespan, defect analysis
- Environmental savings (CO₂, e-waste prevented)

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Product catalog with category filters + user stats |
| `/products/:id` | Product Detail | Confidence card, eco-delivery, refurbished alternatives |
| `/orders` | Orders | Order history with fit scores and return risk |
| `/returns/new` | New Return | 3-step AI assessment (quality → verify → assess) |
| `/feed` | Second Life | Matched + browse all certified pre-owned items |
| `/listings/:id` | Listing Detail | Trust report + product lifecycle journey |
| `/profile` | Dashboard | Impact stats, wallet, challenges, redeem, profile editor |

## API Endpoints

### Users & Profiles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/` | List all users |
| GET | `/api/users/{id}` | User profile |
| PUT | `/api/users/{id}` | Update profile (shopping twin) |
| GET | `/api/users/{id}/green-credits` | Credit balance + transaction history |
| GET | `/api/users/{id}/impact-stats` | Environmental impact dashboard |
| GET | `/api/users/{id}/challenges` | Active green challenges |
| POST | `/api/users/{id}/challenges/{cid}/complete` | Complete a challenge |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products/` | List all products |
| GET | `/api/products/{id}` | Product detail |
| GET | `/api/products/{id}/confidence` | Return frequency score |
| GET | `/api/products/{id}/impact` | Environmental footprint |
| GET | `/api/products/{id}/refurbished-alternative` | Check circular option |
| GET | `/api/products/{id}/sustainability-advice` | AI purchase tips |

### Orders & Returns
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders/` | Create order (fit score + delivery credits) |
| GET | `/api/orders/?user_id=` | Order history |
| GET | `/api/orders/delivery-options` | Eco-delivery options with CO₂ |
| POST | `/api/returns/` | Submit return → AI assessment → auto-match |

### Listings & Second Life
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/listings/feed?user_id=` | Personalized matched feed |
| GET | `/api/listings/all` | Browse all available |
| GET | `/api/listings/{id}` | Detail + trust report |
| POST | `/api/listings/{id}/purchase` | Buy + earn credits |

### Wishlist & Radius Matching
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/wishlist/` | Add to wishlist (product/category/brand + radius) |
| GET | `/api/wishlist/?user_id=` | User's wishlist items |
| DELETE | `/api/wishlist/{id}` | Remove from wishlist |
| GET | `/api/wishlist/matches?user_id=` | Matched items near you |
| GET | `/api/wishlist/notifications?user_id=` | Match notifications |
| POST | `/api/wishlist/notifications/read` | Mark as read |
| GET | `/api/wishlist/journey/{listing_id}` | Full product provenance |
| POST | `/api/wishlist/matches/{id}/purchase` | Buy at dynamic discount |

### Media Quality & AI Assessment
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/media/validate/image` | Quality guardrail check |
| POST | `/api/media/validate/video` | Video quality check |
| POST | `/api/media/validate/batch` | Batch validate (up to 5 files) |
| GET | `/api/media/guidelines` | Upload guidelines for frontend |
| POST | `/api/sustainability/verify` | Product identity verification (Bedrock) |
| POST | `/api/sustainability/assess` | Full AI condition assessment (Bedrock) |

### Redemptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/redemptions/options` | Available reward options |
| POST | `/api/redemptions/redeem` | Redeem credits |
| GET | `/api/redemptions/history?user_id=` | Redemption history |

## AI & Services Architecture

| Service | File | Purpose |
|---------|------|---------|
| Media Validator | `services/media_validator.py` | Pre-Bedrock quality guardrail (Pillow-based) |
| AI Assessment | `services/ai_assessment.py` | Product condition scoring (stub → Bedrock) |
| Wishlist Matcher | `services/wishlist_matcher.py` | Radius matching + dynamic discount engine |
| Credit Engine | `services/credit_engine.py` | Green Credits formula + level progression |
| Impact Calculator | `services/impact_calculator.py` | Environmental metrics per category |
| Sustainability Advisor | `services/sustainability_advisor.py` | Contextual tips (stub → Bedrock) |
| Shopping Twin | `services/matching.py` | Heuristic buyer-item matching |

## Business Impact

| Metric | How |
|--------|-----|
| **Faster discovery** | Proactive notifications to wishlist holders — no searching needed |
| **Reduced logistics** | Product travels 5km (local) instead of 150km (warehouse) |
| **Lower carbon** | ~17 kg CO₂ saved per local delivery |
| **Less waste** | Products get second life instead of landfill |
| **Customer savings** | 15-50% dynamic discount from logistics savings |
| **Return cost reduction** | No reverse logistics to warehouse — direct P2P |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, TailwindCSS 4, React Router 7 |
| Backend | FastAPI, SQLAlchemy 2, Pydantic v2, Python 3.11+ |
| AI/ML | AWS Bedrock (Nova Lite v1), Pillow (image processing) |
| Database | SQLite (dev) / PostgreSQL via RDS (prod) |
| Storage | AWS S3 (return images) |
| Testing | Pytest, httpx, FastAPI TestClient |

## Team FluxForge

| Name | GitHub |
|------|--------|
| Anuj A | [@a-anuj](https://github.com/a-anuj) |
| Harish J | [@harish1604](https://github.com/harish1604) |
| Hari Prasath K | [@hariPrasathK-Dev](https://github.com/hariPrasathK-Dev) |

Built in 48 hours for Amazon HackOn Season 6.0.
