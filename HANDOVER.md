# Technical Handover — Glimmora Pharma

> **Audience:** A developer picking up this codebase with no prior context.
> **Date prepared:** 2026-06-26 · **Branch:** `devAI` (this is the active/deploy branch, *not* `main`).
> **Basis:** This document is derived from the actual source tree. Where the
> committed `README.md` disagrees with the code, the code wins and the
> discrepancy is called out. Anything not determinable from the repo is marked
> **“not determinable from the codebase.”**

---

## 1. Overview & Purpose

**Glimmora Pharma** is a **multi-tenant GxP / GMP inspection-readiness SaaS** for
pharma and biotech companies. It helps quality and regulatory teams run their
compliance programs and stay inspection-ready against **21 CFR 210/211/11**,
**EU GMP Annex 11/15**, **ICH Q9/Q10**, **GAMP 5**, **WHO GMP**, and **MHRA**
guidelines.

Each pharma customer is a **tenant** with its own users, sites, and records.
The product is organized into a set of GxP workflow modules: Gap Assessment,
CAPA, Deviations, FDA 483 handling, CSV/CSA (computer-system validation),
Change Control, Evidence/Documents, Inspection Readiness, Governance (RAID),
Audit Trail, plus an **AI assistant layer** (chat, voice, RCA/CAPA generation,
regulatory intelligence) backed by a separate Python service.

The defining engineering characteristic is **21 CFR Part 11 compliance**:
append-only audit logging on every mutation, immutable e-signature ledger
(`SignedRecord`), soft-delete (records and files are never physically removed),
content-hash binding of signatures to record state, and segregation-of-duties
(SoD) enforcement across review/approval/verification steps.

---

## 2. Current Status

**Overall: a feature-rich, actively-developed application that runs locally on
SQLite. It is largely functional but carries notable “local-dev shortcut” tech
debt that blocks a clean production (PostgreSQL) deploy.**

What's working / present:
- ~20 feature modules with real server-backed CRUD, most complete (see §7).
- Full auth: NextAuth Credentials + tenant-level email-OTP MFA + subscription gating.
- Part 11 machinery: audit logs, `SignedRecord` e-signature ledger, soft-delete,
  SoD guards, reference-code generation, file storage abstraction.
- A separate **FastAPI AI backend** (OpenAI GPT-4o + Pinecone RAG + Whisper/TTS voice).
- CI pipeline (lint + typecheck + build + Playwright smoke) on GitHub Actions.
- Deploy specs for **DigitalOcean App Platform** (`.do/app.yaml`) and **Render** (`render.yaml`).

What is **not** production-clean (see §13 for detail):
- Prisma datasource is hard-set to `sqlite` in `schema.prisma` with “DO NOT
  COMMIT” warnings — but it **is** committed. Prod is supposed to be Postgres.
- **Migration drift:** the Support module's tables (`Ticket`, `TicketMessage`,
  `TicketActivity`) exist in `schema.prisma` but have **no migration** — only
  `prisma db push` would create them. `prisma migrate deploy` (used by CI and
  the DO pre-deploy job) would not.
- The committed `README.md` is stale (describes a Pages-Router auth route, a
  Vite→Next migration, and Vercel deploy — none of which match current code).

---

## 3. Tech Stack (with versions from manifests)

### Frontend / Web app (`package.json`)
| Area | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack dev) | `^16.2.4` |
| Language | TypeScript | `~5.9.3` |
| UI runtime | React / React-DOM | `^19.2.5` |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | `^4.2.1` |
| Icons / charts | lucide-react `^0.577.0`, recharts `^3.8.0` | |
| Forms | react-hook-form `^7.71.2` + `@hookform/resolvers` `^5.2.2` + zod `^4.3.6` | |
| Client state | Redux Toolkit `^2.11.2` + react-redux `^9.2.0` | |
| Data fetching (client) | `@tanstack/react-query` `^5.90.21` | |
| Auth | next-auth `^4.24.14` | |
| ORM | Prisma + `@prisma/client` | `^6.19.3` |
| Email | nodemailer `^8.0.6` (Gmail SMTP) | |
| Hashing | bcryptjs `^3.0.3` | |
| Object storage | `@aws-sdk/client-s3` `^3.1046.0` (DigitalOcean Spaces) | |
| Dates | dayjs `^1.11.20` | |
| Audio (client) | `@sapphi-red/web-noise-suppressor` `^0.3.5` (voice assistant) | |
| Tests | `@playwright/test` `^1.59.1` | |
| Tooling | ESLint `^9.39.4`, typescript-eslint `^8.56.1`, tsx `^4.21.0`, concurrently `^9.2.1`, dotenv `^17.4.2` | |

