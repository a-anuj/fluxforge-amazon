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

- Use `APIRouter(prefix="/<name>", tags=["<name>"])`, one module per domain (matching existing routers like `users.py`, `community.py`).
- Inject the database session with `Depends(get_db)` (from `app.database`).

## Add an endpoint (recipe)

Add a path operation to an existing `router`:

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

- Use Pydantic schemas from `backend/app/schemas.py` for request bodies and response models.
- Query and mutate through the injected `Session`.

## Add a model (recipe)

Add a SQLAlchemy class to `backend/app/models.py`:

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

- Subclass `Base`, set `__tablename__` (snake_case), and declare `Column`s and `relationship`s.
- Tables are auto-created at startup via `Base.metadata.create_all` (called in the `lifespan` handler in `main.py`). There is no migration tool — see the Safe column migration pattern below for adding columns to existing tables.

## Add a service (recipe)

Put business or AI logic in `backend/app/services/<name>.py` (one module per capability, matching existing services such as `ai_assessment.py`, `credit_engine.py`). Keep routers thin and have them call into the service:

```python
# backend/app/services/<name>.py
def do_work(...):
    ...
```

```python
# in a router
from app.services.<name> import do_work
result = do_work(...)
```

## Register the router

Import the new router in `backend/app/main.py` and mount it under the `/api` prefix, following the existing `include_router` block:

```python
from app.routers import users, products, orders, returns, listings, redemptions, media, sustainability, analytics
from app.routers import wishlist as wishlist_router, community, baseline, tryon

app.include_router(<name>.router, prefix="/api")
```

Every router in the app is mounted with `app.include_router(<r>.router, prefix="/api")`, so a router with `prefix="/<name>"` is served under `/api/<name>`.

## Safe column migration pattern

`backend/app/main.py` defines `_safe_add_column(conn, table, column, col_type, default=None)`:

```python
def _safe_add_column(conn, table, column, col_type, default=None):
    """Add a column to an existing table if it doesn't already exist."""
    try:
        if default is not None:
            conn.execute(_sql_text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type} DEFAULT {default}"))
        else:
            conn.execute(_sql_text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
    except Exception:
        pass  # column already exists or DB doesn't support it
```

It issues an idempotent `ALTER TABLE ... ADD COLUMN`, wrapped in `try/except` that swallows "column already exists" errors. It is invoked in the `lifespan` startup context after `Base.metadata.create_all`. This is a **known characteristic**: the app has no migration tool, so schema changes to existing tables are applied at startup. To add a column to an existing table, add another `_safe_add_column(...)` call in `lifespan` rather than reaching for a migration framework.

## AWS graceful-degradation pattern

AWS calls fall back to a non-fatal path when configuration is missing or a call fails. Concrete example — the S3 upload helper `_try_upload_to_s3(data_url, key)` in `backend/app/routers/baseline.py`:

- Returns the original base64 data URL when `AWS_S3_BUCKET_NAME` is unset.
- On `put_object` failure, logs a warning and returns the original data URL as a fallback.

```python
def _try_upload_to_s3(data_url: str, key: str) -> str:
    try:
        bucket = os.getenv("AWS_S3_BUCKET_NAME")
        if not bucket:
            return data_url  # No S3 configured — store data URL directly
        ...
        s3.put_object(Bucket=bucket, Key=key, Body=image_bytes, ContentType=content_type)
        return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    except Exception as e:
        logger.warning(f"S3 upload failed, using data URL fallback: {e}")
        return data_url
```

Bedrock clients follow a similar spirit and are created **per-call** (rather than as shared module-level clients) in `sustainability.py`, `community.py`, and `product_verifier.py`. Follow this pattern for new AWS integrations: degrade gracefully instead of crashing the request when AWS is unconfigured or unavailable.

## pytest / conftest pattern

Backend tests use `backend/tests/conftest.py`, which sets up an isolated in-memory database:

- In-memory SQLite engine (`sqlite:///:memory:`) created with `StaticPool` and `connect_args={"check_same_thread": False}`.
- `Base.metadata.create_all(bind=engine)` builds the schema (a session-scoped `db_engine` fixture).
- A `db_session` fixture opens a connection/transaction, seeds a baseline `User(id=1)` and `Product(id=1)`, yields the session, then rolls back for isolation.
- A `client` fixture overrides the `get_db` dependency via `app.dependency_overrides[get_db]` and wraps `TestClient(app)`, clearing the override afterward.

Write tests against the `client` fixture so requests run through the app with the in-memory DB. Run the suite with `pytest` from `backend/`.

## Known characteristics (backend)

The following are **known hackathon characteristics** of the FluxForge codebase. They are documented here for accuracy. Do **not** "fix" them in application code — treat them as existing, intentional behavior:

- **Permissive CORS** — `backend/app/main.py` configures the CORS middleware with `allow_origins=["*"]` (also `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`). This is intentional for network access during the hackathon.
- **Role_Field_Auth** — authorization is decided by the `User.role` string field (`"customer" | "employee" | "admin"`, default `"customer"`). There is no password, token, or session-based authentication; callers pass identifiers explicitly.
- **Duplicated `ai_condition_summary` column** — the `CommunityListing` model in `backend/app/models.py` declares `ai_condition_summary = Column(Text, nullable=True)` twice. This is a known duplicate, not a defect to remove.
- **Startup `ALTER TABLE` migrations** — schema changes to existing tables are applied at startup through `_safe_add_column` in `main.py` (no migration tool). Add new columns there.
