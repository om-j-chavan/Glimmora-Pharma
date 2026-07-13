# STATUS & BACKLOG

> The honest current state of branch `devAI`, what changed this session, what's verified vs needs eyes, known debt, and the **deviation redesign** (agreed but not built — fully captured here so it's resumable from this doc alone).

## Overall state
The app is **broadly COMPLETE and functional** across compliance modules (see [MODULES.md](./MODULES.md)). The platform/admin + plan-subscription area is solid. Since these docs were first written, three large pieces **landed** (deviation redesign, CAPA one-approval reshape, gap-assessment finding workflow) — see the next section. The notable **not-done / risk** items: **the new deviation + finding flows are largely UNTESTED in a browser** (audited-correct, not click-tested end-to-end), client-side MFA, finding comments don't carry to CAPA (#22c), and a few mocked/stubbed surfaces (agi-console drift persistence, governance KPIs, regulatory-intelligence data, inspection UI, platform MFA default).

## Major work landed since these docs were written

> Built across multiple commits on `devAI`. Code-verified for this update; **end-to-end browser testing is still outstanding** for the deviation + finding flows.

### Deviation redesign — BUILT
The priority-split / investigation-first flow described in "THE DEVIATION REDESIGN" (further below — kept as the design reference) is **implemented**: `Deviation.priority` (`Low|Medium|High`, nullable, QA-set from severity), the `capa_pending` status (`src/store/deviation.slice.ts`, `src/constants/statusTaxonomy.ts`), the `DeviationTask` + `DeviationTaskMessage` models, `src/actions/deviation-tasks.ts` (assign → start → submit → review → rework, with the flat message thread + categorized task docs), the CAPA escalation that cancels the open task, the CAPA-close → `capa_pending` unblock, and the Worklist union. Worker UI: `src/modules/worklist/DeviationTaskPanel.tsx`.

### CAPA reshape — BUILT
- **One-approval closure:** independent verification removed; `signAndCloseCAPA` runs from `pending_qa_review` (`closure.ts:110-115`). `verifyCAPA`/`pending_verification` are **legacy-only** (closure still accepts + normalizes a parked `pending_verification`). ⚠️ **`scripts/backfill-capa-retire-verification.ts` MUST be run per-environment** to move any legacy `pending_verification` rows to `pending_qa_review`.
- **Driver → single assignee** (`CAPA.ownerId`); the Worklist assignee evidence panel does **per-category** evidence upload + **per-category rework** (`rejectEvidenceCategory`, `src/actions/evidence.ts`).
- **Carryover generalized** — `convertCategorizedDocsToEvidence` (in `src/actions/capas/lifecycle.ts`) converts a deviation's OR a finding's categorized docs into real CAPA `EvidenceFile`s; one shared helper, fault-isolated.

