# CODEBASE MAP

> How the repo is organized and the conventions you must know to navigate it. Paths are from the repo root.

## Top-level layout

```
/
├── app/                  Next.js App Router — routes, layouts, API routes
├── src/                  All app code (components, modules, actions, queries, lib, store, hooks)
├── prisma/              schema.prisma, migrations/, seed.ts, dev.db (gitignored)
├── backend/             SEPARATE FastAPI AI service (Python) — own SQLAlchemy DB. Do not change here.
├── docs/                Documentation, including this docs/handover/ set
├── scripts/            One-off backfills, dev-api launcher, mailer test
├── tests/              Playwright smoke/spec tests
├── public/             Static assets (logo.png, etc.)
├── proxy.ts            Edge auth gate (Next 16 "proxy" = middleware equivalent)
├── package.json        Web app manifest + npm scripts
├── render.yaml         Render deploy blueprint (SQLite on persistent disk)
├── .do/app.yaml        DigitalOcean spec (legacy Postgres path — abandoned; see SETUP-AND-CONFIG.md)
├── .github/workflows/  CI (ci.yml)
└── CLAUDE.md / README.md   Project instructions (note: some claims now stale — code wins)
```

## `app/` — routes & API (Next.js App Router)

Route groups:
- **`app/(app)/`** — the authenticated product. One folder per module, each with `page.tsx` (a Server Component that fetches via the queries layer and renders the module UI from `src/modules/`). Routes: `/` (dashboard), `gap-assessment`, `capa` + `capa/[id]`, `deviation`, `fda-483`, `csv-csa` + `csv-csa/systems/[reference]`, `change-control`, `evidence`, `inspection`, `readiness`, `governance`, `audit-trail`, `worklist`, `settings`, `support` + `support/[id]`, and AI surfaces (`ai-tools`, `ai-capa` + `ai-capa/[capaId]`, `ai-policy`, `agi-console`, `regulatory-intelligence`).
- **`app/(admin)/admin/`** — the platform-operator console (super_admin/customer_admin): `/admin` (customer accounts + plans), `admin/customer/[id]` (tenant detail — plan editor, Renew, MFA), `admin/audit`, `admin/settings`, `admin/support` + `admin/support/[id]`.
- **`app/login/`, `app/site-picker/`, `app/docs/[slug]/`** — auth + misc.
- **Root error pages**: `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx` (theme-aware; committed).

API routes (`app/api/`):
- `auth/[...nextauth]/route.ts` — NextAuth credentials provider + MFA `authorize()`.
- `auth/me/route.ts` — returns the current session user (post-login hydration).
- `ai-proxy/[...path]/route.ts` — server-side proxy to the FastAPI backend (JWT handoff, path allowlist).
- `documents/[id]`, `evidence/files/[id]`, `stage-documents/[id]`, `findings/[id]/evidence` — file download/stream routes.

## `src/` — the app code

### `src/modules/<feature>/` — feature UI (client components)
One folder per feature (`dashboard`, `capa`, `deviation`, `gap-assessment`, `fda-483`, `csv-csa`, `change-control`, `evidence`, `readiness`, `inspection`, `governance`, `worklist`, `settings`, `support`, `admin`, AI surfaces). Convention: a `XxxPage.tsx` orchestrator + sub-components, often a `.adapter.ts` (Prisma row → Redux/slice shape), `.schemas.ts` (Zod form schemas), `.constants.ts` (status/label maps). These are **client** components driven by Redux + props from the server page.

### `src/actions/` — Server Actions (the WRITE path)
`"use server"` files; one per domain (`tenants.ts`, `deviations.ts`, **`deviation-tasks.ts`** (the low-priority DeviationTask loop), `findings.ts` (also hosts the gap-finding work loop: `assignFinding`/`submitFinding`/`reviewFinding`/`reworkFinding`/`postFindingMessage`/`loadFindingReview`/`uploadFindingEvidence`/`removeFindingEvidence`/`loadFindingDocuments`), `change-control.ts`, `systems.ts`, `rtm.ts`, `inspections.ts`, `raid.ts`, `evidence.ts` (incl. `rejectEvidenceCategory`), `documents.ts`, `fda483.ts`, `worklist.ts`, `settings.ts`, `agiConsole.ts`). CAPA is split into a sub-folder `src/actions/capas/` (`lifecycle.ts`, `closure.ts`, `approvals.ts`, `verification.ts` *(legacy — verification retired)*, `rca-review.ts`, `alignment.ts`, `action-items.ts`, `effectiveness.ts`) re-exported by `src/actions/capas.ts`.

