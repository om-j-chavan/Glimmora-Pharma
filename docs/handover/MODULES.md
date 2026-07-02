# MODULES

> Per-module state, key files, and main flow. State legend: **COMPLETE** (real queries + real audited writes, no stubs) · **IN-PROGRESS** (works but has a documented gap) · **STUBBED** (UI placeholder or mocked data). Verified against code this session; thin spots marked **(unverified)**.

Every product page follows the same shape: `app/(app)/<route>/page.tsx` is a Server Component that calls cached queries in `src/lib/queries/*`, then renders the client UI in `src/modules/<feature>/`. Writes go through `src/actions/*` (audited `ActionResult`).

## Compliance core

### Dashboard — COMPLETE
- **Files:** `app/(app)/page.tsx`, `src/modules/dashboard/DashboardPage.tsx`, `src/lib/queries/dashboard.ts`.
- **What:** QA-head landing page — readiness %, CAPA-overdue KPI, observation volume, 90-day action plan, risk signals, **Area Readiness Heatmap**.
- **Flow:** page fetches 6 queries in parallel (`getDashboardStats`, `getOverallReadiness`, `getFindings`, `getCAPAs`, `getDeviations`, `getSystems`) and seeds the Redux data slices on mount; widgets render from those slices.
- **Note:** **Bug 17** (heatmap) and the empty-on-load issue (**Bug 15**, prior) were fixed this session — the page now seeds findings/CAPAs/deviations/**systems** itself. `systems` slice was re-introduced this session.

### Gap Assessment (Findings) — COMPLETE (finding workflow added — **largely untested in a browser**)
- **Files:** `app/(app)/gap-assessment/page.tsx`, `src/modules/gap-assessment/{GapPage.tsx,modals/AddFindingModal.tsx,tabs/GapRegisterTab.tsx}`, `src/actions/findings.ts`, `src/lib/queries/findings.ts`, plus the worker surface `src/modules/worklist/FindingWorkPanel.tsx`.
- **What:** logs regulatory gaps/findings with severity, area, owner, target date, evidence, RCA, CAPA linkage — **now with a full deviation-style work loop cloned onto findings** (added across several sessions).
- **The finding work loop (mirrors the DeviationTask subsystem):**
  - **Disposition is severity-gated** (`GapRegisterTab.tsx`): **LOW → "Assign person"** (`assignFinding` → the assignee works it in the Worklist) **+ Raise CAPA** as a secondary option; **HIGH/MEDIUM/CRITICAL → "Raise CAPA"**. Once assigned, the assign dropdown is hidden and the assignee is shown read-only.
  - **Assign** (`assignFinding`, `findings.ts`) — QA assigns to an active tenant user; an Open finding flips to **In Progress** (the "assigned" signal). The finding then surfaces in the assignee's **Worklist** (4th source — see Worklist below).
  - **Work** (`FindingWorkPanel.tsx`) — categorized evidence upload (the 7 GxP `EVIDENCE_CATEGORIES`, mandatory category, multiple files, remove-before-submit via `removeFindingEvidence`), completion notes, a flat QA↔assignee thread (`FindingMessage`), and a submit-to-QA confirm.
  - **Review** (`reviewFinding`/`reworkFinding`/`postFindingMessage`/`loadFindingReview`) — QA accepts (→ Closed) or sends back for rework (→ Rework, reason auto-posted to the thread); SoD: reviewer ≠ owner.
  - **Escalate** — `Raise CAPA` from a finding → `createCAPA({ linkedFindingId })` with carryover (categorized docs → real CAPA `EvidenceFile`s, owner → CAPA assignee, RCA text). See [FLOWS.md](./FLOWS.md#gap-assessment-finding-flow).
- **Status union (`src/store/findings.slice.ts`):** `Open | In Progress | Submitted | Rework | Closed`. `Finding.owner` is a **String userId (NOT a User FK)** — resolve via `users` list client-side; this is why the finding→CAPA carryover must re-resolve the owner to a real User (see Bug #25 in [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md)).
- **Base ops:** create/update/close/restore findings (Zod-validated, audited); closing a linked CAPA cascades the Finding → closed.

### CAPA — COMPLETE (reshaped — **ONE-approval closure; independent verification removed**)
- **Files:** `app/(app)/capa/page.tsx` + `capa/[id]/page.tsx`, `src/modules/capa/*`, `src/actions/capas/*` (`lifecycle`, `closure`, `approvals`, `verification` *(legacy)*, `rca-review`, `alignment`, `action-items`, `effectiveness`), `src/lib/queries/capas.ts`.
- **What:** full CAPA lifecycle — RCA review, tiered approval, action items, 90-day effectiveness, Part 11 signed closure.
- **State machine (now):** `open → in_progress → pending_qa_review → closed` (+ `rejected` → `in_progress`). **Independent verification was REMOVED:** one QA approval → Part 11 signed close directly from `pending_qa_review` (`closure.ts:110-115`). `pending_verification` still exists in the `CAPAStatus` union (`src/types/capa.ts`) and `verifyCAPA` still exists in `verification.ts`, but both are **legacy-only** — closure accepts a CAPA parked in `pending_verification` and normalizes it. A per-environment backfill **`scripts/backfill-capa-retire-verification.ts`** moves legacy `pending_verification` rows to `pending_qa_review` (**must be run per-env** — see [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md)).
- **Driver → single assignee:** the old "driver" concept is gone; a CAPA now has one **assignee** (`CAPA.ownerId`). The Worklist shows the assignee an **evidence panel** with **per-category evidence upload + per-category rework** (`rejectEvidenceCategory` in `src/actions/evidence.ts`).
- **Deviation/Finding → CAPA carryover:** raising a CAPA from a deviation or finding carries the worker → CAPA assignee, RCA text, and **categorized docs → real `EvidenceFile`s** (`convertCategorizedDocsToEvidence`, generalized in `lifecycle.ts`). Comments are **not** carried (see #22c in [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md)).
- **Access:** the CAPA *module* (nav + `/capa`) is locked to `qa_head` + `customer_admin`; everyone else reaches their CAPA work via the **Worklist**. See [FLOWS.md](./FLOWS.md#capa-lifecycle).

### Deviation — COMPLETE (**redesign BUILT** — priority split + DeviationTask subsystem; **largely untested in a browser**)
- **Files:** `app/(app)/deviation/page.tsx`, `src/modules/deviation/{DeviationPage,DeviationInvestigation,DeviationIntelligencePanel}.tsx`, `src/actions/deviations.ts`, `src/actions/deviation-tasks.ts`, `src/lib/queries/deviations.ts`, plus the worker surface `src/modules/worklist/DeviationTaskPanel.tsx`.
- **What (now built):** the priority-split / investigation-first flow that was previously only *designed* is **implemented**:
  - **QA sets `priority`** (`Deviation.priority` — `Low | Medium | High`, prefilled from FDA `severity`, overridable). Drives the disposition.
  - **LOW → lightweight `DeviationTask`:** QA assigns to a user with a message → assignee works it in the **Worklist** (categorized task docs via the 7 GxP categories, completion notes, submit) → QA **reviews → Close (signed) or Rework**; a flat `DeviationTaskMessage` QA↔worker thread; "Raise CAPA" escalation **cancels** the open task.
  - **HIGH/MEDIUM → raise a CAPA:** `createCAPA({ linkedDeviationId })`; deviation → **`capa_pending`** (new status), stays open + linked until the CAPA closes; QA still **sign-closes** (no auto-close).
  - Phase-gated detail modal (disposition surfaces only at the right phase); Part 11 signed close throughout (`DEVIATION_CLOSURE`).
- **Status union (now):** `open → under_investigation → pending_qa_review → capa_pending → closed | rejected` (`src/store/deviation.slice.ts`).
- See [FLOWS.md](./FLOWS.md#deviation-flow-priority-split) and the build record in [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md#deviation-redesign--built).
- One roadmap TODO: AI-suggestion button in `DeviationInvestigation.tsx` (non-blocking). *(unverified whether still present after the rebuild.)*

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

### Worklist — COMPLETE (**now unions 4 sources**)
- **Files:** `app/(app)/worklist/page.tsx`, `src/modules/worklist/{WorklistPage,TaskPanel,DeviationTaskPanel,FindingWorkPanel}.tsx`, `src/lib/queries/worklist.ts`, `src/actions/worklist.ts`.
- **What:** the fixer/owner/assignee surface. **Computed aggregation (no table)** — `getWorklist` now unions **four** sources (`worklist.ts:148-189`):
  1. `CAPAActionItem` where `ownerId == you`,
  2. `CAPA` where `ownerId == you` (the CAPA assignee),
  3. `DeviationTask` where `assigneeId == you` (`deviationTasks`),
  4. `Finding` where `owner == you` and status ∈ `FINDING_ACTIVE_STATUSES` (`Open|In Progress|Submitted|Rework`) (`assignedFindings`).
- All four feed the **combined count / filter / empty-state** machinery and the "Needs rework" band (`WorklistPage.tsx`). Deviation tasks render via `DeviationTaskPanel`, gap findings via `FindingWorkPanel`.
- Return shape (`Worklist`, `worklist.ts:127`): `{ groups, deviationTasks, assignedFindings, openCount, reworkCount, ... }`.

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