### AI backend (`backend/requirements.txt`, `runtime.txt`)
| Package | Version |
|---|---|
| Python | 3.12.7 |
| fastapi | 0.115.0 |
| uvicorn[standard] | 0.30.6 |
| sqlalchemy | 2.0.36 |
| openai | 1.30.0 |
| pinecone | >=5.0.0 |
| pydantic | 2.8.2 |
| pypdf 4.0.0 / python-docx 1.1.0 | (document text extraction) |
| PyJWT 2.8.0 / bcrypt 4.2.0 / python-multipart 0.0.9 | |
| psycopg2-binary | >=2.9.9 |

### Databases
- **Web app:** Prisma → **SQLite** in dev (`prisma/dev.db`); intended **PostgreSQL** in prod.
- **AI backend:** its **own** SQLAlchemy database (separate from Prisma) — SQLite in dev, Postgres in prod via `DATABASE_URL`.

### External services / APIs
- **OpenAI** — GPT-4o (CAPA recurrence), GPT-4o-mini (intent/chat/RAG), `text-embedding-3-small`, `whisper-1` (STT), `tts-1` (TTS).
- **Pinecone** — serverless vector store, index `glimmora-docs`, for RAG.
- **Gmail SMTP** — transactional/OTP email via App Password.
- **DigitalOcean Spaces** (S3-compatible) — file storage in prod.
- **Keycloak OIDC** — env vars present (`KEYCLOAK_*`) but optional/disabled; integration not confirmed wired in code.

---

## 4. Architecture

Two deployable services plus managed infrastructure:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser (React 19 client islands; Redux for ephemeral UI + config mirror) │
└───────────────┬───────────────────────────────────┬──────────────────────┘
                │ HTML + Server Actions              │ (browser → AI, public URL)
                ▼                                     │
┌──────────────────────────────────────────┐         │
│  Next.js 16 "web" service                 │         │
│   • App Router Server Components (reads)   │         │
│   • Server Actions (writes + auditLog)     │         │
│   • proxy.ts (edge auth gate)              │         │
│   • Prisma 6 → SQLite/Postgres             │         │
│   • /api/ai-proxy/[...path] ──────────────┼─────────┘ (server → AI, PRIVATE network)
│   • /api/{documents,evidence,...} (files)  │
└───────────────┬───────────────────────────┘
                │ Prisma                               ┌─────────────────────────┐
                ▼                                       │ FastAPI "api" service    │
        ┌───────────────┐                               │  • OpenAI GPT-4o / mini  │
        │ Prisma DB     │                               │  • Pinecone RAG          │
        │ (Postgres/    │                               │  • Whisper STT / TTS     │
        │  SQLite)      │                               │  • own SQLAlchemy DB     │
        └───────────────┘                               └─────────────────────────┘
        ┌───────────────┐
        │ File storage  │  local ./uploads  OR  DigitalOcean Spaces (S3)
        └───────────────┘