### Gap Assessment finding workflow — BUILT (clones the deviation loop)
`assignFinding` (Open → In Progress), findings as the **4th `getWorklist` source**, categorized finding docs + notes (`FindingWorkPanel.tsx`), submit/review/rework loop with `FindingMessage`, and `createCAPA({ linkedFindingId })` carryover. Severity-gated disposition (LOW → Assign + Raise CAPA; HIGH/MED/CRIT → Raise CAPA). Round-4 cosmetic polish on the create/detail/edit modals also landed. See [MODULES.md](./MODULES.md#gap-assessment-findings--complete-finding-workflow-added--largely-untested-in-a-browser).

### Worklist — now 4 sources
`getWorklist` unions CAPA action items + CAPA assignee + `DeviationTask` + gap `Finding` (`worklist.ts:148-189`), all in the combined count/filter/empty-state machinery.

### Outstanding / unverified (from the recent gap-assessment audit)
- **#22c — finding comments do NOT carry to the CAPA** on escalation. Docs, owner, and RCA carry; the `FindingMessage` thread is not copied/linked. (Intentional today; flagged if you want it.)
- **Shared-component coverage is PARTIAL** in the finding create form — single-line text → `Input`, selects → `Dropdown`, date → `DatePicker`, but the **Purpose `<textarea>`** and the **file `<input type="file">`** remain raw (no shared Textarea/file component exists).
- **Browser testing** — the deviation-task loop, the finding loop, the per-category CAPA evidence rework, and the carryovers are **audited-correct but not click-tested end-to-end**. Treat as "needs eyes."
- **Backfill** — `backfill-capa-retire-verification.ts` must be run on each environment's DB.

## Bugs fixed this session

| Bug | Symptom | Fix | Where |
|---|---|---|---|
| **2** | Creating a customer account with the plan's **Max users = 0** (or empty) saved the tenant **Active** with no warning (0 was silently floored to 1). | Added a client validation gate in `AccountModal` (block `maxUsers < 1`, `valueAsNumber` so an emptied field is caught not coerced) + a server caps assertion in `assignPlan`. | `AccountModal.tsx`, `AccountPlanFields.tsx`, `src/actions/tenants.ts` |
| **Max sites / Retention** | Same 0/empty hole on the **Max sites** and **Retention** inputs (siblings of Max users). | Applied the identical guard to both (valueAsNumber + `≥1` validation + canSave). | `AccountPlanFields.tsx`, `AccountModal.tsx` |
| **8** | A plan with **expiry earlier than start** saved with no validation. | Superseded by the **duration** feature: expiry is now **derived** from `startDate + durationMonths`, the manual expiry input is gone, and the old `expiry≥start` Zod refine was removed (a positive term is always ordered). | `src/lib/plans.ts`, `src/actions/tenants.ts`, form chain |
| **11** | An expired subscription showed **"Inactive" in the accounts list but "Active" on the detail page** (two different status derivations). | Made the detail header derive subscription status from the same `planState`/expiry logic the list uses. | `src/modules/admin/customer-detail/_components/DetailHeader.tsx` |
| **17** | Area Readiness Heatmap: sites whose only records were **unlinked CAPAs** showed "—"; the **CSV/IT row** read from a `systems` slice that was never seeded. | Added a `capaArea()` source-based fallback for unlinked CAPAs; **re-introduced the `systems` Redux slice** and seeded it from the dashboard server fetch (unioned into `getWorklist`-style seeding). | `src/modules/dashboard/DashboardPage.tsx`, `src/hooks/useTenantData.ts`, `src/store/systems.slice.ts`, `app/(app)/page.tsx` |
| **18** | The **Support page 500'd** — `Ticket/TicketMessage/TicketActivity` existed in the schema but had **no migration** (the old migrations were Postgres-era and unrunnable on SQLite). | Regenerated a clean **SQLite migration baseline** `20260629054845_init` from the current schema (43 tables incl. the 3 Support tables); proved a fresh `migrate deploy` builds them; `dev.db` left untouched. | `prisma/migrations/20260629054845_init/`, `migration_lock.toml` |

## Plan / subscription features added this session
All in `src/lib/plans.ts` (rules) + `src/actions/tenants.ts` (`assignPlan`) + the admin UI. See [FLOWS.md](./FLOWS.md#plansubscription-flow).

1. **Duration (term in months).** New `Plan.durationMonths Int @default(12)`. `expiryDate` is **derived** = `resolveExpiry(startDate, durationMonths)` (dayjs calendar-month math) and stored; the manual expiry input was removed. Auto-fills from tier preset (12), editable only for TAILORED. `PlanCaps`/`PLAN_TIERS`/`TAILORED_CEILINGS`/`resolvePlanCaps`/`validateTailoredCaps` all extended.
2. **Renew (time-only).** A "Renew" button on the tenant detail page extends the term without touching tier/caps. `newStart = max(current expiry, today)`; new expiry derived; reuses the `assignPlan` write path with `renewal:true` → audited as **`PLAN_RENEWED`** (vs `PLAN_ASSIGNED`). Label added to `auditEvents.ts`.
3. **Cap-vs-usage guard (TAILORED).** A TAILORED plan's `maxUsers`/`maxSites` **cannot be set below the tenant's current ACTIVE usage** (strict `<`; equal allowed). Server-authoritative in `assignPlan` (reuses the `planCaps.ts` active-count pattern); mirrored client-side in `AccountModal`.
4. **Retention compliance floor (TAILORED).** A TAILORED plan's `minRetentionYears` **cannot be below 7** (`MIN_TAILORED_RETENTION_YEARS` — matches the data layer's hard 7-year Part 11 file-retention floor). Decoupled from duration/usage. Server + client.

## SQLite decision & migration baseline
- **SQLite is the committed database for all environments.** The Postgres cutover was attempted then **reverted** this session (schema provider + `migration_lock.toml` back to `sqlite`; the `tier` enum reverted to a `String`). See [SETUP-AND-CONFIG.md](./SETUP-AND-CONFIG.md#the-database-decision-read-this).
- The migration folder was **regenerated** as a single SQLite baseline (`20260629054845_init`) — the Bug 18 fix.

## Audited-correct, still need BROWSER verification (not blocking)
- **Bug 1** — "invalid password briefly redirects to dashboard (~1s) then back, no error." **Code audit: correct.** `authClient` uses `signIn(..., { redirect:false })`, and `LoginPage` early-returns with an inline error on `!result.ok` (never a premature `router.push`). The ~1s visual timing can't be confirmed from code — **verify in a browser** with a wrong password.
- **Bug 19** — "dashboard date text overflows the date-picker field." **CSS, render-dependent.** The dashboard doesn't use the `DatePicker` for that text; the likely culprit is the shared `DatePicker` value span lacking `truncate`/`min-w-0` (`src/components/ui/DatePicker.tsx`) — the `Dropdown` already got that fix. **Verify in a browser**; if it reproduces, add `truncate min-w-0` to the span.

## Known limitations / tech debt
- **Retention is a promise only** — `Plan.minRetentionYears` and `EvidenceFile.retainUntil` (+7y) are documented commitments; **there is no purge/archival job** ("no purge before Phase 4"). `AuditLog`/`CAPA`/`Deviation`/`Finding` rows persist indefinitely.
- **`dev.db` has no `_prisma_migrations` history** (built by `db push`) → `migrate deploy` against it would fail; local uses `db push`. (`migrate resolve --applied` would adopt it non-destructively.)
- **MFA login is unfinished on the client** — server email-OTP flow is complete, but there's no OTP input in `LoginPage`/`authClient`, so an `mfaEnabled` tenant can't actually log in via the UI. **Don't enable MFA on a tenant you need UI access to** until this is wired.
- **FastAPI backend JWT is permissive** — token enforcement was removed app-wide (2026-05-15); the only real gate in front of the AI backend is the Next proxy's `auth()` check. Backend default `SECRET_KEY` is hardcoded.
- **AI model mismatch** — backend uses **gpt-4o-mini** (CLAUDE.md says gpt-4o). Pinecone RAG is optional (falls back to plain OpenAI).
- **Mocked / stubbed surfaces:** agi-console **Drift alerts don't persist** (no `DriftAlert` model — in-memory, reset on refresh); governance **KPI tab is mocked**; **regulatory-intelligence data is mocked** (`MOCK_AI_RESPONSES=true`); **Inspection UI** is a "Coming soon" placeholder (data layer exists); **Platform Settings MFA-default toggle not wired**.
- **Audit trail** has no content-hash/tamper-evidence chain yet (actor+timestamp+tenant only); `SignedRecord` provides the cryptographic binding for *signed* events.
- **Two AI base-URL env vars** (`BACKEND_URL`/`NEXT_PUBLIC_API_URL` for the proxy; `NEXT_PUBLIC_AI_API_URL`/hardcoded onrender for the browser) — worth consolidating.
- **`.env.example` and `.do/app.yaml` still reference Postgres** — stale after the SQLite decision.
- **`HANDOVER.md`** (the old root doc) is **stale** — this `docs/handover/` set supersedes it.

---

# DEVIATION REDESIGN — BUILT (design reference, was: mid-design)

**Status: BUILT** (see "Deviation redesign — BUILT" above). This section is **kept as the design reference** — the agreed plan that was implemented. The schema (`Deviation.priority`, `capa_pending`, `DeviationTask` + `DeviationTaskMessage`), the actions (`src/actions/deviation-tasks.ts`), the worklist union, and the worker/QA UI all exist now. Read it for the rationale + SoD/compliance rules; the "Build plan — 4 stages" and "Open questions" below are **historical** (resolved during the build). Anything where the shipped code might differ from this plan is marked **(verify against code)**.

## Why / what changes
The current flow assumes **every deviation is investigated** (`open → under_investigation → pending_qa_review → closed|rejected`, with an RCA step + a CAPA-decision step, all on the deviation). The new flow **splits by priority**: trivial deviations become a lightweight assigned task; serious ones escalate to a CAPA (where the RCA properly lives) while the deviation stays open and linked.

## The new flow (agreed)
1. **Create** — broad roles (any non-`viewer`) can create. **Remove** the `owner` field, **remove** document-upload-at-create, **no RCA** on the deviation. (Note: doc-upload-at-create doesn't exist today anyway; RCA-at-create doesn't either — so mainly `owner` goes.)
2. **QA Head sets PRIORITY** — a new `priority` field, **pre-filled from the FDA `severity`** (Critical/Major/Minor) but **overridable** by QA. Priority drives the split.
3. **LOW priority → lightweight `DeviationTask`:**
   - QA assigns the deviation to **a user** (any active tenant user) **with a message**.
   - The task appears in the assignee's **Worklist**; assignee does the work, **adds a document, submits**.
   - QA **reviews → Close or Rework** (rework sends it back to the assignee).
   - **Optional "Raise CAPA"** escalation on a low deviation → **cancels the open task** and switches to the CAPA path.
4. **HIGH / MEDIUM priority → QA raises a CAPA:**
   - `createCAPA({ linkedDeviationId })` (already exists — links both sides atomically; the deviation already stays open by default).
   - Deviation status → **`capa_pending`** (new), stays **open + linked**.
   - When the CAPA closes, the deviation **UNBLOCKS** but QA still **SIGN-closes** it (Part 11 preserved — **no auto-close**).

## Compliance rules (must hold)
- The **deviation record stays fully Part 11** — every close is password-signed (`DEVIATION_CLOSURE` SignedRecord). Only the **task handling** is lightweight.
- **Low-priority QA close IS signed** too.
- **SoD: assignee ≠ reviewer** on the task (ID-based, like the rest of the app).

## New schema needed
- **`Deviation.priority String`** — `Low | Medium | High` (Zod-validated; SQLite has no enum). Add to schema, `CreateDeviationSchema`, the form schema, the slice + adapter.
- **`capa_pending` status** — add to the status union (`src/store/deviation.slice.ts`), `DEVIATION_STATUSES` (`src/constants/statusTaxonomy.ts`), and `DeviationPage.constants.ts` (badge/label).
- **`DeviationTask` child model** (mirror `CAPAActionItem`): `id`, `tenantId`, `deviationId` (FK, `onDelete: Cascade`), **`assigneeId` (User FK — the Worklist key)** + `assignee` name cache, `message String` (the QA instruction), `dueDate?`, `status` (`pending | in_progress | submitted | closed | rework`), submission (`completionNotes`, `submittedAt`, `submittedById`), review (`reviewedById`, `reviewedAt`, `reworkReason`, `reworkRequestedById`, `reworkRequestedAt`), a document link (reuse `Document` via `linkedModule`/a `deviationTaskId`), the soft-delete quartet, `createdBy`/`createdById`.

## Key reuse facts (from the audit)
- **CAPA link → REUSE.** `createCAPA({ linkedDeviationId })` already raises a CAPA from a deviation and writes both `CAPA.deviationId` (authoritative) + `Deviation.linkedCAPAId` (legacy) atomically, and **leaves the deviation open** (doesn't change its status). **Net-new:** the "deviation closes/unblocks when its CAPA resolves" coupling — nothing couples the two statuses today (CAPA close cascades to `Finding` only, never Deviation).
- **Worklist → NEW.** The Worklist is a **computed CAPA-only aggregation** (`src/lib/queries/worklist.ts`, keyed on `CAPAActionItem.ownerId`/`CAPA.ownerId`); it **never reads Deviation**. So a deviation task needs the new `DeviationTask` model **plus** a small additive union into `getWorklist` (`where: { assigneeId: userId, tenantId, deletedAt:null }`). `CAPAActionItem` is the proven lifecycle template but is CAPA-scoped (no standalone per-item review/close) — hence a new model.
- **SoD → REUSE the ID pattern.** Guard in the review action: `if (task.assigneeId && task.assigneeId === session.user.id) return {error:"reviewer ≠ assignee"}` + a `DEVIATION_QA_ROLES` check; persist actor via `resolveUserFk(...).userId`.
- **Roles → already broad.** Any non-`viewer` can create (`canWriteDeviation`). QA decisions = `DEVIATION_QA_ROLES` (qa_head). Assignee can be any active tenant user (e.g. `operations_head`). 🚩 **There is no generic "operator" role** — assignees are dept-head roles; confirm that's acceptable.

## Build plan — 4 stages, each its own commit
1. **Schema foundation** — add `Deviation.priority`, the `capa_pending` status (union + taxonomy + constants), and the `DeviationTask` model. `prisma db push` + `prisma generate`. Update the slice + adapter types. *(Commit: "deviation redesign (1/4): schema foundation".)*
2. **Create-form changes** — remove `owner` from the create schema/form/action; ensure no doc-upload/RCA at create; default `priority` from `severity`. *(Commit 2/4.)*
3. **Priority split + CAPA coupling** — QA sets/confirms priority; HIGH/MED → raise CAPA (reuse `createCAPA(linkedDeviationId)`) + set status `capa_pending`; add the CAPA-close→deviation-unblock coupling (and keep the Part-11 sign-close — no auto-close); broaden/retire the current Critical-only close gate as needed. *(Commit 3/4.)*
4. **Low-priority DeviationTask subsystem** — assign (assigneeId + message + notify), assignee submit (notes + document), QA review → close|rework, the "Raise CAPA cancels the task" escalation, **union into `getWorklist`**, and the **SoD assignee≠reviewer** guard. *(Commit 4/4.)*

## Open questions to confirm before building (flagged in the audit)
- **`priority` definition** — independent QA field vs derived from severity, and how the 3 impact fields (patient/product/regulatory) relate. (Agreed: pre-fill from severity, overridable.)
- **Close-coupling + e-signature** — confirmed: **no auto-close**; QA always sign-closes; CAPA-close only *unblocks*.
- **Scope acknowledgement** — this **replaces** the investigation + CAPA-decision steps (a flow rewrite of `deviations.ts` + `DeviationInvestigation.tsx`), not a bolt-on.
- **Assignee document upload** — verify the document pipeline lets a non-author (e.g. `operations_head`) upload to a `DeviationTask` (the `isAssignedToTask` predicate already exists for owner-path access).
- **No "operator" role** — assignees are dept-head roles; confirm acceptable or add roles.

## Reference: relevant files for the build
`prisma/schema.prisma` (Deviation ~531-632), `src/actions/deviations.ts` (all transitions), `src/modules/deviation/{DeviationPage,DeviationInvestigation,DeviationPage.schemas,DeviationPage.constants,DeviationPage.adapter}.tsx`, `src/store/deviation.slice.ts`, `src/constants/statusTaxonomy.ts`, `src/lib/queries/worklist.ts` + `src/actions/worklist.ts` + `src/modules/worklist/*` (task integration), `src/actions/capas/lifecycle.ts` (`createCAPA`), `src/lib/permissions/roleSets.ts` (`DEVIATION_QA_ROLES`, `canWriteDeviation`).
