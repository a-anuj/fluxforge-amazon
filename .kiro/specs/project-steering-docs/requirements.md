# Requirements Document

## Introduction

This feature delivers a coherent set of Kiro steering documents for the FluxForge / Amazon Circular Intelligence Platform monorepo. Steering documents are Markdown files stored under `.kiro/steering/` that give Kiro persistent, project-specific context (product purpose, technology stack, structure, and conventions) so that generated code and guidance stay accurate and consistent.

The deliverable is documentation only. It describes the existing FluxForge codebase (a FastAPI backend, a React/Vite frontend, SQLite/PostgreSQL persistence, and AWS integrations) as it currently exists. It MUST NOT require or trigger any change to the application source code. Known hackathon characteristics of the codebase (for example a duplicated model column, permissive CORS, and role-field-based access without real authentication) are documented as factual known characteristics, not as defects to be fixed.

Six steering files are produced:

- `product.md`, `tech.md`, `structure.md` — always included in Kiro context.
- `backend.md` — conditionally included when working on backend files.
- `frontend.md` — conditionally included when working on frontend files.
- `skills.md` — end-to-end workflow guidance.

## Glossary

- **Steering_Doc_Set**: The complete collection of six Markdown steering files produced by this feature and stored under `.kiro/steering/`.
- **Steering_File**: A single Markdown document within the Steering_Doc_Set.
- **Front_Matter**: The YAML block delimited by `---` at the top of a Steering_File that declares Kiro inclusion settings.
- **Always_Included_File**: A Steering_File that Kiro loads into every interaction. In this feature: `product.md`, `tech.md`, and `structure.md`.
- **Conditional_File**: A Steering_File configured with `inclusion: fileMatch` and a `fileMatchPattern`, loaded by Kiro only when a matching file is in context. In this feature: `backend.md` and `frontend.md`.
- **FluxForge**: The Amazon Circular Intelligence Platform application documented by the Steering_Doc_Set; also branded internally as the "Amazon Green Credits Ecosystem".
- **Backend**: The FastAPI application located under `backend/`, using SQLAlchemy ORM, Pydantic schemas, routers, and services.
- **Frontend**: The React 19 application located under `frontend/`, built with Vite, React Router, and Tailwind CSS 4.
- **Green_Credits**: The in-application reward currency users earn for sustainable actions and redeem for benefits.
- **Baseline_Scan**: An employee-captured multi-angle image scan of an order at delivery, stored against the Order and later compared against return photos.
- **AI_Assessment**: The condition-evaluation step applied to returned products, currently implemented as a stub in `backend/app/services/ai_assessment.py`.
- **Safe_Column_Migration**: The `_safe_add_column` startup pattern in `backend/app/main.py` that issues idempotent `ALTER TABLE ... ADD COLUMN` statements wrapped in try/except.
- **AWS_Graceful_Degradation**: The pattern where AWS calls (S3, Bedrock) are wrapped so that missing configuration or failures fall back to a non-fatal path (for example returning a data URL instead of an S3 URL) rather than crashing a request.
- **Role_Field_Auth**: The authorization approach in which access is decided by a `User.role` string field ("customer" | "employee" | "admin") with no password, token, or session-based authentication.
- **Author**: The process (Kiro) that generates the Steering_Doc_Set.

## Requirements

### Requirement 1: Steering directory and file set

**User Story:** As a developer using Kiro on FluxForge, I want a complete set of steering files in the standard location, so that Kiro has persistent project context.

#### Acceptance Criteria

1. THE Steering_Doc_Set SHALL be stored in the `.kiro/steering/` directory of the monorepo root.
2. THE Steering_Doc_Set SHALL contain exactly six files named `product.md`, `tech.md`, `structure.md`, `backend.md`, `frontend.md`, and `skills.md`.
3. THE Steering_Doc_Set SHALL be written in Markdown format.
4. THE Author SHALL produce only documentation files and SHALL NOT modify FluxForge application source code.

### Requirement 2: Front-matter and inclusion configuration

**User Story:** As a Kiro user, I want each steering file to declare the correct inclusion mode, so that always-on context and file-scoped context load at the right times.

#### Acceptance Criteria

1. THE files `product.md`, `tech.md`, and `structure.md` SHALL be configured as Always_Included_File entries, using the default always-included inclusion setting.
2. THE file `backend.md` SHALL contain Front_Matter that sets `inclusion: fileMatch` and a `fileMatchPattern` that matches paths under `backend/`.
3. THE file `frontend.md` SHALL contain Front_Matter that sets `inclusion: fileMatch` and a `fileMatchPattern` that matches paths under `frontend/`.
4. WHERE a Steering_File declares Front_Matter, THE Front_Matter SHALL be a valid YAML block delimited by `---` lines at the top of the file.
5. THE file `skills.md` SHALL be present in the Steering_Doc_Set with a defined inclusion setting.

### Requirement 3: Product overview content (product.md)

**User Story:** As a contributor new to FluxForge, I want a product overview, so that I understand the circular-commerce domain, roles, and key flows.

#### Acceptance Criteria

1. THE `product.md` file SHALL describe FluxForge as a circular-commerce and Green_Credits sustainability platform.
2. THE `product.md` file SHALL document the three user roles: customer, employee, and admin.
3. THE `product.md` file SHALL document the end-to-end return lifecycle flow: purchase, delivery Baseline_Scan, return, AI_Assessment, and resell or refurbish outcome.
4. THE `product.md` file SHALL document the Green_Credits earn-and-redeem flow.
5. THE `product.md` file SHALL document the community resale flow and the wishlist-match flow.
6. THE `product.md` file SHALL document the virtual try-on flow.

