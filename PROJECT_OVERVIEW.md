# Glimmora Pharma — Project Overview

> Generated from a direct read of the codebase (branch `devAI`). Where something is missing, stale, or inconsistent, it is flagged as a **Note** rather than assumed.

---

## 1. Project Summary

**Glimmora Pharma** is a multi-tenant, AI-assisted **pharmaceutical Quality Management System (QMS)** built for regulated (GxP / 21 CFR Part 11) environments. It gives pharma companies a single platform to run their compliance lifecycle: CAPA (Corrective and Preventive Actions), deviations, gap assessments, FDA 483 / Warning Letter responses, computer system validation (CSV/CSA), change control, inspection readiness, and governance — each wrapped in an audit trail and, where regulation demands it, a Part 11 electronic-signature ledger. It is organized around a strict tenant model: each customer (a `Tenant`) has its own users, sites, subscription plan, regulatory region, and fully isolated data.

The platform layers AI on top of that compliance core. A separate FastAPI service provides a RAG-grounded assistant, natural-language querying of the tenant's own records, live regulatory web search, voice (speech-to-text / text-to-speech), and per-stage AI analysis (e.g. semantic CAPA recurrence detection, auto-drafted FDA 483 responses). The main use case is a regulated pharma organization managing its quality and compliance obligations end-to-end, with AI accelerating the investigation, drafting, and analysis work that would otherwise be manual — while every consequential action stays traceable and e-signable for inspection.

---

## 2. Tech Stack

### Frontend / web app (repository root)
| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack in dev) | `^16.2.4` (running 16.2.10) |
| UI runtime | React / React DOM | `^19.2.5` |
| Language | TypeScript | `~5.9.3` (target ES2023) |
| Auth | NextAuth (Credentials + email-OTP MFA) | `^4.24.14` |
| ORM / DB client | Prisma / `@prisma/client` | `^6.19.3` |
| State | Redux Toolkit + react-redux | `^2.11.2` / `^9.2.0` |
| Server-state | TanStack React Query | `^5.90.21` |
| Forms / validation | react-hook-form + `@hookform/resolvers` + Zod | `^7.71.2` / `^5.2.2` / `^4.3.6` |
| Styling | Tailwind CSS v4 (CSS-first config) | `^4.2.1` |
| Charts | Recharts | `^3.8.0` |
| Icons | lucide-react | `^0.577.0` |
| Email | nodemailer | `^9.0.3` |
| Hashing | bcryptjs | `^3.0.3` |
| File storage | `@aws-sdk/client-s3` (→ DigitalOcean Spaces) | `^3.1046.0` |
| Dates | dayjs | `^1.11.20` |

### AI backend (`backend/`, Python)
| Layer | Technology | Version |
|---|---|---|
| Runtime | Python | 3.12.7 (`runtime.txt`) |
| Framework | FastAPI | `==0.115.0` |
| Server | uvicorn[standard] | `==0.30.6` |
| ORM | SQLAlchemy (2.0 declarative) | `==2.0.36` |
| LLM SDK | openai (GPT-4o / 4o-mini / embeddings / Whisper / TTS) | `==1.30.0` |
| Vector DB | pinecone | `>=5.0.0` |
| Web search | Tavily (called via raw `httpx`) | `httpx ==0.27.2` |
| PDF / DOCX extract | pypdf / python-docx | `==4.0.0` / `==1.1.0` |
| Auth | PyJWT + bcrypt | `==2.8.0` / `==4.2.0` |
| Validation | pydantic | `==2.8.2` |
| Postgres driver | psycopg2-binary | `>=2.9.9` |

**Note:** the backend implements RAG directly against the OpenAI + Pinecone SDKs — **no LangChain**. Tavily has no SDK dependency; it's a raw REST call.

