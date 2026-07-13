# Glimmora Pharma — Complete Project Details

> Verified against source (branch `devAI`). Every claim cites the file it came from. Where something can't be determined from the repo, it says so explicitly. Enumerations (models, routes, actions, endpoints, env vars) were produced by globbing/grepping the actual tree, not from memory or docs.

---

## 1. Tech Stack & Versions

### Web app (repo root) — from [package.json](package.json)
- **Next.js** `^16.2.4` (running 16.2.10; App Router + Turbopack in dev), **React** / **React DOM** `^19.2.5`, **TypeScript** `~5.9.3` ([tsconfig.json](tsconfig.json) target ES2023, `moduleResolution: bundler`, path alias `@/* → ./src/*`).
- **Runtime dependencies** (`dependencies`):
  `@aws-sdk/client-s3 ^3.1046.0`, `@hookform/resolvers ^5.2.2`, `@prisma/client ^6.19.3`, `@reduxjs/toolkit ^2.11.2`, `@sapphi-red/web-noise-suppressor ^0.3.5`, `@tanstack/react-query ^5.90.21`, `@types/nodemailer ^8.0.0`, `bcryptjs ^3.0.3`, `clsx ^2.1.1`, `dayjs ^1.11.20`, `lucide-react ^0.577.0`, `next ^16.2.4`, `next-auth ^4.24.14`, `nodemailer ^9.0.3`, `prisma ^6.19.3`, `react ^19.2.5`, `react-dom ^19.2.5`, `react-easy-crop ^6.1.0`, `react-hook-form ^7.71.2`, `react-is ^19.2.4`, `react-redux ^9.2.0`, `recharts ^3.8.0`, `tailwindcss ^4.2.1`, `zod ^4.3.6`.
- **Dev dependencies** (`devDependencies`):
  `@eslint/js ^9.39.4`, `@playwright/test ^1.59.1`, `@tailwindcss/postcss ^4.2.1`, `@types/bcryptjs ^3.0.0`, `@types/node ^24.12.0`, `@types/react ^19.2.14`, `@types/react-dom ^19.2.3`, `concurrently ^9.2.1`, `dotenv ^17.4.2`, `eslint ^9.39.4`, `eslint-plugin-react-hooks ^7.0.1`, `globals ^17.4.0`, `tsx ^4.21.0`, `typescript ~5.9.3`, `typescript-eslint ^8.56.1`.

### AI backend (`backend/`) — from `backend/requirements.txt` + `backend/runtime.txt`
- **Python** `3.12.7` (`backend/runtime.txt`), **FastAPI** `==0.115.0`, **Uvicorn** `[standard] ==0.30.6`.
- Full pinned list: `fastapi==0.115.0`, `uvicorn[standard]==0.30.6`, `sqlalchemy==2.0.36`, `openai==1.30.0`, `httpx==0.27.2`, `pydantic==2.8.2`, `python-dotenv==1.0.1`, `pypdf==4.0.0`, `python-docx==1.1.0`, `PyJWT==2.8.0`, `python-multipart==0.0.9`, `bcrypt==4.2.0`, `pinecone>=5.0.0` (unpinned min), `psycopg2-binary>=2.9.9` (unpinned min). **No LangChain** — RAG is built directly on the OpenAI + Pinecone SDKs; Tavily is called via raw `httpx` (no SDK).

