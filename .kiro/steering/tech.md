# Technology & Commands

This document describes the technology stack, persistence layer, common commands, and environment variables for the FluxForge / Amazon Circular Intelligence Platform monorepo. Environment variables are referenced **by name only** — never with real secret values.

## Backend stack

The backend is a FastAPI application. Dependencies are declared in `backend/requirements.txt`:

- **FastAPI** — web framework and routing.
- **SQLAlchemy 2.x** — ORM for models and queries.
- **Pydantic 2.x** — request/response schema validation.
- **Uvicorn** (`uvicorn[standard]`) — ASGI server.
- **boto3** — AWS SDK, used for Amazon Bedrock (Nova Pro, Nova Lite) and S3 integrations.
- **Pillow** — image processing.
- **python-multipart** — multipart/form-data handling (invoice uploads, product photos, try-on photos).
- **python-dotenv** — loads environment variables from a `.env` file.
- **gradio_client** — client for Gradio-hosted model endpoints.

`pytest` and `httpx` are included for testing, and `psycopg2-binary` for PostgreSQL connectivity.

## Frontend stack

The frontend is a React application built with Vite. Dependencies are declared in `frontend/package.json`:

- **React 19** (`react`, `react-dom`) — UI library.
- **Vite** — dev server and build tool.
- **react-router-dom 7** — client-side routing.
- **Tailwind CSS 4** (`tailwindcss`, `@tailwindcss/vite`) — utility-first styling via the Vite plugin.
- **Redux Toolkit** (`@reduxjs/toolkit`) — state management.
- **Recharts** — charts and data visualization.
- **lucide-react** — icon set.

ESLint is configured for linting via the `@eslint/js` and `eslint` dev dependencies.

**Note: the shopping cart has been removed.** `UserContext` no longer exposes `cart`, `addToCart`, `removeFromCart`, or `isInCart`. The `/cart` route and `Cart.jsx` page are no longer registered.

## Persistence

Database configuration lives in `backend/app/database.py`. The connection URL is resolved from the `DATABASE_URL` environment variable:

- **Development (default):** SQLite — `sqlite:///./circular_intelligence.db`. When the URL starts with `sqlite`, `connect_args={"check_same_thread": False}` is applied.
- **Production:** PostgreSQL via `psycopg2-binary`, selected by setting `DATABASE_URL` to a Postgres connection string.

A `SessionLocal` session factory is bound to the engine, and the `get_db()` dependency yields a session per request.

### Seed script (`backend/seed.py`)

`python seed.py` drops and re-creates all tables, then inserts sample data. The drop strategy is DB-aware:

- **PostgreSQL** — `DROP SCHEMA public CASCADE` / `CREATE SCHEMA public`
- **SQLite** — `Base.metadata.drop_all(bind=engine)` (PostgreSQL syntax is not supported)

Product images use the DummyJSON CDN (`cdn.dummyjson.com`) — permanent URLs, no API key required, 2–4 real product photo angles per item.

## Command reference

| Task | Command | Directory |
| --- | --- | --- |
| Install backend deps | `pip install -r requirements.txt` | `backend/` |
| Seed the database | `python seed.py` | `backend/` |
| Run backend | `uvicorn app.main:app --reload` | `backend/` |
| Run frontend (dev) | `npm run dev` | `frontend/` |
| Run backend tests | `pytest` | `backend/` |
| Lint frontend | `npm run lint` | `frontend/` |
| Full stack (containers) | `docker compose up --build` | repo root |

## Backend environment variables

Referenced by name only — do not commit real values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Selects the database connection (SQLite in dev, PostgreSQL in prod). |
| `AWS_REGION` | AWS region for Bedrock and S3 clients. |
| `AWS_ACCESS_KEY_ID` | AWS credential identifier. |
| `AWS_SECRET_ACCESS_KEY` | AWS credential secret. |
| `AWS_S3_BUCKET_NAME` | Target S3 bucket for community listing images, return photos, and invoice audit images. When unset, community image uploads will fail (S3 is required for community listings). |

The code also observes `S3_AWS_REGION` and `AWS_DEFAULT_REGION` as region fallbacks (referenced by name only).

## Frontend environment variables

The API base URL is resolved in `frontend/src/api/client.js`:

- **`VITE_API_URL`** — if set, used directly as the API base URL.
- Otherwise, in a production build the base URL is `/api`.
- Otherwise (development), the base URL is `http://{window.location.hostname}:8000/api`.

This means the frontend dev server auto-targets port `8000` on the current hostname unless `VITE_API_URL` is provided.