### Database, build, runtime
- **Database:** SQLite in **all** environments (dev: `prisma/dev.db`). `datasource provider = "sqlite"`; `migration_lock.toml` pins `sqlite`. The `.env.example` and CLAUDE.md mention a PostgreSQL path, but schema comments state the Postgres migration was deferred/abandoned. The FastAPI side uses its own SQLAlchemy DB (`DATABASE_URL`, default `sqlite:///./glimmora.db`), separate from Prisma's.
- **No caching layer or message queue** is present (no Redis, no queue). React `cache()` provides request-level read memoization only.
- **Package manager:** npm (`package-lock.json`; `.npmrc` sets `legacy-peer-deps=true`). No pnpm/yarn lockfiles.
- **Build tools:** Next.js (Turbopack dev / `next build`), Prisma CLI, `tsx` for TS scripts, ESLint 9 flat config, Playwright for tests.

### Hosting / deployment
Three overlapping deploy targets are checked in (no Dockerfile / docker-compose):
- **DigitalOcean App Platform** (`.do/app.yaml`, region `blr`) — the most complete: a PRE_DEPLOY Prisma `migrate` job, a Python `api` service (uvicorn), and a Next.js `web` service wired to the API over DO's private network (`BACKEND_URL=${api.PRIVATE_URL}`), with DO Spaces for files.
- **Render** (`render.yaml`) — single Node web service with a persistent 1 GB disk holding the SQLite file + uploads; `prisma db push` on every boot; local file storage. The public AI backend is referenced at `https://pharma-glimmora-ai-backend.onrender.com/api`.
- **Vercel** (`vercel.json`) — minimal (`{ "framework": "nextjs" }`).

---

## 3. Architecture & Components

**Overall shape: a three-part system.**

1. **Next.js full-stack web app** (repo root) — the product. Not a thin client: it holds the compliance domain logic in **Server Actions** (writes) and **cached Prisma queries** (reads), talking directly to the SQLite database via Prisma.
2. **FastAPI AI service** (`backend/`) — a standalone Python app for all AI/LLM work, with its **own** SQLAlchemy database and JWT auth. The browser never calls it directly.
3. **SQLite database** — the compliance system of record, driven by Prisma.

The web app reaches the AI service only through a **same-origin, session-authenticated proxy** (`app/api/ai-proxy/[...path]/route.ts`), keeping the AI backend off the public path and the browser session out of the AI backend.

### Key directories

**Repository root**
- `app/` — Next.js App Router: pages, layouts, and thin API route handlers.
- `src/` — the application code (see below).
- `prisma/` — `schema.prisma`, migrations, `seed.ts`, role-limit seeders.
- `backend/` — the FastAPI AI service (self-contained Python app).
- `scripts/` — operational TS scripts: `dev-api.mjs` (cross-platform uvicorn launcher), a mailer smoke test, and ~15 one-off `backfill-*` / `probe-*` data-migration scripts.
- `tests/` — Playwright specs.
- `docs/` — the real documentation set (see the README note in §5); `docs/handover/` is the canonical, current handover.

**`app/` (App Router)**
- **Route group `(app)`** — the customer/compliance app, guarded by `requireAuth()`; `super_admin` is redirected to `/admin`. Pages: dashboard, `capa`, `deviation`, `gap-assessment`, `fda-483`, `csv-csa`, `change-control`, `evidence`, `audit-trail`, `governance`, `inspection`, `readiness`, `regulatory-intelligence`, `settings`, `support`, `worklist`, plus AI surfaces (`agi-console`, `ai-capa`, `ai-policy`, `ai-tools`).
- **Route group `(admin)`** — the platform `super_admin` console under `/admin`: customer accounts, per-customer detail, platform audit, frameworks, regions, subscription-plan settings.
- **`app/api/`** — thin route handlers (business logic lives in Server Actions): NextAuth catch-all, `auth/me`, the AI proxy, and authenticated tenant-scoped file-download routes (`documents/[id]`, `evidence/files/[id]`, `findings/[id]/evidence`, `stage-documents/[id]`).

