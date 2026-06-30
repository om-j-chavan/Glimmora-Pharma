# MODULES

> Per-module state, key files, and main flow. State legend: **COMPLETE** (real queries + real audited writes, no stubs) · **IN-PROGRESS** (works but has a documented gap) · **STUBBED** (UI placeholder or mocked data). Verified against code this session; thin spots marked **(unverified)**.

Every product page follows the same shape: `app/(app)/<route>/page.tsx` is a Server Component that calls cached queries in `src/lib/queries/*`, then renders the client UI in `src/modules/<feature>/`. Writes go through `src/actions/*` (audited `ActionResult`).

## Compliance core

### Dashboard — COMPLETE
- **Files:** `app/(app)/page.tsx`, `src/modules/dashboard/DashboardPage.tsx`, `src/lib/queries/dashboard.ts`.
- **What:** QA-head landing page — readiness %, CAPA-overdue KPI, observation volume, 90-day action plan, risk signals, **Area Readiness Heatmap**.
- **Flow:** page fetches 6 queries in parallel (`getDashboardStats`, `getOverallReadiness`, `getFindings`, `getCAPAs`, `getDeviations`, `getSystems`) and seeds the Redux data slices on mount; widgets render from those slices.
- **Note:** **Bug 17** (heatmap) and the empty-on-load issue (**Bug 15**, prior) were fixed this session — the page now seeds findings/CAPAs/deviations/**systems** itself. `systems` slice was re-introduced this session.

### Gap Assessment (Findings) — COMPLETE
- **Files:** `app/(app)/gap-assessment/page.tsx`, `src/modules/gap-assessment/GapPage.tsx`, `src/actions/findings.ts`, `src/lib/queries/findings.ts`.
- **What:** logs regulatory gaps/findings with severity, area, owner, target date, evidence, RCA, and CAPA linkage.
- **Flow:** create/update/close/restore findings (Zod-validated, audited); attach evidence via the shared document pipeline; closing a linked CAPA cascades the Finding → closed.

### CAPA — COMPLETE
- **Files:** `app/(app)/capa/page.tsx` + `capa/[id]/page.tsx`, `src/modules/capa/*`, `src/actions/capas/*` (8 domain files: `lifecycle`, `closure`, `approvals`, `verification`, `rca-review`, `alignment`, `action-items`, `effectiveness`), `src/lib/queries/capas.ts`.
- **What:** full CAPA lifecycle — RCA review, tiered approval, independent verification, action items, 90-day effectiveness, Part 11 signed closure.
- **State machine:** `open → in_progress → pending_qa_review → pending_verification → closed` (+ `rejected` which bounces back to `in_progress`).
- **Access:** the CAPA *module* (nav + `/capa`) is locked to `qa_head` + `customer_admin`; everyone else reaches their CAPA work via the **Worklist**. See [FLOWS.md](./FLOWS.md#capa-lifecycle).

### Deviation — COMPLETE today, **MID-REDESIGN**
- **Files:** `app/(app)/deviation/page.tsx`, `src/modules/deviation/{DeviationPage,DeviationInvestigation,DeviationIntelligencePanel}.tsx`, `src/actions/deviations.ts`, `src/lib/queries/deviations.ts`.
- **What (current):** single-track investigation flow — `open → under_investigation → pending_qa_review → closed|rejected`; reporter≠investigator≠CAPA-decider SoD; Part 11 signed close; raise-CAPA button (`createCAPA` with `linkedDeviationId`).
- ⚠️ **The whole flow is being redesigned** into a priority split (low = lightweight task, high/med = raise-CAPA-and-stay-open). **Not yet built.** Full agreed design + 4-stage build plan in [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md#the-deviation-redesign-mid-design--resumable).
- One roadmap TODO: AI-suggestion button in `DeviationInvestigation.tsx` (non-blocking).

### FDA 483 — COMPLETE (AI draft mocked)
- **Files:** `app/(app)/fda-483/page.tsx`, `src/modules/fda-483/*`, `src/actions/fda483.ts`, `src/lib/queries/fda483.ts`.
- **What:** FDA 483 inspection events → observations → RCA → raise/link CAPA → response draft → Part 11 signed submission. Readiness scoring 20→40→60→80→100.
- **Note:** the AI response-draft has a deterministic **mock fallback** ("gateway mocked") — not a blocker.

### CSV/CSA Validation — COMPLETE
- **Files:** `app/(app)/csv-csa/page.tsx` + `csv-csa/systems/[reference]`, `src/modules/csv-csa/CSVPage.tsx`, `src/actions/systems.ts` (~1,950 lines), `src/actions/rtm.ts`, `src/lib/queries/systems.ts`.
- **What:** GxP system validation (URS→FS→DS→IQ→OQ→PQ→RTR stages), per-stage document evidence, RTM traceability, QA sign-off (Part 11 signed), validation-status auto-derivation, soft-delete archive.

### Change Control — COMPLETE
- **Files:** `app/(app)/change-control/page.tsx`, `src/modules/change-control/ChangeControlListPage.tsx`, `src/actions/change-control.ts` (~1,140 lines), `src/lib/queries/change-control.ts`.
- **What:** change records (`Draft → In Review → Approved → In Implementation → Implemented → Closed`), bidirectional CAPA linkage, **Part 11 e-signature on consequential transitions** (Approved/Rejected/Closed).

### Evidence & Documents — COMPLETE
- **Files:** `app/(app)/evidence/page.tsx`, `src/modules/evidence/EvidencePage.tsx`, `src/actions/evidence.ts`, `src/actions/documents.ts`, `src/lib/queries/evidence.ts`.
- **What:** CAPA evidence collection (7 ALCOA+ categories), generic Document control with `linkedModule`/`linkedRecordId`, SHA-256 hashing, `retainUntil = +7y`, QA disposition (accept/reject), immutable note versions. Evidence locks when its CAPA hits QA review.

### Inspection Readiness — COMPLETE
- **Files:** `app/(app)/readiness/page.tsx`, `src/modules/readiness/ReadinessPage.tsx`, `src/actions/inspections.ts`, `src/lib/queries/inspections.ts`.
- **What:** pre-inspection readiness kanban (lanes × time-buckets), training records, mock simulations, playbooks, % readiness score.

### Inspection — STUBBED (UI) / data layer COMPLETE
- **Files:** `app/(app)/inspection/page.tsx` (renders a "Coming soon" placeholder — `src/modules/inspection/InspectionPage.tsx`), but `src/actions/inspections.ts` + `src/lib/queries/inspections.ts` are fully implemented (shared with Readiness).
- **Note:** the **data layer exists**; only the dedicated Inspection UI is a placeholder.

### Governance (RAID) — COMPLETE (KPI tab mocked)
- **Files:** `app/(app)/governance/page.tsx`, `src/modules/governance/GovernancePage.tsx`, `src/actions/raid.ts`, `src/lib/queries/governance.ts`.
- **What:** RAID (Risks/Actions/Issues/Decisions) tracking with role gates + owner edits.
- **Gap:** the KPI-scorecard tab renders **mock** data — `governance.ts` has a TODO ("replace with /api/governance/kpis once the route exists").

### Audit Trail — COMPLETE
- **Files:** `app/(app)/audit-trail/page.tsx` (gated to qa_head/customer_admin/super_admin), `src/modules/audit-trail/AuditTrailPage.tsx`, `src/lib/queries/governance.ts` (`getAuditTrailView`), writes via `src/lib/audit.ts` → `logAuditAction`.
- **What:** immutable event log (actor id/name/role, module, action, recordId, old/new JSON) with filters.
- **Note:** a content-hash/tamper-evidence chain is noted as **future** (the current schema has actor+timestamp+tenant scoping, not a hash chain).

### Worklist — COMPLETE
- **Files:** `app/(app)/worklist/page.tsx`, `src/modules/worklist/{WorklistPage,TaskPanel}.tsx`, `src/lib/queries/worklist.ts`, `src/actions/worklist.ts`.
- **What:** the fixer/owner surface. **Computed aggregation (no table)** — unions `CAPAActionItem` where `ownerId==you` + `CAPA` where `ownerId==you` (drivers see their whole CAPA group). Assignee completes items with notes + evidence; rework surfaces in a "Needs rework" band.
- **Key fact for the deviation redesign:** the worklist only reads CAPA records — a deviation task needs a new `DeviationTask` model unioned in here (see [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md)).

## Platform & config

### Settings — COMPLETE
- **Files:** `app/(app)/settings/page.tsx`, `src/modules/settings/SettingsPage.tsx` + tabs, `src/actions/settings.ts`, `src/lib/queries/settings.ts`.
- **What:** tenant config — Org, Sites, Users (+ roles, plan-cap enforcement on create), Subscription (read-only view), Frameworks, AGI Policy, Permissions matrix. Tab-level role gating; read-only banner for non-admins.

### Support (ticketing) — COMPLETE (tables fixed this session)
- **Files:** `app/(app)/support/page.tsx` + `support/[id]`, `app/(admin)/admin/support/*`, `src/modules/support/{TicketQueue,TicketDetailView}.tsx`, `src/actions/support.ts`, `src/lib/queries/support.ts`.
- **What:** ticket queue (status/priority/category/date/search filters, SLA), thread + internal notes (stripped for non-managers at the data layer), assign/resolve, `TicketActivity` audit rows. Chatbot can hand off to a ticket.
- **Note:** **Bug 18** — `Ticket/TicketMessage/TicketActivity` had no migration; the page 500'd on a migrate-deployed DB. Fixed this session by the regenerated SQLite baseline. See [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md).

### Admin console (customer accounts / plans) — COMPLETE
- **Files:** `app/(admin)/admin/*`, `src/modules/admin/{AdminShell,customer-accounts,customer-detail,platform-audit,platform-settings}/*`, `src/actions/tenants.ts`.
- **What:**
  - **Customer Accounts** (`/admin`) — list/create/edit/suspend tenants; stat cards (Total/Active/MFA/Overdue).
  - **Customer Detail** (`/admin/customer/[id]`) — plan editor (tier, caps, dates), **Renew** action, MFA toggle, user/site utilization-vs-cap.
  - **Platform Audit** (`/admin/audit`) — super_admin platform-event feed.
  - **Plans** — tier caps in `src/lib/plans.ts`; assigned via `assignPlan`.
- **This session added** the whole plan-subscription feature set (duration, renew, cap-vs-usage guard, retention floor). See [FLOWS.md](./FLOWS.md#plansubscription-flow) and [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md).
- **IN-PROGRESS:** `PlatformSettingsPage` (`/admin/settings`) is mostly read-only — the platform-wide **MFA default** toggle is **not yet wired** (per-tenant MFA works); retention policy is static text.

## AI surfaces (reach the FastAPI backend via `app/api/ai-proxy`)

### chatbot — COMPLETE
- **Files:** `src/components/chatbot/AIChatbot.tsx`.
- **What:** floating assistant — text Q&A (`/api/ai/help` with confidence band + sources), voice round-trip (record→transcribe→reply→TTS, RNNoise noise suppression), and "Create a ticket" handoff to Support.

### ai-tools — COMPLETE
- **Files:** `app/(app)/ai-tools/page.tsx`, `src/modules/ai-tools/AiToolsPage.tsx`.
- **What:** direct lookups into the AI backend's CAPA-lifecycle records (RCA/action-plan/monitoring/effectiveness/closure/audit) by ID, + AI/voice health pings.

### ai-capa — COMPLETE
- **Files:** `app/(app)/ai-capa/page.tsx` + `[capaId]`, `src/modules/ai-capa/{AiCapaIndex,AiCapaPage}.tsx`.
- **What:** list + 5-stage lifecycle dashboard for AI-backend-tracked CAPAs (RCA → action plan → monitoring → effectiveness → closure), with per-stage submission modals.

### regulatory-intelligence — COMPLETE (MOCKED data)
- **Files:** `app/(app)/regulatory-intelligence/page.tsx`, `src/modules/regulatory-intelligence/RegulatoryIntelligencePage.tsx`, `src/lib/ai/index.ts`.
- **What:** FDA/EMA guidance-change monitoring UI. Real UI, **mock data** (`MOCK_AI_RESPONSES=true` in `src/lib/ai/index.ts`); the return shape is stable so flipping to a live feed needs no UI change.

### agi-console — IN-PROGRESS
- **Files:** `app/(app)/agi-console/page.tsx`, `src/modules/agi-console/{AGIPage,tabs/*}.tsx`, `src/actions/agiConsole.ts`.
- **What:** agent enable/disable toggles, autonomy mode, oversight metrics, drift monitoring.
- **Gap:** the **Drift Monitoring** tab logs to the audit trail but **drift alerts do not persist** (no `DriftAlert` Prisma model — in-memory only, reset on refresh). Server-fetched AGI activity logs are accepted as a prop but the activity feed still derives from (empty) Redux — **partial wiring (unverified end-to-end)**.

### ai-policy — COMPLETE (static)
- **Files:** `app/(app)/ai-policy/page.tsx` (admin-gated), `src/modules/settings/AIPolicyPage.tsx`.
- **What:** static human-in-the-loop AI policy documentation (can-do / cannot-do / confidence bands / regulatory references).

### FastAPI AI backend (separate service — context only)
- See [FLOWS.md](./FLOWS.md#ai-request-path) and [OVERVIEW.md](./OVERVIEW.md). gpt-4o-**mini** + optional Pinecone RAG, own SQLAlchemy DB, permissive JWT. **No code changes here.**
