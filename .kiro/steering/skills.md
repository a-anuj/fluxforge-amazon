---
inclusion: manual
---

# Skills & Workflows

End-to-end workflow recipes for building and operating FluxForge / the Amazon Circular Intelligence Platform. Pull this file in on demand with `#skills` when you are actively building a feature or operating the project. For per-layer detail, cross-reference `backend.md` (backend recipes and patterns) and `frontend.md` (frontend recipes and conventions).

## Full-stack feature workflow

Add a feature that spans the backend and frontend by moving through the layers in order. This mirrors the backend layering rule (routers → services → models) and the frontend conventions.

1. **Model** — add a SQLAlchemy class in `backend/app/models.py` (subclass `Base`, set a snake_case `__tablename__`, define `Column`s and `relationship`s). Tables auto-create at startup via `Base.metadata.create_all`. See `backend.md`.
2. **Schema** — add the Pydantic request/response schemas in `backend/app/schemas.py`.
3. **Service** — put business/AI logic in `backend/app/services/<name>.py`, keeping routers thin. See `backend.md`.
4. **Router** — create `backend/app/routers/<name>.py` with `router = APIRouter(prefix="/<name>", tags=["<name>"])`, inject the DB session via `Depends(get_db)`, and call the service.
5. **Register** — import the router in `backend/app/main.py` and add `app.include_router(<name>.router, prefix="/api")`.
6. **API function** — add a named export in `frontend/src/api/client.js` that calls the `request(path, options)` wrapper (or `multipartRequest` for file uploads). See `frontend.md`.
7. **Page** — create a PascalCase page component in `frontend/src/pages/` and default-export it.
8. **Route** — register the page with a `<Route path=... element={<Page/>} />` inside the `<Routes>` / `<Layout>` block in `frontend/src/App.jsx`.
9. **Test** — add backend tests under `backend/tests/` using the `conftest.py` fixtures (see `backend.md`), and run them with `pytest`.

## Endpoint + frontend wiring workflow

When you only need to add one endpoint and wire it to the UI:

1. Add the path operation to an existing (or new) router in `backend/app/routers/`.
2. If the router is new, register it in `backend/app/main.py` with `app.include_router(<name>.router, prefix="/api")`.
3. Add a matching named-export function in `frontend/src/api/client.js` that calls `request(path, options)`.
4. Call that function from a page or component in `frontend/src/pages/` or `frontend/src/components/`.

Note: `BASE_URL` in `client.js` already prefixes `/api`, so API function paths start *after* `/api` — for example use `/users/` (which resolves to `/api/users/`), not `/api/users/`.

## Run / test / deploy

Consistent with `tech.md`:

| Task | Command | Directory |
| --- | --- | --- |
| Run backend | `uvicorn app.main:app --reload` | `backend/` |
| Run frontend (dev) | `npm run dev` | `frontend/` |
| Run backend tests | `pytest` | `backend/` |
| Full stack (containers) | `docker compose up --build` | repo root |

For containerized runs and deployment, `docker compose up --build` (see `docker-compose.yml`) builds and starts the full stack; consult `DEPLOY.md` for the deployment guide.

## Gotchas (known FluxForge characteristics)

These are existing characteristics of the codebase. Work *with* them — they are not defects to fix in application code.

- **No real auth.** Access is gated only by the `User.role` field (`"customer" | "employee" | "admin"`); there is no password, token, or session authentication. Pass `user_id` explicitly in requests where the acting user matters.
- **CORS is fully open.** `backend/app/main.py` sets `allow_origins=["*"]`.
- **Schema changes at startup.** New columns are applied at startup via `_safe_add_column` in `backend/app/main.py` (idempotent `ALTER TABLE ... ADD COLUMN` wrapped in try/except, called in `lifespan` after `Base.metadata.create_all`) — there is no migration tool. Add new columns there.
- **Duplicated column.** `CommunityListing` in `backend/app/models.py` declares `ai_condition_summary` twice. This is a known duplicate, not something to "fix".
- **AWS is optional in dev.** Without `AWS_S3_BUCKET_NAME`, the S3 upload helper in `backend/app/routers/baseline.py` falls back to returning a data URL; Bedrock and Gradio calls degrade gracefully rather than crashing a request.
- **Frontend dev API base.** In `frontend/src/api/client.js`, `BASE_URL` auto-targets `http://{window.location.hostname}:8000/api` in development unless `VITE_API_URL` is set (production builds use `/api`).
