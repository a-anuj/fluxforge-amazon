# AGENTS.md — FluxForge / Amazon Circular Intelligence Platform

FluxForge — internally branded the **"Amazon Green Credits Ecosystem"** (the FastAPI `title` in `backend/app/main.py`) — is a circular-commerce and Green Credits sustainability platform. It turns product returns into an opportunity to reuse, refurbish, and resell goods, and rewards customers for sustainable behavior (buying refurbished, reselling, repairing, donating, recycling, choosing eco delivery) with an in-app **Green Credits** currency. It also supports peer-to-peer community resale, radius-based wishlist matching, and virtual apparel try-on, and tracks environmental impact metrics (CO₂ saved, e-waste prevented, water saved).

## Source of truth

This is a cross-tool guide following the [AGENTS.md](https://agents.md) convention so teammates using different IDEs/agents (Cursor, Claude Code, Copilot, Kiro, etc.) share one root guide. It mirrors the **essentials**; the richer, authoritative detail lives in the Kiro steering docs under `.kiro/steering/`, which Kiro auto-loads by context. When something here is not enough, read those files:

| Steering file | Covers |
| --- | --- |
| `.kiro/steering/product.md` | Product overview, user roles, return lifecycle, Green Credits, community resale + wishlist, virtual try-on |
| `.kiro/steering/tech.md` | Tech stack, persistence, command reference, environment variables |
| `.kiro/steering/structure.md` | Monorepo map, backend layering, naming conventions, entry points |
| `.kiro/steering/backend.md` | Backend recipes (router/endpoint/model/service), migrations, AWS degradation, pytest patterns |
| `.kiro/steering/frontend.md` | Frontend recipes (page/route/API), `client.js`, `UserContext`, Tailwind |
| `.kiro/steering/skills.md` | End-to-end full-stack feature and endpoint-wiring workflows (pull in with `#skills`) |

## Tech stack

**Backend** (FastAPI app; deps in `backend/requirements.txt`):

- FastAPI — web framework and routing
- SQLAlchemy 2.x — ORM for models and queries
- Pydantic 2.x — request/response validation
- Uvicorn (`uvicorn[standard]`) — ASGI server
- boto3 — AWS SDK (Amazon Bedrock + S3)
- Pillow — image processing
- python-multipart — multipart/form-data (file uploads)
- python-dotenv — loads env vars from `.env`
- gradio_client — client for Gradio-hosted model endpoints

(`pytest` + `httpx` for testing; `psycopg2-binary` for PostgreSQL.)

**Frontend** (React + Vite; deps in `frontend/package.json`):

- React 19 (`react`, `react-dom`)
- Vite — dev server and build tool
- react-router-dom 7 — client-side routing
- Tailwind CSS 4 (`tailwindcss`, `@tailwindcss/vite`)
- Redux Toolkit (`@reduxjs/toolkit`)
- Recharts — charts and data visualization
- lucide-react — icons

**Persistence:** SQLite in dev (`sqlite:///./circular_intelligence.db`), PostgreSQL in prod — selected via the `DATABASE_URL` environment variable (`backend/app/database.py`).

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

Monorepo layout:

```
.
├── backend/            # FastAPI application
├── frontend/           # React 19 + Vite application
├── docker-compose.yml  # Full-stack container orchestration
└── DEPLOY.md           # Deployment guide
```

Backend (`backend/app/`):

```
backend/app/
├── routers/      # HTTP endpoints, one module per domain
├── services/     # Business and AI logic, one module per capability
├── models.py     # SQLAlchemy ORM table definitions
├── schemas.py    # Pydantic request/response schemas
├── database.py   # Engine, SessionLocal, and the get_db dependency
└── main.py       # FastAPI app, router registration, startup migrations
```

Frontend (`frontend/src/`):

```
frontend/src/
├── api/          # API client (client.js)
├── components/   # Reusable PascalCase components
├── context/      # React context providers (e.g. UserContext.jsx)
├── pages/        # PascalCase route-level page components
├── utils/        # Shared helpers
├── App.jsx       # Route table
├── main.jsx      # React root render
└── index.css     # Global styles / Tailwind entry
```

**Backend layering rule:** requests flow one direction — `routers → services → models`. Routers stay thin (HTTP concerns, validation, dependency injection); services hold business/AI logic; models are the SQLAlchemy persistence layer.

## Conventions

**Backend**

- **Routers** — one module per domain in `backend/app/routers/` (e.g. `users.py`, `community.py`), each exposing `router = APIRouter(prefix=..., tags=[...])`. Inject the DB session with `Depends(get_db)`.
- **Services** — one module per capability in `backend/app/services/` (e.g. `ai_assessment.py`, `credit_engine.py`).
- **Models** — PascalCase SQLAlchemy classes in `backend/app/models.py`, each with a snake_case `__tablename__`.
- **Register a router** — import it in `backend/app/main.py` and mount under `/api`: `app.include_router(<name>.router, prefix="/api")`. So a router with `prefix="/<name>"` is served at `/api/<name>`.

**Frontend**

- **Pages** — PascalCase components in `frontend/src/pages/` (e.g. `Home.jsx`, `Dashboard.jsx`), default-exported.
- **Components** — PascalCase components in `frontend/src/components/` (e.g. `Layout.jsx`).
- **API functions** — named exports in `frontend/src/api/client.js` (e.g. `getUsers`, `createOrder`) that call the `request(path, options)` wrapper (or `multipartRequest` for uploads). `BASE_URL` already includes the `/api` prefix, so paths start **after** `/api` — use `/users/` (resolves to `/api/users/`), not `/api/users/`.

## Environment variables (names only)

**Backend**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Selects the DB connection (SQLite in dev, PostgreSQL in prod) |
| `AWS_REGION` | AWS region for Bedrock and S3 clients |
| `AWS_ACCESS_KEY_ID` | AWS credential identifier |
| `AWS_SECRET_ACCESS_KEY` | AWS credential secret |
| `AWS_S3_BUCKET_NAME` | Target S3 bucket for uploads; when unset, uploads fall back to a non-fatal path |

`S3_AWS_REGION` and `AWS_DEFAULT_REGION` are also observed as region fallbacks (names only).

**Frontend**

- `VITE_API_URL` — if set, used directly as the API base URL.
- Otherwise, `BASE_URL` resolves to `/api` in a production build.
- Otherwise (development), `http://{window.location.hostname}:8000/api` — the dev frontend auto-targets port `8000` on the current hostname unless `VITE_API_URL` is set.

## Gotchas / known characteristics

These are existing, intentional hackathon characteristics. Work **with** them — do not "fix" them in application code:

- **No real auth.** Access is gated only by the `User.role` string (`"customer" | "employee" | "admin"`, default `"customer"`) — no password, token, or session auth. Pass `user_id` explicitly where the acting user matters.
- **CORS is fully open.** `backend/app/main.py` sets `allow_origins=["*"]`.
- **Schema changes at startup.** New columns are applied at startup via `_safe_add_column` in `backend/app/main.py` (idempotent `ALTER TABLE ... ADD COLUMN` in try/except, called in `lifespan` after `Base.metadata.create_all`) — there is no migration tool. Add new columns there.
- **Duplicated column.** `CommunityListing` in `backend/app/models.py` declares `ai_condition_summary` twice — a known duplicate, not a defect to remove.
- **AWS is optional in dev.** Without `AWS_S3_BUCKET_NAME`, the S3 upload helper in `backend/app/routers/baseline.py` falls back to returning a data URL; Bedrock and Gradio calls degrade gracefully rather than crashing a request.
- **AI assessment is a stub.** `backend/app/services/ai_assessment.py` (`assess_condition()`) returns mock data — it is the single integration point for a future real vision model.
- **Frontend dev API base.** `BASE_URL` in `frontend/src/api/client.js` auto-targets `http://{window.location.hostname}:8000/api` in development unless `VITE_API_URL` is set.

## For agents

Keep changes minimal and consistent with the existing patterns above. Follow the backend layering (`routers → services → models`) and the frontend conventions. Documentation and spec artifacts live under `.kiro/` — prefer the `.kiro/steering/*.md` files for deeper, authoritative detail.
