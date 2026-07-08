# AGENTS.md — FluxForge / Amazon Circular Intelligence Platform

FluxForge — internally branded the **"Amazon Green Credits Ecosystem"** (the FastAPI `title` in `backend/app/main.py`) — is a circular-commerce and Green Credits sustainability platform. It turns product returns into an opportunity to reuse, refurbish, and resell goods, and rewards customers for sustainable behavior (buying refurbished, reselling, repairing, donating, recycling, choosing eco delivery) with an in-app **Green Credits** currency. It also supports peer-to-peer community resale with AI-verified ownership proofs, radius-based wishlist matching (NearDrop), and virtual apparel try-on.

## Source of truth

This is a cross-tool guide following the [AGENTS.md](https://agents.md) convention so teammates using different IDEs/agents (Cursor, Claude Code, Copilot, Kiro, etc.) share one root guide. The richer authoritative detail lives in `.kiro/steering/`:

| Steering file | Covers |
| --- | --- |
| `.kiro/steering/product.md` | Product overview, user roles, return lifecycle, community listing split flow, NearDrop redesign, virtual try-on |
| `.kiro/steering/tech.md` | Tech stack, persistence, seed script, command reference, environment variables |
| `.kiro/steering/structure.md` | Monorepo map, backend layering, naming conventions, entry points |
| `.kiro/steering/backend.md` | Backend recipes, migration pattern, Bedrock models, invoice verification gates, status machines, known characteristics |
| `.kiro/steering/frontend.md` | Frontend recipes, route table, key API functions, UI patterns (Home grid, ProductDetail gallery, SellItem, NearDrop) |
| `.kiro/steering/skills.md` | End-to-end full-stack feature workflows |

## Tech stack

**Backend** (FastAPI; deps in `backend/requirements.txt`):
- FastAPI, SQLAlchemy 2.x, Pydantic 2.x, Uvicorn, boto3, Pillow, python-multipart, python-dotenv, gradio_client
- pytest + httpx for testing; psycopg2-binary for PostgreSQL

**Frontend** (React 19 + Vite; deps in `frontend/package.json`):
- React 19, Vite, react-router-dom 7, Tailwind CSS 4, Redux Toolkit, Recharts, lucide-react

**Persistence:** SQLite in dev, PostgreSQL in prod — `DATABASE_URL` env var.

**Bedrock models:**
- `amazon.nova-lite-v1:0` — community image check, AI price suggestion, product identity
- `amazon.nova-pro-v1:0` — invoice OCR/verification, serial cross-check, return photo assessment

## Commands

| Task | Command | Directory |
| --- | --- | --- |
| Install backend deps | `pip install -r requirements.txt` | `backend/` |
| Seed the database | `python seed.py` | `backend/` |
| Run backend | `uvicorn app.main:app --reload` | `backend/` |
| Run frontend (dev) | `npm run dev` | `frontend/` |
| Run backend tests | `pytest` | `backend/` |
| Lint frontend | `npm run lint` | `frontend/` |
| Full stack (containers) | `docker compose up --build` | repo root |

## Project structure

```
.
├── backend/            # FastAPI application
├── frontend/           # React 19 + Vite application
├── docker-compose.yml
└── DEPLOY.md
```

Backend (`backend/app/`):
```
routers/      # HTTP endpoints, one module per domain
services/     # Business and AI logic
models.py     # SQLAlchemy ORM table definitions
schemas.py    # Pydantic request/response schemas
database.py   # Engine, SessionLocal, get_db dependency
main.py       # FastAPI app, router registration, lifespan migrations
```

Frontend (`frontend/src/`):
```
api/          # client.js — all HTTP calls
components/   # Reusable PascalCase components
context/      # UserContext.jsx — user + auth state (no cart)
pages/        # PascalCase route-level pages
App.jsx       # Route table
```

**Backend layering:** `routers → services → models`. Routers stay thin.

## Return lifecycle (current)

1. **Purchase** — `Order.status = "placed"`, shown as "Order Received"
2. **Return** — customer taps "Return or Replace" on Orders page → `POST /api/returns/` → `Order.status = "returned"`, `Return.status = "completed"` immediately. Green Credits awarded. No scan, no employee action.

**Video-scan removed, pending rebuild.** `baseline.py`, `pickup_scan`, `EmployeeScan.jsx`, `DeliveryDashboard.jsx`, `NewReturn.jsx` (old version), `LiveVideoScanner` are dormant but preserved.

**Nova Pro return flow:** `NewReturn.jsx` now implements a 3-step photo-based return via `POST /api/returns/with-photo`.

## Community listing split flow

"+ Post a Community Listing" navigates to **`/community/sell`** (`SellItem.jsx`) — a dedicated multi-step page, not a modal.

**Amazon path:** order picker → product photo → details (condition locked by AI, price, description) → done. Listing gets `purchase_source="amazon"` + `amazon_order_id`. Buyer sees **"Amazon Verified Purchase"** badge.

**Non-Amazon path:** product info + invoice upload → 5-gate verification → product photo → details (condition locked by AI, price, description) → done. Listing gets `purchase_source="non_amazon"` + all invoice extraction fields. Buyer sees **"Invoice Verified"** badge.

**Invoice verification gates (all in `POST /api/community/verify-invoice`):**
1. File type + size (JPEG/PNG/WebP/PDF, 15 MB max)
2. Nova Pro OCR — extracts product name, store, date, total, serial/IMEI; validates against claimed product
3. Confidence gate — must output `"good photo"`. If `"cannot find the values"`, blocks verification.
4. Price cross-validation — `asking > 5× invoice total` blocks; `asking > 1.1× invoice` warns
5. Serial/IMEI cross-check for electronics — Nova Pro looks for invoice serial in product photo (warning only)

## NearDrop wishlist flow

`/neardrop` — "Add to Wishlist" opens a full-screen `ProductPicker` (2-col product grid, search, category pills). Tapping Watch opens `WatchConfigModal` (max-price + radius sliders). "My Wishlist" tab shows product-card grid with NearDrop metrics strip per item.

## Key model fields added (recent)

- `Product.image_urls` — comma-separated CDN image URLs for multi-angle gallery
- `CommunityListing`: `purchase_source`, `amazon_order_id`, `invoice_image_url`, `invoice_verified`, `invoice_product_name`, `invoice_store`, `invoice_date`
- `Return`: `condition_note`, `confidence`, `assessment_source`, `original_recommended_action`, `gate_override`
- `Listing.condition_note`
- New models: `Donation`, `RecycleLog`

## Gotchas / known characteristics

- **No real auth.** `User.role` string (`"customer" | "employee" | "admin"`) — no tokens or sessions.
- **CORS fully open.** `allow_origins=["*"]`.
- **Schema changes at startup.** `_safe_add_column(engine, ...)` in `main.py` lifespan — takes the engine object, not a connection. No migration tool.
- **Duplicated column.** `CommunityListing.ai_condition_summary` declared twice — known, do not remove.
- **Cart removed.** `UserContext` no longer has `cart`, `addToCart`, `removeFromCart`, `isInCart`. `/cart` route is gone.
- **AWS optional in dev.** Missing `AWS_S3_BUCKET_NAME` causes community image uploads to fail (S3 required). Bedrock degrades gracefully.
- **AI assessment stub.** `assess_condition()` in `ai_assessment.py` returns mock data. Fallback in `create_return` when no `recommended_action` supplied.
- **Video-scan code dormant.** `baseline.py`, `ai_assessment.py`, `pickup_scan` in `returns.py`, and the old scan UI files are intact but not gating any active flow.
- **Frontend dev API base.** `BASE_URL` targets `http://{hostname}:8000/api` in dev unless `VITE_API_URL` is set.
- **Seed script is SQLite-safe.** Uses `Base.metadata.drop_all()` for SQLite instead of `DROP SCHEMA PUBLIC CASCADE`.
- **Product images use DummyJSON CDN.** `cdn.dummyjson.com` — permanent URLs, no API key, 2–4 angles per product.
- **`_safe_add_column` signature.** Takes `(db_engine, table, column, col_type, default=None)` — the engine, not a connection. Each call opens its own connection internally.

## Conventions

**Backend**
- One router module per domain in `backend/app/routers/`; expose `router = APIRouter(prefix=..., tags=[...])`.
- One service module per capability in `backend/app/services/`.
- PascalCase SQLAlchemy models in `backend/app/models.py`, snake_case `__tablename__`.
- Mount routers: `app.include_router(r.router, prefix="/api")`.

**Frontend**
- PascalCase pages in `frontend/src/pages/`, default-exported.
- API functions as named exports in `frontend/src/api/client.js`.
- `BASE_URL` already includes `/api` — paths start after it: `/users/` not `/api/users/`.
- File uploads use raw `fetch` + `FormData`, not the `request()` wrapper.

## Documentation maintenance rule

Every time a feature changes, update docs **before closing the task**:

| What changed | Files to update |
|---|---|
| User-facing flow, roles, domain | `.kiro/steering/product.md` |
| Endpoint, model, status, service | `.kiro/steering/backend.md` |
| Page, route, API function, UI pattern | `.kiro/steering/frontend.md` |
| Dependency, command, env var | `.kiro/steering/tech.md` |
| Anything above | `AGENTS.md` — always sync gotchas and flow summaries |

The PostTaskExec hook enforces this as an automated reminder.

## For agents

Keep changes minimal and consistent with existing patterns. Follow the backend layering (`routers → services → models`) and frontend conventions. After every task that changes system behaviour, update the docs. Do not mark a task complete without verifying the steering files and `AGENTS.md` reflect the new state.
