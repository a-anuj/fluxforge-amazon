# Design Document

## Overview

This design specifies the six Kiro steering documents for the FluxForge / Amazon Circular Intelligence Platform monorepo. The deliverable is **documentation only** — six Markdown files under `.kiro/steering/`. No FluxForge application source code changes.

The design fixes, for each file:

1. Its exact YAML front-matter (inclusion configuration).
2. A concrete section outline describing what content goes in it.
3. The exact codebase paths and symbols each section must reference, so the Tasks phase produces factually accurate docs.

All referenced paths, symbols, commands, and environment variable names in this design were verified against the current codebase (see Appendix A: Verified Codebase Facts). The Tasks phase MUST use those verified facts verbatim.

### Design principles

- **Accuracy over completeness.** Every path/symbol/command/env-var documented must exist in the repo. If a fact cannot be verified, it is omitted.
- **Known hackathon characteristics are documented as existing behavior**, never as defects requiring an app code change (Requirement 9.6).
- **No secret values.** Environment variables are referenced by name only (Requirement 4.7).
- **Language for code examples:** Python (backend) and JavaScript/JSX (frontend), matching the real stack.

## Architecture

### Artifact layout

```
.kiro/steering/
├── product.md      # always included (no inclusion field)
├── tech.md         # always included (no inclusion field)
├── structure.md    # always included (no inclusion field)
├── backend.md      # inclusion: fileMatch — fileMatchPattern: 'backend/**'
├── frontend.md     # inclusion: fileMatch — fileMatchPattern: 'frontend/**'
└── skills.md       # inclusion: manual
```

### Inclusion model (Kiro steering semantics)

| File | Inclusion | Loaded when |
| --- | --- | --- |
| `product.md` | default (always) | every interaction |
| `tech.md` | default (always) | every interaction |
| `structure.md` | default (always) | every interaction |
| `backend.md` | `fileMatch`, pattern `backend/**` | a file under `backend/` is in context |
| `frontend.md` | `fileMatch`, pattern `frontend/**` | a file under `frontend/` is in context |
| `skills.md` | `manual` | referenced explicitly by the user with `#skills` |

**skills.md inclusion decision — `manual` (justification):** `skills.md` holds long-form, end-to-end workflow recipes (full-stack feature, endpoint wiring, run/test/deploy, gotchas). Loading it into every interaction (always) would spend context budget on procedural content that is only relevant when a contributor is actively building a feature; scoping it to `fileMatch` is wrong because the workflows span both `backend/` and `frontend/` and also apply when no file is yet open (e.g., planning a new feature). `manual` lets a contributor pull it in on demand via `#skills` at the moment they need the recipe, which matches its purpose. This satisfies Requirement 2.5 (present with a defined inclusion setting).

### Front-matter format rule (Requirement 2.4)

