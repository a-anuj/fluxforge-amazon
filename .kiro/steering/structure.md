# Project Structure & Conventions

This document maps the FluxForge / Amazon Circular Intelligence Platform monorepo: where code lives, how requests flow through the backend, the naming conventions to follow, and the key entry points. Use it to place new code in the right location and keep the layout consistent.

## Monorepo directory map

### Root

```
.
├── backend/            # FastAPI application
├── frontend/           # React 19 + Vite application
├── docker-compose.yml  # Full-stack container orchestration
└── DEPLOY.md           # Deployment guide
```

### Backend tree (`backend/app/`)

```
backend/app/
├── routers/      # HTTP endpoints, one module per domain
├── services/     # Business and AI logic, one module per capability
├── models.py     # SQLAlchemy ORM table definitions
├── schemas.py    # Pydantic request/response schemas
├── database.py   # Engine, SessionLocal, and the get_db dependency
└── main.py       # FastAPI app, router registration, startup migrations
```

### Frontend tree (`frontend/src/`)

```
frontend/src/
├── api/          # API client (client.js)
├── components/   # Reusable PascalCase components
├── context/      # React context providers (e.g. UserContext.jsx)
├── pages/        # PascalCase route-level page components
├── utils/        # Shared helpers
├── assets/       # Static assets
├── App.jsx       # Route table
├── main.jsx      # React root render
└── index.css     # Global styles / Tailwind entry
```

## Backend layering rule

Requests flow in one direction:

```
routers → services → models
```

- **Routers** handle HTTP concerns: path operations, request/response validation, and dependency injection. Keep them thin.
- **Services** hold business and AI logic. Routers call into services rather than embedding logic directly.
- **Models** are SQLAlchemy ORM tables — the persistence layer that services read from and write to.

## Naming conventions

### Backend

- **Routers** — one module per domain in `backend/app/routers/` (for example `users.py`, `community.py`). Each module exposes `router = APIRouter(prefix=..., tags=[...])`.
- **Services** — one module per capability in `backend/app/services/` (for example `ai_assessment.py`, `credit_engine.py`).
- **Models** — PascalCase SQLAlchemy classes in `backend/app/models.py`, each with a snake_case `__tablename__`.

### Frontend

- **Pages** — PascalCase components in `frontend/src/pages/` (for example `Home.jsx`, `Dashboard.jsx`).
- **Components** — PascalCase components in `frontend/src/components/` (for example `Layout.jsx`).
- **API functions** — named exports in `frontend/src/api/client.js` (for example `getUsers`, `createOrder`).

## Entry points

- `backend/app/main.py` — FastAPI app instance, router registration, and startup migrations.
- `frontend/src/main.jsx` — React root render.
- `frontend/src/api/client.js` — API client used by the frontend to reach the backend.
- `frontend/src/App.jsx` — the route table.

## Known structural characteristic

The `CommunityListing` model in `backend/app/models.py` declares the `ai_condition_summary` column twice (`ai_condition_summary = Column(Text, nullable=True)` appears two times). This is an existing characteristic of the codebase, documented here for accuracy. It is not a code change to make — treat it as part of the current structure rather than a defect to fix.