### Databases actually configured
- **Prisma datasource** = **SQLite in all environments** — [prisma/schema.prisma](prisma/schema.prisma) `provider = "sqlite"`, `url = env("DATABASE_URL")`; `prisma/migrations/migration_lock.toml` pins `sqlite`. Dev file `prisma/dev.db`. [.env.example:12](.env.example#L12) sets `DATABASE_URL="file:./dev.db"` and *documents* a PostgreSQL production string in a comment, but the schema/lockfile remain SQLite. CI uses a throwaway `file:./prisma/ci.db` ([.github/workflows/ci.yml:17](.github/workflows/ci.yml#L17)).
- **FastAPI DB** = a **separate** SQLAlchemy database — `backend/app/database/db.py` reads `DATABASE_URL`, default `sqlite:///./glimmora.db` (Postgres path adds `pool_pre_ping` + `pool_recycle`). This is a distinct store from Prisma's.

### ORMs in use
- **Prisma 6** (`prisma-client-js`) for the web app — [src/lib/prisma.ts](src/lib/prisma.ts), all of `src/lib/queries/*` and `src/actions/*`.
- **SQLAlchemy 2.0** (declarative `Base`) for the FastAPI backend — `backend/app/models/capa_model.py`.

**Monorepo tooling: none.** No `turbo.json`, `nx.json`, or `workspaces` key in [package.json](package.json). The two apps live in one repo but are independent (npm for web, pip for backend).

---

## 2. Repository Structure

Top-level tree (from `git`-tracked contents + `ls`):

| Path | Purpose |
|------|---------|
| `app/` | Next.js **App Router** — pages, layouts, and thin API route handlers ([app/api/**/route.ts](app/api)). |
| `src/` | Web app code: `actions/` (Server Actions = writes), `lib/queries/` (cached reads), `lib/` (auth, prisma, signing, storage, AI clients), `modules/` (feature UIs), `components/`, `store/` (Redux), `schemas/`, `constants/`, `types/`, `hooks/`. |
| `backend/` | **FastAPI AI service** (Python) — self-contained: `app/main.py`, `app/routers/`, `app/models/`, `app/schemas/`, `app/rag/`, `app/database/`, `ai_service.py`, `ai_db_handler.py`. Its own venv (`backend/.venv`, not committed). |
| `prisma/` | `schema.prisma`, `migrations/`, `seed.ts`, role-limit seeders (`roleLimitsSeed.ts`, `backfillRoleLimits.ts`), `sql/` (one out-of-band data fix), `dev.db`. |
| `scripts/` | Operational TS scripts: `dev-api.mjs` (cross-platform uvicorn launcher), `test-mailer.ts`, and ~15 `backfill-*` / `probe-*` one-off data scripts. |
| `tests/` | Playwright specs (`smoke.spec.ts` + 4 AI-feature specs). |
| `docs/` | The real documentation set (`docs/handover/` is canonical); ~15 markdown guides + audits. |
| `public/` | Static assets served by Next. |
| `.github/workflows/` | CI (`ci.yml`). |
| `.do/` | DigitalOcean App Platform config (`app.yaml`). |
| `.vscode/` | Editor settings. |
| Root files | `render.yaml`, `vercel.json`, `.do/app.yaml` (deploy); `next.config.mjs`, `tsconfig.json`, `eslint.config.js`, `postcss.config.ts`, `playwright.config.ts` (config); `proxy.ts` (edge auth/tenant middleware); `CLAUDE.md`, `AGENTS.md`, `HANDOVER.md` (stale), `MIGRATION-GUIDE.md`, and the generated `PROJECT_OVERVIEW.md` / `PROJECT_AUDIT.md`. **No root `README.md`** despite [CLAUDE.md](CLAUDE.md) linking to it. |

**Where each app lives:** the Next.js app is the repo root (`app/` + `src/`); the FastAPI backend is entirely under `backend/`. They share only the repo and (by convention) a tenant-id concept — not a database.

---

## 3. Architecture

### Web ⇄ AI backend communication
- **Primary (server-side) path:** the browser calls the same-origin proxy [app/api/ai-proxy/[...path]/route.ts](app/api/ai-proxy/[...path]/route.ts), which requires a NextAuth session ([line 36](app/api/ai-proxy/[...path]/route.ts#L36)), allowlists only `api/ai/*` and `api/v1/*` ([line 18](app/api/ai-proxy/[...path]/route.ts#L18)), forwards only `content-type`/`accept`/`auth` headers ([line 26](app/api/ai-proxy/[...path]/route.ts#L26)), and targets `BACKEND_URL` → `NEXT_PUBLIC_API_URL` (minus `/api`) → `http://localhost:8000` ([lines 6-9](app/api/ai-proxy/[...path]/route.ts#L6)).
- **Direct path also exists:** client code hardcodes the public backend URL — [src/lib/aiAuth.ts:17](src/lib/aiAuth.ts#L17) `AI_UPSTREAM = "https://pharma-glimmora-ai-backend.onrender.com"`; also referenced in [src/lib/aiBackend.ts:3](src/lib/aiBackend.ts#L3) and [render.yaml:27](render.yaml#L27). So the browser can reach the FastAPI service without transiting the proxy.

### Auth — web app (NextAuth v4)
- Config in [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts): Credentials provider, `session.strategy = "jwt"`, 8-hour maxAge; `secret: process.env.NEXTAUTH_SECRET` ([line 103](app/api/auth/[...nextauth]/route.ts#L103)).
- **Production secret guard** ([lines 20-30](app/api/auth/[...nextauth]/route.ts#L20)): throws if `NEXTAUTH_SECRET` is unset, equals the `.env.example` placeholder, or is < 32 chars.
- **Dual-table `authorize()`:** matches the **Tenant** table (super_admin / customer_admin) or the **User** table (site users) by email/username; guards include ambiguous-match refusal, lifecycle/active checks, bcrypt password compare, subscription gate, and site-assignment gate.
- **MFA:** tenant-level email OTP (`Tenant.mfaEnabled`); codes hashed in `EmailOTP` (see §5), issued/verified in [src/lib/otp.ts](src/lib/otp.ts), mailed via [src/lib/mailer.ts](src/lib/mailer.ts); super_admin bypasses.
- **Server helpers:** [src/lib/auth.ts](src/lib/auth.ts) — `auth()` ([line 33](src/lib/auth.ts#L33), defaults `role→"viewer"`, `tenantId→""` if missing = fail-closed), `requireAuth()` ([line 54](src/lib/auth.ts#L54)), `resolveUserFk()` ([line 135](src/lib/auth.ts#L135), tenant-scoped), `requireGxPAuthor()` ([line 188](src/lib/auth.ts#L188), blocks super_admin from authoring GxP records). Edge enforcement also in [proxy.ts](proxy.ts).

### Auth — AI backend (JWT)
- [backend/app/routers/auth_router.py](backend/app/routers/auth_router.py): **HS256** ([line 53](backend/app/routers/auth_router.py#L53)), 24-hour expiry ([line 104](backend/app/routers/auth_router.py#L104)). Token claims = `sub` (username) + `customer_id` ([lines 100-106](backend/app/routers/auth_router.py#L100)).
- **Secret source:** `_load_secret_key()` reads `SECRET_KEY` ([line 33](backend/app/routers/auth_router.py#L33)); if unset and not production → hardcoded `"dev-insecure-secret-do-not-use-in-production"` ([line 49](backend/app/routers/auth_router.py#L49)); production (detected via `ENV/ENVIRONMENT=production` or `RENDER`) → raises rather than fall back ([line 41](backend/app/routers/auth_router.py#L41)). **Note the mismatch:** deploy configs set `JWT_SECRET`, code reads `SECRET_KEY` (flagged in `PROJECT_AUDIT.md` C-2).
- **Read from a custom `auth` header** (bare token or `Bearer …`) via `_normalize` ([line 133](backend/app/routers/auth_router.py#L133)); strict vs anonymous-fallback gated by `_auth_strict()` ([line 125](backend/app/routers/auth_router.py#L125)).

### Multi-tenancy end-to-end
- **Web:** `Tenant` is the aggregate root; nearly every Prisma model carries `tenantId` with `onDelete: Cascade`. Reads (`src/lib/queries/*`) and writes (`src/actions/*`) filter by `session.user.tenantId`; bare-id writes are preceded by tenant-ownership guards (e.g. [src/actions/fda483.ts:1509-1518](src/actions/fda483.ts#L1509)). Cross-tenant catalogs (`RegulatoryRegion`, `Framework`) are intentionally global.
- **AI backend:** tenant key is `customer_id`, taken from the JWT ([backend/app/routers/ai_router.py:43](backend/app/routers/ai_router.py#L43)) and applied in [backend/app/ai_db_handler.py:41-46](backend/app/ai_db_handler.py#L41) — **but the filter is fail-open** (`if customer_id:`), flagged in `PROJECT_AUDIT.md` H-2.

---

## 4. API Surface

### Next.js API routes (`app/api/**/route.ts`) — 7 total (from glob)
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts) | GET, POST | public (is the auth endpoint) | NextAuth catch-all — Credentials login + OTP MFA. |
| [app/api/auth/me/route.ts](app/api/auth/me/route.ts) | GET | session (401 if none) | Current-user profile from the JWT, shaped for Redux. |
| [app/api/ai-proxy/[...path]/route.ts](app/api/ai-proxy/[...path]/route.ts) | GET/POST/PUT/PATCH/DELETE/OPTIONS | session (401) + path allowlist | Authenticated proxy to the FastAPI backend. |
| [app/api/documents/[id]/route.ts](app/api/documents/[id]/route.ts) | GET | session + **tenant match** ([line 41](app/api/documents/[id]/route.ts#L41)) | Download a Document's file (soft-delete + super_admin `?includeDeleted=1`). |
| [app/api/evidence/files/[id]/route.ts](app/api/evidence/files/[id]/route.ts) | GET | session + **tenant match** via `evidenceItem→capa→tenantId` ([line 42](app/api/evidence/files/[id]/route.ts#L42)) | Download an EvidenceFile. |
| [app/api/findings/[id]/evidence/route.ts](app/api/findings/[id]/evidence/route.ts) | GET | session + **tenant match** ([line 40](app/api/findings/[id]/evidence/route.ts#L40)) | Inline view of a Gap-Assessment finding's evidence document. |
| [app/api/stage-documents/[id]/route.ts](app/api/stage-documents/[id]/route.ts) | GET | session + **tenant match** via `validationStage→system→tenantId` ([line 52](app/api/stage-documents/[id]/route.ts#L52)) | Download a CSV/CSA StageDocument. |

### Server Actions (`src/actions/**`) — 39 files, ~257 exported actions (from glob + `grep -c "export async function"`)
All are `"use server"`. Standard shape: `requireAuth()` → role/permission gate → `resolveUserFk()` → Zod validate → Prisma mutation → **`auditLog`** row → `revalidatePath()`, returning a discriminated `ActionResult`. Tenant scoping is via `session.user.tenantId` (never client input). File-level inventory with action counts:

| File | # actions | Purpose |
|------|:--:|---------|
| [systems.ts](src/actions/systems.ts) | 25 | CSV/CSA GxP systems, validation stages, stage documents. |
| [fda483.ts](src/actions/fda483.ts) | 23 | FDA 483 events, observations, commitments, response docs, signing. |
| [findings.ts](src/actions/findings.ts) | 15 | Gap-assessment findings + evidence upload + QA review loop. |
| [deviations.ts](src/actions/deviations.ts) | 13 | Deviation lifecycle + RCA + CAPA-decision chain + signed closure. |
| [support.ts](src/actions/support.ts) | 12 | Support tickets, messages, activity. |
| [settings.ts](src/actions/settings.ts) | 12 | Tenant org/users/sites; **user & site cap enforcement** ([line 261](src/actions/settings.ts#L261), [line 88](src/actions/settings.ts#L88)). |
| [frameworks.ts](src/actions/frameworks.ts) | 12 | Platform framework catalog (cross-tenant by design). |
| [change-control.ts](src/actions/change-control.ts) | 12 | Change Control state machine + CAPA links + signed transitions. |
| [tenants.ts](src/actions/tenants.ts) | 11 | Admin tenant CRUD + plan caps ([line 619](src/actions/tenants.ts#L619)). |
| [regions.ts](src/actions/regions.ts) | 10 | Regulatory region catalog (cross-tenant). |
| [inspections.ts](src/actions/inspections.ts) | 9 | Inspection readiness events/actions. |
| [capas/lifecycle.ts](src/actions/capas/lifecycle.ts) | 9 | Core CAPA create/update/lifecycle. |
| [evidence.ts](src/actions/evidence.ts) | 8 | Evidence items/files (size-capped uploads, [line 27](src/actions/evidence.ts#L27)). |
| [deviation-tasks.ts](src/actions/deviation-tasks.ts) | 7 | Low-priority deviation task assign/review. |
| [roleLimits.ts](src/actions/roleLimits.ts) | 6 | Set Plan/Tenant per-role caps (super_admin). |
| [documents.ts](src/actions/documents.ts) | 6 | Cross-module document store. |
| [capas/action-items.ts](src/actions/capas/action-items.ts) | 6 | Structured CAPA action-plan steps. |
| [capa-comments.ts](src/actions/capa-comments.ts) | 6 | CAPA discussion thread / concerns. |
| [stage-tasks.ts](src/actions/stage-tasks.ts) | 5 | Validation-stage rework tasks. |
| [raid.ts](src/actions/raid.ts) | 5 | Governance RAID register. |
| [effectiveness-criteria.ts](src/actions/effectiveness-criteria.ts) | 5 | CAPA effectiveness success criteria. |
| [notifications.ts](src/actions/notifications.ts) | 4 | In-app notifications. |
| [capas/rca-review.ts](src/actions/capas/rca-review.ts) | 3 | CAPA RCA QA-gate. |
| [capas/approvals.ts](src/actions/capas/approvals.ts) | 3 | CAPA tiered approvals (signed). |
| [capas/alignment.ts](src/actions/capas/alignment.ts) | 3 | Action-to-cause alignment review. |
| [rtm.ts](src/actions/rtm.ts) | 2 | Requirements Traceability Matrix. |
| [capas/verification.ts](src/actions/capas/verification.ts) | 2 | Independent QA verification (signed). |
| [capas/effectiveness.ts](src/actions/capas/effectiveness.ts) | 2 | 90-day effectiveness review (signed). |
| [capas/closure.ts](src/actions/capas/closure.ts) | 2 | `signAndCloseCAPA` (signed, transactional) + CC-deps read. |
| [auditLogs.ts](src/actions/auditLogs.ts) | 2 | Audit-trail read wrapper + generic writer. |
| [agiConsole.ts](src/actions/agiConsole.ts) | 2 | AI governance console / FDA 483 AI draft. |
| [worklist.ts](src/actions/worklist.ts) | 1 | Cross-module task aggregation. |
| [datatableDemo.ts](src/actions/datatableDemo.ts) | 1 | Demo/sample data. |
| [complianceSnapshot.ts](src/actions/complianceSnapshot.ts) | 1 | Compliance KPI snapshot. |
| [capas/recurrence.ts](src/actions/capas/recurrence.ts) | 1 | CAPA recurrence linkage. |
| [capas/_shared.ts](src/actions/capas/_shared.ts) | 1 | Shared signing-provenance helper. |
| [capas/_types.ts](src/actions/capas/_types.ts), [capas.ts](src/actions/capas.ts), [index.ts](src/actions/index.ts) | 0 | Types / barrel re-exports. |

### FastAPI routers (`backend/app/routers/**`) — 12 routers (from `grep @router` + prefixes)
Registered in `backend/app/main.py`. Utility routes: `GET /health`, `GET /`.

| Router (prefix) | Endpoints | Auth | Purpose |
|-----------------|-----------|------|---------|
| **auth** `/api/v1/auth` | `POST /signup` ([line 202](backend/app/routers/auth_router.py#L202)), `POST /login` ([line 235](backend/app/routers/auth_router.py#L235)) | **none** (open signup — flagged AUDIT C-1) | Issue JWTs; signup accepts client `customer_id`. |
| **ai** `/api/ai` | `POST /chat` ([line 39](backend/app/routers/ai_router.py#L39)), `GET /health` | JWT via `Depends(get_current_customer_id)` (strict env only) | The RAG/DB/web assistant. |
| **voice** `/api/ai/voice` | `POST /transcribe`, `POST /speak`, `POST /chat`, `GET /health` | (per voice_router) | Whisper STT + TTS + voice chat loop. |
| **capa** `/api/v1/capa` | `POST /create`, `GET /all`, `GET /customer/{customer_id}`, `GET /status/{capa_id}`, `POST /dismiss-alert` | JWT | Stage 1 CAPA create (doc extract + AI recurrence), lists, alerts. |
| **rca** `/api/v1/rca` | `POST /submit`, `GET /capa/{capa_id}`, `GET /status/{rca_id}` | JWT | Stage 2 root-cause analysis. |
| **action-plan** `/api/v1/action-plan` | `POST /submit`, `GET /capa/{capa_id}`, `GET /status/{action_plan_id}` | JWT | Stage 3. |
| **monitoring** `/api/v1/monitoring` | `POST /check`, `GET /capa/{capa_id}`, `GET /status/{monitoring_id}` | JWT | Stage 4. |
| **effectiveness** `/api/v1/effectiveness` | `POST /check`, `GET /status/{effectiveness_id}`, `GET /capa/{capa_id}` | JWT | Stage 5. |
| **closure** `/api/v1/closure` | `POST /initiate`, `GET /status/{closure_id}`, `GET /capa/{capa_id}` | JWT | Stage 6. |
| **audit** `/api/v1/audit` | `GET /all`, `GET /record/{record_id}` | JWT | AI-side audit trail (`AIAuditTrail`). |
| **user** `/api/v1/users` | `GET /` ([line 16](backend/app/routers/user_router.py#L16)) | — | **Placeholder stub** (static message). |

*Note:* per-endpoint auth strictness depends on the environment gate — in a non-strict env (no `AI_AUTH_STRICT`/`RENDER`/`ENV=production`) the JWT dependencies degrade to an `anonymous` identity (AUDIT C-3).

---

## 5. Data Model

### Prisma — 53 models (from `grep "^model" prisma/schema.prisma`), all SQLite
No native enums (SQLite limitation) — "enum" columns are `String` validated app-side with Zod. Compliance posture: soft-delete (`deletedAt/deletedById/…`), append-only edit/version tables, `retainUntil` (+7yr) on file rows, polymorphic e-signature ledger.

- **Auth/Tenant:** `Tenant` (L15, aggregate root + admin login row, `regulatoryRegion`, MFA, `sessionsValidAfter`), `Plan` (L80, 1:1 with Tenant, frozen caps `maxUsers/maxSites/minRetentionYears/durationMonths`), `RegulatoryRegion` (L109, cross-tenant catalog).
- **Settings/org:** `Site` (L135), `User` (L165, `role`, `gxpSignatory`, `siteId`; unique per `(tenantId,email)`/`(tenantId,username)`).
- **Gap Assessment:** `Finding` (L227), `FindingEdit` (L297, append-only), `FindingMessage` (L317, append-only).
- **CAPA:** `CAPA` (L333, wide: RCA/verification/effectiveness/approval/closure, each with SoD actor FKs + `*SignatureId`), `CAPAActionItem` (L549), `CAPADocument` (L603), `CAPAEffectivenessCriterion` (L1562), `CAPAApproval` (L1660, `signatureId`, soft-revoke), `CAPAComment` (L1700, `isConcern` blocks approval).
- **Deviation:** `Deviation` (L622), `DeviationTask` (L736), `DeviationTaskMessage` (L793).
- **FDA 483:** `FDA483Event` (L810, `agiDraft` AI field + response/outcome signatures), `FDA483Document` (L858), `FDA483Observation` (L872), `FDA483Commitment` (L897), `FDA483CommitmentDocument` (L934).
- **CSV/CSA:** `GxPSystem` (L950), `ValidationStage` (L1025), `ValidationStageTask` (L1062), `StageDocument` (L1117, SHA-256 + `retainUntil`), `RTMEntry` (L1148), `RoadmapActivity` (L1189).
- **Documents/Evidence:** `Document` (L1224, cross-module), `EvidenceItem` (L1458, `@@unique([capaId,category])`), `EvidenceNoteVersion` (L1501, immutable), `EvidenceFile` (L1519, SHA-256 + `retainUntil`).
- **Change Control:** `ChangeControl` (L1755, `latestSignedTransitionId`), `CAPAChangeControlLink` (L1819, M:N join).
- **Governance/Readiness:** `RAIDItem` (L1285), `Inspection` (L1311), `ReadinessAction` (L1336), `Simulation` (L1354), `ReadinessCard` (L1393), `Playbook` (L1412), `TrainingRecord` (L1428).
- **Compliance ledger/audit:** `SignedRecord` (L1603, polymorphic Part 11 e-signature ledger keyed by `(recordType, recordId)`, holds signer identity, `signatureMeaning`, `contentHash`, `passwordVerifiedAt`, `ipAddress/userAgent`), `AuditLog` (L1373, tenant-scoped compliance trail, soft-linked by `module`+`recordId`).
- **Auth support / notifications / support desk:** `EmailOTP` (L1850, `(identifier,tenantId)`), `Notification` (L1870), `Ticket` (L1897), `TicketMessage` (L1966), `TicketActivity` (L1986).
- **Frameworks / role limits:** `Framework` (L2009), `FrameworkRegion` (L2045), `TenantFramework` (L2059), `PlanRoleLimit` (L2091, `@@unique([planId,role])`), `TenantRoleLimit` (L2107, `@@unique([tenantId,role])`).

There is **no dedicated AI table** in Prisma; AI output is stored on domain rows (e.g. `FDA483Event.agiDraft`).

### SQLAlchemy (FastAPI) — 8 tables, a separate DB (from `grep __tablename__`)
`backend/app/models/capa_model.py`: `User` → `users`, `CAPA` → `capas`, `RCA` → `rcas`, `ActionPlan` → `action_plans`, `ImplementationMonitoring` → `monitoring`, `EffectivenessCheck` → `effectiveness_checks`, `CAPAClosure` → `capa_closures`. Plus `AIAuditTrail` → `ai_audit_trail`, defined in `backend/app/routers/audit_router.py:11`. These mirror the 6 CAPA lifecycle stages and are keyed by `customer_id` for tenant scoping.

### Migration strategy per environment
- **Local dev:** `prisma db push` or `prisma migrate dev` ([package.json](package.json) `db:migrate`). Migrations on disk: `20260629054845_init` + `20260709070842_add_tenant_regulatory_region_and_plans`.
- **CI:** `prisma migrate deploy` against `ci.db` ([.github/workflows/ci.yml:36](.github/workflows/ci.yml#L36)).
- **DigitalOcean:** `prisma migrate deploy` in a PRE_DEPLOY job ([.do/app.yaml:13](.do/app.yaml#L13)) — correct/reviewed.
- **Render:** `prisma db push` on **every boot** ([render.yaml:14](render.yaml#L14)) — unreviewed schema reconcile (flagged AUDIT C-4).
- **FastAPI:** `Base.metadata.create_all(bind=engine)` at startup in `backend/app/main.py` — implicit table creation, no migration history (flagged AUDIT M-3).

---

## 6. Deployment Configs (all three)

### `.do/app.yaml` — DigitalOcean App Platform (region `blr`)
- **PRE_DEPLOY job `migrate`:** build `npm ci && npx prisma generate`, run `npx prisma migrate deploy`; env `DATABASE_URL` (SECRET). ([lines 5-18](.do/app.yaml#L5))
- **Service `api` (FastAPI):** `source_dir: /backend`, build `pip install -r requirements.txt`, run `uvicorn app.main:app --host 0.0.0.0 --port 8080`, `http_port: 8080`, health `/health`. **Public routes:** `/v1`, `/api/ai`, `/api/v1` ([lines 33-36](.do/app.yaml#L33)). Env: `DATABASE_URL`, `OPENAI_API_KEY`, `PINECONE_API_KEY`, **`JWT_SECRET`** (SECRET), `ALLOWED_ORIGINS=${APP_URL}`.
- **Service `web` (Next.js):** build `npm ci && npx prisma generate && npm run build`, run `npm start`, `http_port: 3000`, health `/api/auth/session`. Env: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `BACKEND_URL=${api.PRIVATE_URL}` (internal networking), `FILE_STORAGE_BACKEND=do-spaces`, `DO_SPACES_ENDPOINT/KEY/SECRET/BUCKET` (SECRET), `DO_SPACES_REGION=blr1`.

### `render.yaml` — Render Blueprint
- **One `web` service** `glimmora-pharma-web`, `runtime: node`, `plan: starter`, branch `devAI`. Build `npm install && npx prisma generate && npm run build`; **start `npx prisma db push && npm start`** ([line 14](render.yaml#L14)).
- **Persistent disk** `glimmora-data` mounted at `/data`, 1 GB ([lines 15-18](render.yaml#L15)).
- Env: `NODE_VERSION=24`, `DATABASE_URL=file:/data/glimmora.db`, `FILE_STORAGE_BACKEND=local`, `NEXT_PUBLIC_API_URL=https://pharma-glimmora-ai-backend.onrender.com/api`; secrets `sync:false` → `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `BACKEND_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`. **No AI backend service defined here** (the AI backend runs as a separate Render service, config not in this repo).

### `vercel.json`
- `{ "framework": "nextjs" }` — a stub; no build/env/route config. ([vercel.json](vercel.json))

### Where the three disagree
| Dimension | `.do/app.yaml` | `render.yaml` | `vercel.json` |
|-----------|----------------|---------------|---------------|
| DB engine/location | SQLite via `DATABASE_URL` secret | SQLite `file:/data/glimmora.db` on disk | not specified |
| Migration on deploy | `migrate deploy` (reviewed) | **`db push` every boot** | none |
| File storage | `do-spaces` | `local` (persistent disk) | none |
| AI backend | defined as `api` service, **public routes** | **not defined** (external Render service) | none |
| Backend URL to web | `${api.PRIVATE_URL}` (private) | public `onrender.com` URL | n/a |
| Region | `blr` / Spaces `blr1` | not specified | n/a |
| Node version | not pinned in yaml | `24` | n/a |
| Secret naming | `JWT_SECRET` (api) | n/a | n/a |

**The web deploy target is ambiguous** (both DO and Render look production-shaped); the **AI backend clearly runs on Render** (URL hardcoded in [aiAuth.ts:17](src/lib/aiAuth.ts#L17), [render.yaml:27](render.yaml#L27)). Cannot be determined from the repo which web target is authoritative — **stated, not guessed.**

---

## 7. Environment Variables

### Frontend `process.env.*` (from `grep` over `app/ src/ proxy.ts next.config.mjs playwright.config.ts`)
`BACKEND_URL`, `CI`, `DO_SPACES_BUCKET`, `DO_SPACES_ENDPOINT`, `DO_SPACES_KEY`, `DO_SPACES_REGION`, `DO_SPACES_SECRET`, `EVIDENCE_MAX_FILE_MB`, `FILE_STORAGE_BACKEND`, `GMAIL_APP_PASSWORD`, `GMAIL_USER`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_AI_API_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_SITE_URL`, `NODE_ENV`, `STAGE_DOC_MAX_FILE_MB`. Plus `NEXTAUTH_URL` (read internally by NextAuth, set in [.env.example:22](.env.example#L22), not via `process.env` in app code).

### Backend `os.getenv(...)` (from `grep` over `backend/`)
`AI_AUTH_STRICT`, `DATABASE_URL`, `ENV`, `ENVIRONMENT`, `OPENAI_API_KEY`, `PINECONE_API_KEY`, `RENDER`, `SECRET_KEY`, `TAVILY_API_KEY`. Plus `ALLOWED_ORIGINS` (read in `backend/app/main.py` for CORS; `RENDER` is platform-injected, not app-set).

### Cross-reference vs deploy configs — flags
- **Read in code but set in NO config:** `NEXT_PUBLIC_AI_API_URL` ([aiAuth.ts](src/lib/aiAuth.ts)), `NEXT_PUBLIC_SITE_URL` ([src/constants/seo.ts](src/constants/seo.ts)), `NEXT_PUBLIC_APP_VERSION` ([support/RaiseTicketModal.tsx](src/modules/support/RaiseTicketModal.tsx)), `EVIDENCE_MAX_FILE_MB`, `STAGE_DOC_MAX_FILE_MB` — none appear in `.env.example`, `render.yaml`, or `.do/app.yaml`; they fall back to code defaults (e.g. file caps default to `"10"`).
- **Secret-name mismatch:** backend code reads **`SECRET_KEY`**; `.do/app.yaml` and `backend/.env.example` set **`JWT_SECRET`**. The configured value is ignored (AUDIT C-2).
- **Declared in `.env.example` but referenced nowhere in code:** `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ISSUER` — scaffolding only (grep finds them only in `.env.example`/docs).
- **`TAVILY_API_KEY`** is read by the backend ([ai_service.py](backend/app/ai_service.py)) and documented in `backend/.env.example`, but is **not** set in `.do/app.yaml` — web search silently degrades to model knowledge if unset.

---

## 8. Secrets & Credential Handling

- **Web app auth secret:** `NEXTAUTH_SECRET`, guarded at boot (throws if unset / placeholder / < 32 chars) — [app/api/auth/[...nextauth]/route.ts:20-30](app/api/auth/[...nextauth]/route.ts#L20).
- **AI backend JWT secret:** `SECRET_KEY` with a hardcoded dev fallback when not detected as production — [backend/app/routers/auth_router.py:32-52](backend/app/routers/auth_router.py#L32). If unset in production (RENDER/ENV) → refuses to boot; otherwise → insecure default. (AUDIT C-2.)
- **Passwords:** bcrypt everywhere — web via [src/lib/passwords.ts](src/lib/passwords.ts) (`BCRYPT_COST`) and `bcryptjs`; backend via `bcrypt` ([auth_router.py:92-96](backend/app/routers/auth_router.py#L92)). E-signature re-auth in [src/lib/signing.ts:33](src/lib/signing.ts#L33) (`verifyPasswordForSigning`, constant-time compare).
- **Committed secrets:** none — `git ls-files` tracks only `.env.example` and `backend/.env.example`; the real `.env` and `dev.db` are **untracked**.
- **Seed behavior** — [prisma/seed.ts](prisma/seed.ts): idempotent upserts that **refresh password hashes each run**. Creates: `super_admin` (password **`"1"`**, [line 30](prisma/seed.ts#L30)), demo `customer_admin` + tier-admin tenants (**`Admin@123`**, [lines 31/87](prisma/seed.ts#L31)), ~9 demo users (**`Demo@123`**, [line 229](prisma/seed.ts#L229)), plus sites, FDA-483/deviation/finding fixtures, regions, frameworks, and `PlanRoleLimit` defaults. **No environment guard** — the only `throw`/`process.exit` are a missing-fixture assertion ([line 285](prisma/seed.ts#L285)) and the catch handler ([line 1147](prisma/seed.ts#L1147)); it will run against whatever `DATABASE_URL` is set and performs destructive wipe-and-reseed of FDA-483/deviation data. (AUDIT H-1.)

---

## 9. File / Storage Handling

- **Backend abstraction:** [src/lib/fileStorage.ts](src/lib/fileStorage.ts) — `local` (filesystem) or `do-spaces` (S3 via `@aws-sdk/client-s3`), selected by `FILE_STORAGE_BACKEND`.
- **Local storage location:** files written under `path.join(process.cwd(), "uploads")` ([line 22](src/lib/fileStorage.ts#L22)) — **outside `./public`**, so not directly URL-reachable.
- **Path-traversal protection:** each key is `path.resolve`d against the base dir and rejected unless it stays within it ([lines 25-26](src/lib/fileStorage.ts#L25) — `if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) …`).
- **Serving:** only through the four authenticated, tenant-scoped download routes in §4 (never static). `Content-Disposition` uses `encodeURIComponent(filename)`; `Cache-Control: private`.
- **Size enforcement (server-side, independent of the 10 MB Server-Action `bodySizeLimit` in [next.config.mjs:34](next.config.mjs#L34)):** `EVIDENCE_MAX_FILE_MB` default 10 ([evidence.ts:27-28](src/actions/evidence.ts#L27), rejected at [line 346](src/actions/evidence.ts#L346)); `STAGE_DOC_MAX_FILE_MB` default 10 ([systems.ts:36-37](src/actions/systems.ts#L36), rejected at [line 1041](src/actions/systems.ts#L1041)).
- **Integrity:** evidence/stage-document rows store SHA-256 + `retainUntil` (+7yr) per the schema (§5).

---

## 10. Third-Party Integrations

- **OpenAI** (`openai==1.30.0`) — GPT-4o (lifecycle analysis, regulatory web chat), GPT-4o-mini (intent/general/RAG/DB-format), `text-embedding-3-small`, `whisper-1` (STT), `tts-1` (TTS). Key: `OPENAI_API_KEY`. Files: `backend/app/ai_service.py`, `backend/app/rag/rag_service.py`, `backend/app/routers/voice_router.py`, `backend/app/routers/capa_router.py` (+ stage routers).
- **Pinecone** (`pinecone>=5.0.0`) — vector store, index `glimmora-docs` (dim 1536, cosine, serverless aws/us-east-1). Key: `PINECONE_API_KEY`. File: `backend/app/rag/rag_service.py`. Degrades gracefully if absent.
- **Tavily** — live regulatory web search via raw `httpx` to `https://api.tavily.com/search`. Key: `TAVILY_API_KEY` (optional). File: `backend/app/ai_service.py`.
- **Gmail SMTP** (`nodemailer ^9.0.3`) — transactional mail + MFA OTP. Keys: `GMAIL_USER`, `GMAIL_APP_PASSWORD`. File: [src/lib/mailer.ts](src/lib/mailer.ts) (logs to console in dev if unset; throws in prod).
- **DigitalOcean Spaces** (S3 API via `@aws-sdk/client-s3 ^3.1046.0`) — production file storage. Keys: `DO_SPACES_ENDPOINT/REGION/KEY/SECRET/BUCKET`. File: [src/lib/fileStorage.ts](src/lib/fileStorage.ts).
- **Keycloak OIDC** — env vars scaffolded in [.env.example:45-48](.env.example#L45) but **not wired in code** (grep finds no reference). Not an active integration.
- **No** payment, analytics, error-monitoring (Sentry/Datadog), or queue integrations found anywhere in the tree.

---

*Method note: enumerations were generated by globbing `app/api/**/route.ts` and `src/actions/**/*.ts`, and grepping `^model` in the schema, `@router.*` decorators + `__tablename__` in the backend, and `process.env.*` / `os.getenv` across the tree. Version numbers are from `package.json`, `backend/requirements.txt`, and `backend/runtime.txt`. Deploy configs, auth files, signing, storage, and seed were read in full. Two items are explicitly undetermined from the repo: (a) which web deploy target is authoritative, and (b) the AI backend's own Render service config (not in this repo).*
