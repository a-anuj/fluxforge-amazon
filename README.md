# Amazon Circular Intelligence

> Sustainability-focused e-commerce platform — AI-powered return prediction, product grading, shopping-twin matching, and trust/transparency reports.

## Architecture

```
/frontend   → React (Vite) + TailwindCSS
/backend    → FastAPI + SQLAlchemy + SQLite
```

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python seed.py          # Creates & seeds the SQLite DB
uvicorn app.main:app --reload
```

API runs at **http://localhost:8000** — Swagger UI at **http://localhost:8000/docs**

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173**

## Features

| Feature | Description |
|---------|-------------|
| **Return Risk Prediction** | AI-computed fit score + return risk before purchase |
| **AI Product Assessment** | Stub image-based condition scoring for returns |
| **Shopping Twins** | Matches returned items to the best-fit buyer |
| **Second-Life Feed** | Personalized feed of certified pre-owned items |
| **Trust Report** | Full transparency page with condition metrics |
| **Green Credits** | Earn credits for purchasing second-life items |

## Pages

1. `/` — Product catalog with search & category filters
2. `/products/:id` — Product detail with purchase confidence card
3. `/orders` — Order history
4. `/returns/new` — Return submission with AI assessment
5. `/feed` — Second-life feed (matched + browse all)
6. `/listings/:id` — Trust & transparency report
7. `/profile` — Shopping twin attributes + green credits wallet

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/` | List all users |
| GET | `/api/users/{id}` | User profile |
| GET | `/api/users/{id}/green-credits` | Green credits balance + history |
| GET | `/api/products/` | List products |
| GET | `/api/products/{id}` | Product detail |
| GET | `/api/products/{id}/alternatives` | Similar products |
| POST | `/api/orders/` | Create order (computes fit score) |
| GET | `/api/orders/?user_id=` | User's orders |
| POST | `/api/returns/` | Submit return (AI assessment) |
| GET | `/api/listings/feed?user_id=` | Matched listings for user |
| GET | `/api/listings/all` | All available listings |
| GET | `/api/listings/{id}` | Listing detail (trust report data) |
| POST | `/api/listings/{id}/purchase` | Purchase listing + earn green credits |

## Extending for Production

- **AI Assessment**: Replace `backend/app/services/ai_assessment.py` with a real Bedrock/Claude Vision call
- **Shopping Twin Matching**: Replace `backend/app/services/matching.py` with ML embeddings
- **Database**: Swap SQLite URL in `backend/app/database.py` for PostgreSQL
- **Auth**: Add JWT/OAuth via FastAPI dependencies