**`src/`**
- `src/actions/` — **Server Actions** (`"use server"`), the primary write layer (~40 files; `capas/` is split by lifecycle stage). Each mutation: auth → role gate → Zod validate → Prisma write → **`auditLog()`** → `revalidatePath()`.
- `src/lib/queries/` — **cached reads** (19 domain files), each wrapped in React `cache()`, tenant-scoped, and soft-delete-aware. No side effects, never writes audit rows.
- `src/lib/` — shared server/utility code: `auth.ts`, `authz.ts`, `prisma.ts`, `signing.ts` (Part 11 primitives), `otp.ts`, `mailer.ts`, `fileStorage.ts` (S3/local), plans/role-limits, `permissions/`, and the `ai*` client wrappers (`aiChat`, `aiData`, `aiSearch`, `aiAuth`, `aiBackend`).
- `src/modules/` — feature UIs, one folder per feature (the bulk of the app; see §4 module list).
- `src/components/` — shared UI: `ui/` design-system primitives, `shared/` (DataTable, StatCard, uploads, plan/role widgets), `layout/` (AppShell, Sidebar, Topbar), `auth/`, `chatbot/AIChatbot`, `search/`, `errors/`, and `Providers.tsx`.
- `src/store/` — Redux Toolkit store with ~14 slices (auth, settings, theme, findings, capa, evidence, raid, permissions, notifications, readiness, deviation, systems, frameworks, regions) + localStorage persistence middleware.
- `src/schemas/`, `src/constants/`, `src/types/`, `src/hooks/` — shared Zod schemas, domain constants, types, and typed hooks.

**`backend/app/`**
- `main.py` — FastAPI app, CORS, registers 11 routers; `Base.metadata.create_all` on startup.
- `routers/` — `auth`, `audit`, `user` (placeholder stub), the six CAPA-lifecycle routers (`capa`, `rca`, `action_plan`, `monitoring`, `effectiveness`, `closure`), `ai` (the assistant), `voice`.
- `ai_service.py` — the assistant orchestrator (intent routing → DB / RAG / web / general).
- `ai_db_handler.py` — natural-language → tenant-filtered SQLAlchemy queries (keyword-routed, **not** LLM-generated SQL).
- `rag/` — Pinecone + OpenAI-embeddings RAG (`rag_service.py`) and the seed corpus (`dummy_docs.py`).
- `models/capa_model.py`, `schemas/capa_schema.py`, `database/db.py` — ORM, Pydantic schemas, DB session.

### How components connect
Browser → Next.js (Server Components/Actions read/write SQLite via Prisma) for all compliance data. For AI, the browser calls the same-origin proxy → FastAPI → OpenAI/Pinecone/Tavily. The two databases (Prisma SQLite and the FastAPI SQLAlchemy DB) are **separate stores**; the AI backend is tenant-aware via a `customer_id` claim in its own JWT.

---

## 4. Data Flow

### A. A compliance write — signing and closing a CAPA (representative)
Traced from `src/actions/capas/closure.ts` (`signAndCloseCAPA`):
1. **Entry** — user submits the sign-and-close form; the Server Action runs on the server.
2. **AuthN/AuthZ** — `requireAuth()` → role gate (`CAPA_CLOSE_ROLES`) + `gxpSignatory` check + `requireGxPAuthor()` → resolve the authoritative actor FK via `resolveUserFk()`.
3. **State gates** — CAPA must be `pending_qa_review`; action items complete; approvals satisfied; no unresolved concern comments.
4. **Re-authentication** — `verifyPasswordForSigning()` (bcrypt, constant-time). Failure writes a `SIGNING_PASSWORD_FAILED` audit row and stops with zero side effects.
5. **Sign** — build canonical JSON of the record state → SHA-256 hash → inside `prisma.$transaction`: mint a `CAPA_CLOSURE` **SignedRecord**, set `CAPA.status="closed"`, and link `closureSignatureId` atomically.
6. **Cascade & record** — close the linked Finding, unblock the linked Deviation; write **two** AuditLog rows (`CAPA_CLOSED` + `CAPA_CLOSURE_SIGNED` pointing at the SignedRecord id); fire a fault-isolated `notify()`; `revalidatePath()`.
7. **Response** — returns a discriminated `ActionResult` (`{success:true,data}` | `{success:false,error}`); the revalidated Server Component re-renders.

