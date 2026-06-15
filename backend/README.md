# FluxForge Backend

FastAPI + SQLAlchemy + AWS Bedrock

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your AWS credentials
python seed.py
uvicorn app.main:app --reload
```

API: **http://localhost:8000** | Docs: **http://localhost:8000/docs**

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes | AWS credentials for Bedrock + S3 |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS credentials |
| `AWS_REGION` | Yes | Default: `us-east-1` |
| `AWS_S3_BUCKET_NAME` | No | S3 bucket for return images (falls back to local) |
| `DATABASE_URL` | No | PostgreSQL URL (falls back to SQLite) |

## Testing

```bash
pytest tests/ -v
```

## Project Structure

```
app/
├── main.py              # FastAPI app + router registration
├── database.py          # SQLAlchemy engine + session
├── models.py            # ORM models (User, Product, Order, Return, Listing, Wishlist...)
├── schemas.py           # Pydantic request/response schemas
├── routers/             # API endpoint handlers
│   ├── users.py
│   ├── products.py
│   ├── orders.py
│   ├── returns.py
│   ├── listings.py
│   ├── redemptions.py
│   ├── media.py         # Quality guardrail endpoints
│   ├── sustainability.py # Bedrock AI assessment
│   └── wishlist.py      # Radius matching + dynamic discounts
└── services/            # Business logic
    ├── media_validator.py
    ├── ai_assessment.py
    ├── wishlist_matcher.py
    ├── credit_engine.py
    ├── impact_calculator.py
    ├── sustainability_advisor.py
    └── matching.py
```
