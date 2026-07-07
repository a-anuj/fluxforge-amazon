---
inclusion: fileMatch
fileMatchPattern: 'backend/**'
---

# Backend Contributor Guide

Task-oriented guidance for working in the FluxForge / Amazon Circular Intelligence Platform backend (the FastAPI app under `backend/app/`). Follow the existing layering: **routers → services → models**. Routers stay thin, services hold business/AI logic, models are the SQLAlchemy ORM tables.

## Add a router (recipe)

Create a new module `backend/app/routers/<name>.py` and expose a `router`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db

router = APIRouter(prefix="/<name>", tags=["<name>"])

@router.get("/")
def list_items(db: Session = Depends(get_db)):
    ...
```

- Use `APIRouter(prefix="/<name>", tags=["<name>"])`, one module per domain.
- Inject the database session with `Depends(get_db)` (from `app.database`).

## Add an endpoint (recipe)

```python
from app.schemas import SomeCreate, SomeResponse

@router.post("/", response_model=SomeResponse)
def create_item(payload: SomeCreate, db: Session = Depends(get_db)):
    obj = SomeModel(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj
```

## Add a model (recipe)

```python
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Thing(Base):
    __tablename__ = "things"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User")
```

Tables are auto-created at startup via `Base.metadata.create_all` in the `lifespan` handler. There is no migration tool — use `_safe_add_column` for existing tables (see below).

## Add a service (recipe)

Put business or AI logic in `backend/app/services/<name>.py`. Keep routers thin.

## Register the router

Import in `backend/app/main.py` and mount under `/api`:

```python
app.include_router(<name>.router, prefix="/api")
```

## Safe column migration pattern

`backend/app/main.py` defines `_safe_add_column(db_engine, table, column, col_type, default=None)`:

```python
def _safe_add_column(db_engine, table, column, col_type, default=None):
    try:
        with db_engine.connect() as conn:
            if default is not None:
                conn.execute(_sql_text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type} DEFAULT {default}"))
            else:
                conn.execute(_sql_text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            conn.commit()
    except Exception:
        pass  # column already exists
```

Note: the signature takes `db_engine` (the engine object), **not** a connection — each call opens its own connection internally. Invoked in `lifespan` after `Base.metadata.create_all`.

## AWS graceful-degradation pattern

- S3 upload helpers return the original data URL when `AWS_S3_BUCKET_NAME` is unset.
- Bedrock clients are created **per-call** in `community.py`, `sustainability.py`, and `product_verifier.py`.
- Invoice verification falls back to `verified=False` (not `True`) when Bedrock is unavailable — conservative by design.

## Bedrock model usage

| Use case | Model |
|---|---|
| Community image check, price suggestion | `amazon.nova-lite-v1:0` |
| Invoice OCR + verification, serial cross-check, return photo assessment | `amazon.nova-pro-v1:0` |
| Product identity check (baseline scan) | `amazon.nova-lite-v1:0` (via `product_verifier.py`) |

## Invoice verification logic (`community.py`)

The `POST /api/community/verify-invoice` endpoint runs **5 gates** in sequence:

1. **File type + size** — JPEG/PNG/WebP/GIF/PDF only, 15 MB max. PDF is converted to JPEG via `pdf2image` if available.
2. **Nova Pro OCR + semantic match** — `_bedrock_invoice_check()` extracts: `product_name`, `store`, `purchase_date`, `invoice_total` (display string), `invoice_total_numeric` (float), `match_confidence`, `serial_number`, `imei`. Validates that the document is a genuine purchase receipt and matches the claimed product.
3. **Confidence hard gate** — `low` confidence forces `verified=False` (listing blocked); `medium` passes but surfaces a warning via `confidence_gate_reason`.
4. **Price cross-validation** — `_validate_price(asking_price, invoice_total_numeric)`:
   - `asking > 5× invoice total` → **block** (fraud risk)
   - `asking > 1.1× invoice total` → **warn** (above original price, unusual for used goods)
   - `asking < 5% of invoice total` → **warn** (suspiciously low, may be error)
5. **Serial/IMEI cross-check** (electronics only, optional) — if an identifier was found in the invoice and the seller has already uploaded a product photo, `_bedrock_serial_cross_check()` asks Nova Pro to look for that exact number in the product photo. Non-blocking warning.

Invoice image is uploaded to S3 for audit trail **regardless of outcome**, with `claimed_title` and `verified` stored in S3 object metadata.

## pytest / conftest pattern

Backend tests use `backend/tests/conftest.py` with an isolated in-memory SQLite database. Run the suite with `pytest` from `backend/`. Tests use the `client` fixture which overrides `get_db`.

## Return status machine

| `Order.status` | Set by | Meaning |
|---|---|---|
| `"placed"` | `create_order` | Order created, shown as "Order Received" |
| `"returned"` | `create_return` | Customer triggered return; final state |

`"delivered"`, `"return_pending"`, `"return_verified"` are **legacy** — may appear in existing DB rows, not set by active code.

| `Return.status` | Set by | Meaning |
|---|---|---|
| `"completed"` | `create_return` | Return finalized immediately |

`"pending_pickup"` is a **legacy** status from the dormant pickup-scan step.

## Key models and fields added

**`Product`**
- `image_url` — primary product image URL (CDN)
- `image_urls` — comma-separated additional angle URLs (CDN, added for multi-angle gallery)

**`CommunityListing` (provenance fields)**
- `purchase_source` — `"amazon"` | `"non_amazon"`
- `amazon_order_id` — FK to `orders.id` (Amazon path only)
- `invoice_image_url` — S3 key of uploaded invoice
- `invoice_verified` — bool: True after all invoice gates pass
- `invoice_product_name`, `invoice_store`, `invoice_date` — extracted by Nova Pro from the invoice

**`Return` (Nova Pro confidence gate fields)**
- `condition_note` — defect summary for refurbished listings
- `confidence` — model confidence in the recommended action
- `assessment_source` — `"nova_pro"` | `"fallback"`
- `original_recommended_action` — set when confidence gate overrode the recommendation
- `gate_override` — bool: True when gate changed the action

**`Listing`**
- `condition_note` — set for refurbished listings

**New models**
- `Donation` — items routed to a donation partner org
- `RecycleLog` — items routed to recycling (unrepairable or low-confidence)

## Known characteristics (backend)

- **Permissive CORS** — `allow_origins=["*"]`, intentional for hackathon.
- **Role field auth** — `User.role` string, no tokens or sessions.
- **Duplicated `ai_condition_summary` column** — `CommunityListing` declares it twice; known duplicate, do not remove.
- **Startup ALTER TABLE migrations** — `_safe_add_column` in `main.py` lifespan, no migration tool.
- **Video-scan code dormant** — `baseline.py`, `ai_assessment.py` stub, `pickup_scan` endpoint, `EmployeeScan.jsx`, `DeliveryDashboard.jsx`, `NewReturn.jsx`, `LiveVideoScanner` all intact but not gating any active flow.
- **AI assessment stub** — `assess_condition()` in `ai_assessment.py` returns mock data; fallback in `create_return` when no `recommended_action` is passed.
- **Seed is SQLite-compatible** — `seed.py` detects the DB URL and uses `Base.metadata.drop_all()` for SQLite instead of `DROP SCHEMA PUBLIC CASCADE`.

## Documentation maintenance rule

Every time you change a feature, update the docs before closing the task:

1. `.kiro/steering/product.md` — user-facing flow, roles, domain concepts
2. `.kiro/steering/backend.md` — endpoint, status machine, model, service, known characteristic
3. `.kiro/steering/frontend.md` — page, route, API client function, UI convention
4. `.kiro/steering/tech.md` — dependency, command, environment variable
5. `AGENTS.md` — always sync gotchas and flow summaries; cross-tool source of truth