### B. A compliance read
Server Component / layout calls a `src/lib/queries/*` function (e.g. `getCAPAs(tenantId)`), which is `cache()`-memoized, always filters `tenantId` + `deletedAt: null`, and returns typed data straight from Prisma. No audit side effects.

### C. An AI request — the assistant
1. Browser client (`src/lib/aiChat.ts` / `AIChatbot.tsx`) POSTs to `/api/ai-proxy/api/ai/chat`.
2. The proxy (`app/api/ai-proxy/[...path]/route.ts`) requires a valid NextAuth session (else 401), allowlists only `api/ai/*` and `api/v1/*`, forwards **only** `content-type`, `accept`, and the AI backend's own `auth` JWT — dropping cookies/session — to `BACKEND_URL`.
3. FastAPI `ai_router` → `ai_service.chat()`: rewrite follow-ups with context (`gpt-4o-mini`) → classify intent → route to **DB_QUERY** (tenant-filtered SQLAlchemy via `ai_db_handler`), **RAG_SEARCH** (Pinecone top-k + `gpt-4o-mini` grounded answer), **WEB_SEARCH** (Tavily + `gpt-4o` cited answer), or **GENERAL** chat.
4. Response streams back through the proxy to the browser.

### External APIs / integrations
- **OpenAI** — GPT-4o (lifecycle analysis, regulatory web chat), GPT-4o-mini (intent/general/RAG/DB-formatting), `text-embedding-3-small`, `whisper-1` (STT), `tts-1` (TTS).
- **Pinecone** — vector store (index `glimmora-docs`, dim 1536, cosine, serverless aws/us-east-1); RAG degrades gracefully if absent.
- **Tavily** — optional live regulatory web search; degrades to model knowledge if unset.
- **Gmail SMTP** (nodemailer) — transactional mail + MFA OTP delivery.
- **DigitalOcean Spaces** (S3 API) — file storage in production.

---

## 5. Key Files & Entry Points

### Entry points
- **Web dev:** `next dev --turbopack` (via `npm run dev:web`), or `npm run dev` which also launches the API through `scripts/dev-api.mjs`. Root layout: `app/layout.tsx` (wraps everything in `Providers`).
- **Web prod:** `next build` → `next start`.
- **AI backend:** `backend/app/main.py` → `uvicorn app.main:app` (port 8000 dev / 8080–8443 in deploy configs). `scripts/dev-api.mjs` is the cross-platform uvicorn launcher (spawns `backend/.venv/Scripts/uvicorn.exe` on Windows).
- **Auth handler:** `app/api/auth/[...nextauth]/route.ts` (NextAuth `authOptions`, JWT strategy, 8h sessions, dual-table Credentials `authorize()` + OTP MFA). Server helpers in `src/lib/auth.ts`.
- **AI proxy:** `app/api/ai-proxy/[...path]/route.ts`.
- **Edge/middleware:** `proxy.ts` (root) — edge auth/tenant enforcement.

### Config files
- `next.config.mjs` — React strict mode; browser-log forwarding; image optimization; **`experimental.serverActions.bodySizeLimit: "10mb"`** (raised for pharma PDF uploads); security headers (HSTS, `X-Frame-Options`, `Permissions-Policy: microphone=(self)` for AI voice); `/api/auth/signin → /login` redirect.
- `tsconfig.json` — strict, ES2023, `moduleResolution: bundler`, path alias `@/* → ./src/*`.
- `eslint.config.js` — flat config (JS + typescript-eslint + react-hooks recommended); deliberately disables two React-19/Compiler rules.
- `postcss.config.ts` — single `@tailwindcss/postcss` plugin. **No `tailwind.config.*`** — Tailwind v4 is configured CSS-first in `src/index.css`.
- `playwright.config.ts` — `tests/`, single worker, auto-starts `npm run dev`, waits on `/login`.
- `prisma/schema.prisma` — `prisma-client-js` generator, `sqlite` datasource.
- Deployment: `.do/app.yaml`, `render.yaml`, `vercel.json`; CI: `.github/workflows/ci.yml`.

