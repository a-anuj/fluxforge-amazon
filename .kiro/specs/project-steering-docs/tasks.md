# Implementation Plan: Project Steering Docs

## Overview

This plan authors six Kiro steering documents under `.kiro/steering/` that describe the existing FluxForge / Amazon Circular Intelligence Platform monorepo. **This is a documentation-only deliverable — no FluxForge application source code is created or modified.** Each task produces one Markdown file following the exact front-matter and section outline fixed in `design.md`, using the verified identifiers in Appendix A: Verified Codebase Facts. A final verification task cross-checks the produced files against Correctness Properties 1–4.

Every content task MUST reproduce paths, module names, symbols, commands, and environment-variable names verbatim from `design.md` Appendix A, and MUST reference environment variables by name only (no secret values).

## Tasks

- [x] 1. Create `.kiro/steering/product.md` (Always included)
  - Create the file with **no front-matter block** (default always-included per Requirement 2.1).
  - Author the seven sections from design Component 1: title & one-line purpose ("Amazon Green Credits Ecosystem" brand from `backend/app/main.py` FastAPI `title`); domain summary (circular commerce + Green Credits); user roles (`customer`, `employee`, `admin` via `User.role`); return lifecycle flow (purchase → delivery Baseline_Scan → return → AI_Assessment → resell/refurbish, referencing `Order.baseline_scan_*`, the `Return` model, and the `backend/app/services/ai_assessment.py` stub); Green Credits earn/redeem (`GreenCreditTx`, `GreenChallenge`, `Redemption`); community resale + wishlist-match (`CommunityListing`, `Wishlist`, `WishlistMatch`, `WishlistNotification`); virtual try-on (`UserBodyPhoto`, `TryOnCache`, `tryon` router).
  - Use only identifiers verified in Appendix A.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.1_

- [x] 2. Create `.kiro/steering/tech.md` (Always included)
  - Create the file with **no front-matter block** (default always-included).
  - Author the six sections from design Component 2: backend stack (FastAPI, SQLAlchemy 2.x, Pydantic 2.x, Uvicorn, boto3, Pillow, python-multipart, python-dotenv, gradio_client — source `backend/requirements.txt`); frontend stack (React 19, Vite, `react-router-dom` 7, Tailwind CSS 4, Redux Toolkit, Recharts, lucide-react — source `frontend/package.json`); persistence (SQLite dev `sqlite:///./circular_intelligence.db`, PostgreSQL via `psycopg2-binary`, selected by `DATABASE_URL` — source `backend/app/database.py`).
  - Include the command reference table (Task | Command | Directory) exactly as in design section 4: install deps, seed, run backend, run frontend, pytest, lint, docker compose.
  - Include the backend env var table (`DATABASE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`, plus `S3_AWS_REGION`/`AWS_DEFAULT_REGION` fallbacks) — names only, no values — and the frontend env var section (`VITE_API_URL` and the `BASE_URL` resolution behavior in `frontend/src/api/client.js`).
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.1_

- [x] 3. Create `.kiro/steering/structure.md` (Always included)
  - Create the file with **no front-matter block** (default always-included).
  - Author the five sections from design Component 3: monorepo directory map (root, `backend/app/` tree, `frontend/src/` tree); backend layering rule (routers → services → models); naming conventions for backend routers/services/models and frontend pages/components/API functions; entry points (`backend/app/main.py`, `frontend/src/main.jsx`, `frontend/src/api/client.js`, `frontend/src/App.jsx`); and the known structural characteristic note (duplicated `ai_condition_summary` column in `CommunityListing` in `backend/app/models.py`), framed as an existing characteristic that is NOT a code change to make.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 5.1, 5.2, 5.3, 5.4, 9.1, 9.2, 9.6_