```

Key architectural conventions:
- **Reads** = React `cache()`-wrapped Prisma queries in `src/lib/queries/` (deduped per request).
- **Writes** = `"use server"` Server Actions in `src/actions/`, each returning an
  `ActionResult` (`{ success: true, data } | { success: false, error }`, never throws)
  and paired with an `auditLog` row. Complex flows use `prisma.$transaction()` so
  the mutation + `SignedRecord` + audit commit atomically.
- **Auth surface:** two storage tables — `Tenant` rows hold `super_admin` and each
  `customer_admin`; `User` rows hold tenant-scoped staff roles. `session.user.id`
  may therefore be a Tenant id *or* a User id; `resolveUserFk()` reconciles this.
- **Defense in depth:** `proxy.ts` (Next 16's renamed middleware) gates routes at
  the edge; pages still call `requireAuth()`; id-scoped mutations re-check tenant
  ownership (IDOR defense).
- **AI isolation:** the browser never calls FastAPI for privileged work — Next.js
  proxies via `/api/ai-proxy/*` over DigitalOcean's private network and allowlists
  only `api/ai/*` and `api/v1/*` paths.

---

## 5. Folder / File Structure (annotated)

```
Glimmora-Pharma/
├── app/                              # Next.js App Router
│   ├── (app)/                        # Authenticated tenant routes (layout enforces auth + subscription)
│   │   ├── page.tsx                  #   / — Dashboard
│   │   ├── capa/ , capa/[id]/        #   CAPA tracker + detail
│   │   ├── deviation/ gap-assessment/ evidence/ csv-csa/ (+ systems/[reference])
│   │   ├── fda-483/ readiness/ governance/ audit-trail/ worklist/ settings/
│   │   ├── support/ , support/[id]/  #   Support tickets (newest module)
│   │   ├── inspection/               #   STUB — "coming soon" (data layer exists, UI not built)
│   │   ├── agi-console/ ai-capa/[capaId]/ ai-policy/ ai-tools/   # AI surfaces
│   │   ├── change-control/ regulatory-intelligence/
│   │   └── (most routes have loading.tsx + error.tsx)
│   ├── (admin)/admin/                # Super-admin + customer-admin console
│   │   ├── page.tsx (customer accounts), customer/[id]/, audit/, settings/
│   │   └── support/ , support/[id]/  #   Platform-wide support queue
│   ├── login/  site-picker/  docs/[slug]/   # Public sign-in, post-login site selector, help docs
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # NextAuth handler (App Router — see §6)
│   │   ├── auth/me/route.ts             # Session reader
│   │   ├── ai-proxy/[...path]/route.ts  # Same-origin proxy to FastAPI (allowlisted)
│   │   ├── documents/[id]/route.ts      # Authenticated file download (tenant-scoped, soft-delete aware)
│   │   ├── evidence/files/[id]/route.ts # CAPA evidence file download
│   │   ├── stage-documents/[id]/route.ts# CSV/CSA stage document download
│   │   └── findings/[id]/evidence/route.ts # Gap finding evidence (inline preview)
│   └── layout.tsx                    # Root layout (theme bootstrap, Providers, metadata noindex)
├── proxy.ts                          # Edge auth gate (Next 16 "proxy" = old middleware.ts)
├── backend/                          # FastAPI AI service (separate app + own DB) — see §6/§9
│   └── app/{main.py, ai_service.py, ai_db_handler.py, database/, models/, schemas/, rag/, routers/}
├── prisma/
│   ├── schema.prisma                 # 43 models (provider hard-set to sqlite — see §13)
│   ├── migrations/                   # ONLY 2: _init + _notifications (DRIFTED — see §13)
│   ├── seed.ts                       # Baseline tenants/users/sites
│   └── dev.db                        # SQLite (committed despite .gitignore intent)
├── src/
│   ├── modules/                      # ~20 feature modules (UI + view logic) — see §7
│   ├── actions/                      # Server Actions (writes); capas/ is a sub-folder of files
│   ├── lib/
│   │   ├── prisma.ts auth.ts mailer.ts otp.ts passwords.ts
│   │   ├── signing.ts                # Part 11 e-signature pipeline (canonicalize → hash → SignedRecord)
│   │   ├── fileStorage.ts            # local | do-spaces backend abstraction
│   │   ├── plans.ts capa-approvals.ts capa-readiness.ts evidence-lock.ts reference.ts notify.ts
│   │   ├── permissions/roleSets.ts   # Canonical role authorization (shared client+server)
│   │   ├── queries/                  # Cached Prisma reads (React.cache)
│   │   └── mappers/                  # Prisma row → Redux/app shape adapters
│   ├── store/                        # Redux slices (auth, settings, theme, notifications, per-module)
│   ├── hooks/  components/{ui,shared,auth,layout}/  types/  schemas/  constants/
├── scripts/
│   ├── dev-api.mjs                   # Cross-platform uvicorn launcher (Windows-safe)
│   ├── test-mailer.ts                # Mailer smoke test
│   └── backfill-*.ts (14 files)      # One-off data backfills (references, FKs, status casing, etc.)
├── tests/                            # Playwright specs (smoke + AI feature specs) — see §10
├── docs/                             # SOW, gap analysis, user manuals, AI testing manuals, audits
├── .github/workflows/ci.yml          # CI: lint, typecheck, build, Playwright smoke
├── .do/app.yaml                      # DigitalOcean App Platform spec (api + web + migrate job)
├── render.yaml                       # Render blueprint (single web service, SQLite on disk)
├── vercel.json                       # { "framework": "nextjs" } (legacy; not the active target)
├── next.config.mjs                   # Headers, 10MB serverActions body limit, image opt
├── .env.example                      # Documented env vars (see §11)
├── oapi.tmp.json                     # Temp OpenAPI dump (FastAPI) — stray file, safe to remove
├── shadow.db                         # Stray SQLite shadow DB in repo root — safe to remove
└── *.png (≈25 screenshots in root)   # Dev screenshots committed to root — clutter
```

---

## 6. Workflow & Data Flow

### A read request (e.g. open `/capa`)
1. `proxy.ts` runs at the edge: decodes the NextAuth JWT (`getToken`). No token →
   redirect `/login?callbackUrl=…` (pages) or `401` (APIs). Role gating: `/admin/*`
   requires `super_admin`/`customer_admin`; `super_admin` is bounced *out* of non-admin pages.
2. The Server Component page calls `requireAuth()` → session (with `tenantId`).
3. It calls a cached query from `src/lib/queries/` (e.g. `getCAPAs(tenantId)`),
   scoped by `session.user.tenantId`.
4. HTML renders server-side; interactive bits hydrate as client islands; Redux
   holds ephemeral UI state (and, in a few transitional modules, a config mirror).

### A write request (e.g. create a CAPA)
1. Client island calls a Server Action in `src/actions/`.
2. Action: `requireAuth()` → Zod-validate input → `resolveUserFk()` (maps the
   session id to a real `User.id` or null for admins) → `requireGxPAuthor()`
   (blocks `super_admin` from authoring GxP records).
3. Prisma mutation, often inside `$transaction()` to allocate a human reference
   (e.g. `CAPA-2026-014`) and/or mint a `SignedRecord` atomically.
4. `prisma.auditLog.create()` records the event (tenant, user, module, action,
   old/new value). `revalidatePath()` refreshes the page cache.
5. Returns `ActionResult`. Optionally fires a fault-isolated `notify()` (never blocks the action).

### An e-signature (Part 11) event (e.g. sign & close a CAPA)
1. User re-enters their password → `verifyPasswordForSigning()` (constant-time bcrypt, Tenant then User table).
2. The record's current state is canonicalized (`canonicalJson`, sorted keys) and SHA-256 hashed (`computeContentHash`).
3. A `SignedRecord` row is written (immutable: signer identity + email snapshot, signature meaning, content hash, summary, `passwordVerifiedAt`, IP/UA) in the same transaction as the state change. The source row stores a 1:1 `*SignatureId` FK.
   An inspector can later recompute the hash to detect post-signing tampering.

### An AI request (e.g. chat / RCA draft)
- **Privileged (server-mediated):** browser → `/api/ai-proxy/[...path]` → (auth check, allowlist `api/ai/*`/`api/v1/*`, strip cookies) → FastAPI over DO private network → OpenAI/Pinecone.
- **Public/voice:** browser → `NEXT_PUBLIC_API_URL` (public FastAPI URL) directly.
- FastAPI classifies intent (`DB_QUERY` / `RAG_SEARCH` / `GENERAL`), then routes to its NL→SQL handler, Pinecone RAG, or a general GPT call.

---

## 7. Features

### Implemented (working modules) — under `src/modules/` and `app/(app)/`
- **Dashboard** — KPI aggregation, readiness score, action prioritization.
- **Gap Assessment** — findings vs frameworks; register, RCA, evidence, CAPA linkage; soft-delete + edit trail (`FindingEdit`).
- **CAPA** — full lifecycle: RCA (+ QA gate), structured action items, evidence collection, effectiveness criteria, tiered approvals, independent verification, sign-&-close, 90-day effectiveness review, discussion threads with “concern” blockers, change-control links. The most mature module.
- **Deviation** — report → investigation (SoD) → CAPA decision (SoD) → closure (signed); recurrence linkage; AI intelligence panel.
- **FDA 483** — events, observations, first-class commitments, AI response drafts, signed response submission, audit tab.
- **CSV/CSA** — GxP system inventory, validation stages (IQ/OQ/PQ), stage documents, RTM, roadmap, drift detection, Part 11 validation sign-off.
- **Change Control** — SOP/equipment/process/product changes, risk, status state-machine, bidirectional CAPA links.
- **Evidence / Documents** — document library; being unified into a cross-module attachment store (Phase 1.3a done, 1.3b pending — see §8).
- **Readiness** — playbooks, simulations, training records, readiness cards/roadmap.
- **Governance** — RAID log + KPI scorecard.
- **Audit Trail** — read-only Part 11 event view with filters/export.
- **Worklist** — per-user task list (action items, approvals).
- **Settings** — org, sites, users/roles, frameworks, AGI policy, permissions, subscription (has its own `CLAUDE.md`; canonical config source other modules read).
- **Support** — customer tickets + super-admin queue (newest module; see migration-drift caveat in §13).
- **AI surfaces** — AGI Console, AI-CAPA, AI-Tools, AI-Policy, Regulatory Intelligence (regulatory feed is currently mocked, wired for a live data source).
- **Admin** — customer accounts, plan/subscription management, platform audit/settings.

### In progress / transitional
- **Document unification** (`Document` model carries both legacy + new columns; Phase 1.3b backfill/rename/NOT-NULL promotion is pending — see schema comments).
- **Server-first migration** — a few modules still seed Redux from server props (Dashboard, AGI Console, Settings).
- **Regulatory Intelligence** — UI complete, data mocked.

### Stubbed / planned / missing
- **Inspection** module — “Coming soon” placeholder; data layer (`actions/inspections`, queries) exists but no UI.
- **Keycloak OIDC** — env scaffolding only; not confirmed wired.
- `EvidenceItem` e-sig lock fields are present but documented as “unused in v1” placeholders.
- `Plan.minRetentionYears` is a “promise only” — **no purge/retention enforcement logic exists**.

---

## 8. Database (Prisma — 43 models)

> Provider is set to `sqlite` (with “restore postgresql for CI/prod” warnings).
> No native enums — every status/category is a `String` validated at the app
> layer (SQLite portability). Most domain records carry a Part 11 **soft-delete**
> quartet (`deletedAt/deletedById/deletedByName/deletionReason`).

**Auth / tenancy:** `Tenant` (holds super_admin + customer_admin, MFA flag,
`sessionsValidAfter` for session invalidation), `Plan` (1:1 with Tenant; frozen
caps), `Site`, `User` (unique email/username *per tenant*), `EmailOTP` (MFA codes, no FK).

**Gap Assessment:** `Finding`, `FindingEdit` (append-only edit trail).

**CAPA family:** `CAPA` (very wide — RCA, alignment review, RCA QA gate,
verification, effectiveness review, DI gate, closure, rejection, recurrence — all
as first-class columns), `CAPAActionItem` (structured action plan, replaces the
free-text blob), `CAPADocument`, `CAPAApproval` (tiered sign-offs),
`CAPAComment` (threaded, `isConcern` blocks approval),
`CAPAEffectivenessCriterion`, `CAPAChangeControlLink`.

**Deviation:** `Deviation` (investigation + CAPA-decision SoD chain, recurrence link).

**FDA 483:** `FDA483Event`, `FDA483Observation`, `FDA483Commitment`,
`FDA483Document`, `FDA483CommitmentDocument`.

**CSV/CSA:** `GxPSystem`, `ValidationStage`, `StageDocument`, `RTMEntry`, `RoadmapActivity`.

**Evidence:** `EvidenceItem`, `EvidenceNoteVersion` (immutable note history),
`EvidenceFile` (SHA-256 + 7-yr retain), `Document` (unifying store, dual-schema).

**Change Control:** `ChangeControl`, `CAPAChangeControlLink`.

**Compliance ledger:** `SignedRecord` (polymorphic Part 11 e-signature ledger,
linked by `(recordType, recordId)`; immutable), `AuditLog` (append-only trail).

**Governance / Readiness:** `RAIDItem`, `Inspection`, `ReadinessAction`,
`Simulation`, `ReadinessCard`, `Playbook`, `TrainingRecord`.

**Cross-cutting:** `Notification` (fault-isolated, additive).

**Support (NO migration yet — see §13):** `Ticket`, `TicketMessage`, `TicketActivity`.

**Relationships (highlights):** `Tenant 1—* {User, Site, CAPA, Finding, …}` with
`onDelete: Cascade`; regulatory records (`CAPA`, `Deviation`, `Finding`) use
`onDelete: SetNull` on user FKs so they survive user deletion; `CAPA ↔ Deviation`
is a 1:1 (`deviationId @unique`); `CAPA ↔ Finding` 1:1; signature FKs are 1:1
(`@unique`). A separate **AI backend DB** (SQLAlchemy: `users`, `capas`, `rcas`,
`action_plans`, `monitoring`, `effectiveness_checks`, `capa_closures`,
`ai_audit_trail`) is wholly independent of the Prisma schema.

---

## 9. API Endpoints & Integrations

### Next.js route handlers (`app/api/**/route.ts`)
| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth Credentials provider + MFA/OTP + subscription gate + auth audit |
| `/api/auth/me` | GET | Current user from JWT |
| `/api/ai-proxy/[...path]` | GET/POST/PUT/PATCH/DELETE/OPTIONS | Authenticated same-origin proxy to FastAPI; allowlists `api/ai/*`, `api/v1/*`; strips cookies; 404→204 for lifecycle by-capa lookups |
| `/api/documents/[id]` | GET | Tenant-scoped document download (410 if soft-deleted) |
| `/api/evidence/files/[id]` | GET | CAPA evidence file download (tenant-scoped, soft-delete aware) |
| `/api/stage-documents/[id]` | GET | CSV/CSA stage document download |
| `/api/findings/[id]/evidence` | GET | Gap finding evidence, inline preview |

> **Note:** NextAuth lives in the **App Router** (`app/api/auth/[...nextauth]/route.ts`).
> There is **no `pages/` directory** — contradicting the README, which still
> describes a Pages-Router auth shim.

### FastAPI backend (`backend/app/`, routes under `/api/ai`, `/api/v1`, `/v1`)
- **Auth:** `POST /api/v1/auth/signup`, `/login` (HS256 JWT, 24h). *Token enforcement is permissive — missing token → anonymous (per in-code note dated 2026-05-15).*
- **AI chat:** `POST /api/ai/chat` (intent → NL→SQL / RAG / general).
- **Voice:** `POST /api/ai/voice/{transcribe,speak,chat}` (Whisper + TTS; 6 voices), `GET /api/ai/voice/health`.
- **CAPA:** `POST /api/v1/capa/create` (multipart + optional PDF/DOCX/TXT; GPT-4o recurrence check + 12-month flag), `GET /all`, `/customer/{id}`, `/status/{id}`, `POST /dismiss-alert`.
- **Lifecycle:** `/api/v1/{rca,action-plan,monitoring,effectiveness,closure}/*`.
- **Audit/User:** `/api/v1/audit/*`, `/api/v1/user/*`. Health: `GET /`, `GET /health`.

### External integrations
OpenAI (GPT-4o / 4o-mini / embeddings / Whisper / TTS), Pinecone (`glimmora-docs`),
Gmail SMTP, DigitalOcean Spaces (S3). Keycloak OIDC scaffolded but optional.

---

## 10. Dev Setup

> Platform note: this repo is developed on Windows (PowerShell primary). The
> `dev` script runs the web app and the Python API together via `concurrently`.

```bash
# 1. Web app
npm install
cp .env.example .env          # fill NEXTAUTH_SECRET; GMAIL_* optional in dev
npx prisma migrate dev        # or: npx prisma db push  (see migration caveat in §13)
npm run db:seed               # seeds tenants/users/sites

# 2. AI backend (optional but needed for AI features)
cd backend
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt
# set backend/.env: OPENAI_API_KEY, PINECONE_API_KEY, JWT_SECRET, DATABASE_URL, ALLOWED_ORIGINS
python -m app.rag.dummy_docs  # one-time: seed Pinecone index
cd ..

# 3. Run both (web :3000 + api :8000)
npm run dev                   # concurrently: `next dev --turbopack` + scripts/dev-api.mjs
# or individually:
npm run dev:web               # next only
npm run dev:api               # uvicorn only (port 8000; cross-platform launcher)
```

**npm scripts:** `dev`, `dev:web`, `dev:api`, `build`, `start`, `lint`,
`db:migrate`, `db:seed`, `db:studio`, `db:reset`, `test:mailer`,
`test`/`test:smoke` (Playwright).

**Seeded test credentials** (from README; verify against `prisma/seed.ts`):
super admin `superadmin@glimmora.com` / `1`; customer admin
`admin@pharmaglimmora.com` / `Admin@123`; role users `qa@/ra@/csv@/qc@/it@/ops@pharmaglimmora.com` / `Demo@123`.

---

## 11. Environment & Config

### Web app (`.env.example`)
| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `file:./dev.db` dev; Postgres URL prod |
| `NEXTAUTH_SECRET` | yes (prod) | Prod refuses to boot if placeholder/empty/<32 chars; `openssl rand -base64 32`. Also: when **unset in dev**, `proxy.ts` fails *open* (auth gate skipped) |
| `NEXTAUTH_URL` | yes | full origin incl. `https://` in prod |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | optional dev / required prod | App Password, not account password. Unset in dev → OTP logged to console; in prod the mailer throws on import |
| `NEXT_PUBLIC_API_URL` | — | Public FastAPI URL the browser calls directly (`…/api`) |
| `NEXT_PUBLIC_SITE_URL` | optional | SEO/metadata base URL (`src/constants/seo.ts`); falls back to `https://app.glimmora.com`. Used in code but **not** listed in `.env.example` |
| `BACKEND_URL` | — | Server-side FastAPI base (no `/api`); DO sets `${api.PRIVATE_URL}`; dev `http://localhost:8000` |
| `FILE_STORAGE_BACKEND` | — | `local` (dev) or `do-spaces` (prod) |
| `DO_SPACES_ENDPOINT/REGION/KEY/SECRET/BUCKET` | when `do-spaces` | DigitalOcean Spaces creds |
| `KEYCLOAK_CLIENT_ID/SECRET/ISSUER` | optional | Leave blank to disable |

### AI backend env
`DATABASE_URL`, `OPENAI_API_KEY`, `PINECONE_API_KEY`, `JWT_SECRET`,
`ALLOWED_ORIGINS` (comma-separated; default `localhost:3000`). Fallback secret
`pharma_secret_key_2026` is referenced in code — **rotate/remove for prod.**

### Config files
`next.config.mjs` (security headers incl. HSTS + `microphone=(self)`; 10 MB
`serverActions.bodySizeLimit`; image optimization; `/api/auth/signin`→`/login`
redirect), `tsconfig.json`, `eslint.config.js`, `postcss.config.ts`,
`playwright.config.ts`, `.npmrc`.

---

## 12. Deployment

There are **three** deploy descriptors; the **DigitalOcean App Platform** spec is
the most complete and current (matches `devAI`, Postgres, Spaces, private AI network):

- **`.do/app.yaml`** (region `blr`): a `PRE_DEPLOY` `migrate` job (`prisma migrate
  deploy`), an `api` service (FastAPI, uvicorn :8080, health `/health`), and a
  `web` service (Next.js :3000, health `/api/auth/session`). Web env wires
  `BACKEND_URL=${api.PRIVATE_URL}`, `FILE_STORAGE_BACKEND=do-spaces`, Spaces creds,
  NextAuth + Gmail secrets. Both auto-deploy on push to `devAI`.
- **`render.yaml`**: single Next.js web service on a **persistent disk** with
  **file-based SQLite** (`DATABASE_URL=file:/data/glimmora.db`), `FILE_STORAGE_BACKEND=local`;
  boot runs `prisma db push` (idempotent), seed once via shell. Backend deployed separately.
- **`vercel.json`**: `{ "framework": "nextjs" }` — legacy; not the active target.

**CI (`.github/workflows/ci.yml`):** on every push/PR — `check` job (npm ci,
prisma generate, `migrate deploy` to throwaway SQLite, lint, `tsc --noEmit`,
build) then `smoke` job (migrate + seed + Playwright chromium). CI runs against
**SQLite** (“Postgres CI deferred to the Phase-4 Postgres migration”).

---

## 13. Bugs, Limitations & Tech Debt

1. **Prisma provider committed as `sqlite`.** `schema.prisma` hard-codes
   `provider = "sqlite"` with explicit “DO NOT COMMIT — CI/prod use postgresql”
   comments, yet it's committed. The generated migrations are SQLite-flavored SQL,
   so `prisma migrate deploy` against Postgres (as `.do/app.yaml` does) will not
   work cleanly. A real Postgres cutover (“Phase 4”) is outstanding: restore the
   `postgresql` datasource, restore native enums (`PlanTier`, status enums), and
   regenerate migrations.
2. **Migration drift (high priority).** Only two migrations exist
   (`_init` = 39 tables, `_notifications` = 1). The schema has **43 models** — the
   **Support module's `Ticket`, `TicketMessage`, `TicketActivity` have no
   migration.** They only get created by `prisma db push` (Render path), **not**
   by `prisma migrate deploy` (CI + DO pre-deploy). Any environment relying on
   `migrate deploy` will be missing the Support tables. Generate the missing migration.
3. **Stale README.** Describes Pages-Router auth, a Vite→Next migration history,
   `npm test` being absent / Playwright “broken”, and Vercel deploy — all
   contradicted by current code (App-Router auth, FastAPI backend present, working
   Playwright + CI, DO/Render deploy). Treat this `HANDOVER.md` and the code as truth.
4. **Permissive AI-backend auth.** FastAPI JWT is issued but not enforced
   (missing token → anonymous). The AI service trusts `customer_id` from the
   request; combined with a hardcoded fallback `JWT_SECRET` (`pharma_secret_key_2026`),
   this is a tenant-isolation risk for any directly-reachable backend route. The
   Next proxy mitigates server-mediated calls, but `NEXT_PUBLIC_API_URL` exposes
   the backend publicly for voice/chat.
5. **`proxy.ts` fails open when `NEXTAUTH_SECRET` is unset.** Intentional for dev,
   but means the edge gate is entirely dependent on the secret being set in every
   non-dev environment.
6. **Repo hygiene.** Committed artifacts that shouldn't be in git: `prisma/dev.db`,
   `shadow.db`, `oapi.tmp.json`, `uploads/`, `tsconfig.tsbuildinfo`, and ~25 `*.png`
   screenshots in the project root. These bloat the repo and risk leaking data.
7. **Retention is a promise only.** `Plan.minRetentionYears` and file `retainUntil`
   are stored but there is no enforcement/purge logic — acceptable for now but a
   compliance gap if marketed as enforced.
8. **Two databases, two audit trails.** The Prisma `AuditLog` and the FastAPI
   `ai_audit_trail` are separate; CAPA data partly lives in both stores. Keeping
   them consistent is manual and a known source of drift.
9. **`CAPA` model is extremely wide** (dozens of nullable lifecycle columns).
   It works, but is hard to reason about; many fields are “backfill window”
   nullable with denormalized name caches alongside FK ids.
10. **Tests are smoke-level only.** No unit tests; Playwright covers login + a few
    AI features. Large parts of the compliance logic are unverified by automated tests.

---

## 14. What's Next (priority order)

1. **Fix migration drift** — generate the Support-module migration so
   `migrate deploy` produces the full schema. (Blocks any clean Postgres deploy.)
2. **Execute the Postgres cutover (“Phase 4”)** — switch the datasource, restore
   enums, regenerate a clean migration baseline, and enable Postgres in CI.
3. **Harden the AI backend** — enforce JWT, remove the hardcoded fallback secret,
   verify `customer_id` server-side, and confirm tenant isolation on every route.
4. **Reconcile the README** (or delete it in favor of this handover) so onboarding
   docs match reality.
5. **Repo cleanup** — gitignore + `git rm --cached` the DBs, screenshots, temp
   files, uploads, and build info.
6. **Finish the Document-unification Phase 1.3b** backfill/rename/NOT-NULL promotion.
7. **Build the Inspection module UI** (data layer already exists) or formally defer it.
8. **Wire Regulatory Intelligence to a live data source** (UI already built).

---

## 15. Recommendations

- **Adopt a single migration discipline.** Pick `prisma migrate` *or* `db push`
  per environment and make CI assert “no schema drift” (`prisma migrate diff`) so
  this class of bug can't recur silently.
- **Run CI against Postgres**, not SQLite. The prod/dev DB divergence is the root
  cause of most deploy risk here; testing on SQLite hides Postgres-only issues.
- **Add unit/integration coverage for the Part 11 core** — signing/canonicalization,
  SoD guards, soft-delete, reference allocation, tenant scoping (IDOR). These are
  the highest-value, lowest-test-coverage paths.
- **Treat the AI backend as untrusted from the browser.** Keep all privileged AI
  work behind the Next proxy; restrict `NEXT_PUBLIC_API_URL` surface to genuinely
  public endpoints.
- **Document the dual-DB contract.** Define clearly which record of truth owns
  CAPA state (Prisma vs FastAPI) and how/whether they sync, to prevent divergence.
- **Trim the `CAPA` model** over time (extract lifecycle sub-entities where the
  schema already hints at it, e.g. action items) to reduce cognitive load.
- **Secrets discipline** — rotate any secret that has lived in git/screenshots,
  and ensure `NEXTAUTH_SECRET` / `JWT_SECRET` are environment-injected everywhere.
- **Keep per-module `CLAUDE.md` files** (Settings already has one) as the durable
  source of module-level conventions, and reference them from this handover.

---

*Prepared from a direct read of the repository on branch `devAI`. Items marked
“not determinable from the codebase” were not asserted. For deeper module specs,
see `CLAUDE.md`, `src/modules/settings/CLAUDE.md`, `MIGRATION-GUIDE.md`, and the
`docs/` folder (SOW gap analysis, user manuals, AI testing manuals).*
</content>
</invoke>