**The `ActionResult` convention** (every mutation returns this — see e.g. `src/actions/tenants.ts`):
```ts
type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };
```
**Every compliance mutation:** `requireAuth()` → resolve actor FK (`resolveUserFk`) → role/GxP guard (`requireGxPAuthor`, role-sets) → Zod-validate input → Prisma write (often in `$transaction`) → **`prisma.auditLog.create(...)`** → `revalidatePath(...)` → return `ActionResult`. See [FLOWS.md](./FLOWS.md#write-path).

### `src/lib/queries/` — cached reads (the READ path)
React `cache()`-wrapped Prisma reads, one file per domain (`tenants.ts`, `deviations.ts`, `findings.ts`, `capas.ts`, `capa-criteria.ts`, `change-control.ts`, `systems.ts`, `inspections.ts`, `governance.ts`, `evidence.ts` (also `EVIDENCE_CATEGORIES`/`EVIDENCE_CATEGORY_LABEL`), `fda483.ts`, `support.ts`, `worklist.ts`, `dashboard.ts`, `settings.ts`). Barrel: `src/lib/queries/index.ts`. Server Components import from here. Reads filter `deletedAt: null` and scope by `tenantId`. **Worklist is a computed aggregation here** (no Worklist table) — `getWorklist` now unions **four** sources: `CAPAActionItem` (ownerId), `CAPA` (assignee ownerId), `DeviationTask` (assigneeId), and `Finding` (owner) — see [MODULES.md](./MODULES.md#worklist--complete-now-unions-4-sources).

### `src/lib/` — shared libraries
- **`auth.ts`** — `requireAuth()`, `auth()`, `resolveUserFk()`, `requireGxPAuthor()`.
- **`permissions/roleSets.ts`** — single source of truth for role authorization sets + `getModuleCapabilities()`. See [ROLES-AND-PERMISSIONS.md](./ROLES-AND-PERMISSIONS.md).
- **`signing.ts`** — Part 11 e-signature primitives (password verify, canonicalize, SHA-256 hash, `createSignedRecord`).
- **`plans.ts`** — subscription plan rules (tiers, caps, `resolvePlanCaps`, `resolveExpiry`, `MIN_TAILORED_RETENTION_YEARS`).
- **`planCaps.ts`** — server-side plan-cap enforcement (active user/site counts).
- **`tenantStatus.ts`** — plan/lifecycle status helpers (`isPlanUsable`, `planState`).
- **`mappers/`** — Prisma row → Redux shape (`tenantMapper.ts`, `capaMapper.ts`).
- **`otp.ts`, `mailer.ts`** — email-OTP MFA generation/verify + Gmail SMTP.
- **`labels/`** — human labels (`auditEvents.ts`, `roles.ts`, `errorCodes.ts`).
- **`severity.ts`** — severity taxonomies (generic vs FDA) + badge variants.
- **`dayjs.ts`** — configured dayjs (utc plugin) — import this, not raw dayjs.
- **`prisma.ts`** — the Prisma client singleton.
- **`ai*.ts`** (`aiAuth.ts`, `aiChat.ts`, `aiBackend.ts`) — browser clients for the FastAPI backend.
- **`auditServer.ts`, `errors.ts`, `passwords.ts`, `identity-display.ts`, `searchSources.ts`, `capa-approvals.ts`, `severity.ts`, `ai/`** — misc helpers.

### `src/store/` — Redux Toolkit
Slices: `auth.slice.ts` (session, tenants, plan config), `capa.slice.ts`, `deviation.slice.ts`, `findings.slice.ts`, `systems.slice.ts` (re-introduced this session for the dashboard), `evidence.slice.ts`, `raid.slice.ts`, `readiness.slice.ts`, `permissions.slice.ts` (the `RoleKey` union + matrix), `notifications.slice.ts`, `settings.slice.ts`, `theme.slice.ts`. Store wiring + persistence: `src/store/index.ts` + `persistence.ts` (only `auth/settings/theme/permissions/notifications` persist to localStorage — **data slices never persist**, they re-seed from the server each load).

### `src/hooks/` — React hooks
`useTenantData.ts` (reads data slices, tenant/site-filtered), `useTenantConfig.ts`, `usePermissions.ts` (mirrors `getModuleCapabilities`), `useAppSelector/useAppDispatch`, `useRole`, etc.

### `src/components/` — shared UI
`ui/` (Button, Modal, Dropdown, DatePicker, Badge, Toast, Toggle…), `layout/` (AppShell, Sidebar), `auth/LoginPage.tsx`, `errors/ErrorBoundary.tsx`, `shared/`, `search/`, `chatbot/AIChatbot.tsx`.

## `prisma/`
`schema.prisma` (**46 models**, SQLite — +`DeviationTask`/`DeviationTaskMessage`/`FindingMessage` since the baseline), `migrations/20260629054845_init/` (the regenerated SQLite baseline — predates the 3 new models; local uses `db push`), `migration_lock.toml` (=sqlite), `seed.ts` (tenants + demo users + plans + sample records), `dev.db` (gitignored).

## `scripts/`
`dev-api.mjs` (launches the FastAPI backend in `npm run dev`), backfills (`backfill-capa-deviation.ts`, `backfill-deviation-created-by.ts`, `backfill-finding-status-case.ts`, `backfill-*-status-case.ts`, and ⚠️ **`backfill-capa-retire-verification.ts`** — must be run per-environment to retire legacy `pending_verification` CAPAs), `test-mailer.ts`.

## `backend/` (separate service — context only)
FastAPI app: `app/main.py` (routers), `app/routers/*` (auth, ai, capa, rca, action_plan, monitoring, effectiveness, closure, audit, user, voice), `app/ai_service.py` + `app/rag/rag_service.py` (OpenAI + Pinecone), `app/database/db.py` (own SQLAlchemy DB), `requirements.txt`. See [FLOWS.md](./FLOWS.md#ai-request-path). **No code changes here in this handover.**

## Conventions cheat-sheet
- **Reads** → `src/lib/queries/*` (cached, tenant-scoped, `deletedAt:null`) called from `app/**/page.tsx` Server Components.
- **Writes** → `src/actions/*` (`"use server"`, `ActionResult`, audit-logged).
- **Validation** → Zod, both client (`*.schemas.ts`) and server (in the action).
- **Auth identity** → admins are **Tenant** rows; `resolveUserFk` maps a session id to a real `User.id` before writing User FKs.
- **GxP bright line** → `requireGxPAuthor` blocks `super_admin` from authoring.
- **e-signature** → `src/lib/signing.ts` + `SignedRecord`.
- **Status/severity** → string fields validated app-side (`src/constants/statusTaxonomy.ts`, `src/lib/severity.ts`) — SQLite has no enums.