- [x] 4. Create `.kiro/steering/backend.md` (Conditional — `fileMatch`)
  - Create the file with front-matter exactly:
    ```yaml
    ---
    inclusion: fileMatch
    fileMatchPattern: 'backend/**'
    ---
    ```
  - Author the nine sections from design Component 4: add-a-router recipe (`APIRouter(prefix=..., tags=[...])`, `Depends(get_db)`); add-an-endpoint recipe (Pydantic schemas from `backend/app/schemas.py`); add-a-model recipe (`Base`, `__tablename__`, auto-create via `Base.metadata.create_all`); add-a-service recipe (`backend/app/services/<name>.py`); register-the-router step (`app.include_router(<name>.router, prefix="/api")` in `main.py`).
  - Document the Safe_Column_Migration pattern (`_safe_add_column` in `main.py`, idempotent `ALTER TABLE ADD COLUMN` in try/except, called in `lifespan` after `create_all`) and the AWS_Graceful_Degradation pattern (S3 helper in `backend/app/routers/baseline.py` falling back to data URL when `AWS_S3_BUCKET_NAME` unset or `put_object` fails; per-call Bedrock clients in `sustainability.py`, `community.py`, `product_verifier.py`).
  - Document the pytest/`conftest.py` pattern (`sqlite:///:memory:` + `StaticPool`, `create_all`, `db_session` seeding `User(id=1)` + `Product(id=1)`, `client` fixture overriding `get_db` via `app.dependency_overrides[get_db]` and wrapping `TestClient(app)`).
  - Add the "Known characteristics (backend)" subsection: permissive CORS (`allow_origins=["*"]`), Role_Field_Auth, duplicated `ai_condition_summary`, startup `ALTER TABLE` migrations — each explicitly labeled a known hackathon characteristic, NOT something to fix in app code.
  - _Requirements: 1.1, 1.2, 1.3, 2.2, 2.4, 6.1, 6.2, 6.3, 6.4, 6.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 5. Create `.kiro/steering/frontend.md` (Conditional — `fileMatch`)
  - Create the file with front-matter exactly:
    ```yaml
    ---
    inclusion: fileMatch
    fileMatchPattern: 'frontend/**'
    ---
    ```
  - Author the six sections from design Component 5: add-a-page recipe (PascalCase component in `frontend/src/pages/`, default export); register-a-route recipe (`<Route>` inside `<Routes>`/`<Layout>` in `frontend/src/App.jsx`); add-an-API-function recipe (named export in `frontend/src/api/client.js` calling `request`/`multipartRequest`).
  - Document `client.js` conventions (`request(path, options)` fetch wrapper with `.status`/`.detail` errors, `BASE_URL` resolution, `getApiBaseUrl()`, `getMediaUrl(path)`, `multipartRequest` + `FormData`); `UserContext` usage from `frontend/src/context/UserContext.jsx` (`useUser`, `currentUser`, `switchUser`, `refreshUser`, `updateUserProfile`, cart helpers `cart`/`addToCart`/`removeFromCart`/`isInCart`, `isAdminMode`/`setIsAdminMode`, localStorage keys `amazon_cart`/`amazon_current_user_id`); and Tailwind CSS 4 via the `@tailwindcss/vite` plugin imported through `frontend/src/index.css`.
  - _Requirements: 1.1, 1.2, 1.3, 2.3, 2.4, 7.1, 7.2, 7.3, 7.4, 9.1_

- [x] 6. Create `.kiro/steering/skills.md` (Manual)
  - Create the file with front-matter exactly:
    ```yaml
    ---
    inclusion: manual
    ---
    ```
  - Author the four sections from design Component 6: full-stack feature workflow (model → schema → service → router → register in `main.py` → API function in `client.js` → page → route in `App.jsx` → test, cross-referencing `backend.md`/`frontend.md`); endpoint + frontend wiring workflow (register under `/api`, note `BASE_URL` already prefixes `/api`); run/test/deploy steps consistent with `tech.md` (`uvicorn app.main:app --reload`, `npm run dev`, `pytest`, `docker compose up --build`, referencing `docker-compose.yml` and `DEPLOY.md`); and the gotchas subsection (no real auth / pass `user_id`, open CORS, startup `_safe_add_column` migrations, duplicated `ai_condition_summary`, optional AWS with data-URL fallback, frontend dev API base auto-targeting `:8000`) — all framed as existing characteristics to work with, not fix.
  - _Requirements: 1.1, 1.2, 1.3, 2.5, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 7. Verify the Steering_Doc_Set against Correctness Properties 1–4
  - **Property 1 (file-set exactness):** confirm `.kiro/steering/` contains exactly the six files `product.md`, `tech.md`, `structure.md`, `backend.md`, `frontend.md`, `skills.md` and no additional steering files. _Validates: Requirements 1.1, 1.2_
  - **Property 2 (Markdown well-formedness):** confirm every file has a `.md` extension and parses as Markdown without fatal errors. _Validates: Requirements 1.3_
  - **Property 3 (valid YAML front-matter / inclusion):** confirm `product.md`, `tech.md`, `structure.md` carry no front-matter; `backend.md` has `inclusion: fileMatch` + `fileMatchPattern: 'backend/**'`; `frontend.md` has `inclusion: fileMatch` + `fileMatchPattern: 'frontend/**'`; `skills.md` has `inclusion: manual`; each declared block starts at line 1, is delimited by `---`, and is valid YAML. _Validates: Requirements 2.2, 2.3, 2.4, 2.5_
  - **Property 4 (referenced-identifier accuracy):** enumerate every file path, module/symbol name, command, and environment-variable name referenced across all six files and confirm each exists in the current codebase or its source of truth (`backend/requirements.txt`, `frontend/package.json`, `backend/app/database.py`, `frontend/src/api/client.js`, `backend/app/main.py`, `backend/app/models.py`), and confirm no environment variable is documented with a real secret value. _Validates: Requirements 4.1–4.7, 5.1, 5.4, 6.1, 6.2, 6.4, 6.5, 7.2, 7.3, 7.4, 9.1_
  - Also confirm every known-characteristic note is framed as existing behavior and does not require an application code change. _Validates: Requirements 9.6_
  - Confirm no FluxForge application source files were modified by this feature. _Validates: Requirements 1.4_

## Notes

- **Documentation-only:** these tasks author Markdown under `.kiro/steering/` and MUST NOT create or modify any FluxForge application source code.
- Each task references specific requirements for traceability.
- Known hackathon characteristics (duplicate column, open CORS, role-field auth, startup ALTER TABLE) are documented as existing behavior, never as defects to fix.
- Task 7 realizes the "property tests" as documentation verification checks over the produced files and referenced-identifier set (there is no application runtime to exercise).
- All identifiers must come from `design.md` Appendix A: Verified Codebase Facts.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3", "4", "5", "6"] },
    { "id": 1, "tasks": ["7"] }
  ]
}
```