### Important models / schemas
- **`Tenant`** — aggregate root; nearly every model carries `tenantId` with `onDelete: Cascade`. Holds credentials, `role`, `regulatoryRegion`, MFA, `sessionsValidAfter`, soft-delete lifecycle.
- **`Plan`** — 1:1 with Tenant; subscription tier with **frozen caps** (`maxUsers`, `maxSites`, `minRetentionYears`, `durationMonths`, derived `expiryDate`).
- **`User`** — a person inside a tenant (distinct from the Tenant admin login row); `role`, `gxpSignatory`, `siteId`; unique per `(tenantId, email)` / `(tenantId, username)`.
- **`SignedRecord`** — the **Part 11 e-signature ledger**: a polymorphic, append-only table keyed by `(recordType, recordId)`, capturing who signed, signature meaning (§11.50), a SHA-256 content hash, and password-verification timestamp (§11.200). Referenced by nullable 1:1 FKs on CAPA/Deviation/FDA483Event/Document/CAPAApproval/ChangeControl. `recordType` values include `CAPA_APPROVAL`, `CAPA_CLOSURE`, `CAPA_VERIFICATION`, `FDA483_RESPONSE`, `DEVIATION_CLOSURE`, `CHANGE_CONTROL_TRANSITION`, `CSV_VALIDATION_SIGNOFF`, etc.
- **`AuditLog`** — central compliance trail: tenant-scoped, soft-linked to records by `module` + `recordId` (no FK), cross-referencing SignedRecord ids. Paired with every mutation.
- Domain models by area: Gap Assessment (`Finding`, append-only `FindingEdit`/`FindingMessage`), CAPA (`CAPA`, `CAPAActionItem`, `CAPAApproval`, `CAPAComment`, `CAPAEffectivenessCriterion`, `CAPADocument`), Deviation (`Deviation`, `DeviationTask`), FDA 483 (`FDA483Event` with AI `agiDraft`, `FDA483Observation`, `FDA483Commitment`), CSV/CSA (`GxPSystem`, `ValidationStage`, `StageDocument`, `RTMEntry`, `RoadmapActivity`), Evidence (`Document`, `EvidenceItem`, `EvidenceNoteVersion`, `EvidenceFile`), Change Control (`ChangeControl`, `CAPAChangeControlLink`), Governance/Readiness (`RAIDItem`, `Inspection`, `ReadinessAction`, `Simulation`, `Playbook`, `TrainingRecord`), platform (`RegulatoryRegion`, `Framework`, `FrameworkRegion`, `TenantFramework`, `PlanRoleLimit`, `TenantRoleLimit`), and support/auth (`EmailOTP`, `Notification`, `Ticket`/`TicketMessage`/`TicketActivity`).
- **Signing pipeline:** `src/lib/signing.ts` — `verifyPasswordForSigning()` → `canonicalJson()` per-surface builders → `computeContentHash()` (SHA-256) → `createSignedRecord()` (or transactional `tx.signedRecord.create`).
- **Design conventions:** no native DB enums (all "enums" are Zod-validated `String`s); soft-delete + append-only tables + `retainUntil` (+7yr) retention floors reflect the ALCOA+ / Part 11 posture.

**Note (no native AI table):** AI output is stored as columns on domain rows (e.g. `FDA483Event.agiDraft`), not in a dedicated table.

---

## 6. Setup & Run

### Prerequisites
- Node.js (deploy configs use 20/24), npm, and — for the AI backend — Python 3.12 with a virtualenv at `backend/.venv`.