### Requirement 4: Technology and commands content (tech.md)

**User Story:** As a developer setting up FluxForge, I want the stack and commands documented, so that I can install, run, test, and deploy without guesswork.

#### Acceptance Criteria

1. THE `tech.md` file SHALL document the Backend stack including FastAPI, SQLAlchemy, Pydantic, Uvicorn, and boto3.
2. THE `tech.md` file SHALL document the Frontend stack including React 19, Vite, React Router, Tailwind CSS 4, Redux Toolkit, Recharts, and lucide-react.
3. THE `tech.md` file SHALL document the persistence layer as SQLite for development and PostgreSQL via psycopg2-binary for production, selected through the `DATABASE_URL` environment variable.
4. THE `tech.md` file SHALL document common commands for backend dependency install, database seeding, running the backend, running the frontend, running pytest, running ESLint, and running docker compose.
5. THE `tech.md` file SHALL document Backend environment variables by name, including `DATABASE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_S3_BUCKET_NAME`.
6. THE `tech.md` file SHALL document the Frontend environment variable `VITE_API_URL` and the default API base URL resolution behavior.
7. THE `tech.md` file SHALL reference environment variables by name and SHALL NOT include real secret values.

### Requirement 5: Structure and conventions content (structure.md)

**User Story:** As a developer navigating FluxForge, I want a directory map and layering rules, so that I place new code in the right location.

#### Acceptance Criteria

1. THE `structure.md` file SHALL provide a directory map covering the monorepo root, the `backend/` tree, and the `frontend/` tree.
2. THE `structure.md` file SHALL document the Backend layering rule that request flow proceeds from routers to services to models.
3. THE `structure.md` file SHALL document naming conventions for Backend routers, services, and models and for Frontend pages, components, and API functions.
4. THE `structure.md` file SHALL identify the location of key entry points, including `backend/app/main.py`, `frontend/src/main.jsx`, and `frontend/src/api/client.js`.

### Requirement 6: Backend contributor guidance (backend.md)

**User Story:** As a backend contributor, I want task-oriented backend guidance, so that I can add routers, models, and services following existing patterns.

#### Acceptance Criteria

1. THE `backend.md` file SHALL describe how to add a router, an endpoint, a model, and a service consistent with the existing `backend/app/` layout.
2. THE `backend.md` file SHALL document the Safe_Column_Migration pattern, referencing `_safe_add_column` in `backend/app/main.py` and its idempotent `ALTER TABLE ADD COLUMN` behavior wrapped in try/except.
3. THE `backend.md` file SHALL document the AWS_Graceful_Degradation pattern used in AWS-integrated routers and services, where missing configuration or failed AWS calls fall back to a non-fatal path.
4. THE `backend.md` file SHALL document the pytest and `conftest.py` test pattern, including the in-memory SQLite engine, the `get_db` dependency override, and the seeded test fixtures.
5. THE `backend.md` file SHALL document that new routers must be registered in `backend/app/main.py` under the `/api` prefix.

### Requirement 7: Frontend contributor guidance (frontend.md)

**User Story:** As a frontend contributor, I want task-oriented frontend guidance, so that I can add pages, routes, and API calls following existing patterns.

#### Acceptance Criteria

1. THE `frontend.md` file SHALL describe how to add a page, register a route, and add an API function.
2. THE `frontend.md` file SHALL document the conventions in `frontend/src/api/client.js`, including the `request` fetch wrapper, the `BASE_URL` resolution, and the `getMediaUrl` helper.
3. THE `frontend.md` file SHALL document `UserContext` usage, including `useUser`, `currentUser`, `switchUser`, cart helpers, and `isAdminMode`.
4. THE `frontend.md` file SHALL document the use of Tailwind CSS 4 via the `@tailwindcss/vite` plugin for styling.

### Requirement 8: End-to-end workflow guidance (skills.md)

**User Story:** As a developer, I want end-to-end workflow recipes, so that I can implement a full-stack feature and operate the project reliably.

#### Acceptance Criteria

1. THE `skills.md` file SHALL document an end-to-end workflow for adding a full-stack feature spanning the Backend and Frontend.
2. THE `skills.md` file SHALL document a workflow for adding a Backend endpoint and wiring the corresponding Frontend API function and UI.
3. THE `skills.md` file SHALL document how to run, test, and deploy the project, including backend, frontend, pytest, and docker compose steps.
4. THE `skills.md` file SHALL document key gotchas that a contributor is likely to encounter when working in the FluxForge codebase.

### Requirement 9: Factual accuracy and known characteristics

**User Story:** As a maintainer, I want the steering docs to match the real codebase and label known hackathon traits, so that Kiro does not act on inaccurate assumptions or treat intentional shortcuts as bugs.

#### Acceptance Criteria

1. THE Steering_Doc_Set SHALL describe file paths, module names, commands, and environment variable names that match the current FluxForge codebase.
2. THE Steering_Doc_Set SHALL document the duplicated `ai_condition_summary` column in the `CommunityListing` model in `backend/app/models.py` as a known characteristic.
3. THE Steering_Doc_Set SHALL document the permissive CORS configuration (`allow_origins=["*"]`) in `backend/app/main.py` as a known characteristic.
4. THE Steering_Doc_Set SHALL document Role_Field_Auth, noting that access is determined by the `User.role` field with no real authentication, as a known characteristic.
5. THE Steering_Doc_Set SHALL document the idempotent startup `ALTER TABLE` Safe_Column_Migration as a known characteristic.
6. WHERE a known hackathon characteristic is documented, THE Steering_Doc_Set SHALL present it as an existing characteristic and SHALL NOT require a code change to the FluxForge application to resolve it.