Where a file declares front-matter, it MUST begin at line 1 with a `---` line, contain valid YAML keys, and close with a `---` line before any Markdown body. The three always-included files omit the block entirely (relying on Kiro's default always-included behavior), which is the documented default per Requirement 2.1.

## Components and Interfaces

Each "component" below is one steering file. For each, this section gives the **exact front-matter** and a **section outline** with the codebase anchors the Tasks phase must cite.

---

### Component 1 — `product.md` (Always included)

**Front-matter:** none (default always-included per Requirement 2.1).

**Section outline:**

1. **Title & one-line purpose** — FluxForge, the "Amazon Green Credits Ecosystem" (internal brand, from `backend/app/main.py` FastAPI `title`), a circular-commerce + Green Credits sustainability platform. *(3.1)*
2. **Domain summary** — circular commerce: reduce waste by reusing/refurbishing/reselling returned goods; reward sustainable behavior with Green Credits. *(3.1)*
3. **User roles** — `customer`, `employee`, `admin`, backed by the `User.role` field (values `"customer" | "employee" | "admin"`, default `"customer"`). *(3.2)*
4. **Return lifecycle flow** — purchase → delivery Baseline_Scan (employee captures multi-angle images at delivery, stored on the Order) → return → AI_Assessment (condition evaluation) → resell or refurbish outcome. Reference `Order.baseline_scan_*` fields, the `Return` model, and `backend/app/services/ai_assessment.py` (note: AI assessment is a stub). *(3.3)*
5. **Green Credits earn-and-redeem flow** — users earn credits for sustainable actions (`GreenCreditTx`, `GreenChallenge`) and redeem them (`Redemption`: discount / prime / donation). *(3.4)*
6. **Community resale + wishlist-match flow** — peer-to-peer resale via `CommunityListing`; radius-based matching of returns to `Wishlist` entries producing `WishlistMatch` and `WishlistNotification`. *(3.5)*
7. **Virtual try-on flow** — user uploads a body photo (`UserBodyPhoto`), generates a try-on image (`TryOnCache`) via the `tryon` router. *(3.6)*

---

### Component 2 — `tech.md` (Always included)

**Front-matter:** none (default always-included).

**Section outline:**

1. **Backend stack** — FastAPI, SQLAlchemy 2.x, Pydantic 2.x, Uvicorn, boto3 (Bedrock + S3), Pillow, python-multipart, python-dotenv, gradio_client. Source: `backend/requirements.txt`. *(4.1)*
2. **Frontend stack** — React 19, Vite, React Router (`react-router-dom` 7), Tailwind CSS 4, Redux Toolkit, Recharts, lucide-react. Source: `frontend/package.json`. *(4.2)*
3. **Persistence** — SQLite for development (`sqlite:///./circular_intelligence.db`), PostgreSQL via `psycopg2-binary` for production, selected by the `DATABASE_URL` env var. Source: `backend/app/database.py`. *(4.3)*
4. **Command reference table** *(4.4)* — table with columns *Task | Command | Directory*:

   | Task | Command | Directory |
   | --- | --- | --- |
   | Install backend deps | `pip install -r requirements.txt` | `backend/` |
   | Seed the database | `python seed.py` | `backend/` |
   | Run backend | `uvicorn app.main:app --reload` | `backend/` |
   | Run frontend (dev) | `npm run dev` | `frontend/` |
   | Run backend tests | `pytest` | `backend/` |
   | Lint frontend | `npm run lint` | `frontend/` |
   | Full stack (containers) | `docker compose up --build` | repo root |

5. **Backend env var reference** *(4.5, 4.7)* — name/purpose table, no values: `DATABASE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` (also note `S3_AWS_REGION` / `AWS_DEFAULT_REGION` fallbacks observed in code, referenced by name only).
6. **Frontend env var reference** *(4.6, 4.7)* — `VITE_API_URL`; document the `BASE_URL` resolution in `frontend/src/api/client.js`: uses `VITE_API_URL` if set, else `/api` in production, else `http://{window.location.hostname}:8000/api` in dev.

---

### Component 3 — `structure.md` (Always included)

**Front-matter:** none (default always-included).

**Section outline:**

1. **Monorepo directory map** *(5.1)* — root (`backend/`, `frontend/`, `docker-compose.yml`, `DEPLOY.md`), the `backend/app/` tree (`routers/`, `services/`, `models.py`, `schemas.py`, `database.py`, `main.py`), the `frontend/src/` tree (`api/`, `components/`, `context/`, `pages/`, `utils/`, `assets/`, `App.jsx`, `main.jsx`, `index.css`).
2. **Backend layering rule** *(5.2)* — request flow: **routers → services → models**. Routers handle HTTP + validation, services hold business/AI logic, models are SQLAlchemy ORM tables.
3. **Naming conventions** *(5.3)*:
   - Backend routers: one module per domain in `backend/app/routers/` (e.g. `users.py`, `community.py`), each exposing `router = APIRouter(prefix="/<domain>", tags=[...])`.
   - Backend services: one module per capability in `backend/app/services/` (e.g. `ai_assessment.py`, `credit_engine.py`).
   - Backend models: PascalCase SQLAlchemy classes in `models.py` with snake_case `__tablename__`.
   - Frontend pages: PascalCase components in `frontend/src/pages/` (e.g. `Home.jsx`, `Dashboard.jsx`).
   - Frontend components: PascalCase in `frontend/src/components/` (e.g. `Layout.jsx`).
   - Frontend API functions: named exports in `frontend/src/api/client.js` (e.g. `getUsers`, `createOrder`).
4. **Entry points** *(5.4)* — `backend/app/main.py` (FastAPI app + router registration + startup migrations), `frontend/src/main.jsx` (React root render), `frontend/src/api/client.js` (API client), and `frontend/src/App.jsx` (route table).
5. **Known structural characteristic** *(9.2)* — note the duplicated `ai_condition_summary` column declared twice in the `CommunityListing` model in `backend/app/models.py`, framed as an existing characteristic.

---

### Component 4 — `backend.md` (Conditional)

**Front-matter:**

```yaml
---
inclusion: fileMatch
fileMatchPattern: 'backend/**'
---
```

**Section outline:**

1. **Add a router (recipe)** *(6.1)* — create `backend/app/routers/<name>.py` with `router = APIRouter(prefix="/<name>", tags=["<name>"])`, add path operations, import DB session via `Depends(get_db)`.
2. **Add an endpoint (recipe)** *(6.1)* — decorate a function on an existing `router`; use Pydantic schemas from `backend/app/schemas.py` for request/response; query with the injected `Session`.
3. **Add a model (recipe)** *(6.1)* — add a SQLAlchemy class in `backend/app/models.py` (subclass `Base`, set `__tablename__`, define `Column`s and `relationship`s). Tables auto-create at startup via `Base.metadata.create_all`.
4. **Add a service (recipe)** *(6.1)* — put business/AI logic in `backend/app/services/<name>.py`; keep routers thin and call the service.
5. **Register the router** *(6.5)* — import the router in `backend/app/main.py` and add `app.include_router(<name>.router, prefix="/api")`. Show the existing `include_router` block as the model.
6. **Safe column migration pattern** *(6.2, 9.5)* — document `_safe_add_column(conn, table, column, col_type, default)` in `backend/app/main.py`: idempotent `ALTER TABLE ... ADD COLUMN`, wrapped in `try/except` (swallows "column already exists"), invoked in the `lifespan` startup after `create_all`. Present as a known characteristic (the app has no migration tool; schema changes are applied at startup).
7. **AWS graceful-degradation pattern** *(6.3)* — document that AWS calls fall back to a non-fatal path. Concrete example: the S3 upload helper in `backend/app/routers/baseline.py` returns the original base64 data URL when `AWS_S3_BUCKET_NAME` is unset or when `put_object` raises (logs a warning, returns data URL). Note Bedrock clients are created per-call in `sustainability.py`, `community.py`, `product_verifier.py`.
8. **pytest / conftest pattern** *(6.4)* — document `backend/tests/conftest.py`: in-memory SQLite engine (`sqlite:///:memory:`) with `StaticPool`, `Base.metadata.create_all`, a `db_session` fixture seeding a `User(id=1)` and `Product(id=1)`, and a `client` fixture that overrides the `get_db` dependency via `app.dependency_overrides[get_db]` and wraps `TestClient(app)`.
9. **Known characteristics (backend)** *(9.2, 9.3, 9.4, 9.5, 9.6)* — a dedicated subsection listing, framed as existing behavior:
   - Permissive CORS: `allow_origins=["*"]` in `backend/app/main.py`.
   - Role_Field_Auth: authorization is decided by the `User.role` string field; there is no password/token/session auth.
   - Duplicated `ai_condition_summary` column in `CommunityListing`.
   - Startup `ALTER TABLE` migrations via `_safe_add_column`.
   - Each item explicitly states it is a known hackathon characteristic and NOT something Kiro should "fix" in app code.

---

### Component 5 — `frontend.md` (Conditional)

**Front-matter:**

```yaml
---
inclusion: fileMatch
fileMatchPattern: 'frontend/**'
---
```

**Section outline:**

1. **Add a page (recipe)** *(7.1)* — create a PascalCase component in `frontend/src/pages/`, default-export it.
2. **Register a route (recipe)** *(7.1)* — add a `<Route path=... element={<Page/>} />` inside the `<Routes>` / `<Layout>` block in `frontend/src/App.jsx` (uses `BrowserRouter`, `Routes`, `Route` from `react-router-dom`).
3. **Add an API function (recipe)** *(7.1)* — add a named export in `frontend/src/api/client.js` that calls the `request(path, options)` wrapper (or `multipartRequest` for file uploads).
4. **client.js conventions** *(7.2)* — document `request(path, options)` (fetch wrapper: sets JSON `Content-Type`, throws an `Error` with `.status` and `.detail` on non-OK), `BASE_URL` resolution (`VITE_API_URL` → `/api` in prod → `http://{hostname}:8000/api` in dev), `getApiBaseUrl()`, and `getMediaUrl(path)` (returns absolute URL for relative media paths, strips trailing `/api`). Mention `multipartRequest` + `FormData` for uploads (baseline scan, try-on photo).
5. **UserContext usage** *(7.3)* — document `frontend/src/context/UserContext.jsx`: wrap the app in `<UserProvider>`; consume via `useUser()`; available values: `users`, `currentUser`, `switchUser(userId)`, `refreshUser`, `updateUserProfile`, `loading`, cart helpers `cart` / `addToCart` / `removeFromCart` / `isInCart`, and `isAdminMode` / `setIsAdminMode` (admin mode derives from `currentUser.role === "admin"`). Note persistence to `localStorage` (`amazon_cart`, `amazon_current_user_id`).
6. **Styling with Tailwind CSS 4** *(7.4)* — document that styling uses Tailwind CSS 4 via the `@tailwindcss/vite` plugin (from `frontend/package.json` devDependencies), imported through `frontend/src/index.css`; no separate `tailwind.config` content array required for v4.

---

### Component 6 — `skills.md` (Manual)

**Front-matter:**

```yaml
---
inclusion: manual
---
```

**Section outline:**

1. **Full-stack feature workflow** *(8.1)* — end-to-end recipe spanning backend and frontend: model → schema → service → router → register in `main.py` → API function in `client.js` → page → route in `App.jsx` → test. Cross-references `backend.md` and `frontend.md`.
2. **Endpoint + frontend wiring workflow** *(8.2)* — add a backend endpoint, register the router under `/api`, then add the matching `client.js` function and call it from a page/component; note that `BASE_URL` already prefixes `/api`, so API function paths start after `/api` (e.g. `/users/`).
3. **Run / test / deploy** *(8.3)* — consolidated steps consistent with `tech.md`: run backend (`uvicorn app.main:app --reload` in `backend/`), run frontend (`npm run dev` in `frontend/`), run tests (`pytest` in `backend/`), and container/deploy via `docker compose up --build` (reference `docker-compose.yml` and `DEPLOY.md`).
4. **Gotchas (known FluxForge characteristics)** *(8.4, 9.2–9.6)* — framed as existing behavior to work *with*, not fix:
   - No real auth — access gated only by `User.role`; pass `user_id` explicitly in requests.
   - CORS is fully open (`allow_origins=["*"]`).
   - Schema changes are applied at startup via `_safe_add_column`, not a migration tool; add new columns there.
   - The `CommunityListing.ai_condition_summary` column is declared twice (known duplicate).
   - AWS is optional in dev: without `AWS_S3_BUCKET_NAME`, uploads fall back to data URLs; Bedrock/Gradio calls degrade gracefully.
   - Frontend dev API base auto-targets `:8000` on the current hostname unless `VITE_API_URL` is set.

## Data Models

This feature introduces no runtime data models. The only structured data is the YAML front-matter of the steering files:

```yaml
# Conditional file front-matter shape
inclusion: fileMatch            # or "manual" for skills.md
fileMatchPattern: 'backend/**'  # only for fileMatch
```

Always-included files (`product.md`, `tech.md`, `structure.md`) carry no front-matter block.

## Error Handling

Because the deliverable is documentation, "errors" are accuracy and configuration defects. The Tasks phase and its verification must guard against:

1. **Stale reference** — a documented path/symbol/command/env-var that does not exist in the codebase. Mitigation: cross-reference every identifier against Appendix A / the live repo before finalizing (see Correctness Property 4).
2. **Malformed front-matter** — a `---` block that is not valid YAML or is not at line 1. Mitigation: validate YAML for every file that declares front-matter (Property 3).
3. **Wrong inclusion config** — e.g. `backend.md` missing `fileMatch` or a pattern that does not match `backend/` paths. Mitigation: assert the exact inclusion fields (Requirements 2.2, 2.3).
4. **Fix-framing of known characteristics** — a known hackathon trait written as a required code change. Mitigation: editorial review of each known-characteristic note (Requirement 9.6).
5. **Secret leakage** — an env var documented with a real value. Mitigation: env vars referenced by name only (Requirement 4.7).

## Testing Strategy

Verification is documentation-appropriate: structural checks on the produced files plus a factual cross-reference against the codebase. There is no application runtime to exercise.

- **Structural checks (example-based):** file set exactness and location; per-file front-matter values; presence of each required section/topic; framing review of known characteristics.
- **Cross-reference check (property-based in spirit):** enumerate every file path, module/symbol name, command, and environment-variable name mentioned across all six files, and confirm each exists in the corresponding source of truth. This is the core quality guarantee and is expressed as Property 4 below.

Because this is a docs-only spec, "property tests" are realized as review/verification checks over the referenced-identifier set rather than randomized code execution; there is no pure function to fuzz.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Steering file-set is exactly the six required files

*For all* Markdown steering files under `.kiro/steering/`, the set is exactly `{product.md, tech.md, structure.md, backend.md, frontend.md, skills.md}` — every required name is present and no additional steering file exists.

**Validates: Requirements 1.1, 1.2**

### Property 2: Every steering file is well-formed Markdown

*For all* files in the Steering_Doc_Set, the file has a `.md` extension and parses as Markdown without fatal errors.

**Validates: Requirements 1.3**

### Property 3: Every declared front-matter block is valid YAML

*For any* Steering_File that declares front-matter, the block begins at the top of the file, is delimited by `---` lines, and parses as valid YAML; and for the conditional files this YAML sets `inclusion: fileMatch` with a `fileMatchPattern` matching the intended tree (`backend/**` for `backend.md`, `frontend/**` for `frontend.md`).

**Validates: Requirements 2.2, 2.3, 2.4**

### Property 4: Every referenced identifier matches the codebase

*For all* file paths, module names, symbol names, commands, and environment-variable names referenced anywhere in the Steering_Doc_Set, the referenced identifier exists in the current FluxForge codebase (or its documented source of truth: `requirements.txt`, `package.json`, `database.py`, `client.js`, `main.py`, `models.py`), and no documented environment variable includes a real secret value.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.4, 6.1, 6.2, 6.4, 6.5, 7.2, 7.3, 7.4, 9.1**

## Appendix A: Verified Codebase Facts

The following facts were confirmed by reading the source and MUST be reproduced accurately by the Tasks phase.

- **App title / brand:** `backend/app/main.py` sets FastAPI `title="Amazon Green Credits Ecosystem"`.
- **Router registration:** all routers mounted with `app.include_router(<r>.router, prefix="/api")` in `main.py` (users, products, orders, returns, listings, redemptions, media, sustainability, wishlist, community, analytics, baseline, tryon).
- **CORS:** `allow_origins=["*"]`, `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]` in `main.py`.
- **Safe migration:** `_safe_add_column(conn, table, column, col_type, default=None)` in `main.py`, called inside `lifespan` after `Base.metadata.create_all`, wrapped in `try/except: pass`.
- **DB config:** `backend/app/database.py` — `SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./circular_intelligence.db")`; `get_db()` yields a `SessionLocal`.
- **Roles:** `User.role = Column(String, default="customer")` in `models.py`; values `"customer" | "employee" | "admin"`.
- **Duplicate column:** `CommunityListing` in `models.py` declares `ai_condition_summary = Column(Text, nullable=True)` twice.
- **AWS fallback:** `backend/app/routers/baseline.py` S3 helper returns the data URL when `AWS_S3_BUCKET_NAME` is unset or `put_object` fails (logs a warning). Bedrock clients created per-call in `sustainability.py`, `community.py`, `product_verifier.py`.
- **Tests:** `backend/tests/conftest.py` — in-memory `sqlite:///:memory:` + `StaticPool`; `db_session` seeds `User(id=1)` + `Product(id=1)`; `client` fixture sets `app.dependency_overrides[get_db]` and yields `TestClient(app)`.
- **Backend deps:** `backend/requirements.txt` — fastapi, uvicorn[standard], sqlalchemy>=2, pydantic>=2, boto3, Pillow, python-multipart, python-dotenv, pytest, httpx, psycopg2-binary, gradio_client.
- **Frontend deps:** `frontend/package.json` — react 19, react-dom 19, react-router-dom 7, @reduxjs/toolkit, recharts, lucide-react, @gradio/client; devDeps include vite, @vitejs/plugin-react, tailwindcss 4, @tailwindcss/vite, eslint. Scripts: `dev` (`vite --host`), `build`, `lint` (`eslint .`), `preview`.
- **API client:** `frontend/src/api/client.js` — `request(path, options)`, `multipartRequest`, `getApiBaseUrl()`, `getMediaUrl(path)`; `BASE_URL = VITE_API_URL || (PROD ? "/api" : http://{hostname}:8000/api)`.
- **UserContext:** `frontend/src/context/UserContext.jsx` exposes `useUser()`, `UserProvider`, and values `users, currentUser, switchUser, refreshUser, updateUserProfile, loading, cart, addToCart, removeFromCart, isInCart, isAdminMode, setIsAdminMode`; persists `amazon_cart` and `amazon_current_user_id` to localStorage; `isAdminMode` derives from `currentUser.role === "admin"`.
- **Routing:** `frontend/src/App.jsx` uses `BrowserRouter > UserProvider > Routes > Route element={<Layout/>}` with routes for `/`, `/products/:id`, `/orders`, `/returns/new`, `/feed`, `/listings/:id`, `/profile`, `/neardrop`, `/cart`, `/dashboard`, `/employee-scan`, `/delivery`.
- **Entry points:** `frontend/src/main.jsx` renders `<App/>` into `#root`.