### Frontend (web app)
```bash
npm install
npx prisma generate
npx prisma migrate dev      # or: npx prisma db push   (applies schema to dev.db)
npm run db:seed             # seed demo tenants, users, sites, CAPA/deviation/483 fixtures
npm run dev:web             # web only  (or: npm run dev  for web + AI backend together)
```
App runs at `http://localhost:3000`. Seeded logins include `superadmin@glimmora.com` / `1` (super_admin) and `admin@pharmaglimmora.com` / `Admin@123` (customer_admin); demo users use `Demo@123`.

**Key npm scripts:** `dev` (web + api), `dev:web`, `dev:api`, `build`, `start`, `lint`, `db:migrate`, `db:seed`, `db:studio`, `db:reset`, `test` / `test:smoke` (Playwright), `test:mailer`.

### AI backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
uvicorn app.main:app --port 8000  # or run via  npm run dev:api  from the root
python -m app.rag.dummy_docs      # one-time: seed the Pinecone RAG corpus (needs PINECONE_API_KEY)
```

### Testing
- `npm run test:smoke` runs Playwright specs in `tests/` (auto-starts the app). CI (`.github/workflows/ci.yml`) runs lint → `tsc --noEmit` → build, then a seeded smoke job on Chromium.

### Environment variables

**Frontend** (`.env` / `.env.local`; template in `.env.example`):
`DATABASE_URL`, `NEXTAUTH_SECRET` (≥32 bytes; prod refuses to boot with the placeholder), `NEXTAUTH_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NEXT_PUBLIC_API_URL`, `BACKEND_URL`, `NEXT_PUBLIC_AI_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_VERSION`, `FILE_STORAGE_BACKEND` (`local` | `do-spaces`), `DO_SPACES_ENDPOINT/REGION/KEY/SECRET/BUCKET`, `EVIDENCE_MAX_FILE_MB`, `STAGE_DOC_MAX_FILE_MB`.

**Backend** (`backend/.env.example`): `DATABASE_URL`, `OPENAI_API_KEY` (required), `PINECONE_API_KEY` (optional — enables RAG), `TAVILY_API_KEY` (optional — enables web search), `ALLOWED_ORIGINS`, `SECRET_KEY` (JWT signing), plus `ENV` / `ENVIRONMENT` / `RENDER` / `AI_AUTH_STRICT` for production auth strictness.

---

## Notes, gaps & inconsistencies found

These are real observations from the code, surfaced rather than smoothed over:

- **No root `README.md`** — `CLAUDE.md` links to `./README.md`, but it does not exist. The real documentation lives in `docs/` (canonical: `docs/handover/`). Root `HANDOVER.md` is explicitly marked **stale**.
- **Backend secret-name mismatch** — the code reads `SECRET_KEY` (`backend/app/routers/auth_router.py`), but `backend/.env.example` and `.do/app.yaml` define `JWT_SECRET`. These names don't match; JWT auth will fall back to an insecure dev default if only `JWT_SECRET` is set.
- **Keycloak env vars are scaffolding only** — `KEYCLOAK_CLIENT_ID/SECRET/ISSUER` appear in `.env.example` but are **not referenced anywhere in code**.
- **Two separate databases** — the Prisma SQLite store (compliance system of record) and the FastAPI SQLAlchemy DB are distinct; the AI backend does not read Prisma data directly, only what it's given per request (tenant-scoped by `customer_id`).
- **SQLite everywhere** — despite Postgres references in `.env.example`/CLAUDE.md/CI comments, the Postgres migration is deferred; the schema and lockfile are SQLite for all environments.
- **Three overlapping deploy configs** (`.do/app.yaml`, `render.yaml`, `vercel.json`) with **different DB/storage strategies** (DO: migrate job + Spaces; Render: persistent-disk SQLite + `db push` + local files). Confirm which is the live target before deploying.
- **`user_router.py` is a non-functional placeholder** returning a static message.
- **No Dockerfile / docker-compose**, no Redis/queue, and no backend test suite.
- **Phase-A role limits are inert** — `PlanRoleLimit` / `TenantRoleLimit` tables exist and seed defaults, but the resolver (`TenantRoleLimit → PlanRoleLimit → unlimited`) is not yet enforcing per-role caps end-to-end.
