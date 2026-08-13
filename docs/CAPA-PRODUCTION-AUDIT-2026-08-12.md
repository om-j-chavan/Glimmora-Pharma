# CAPA Tracker — Production Readiness Audit

**Date:** 2026-08-12 · **Scope:** CAPA Tracker module, Pharma Glimmora
**Method:** Static trace (UI → state → server actions → Prisma), Prisma schema + live `prisma/dev.db` inspection, `tsc --noEmit`, `eslint`, `npm run test:unit`, `next build`.
**No code was modified.** The only side effect was regenerating the local dev Prisma client (a gitignored build artifact) to confirm a build failure was environmental — see T-4.

---

## Executive Summary

**Overall status: NOT READY — CRITICAL ISSUES**

The CAPA Tracker is a genuinely mature module. Multi-tenant isolation in the Next.js layer is, on inspection, **excellent** — every one of the ~20 Prisma access points in `src/actions/capas/` and `src/lib/queries/capas.ts` carries an explicit `tenantId` filter, both file-download routes are tenant-scoped and return a 404-shaped response to avoid existence leaks, and lifecycle transitions use optimistic-locked `updateMany` guards. Submission readiness is computed by one shared pure function (`src/lib/capa-readiness.ts`) imported by both client and server, so the checklist and the gate cannot disagree. Separation-of-duties on closure is real and enforced by FK, not by display name.

It is blocked from production by two defects, plus a cluster of correctness problems:

1. An **AI recurrence engine that compares real CAPAs against a hardcoded fixture of five fictional CAPAs, then writes a "FAILED — Recurrence Detected" verdict onto real, closed GxP effectiveness records** based on an LLM-returned identifier that is never validated.
2. **CAPA field-change audit records contain no previous value, no new value, and no record title** — verified against the live database. This does not meet 21 CFR Part 11 §11.10(e).

Beyond those: the "overdue" KPI silently excludes CAPAs sitting in QA review (a CAPA in the dev database is **70 days past due and reports as not overdue**), the whole register is loaded unpaginated and filtered in the browser with no sorting, `CAPA.tenantId` and the entire `AuditLog` table are unindexed, and delete/archive does not exist at all.

| Category | Verdict |
|---|---|
| Multi-tenant isolation (Next.js layer) | **Strong** — no cross-tenant defect found |
| RBAC / authorization | Strong server-side; one gap on file downloads |
| Workflow state machine | Works, but carries two dead states and one deadlock |
| Data / KPI correctness | **Several defects** |
| Date & period filtering | **Feature absent**; timezone defects in what exists |
| Audit trail / Part 11 | **Fails §11.10(e)** |
| Documents / evidence | Strong |
| Performance | **Will not scale past ~1,000 CAPAs** |
| AI features | **One critical defect**; the rest are real and sound |
| Test coverage | **Effectively zero for CAPA** |

---

## 1. The actual CAPA flow

### Files and routes

| Layer | Path |
|---|---|
| List route | `app/(app)/capa/page.tsx` (+ `loading.tsx`, `error.tsx`) |
| Detail route | `app/(app)/capa/[id]/page.tsx` |
| AI lifecycle route | `app/(app)/ai-capa/page.tsx`, `app/(app)/ai-capa/[capaId]/page.tsx` |
| List shell | `src/modules/capa/CAPAPage.tsx` |
| Tabs | `tabs/QMSBlueprintTab.tsx`, `tabs/CAPATrackerTab.tsx`, `tabs/CAPAMetricsTab.tsx` |
| Detail shell | `src/modules/capa/CAPADetailPageV2.tsx` (live) · `CAPADetailPage.tsx` (superseded, still compiled) |
| Modals | `AddCAPAModal.tsx`, `EditCAPAModal.tsx`, `SignCloseModal.tsx`, `AIGenerateCAPAModal.tsx` (unreachable — F-6) |
| State | `src/store/capa.slice.ts` (Redux, non-persisted), hydrated from server props |
| Mapper | `src/lib/mappers/capaMapper.ts` |
| Reads | `src/lib/queries/capas.ts` |
| Writes | `src/actions/capas/{lifecycle,closure,alignment,rca-review,verification,action-items,effectiveness,sod-override}.ts`, `src/actions/capa-comments.ts`, `src/actions/evidence.ts` |
| Shared gate | `src/lib/capa-readiness.ts` |
| Permissions | `src/lib/permissions/roleSets.ts`, `src/hooks/usePermissions.ts` |
| File download | `app/api/evidence/files/[id]/route.ts`, `app/api/documents/[id]/route.ts` |

### Data model

`CAPA` (61-field model) → `CAPAActionItem`, `EvidenceItem` → `EvidenceFile`, `CAPAComment`, `CAPAEffectivenessCriterion`, `CAPAApproval`, `CAPASODOverride`, `CAPAChangeControlLink`. Links out to `Finding` (1:1), `Deviation` (1:1), `GxPSystem`, `Risk`, `SignedRecord` (closure / verification / effectiveness), `User` (creator / owner / rejecter), `Site`, `Tenant`.

### Per-operation trace

| Operation | Path | Status |
|---|---|---|
| **Create** | `AddCAPAModal` → `createCAPA` (`lifecycle.ts:411`) → tx: reference alloc + `cAPA.create` + evidence init + source-record linking + carryover | Works. `qa_head` only. |
| **View list** | `page.tsx` → `getCAPAs(tenantId)` → Redux → `useTenantData` (tenant+site filter) → `CAPATrackerTab` | Works. Unpaginated — H-4. |
| **View detail** | `[id]/page.tsx` → `getCAPA` + 8 parallel loaders → `CAPADetailPageV2` | Works. |
| **Edit** | `EditCAPAModal` → `updateCAPA` (`lifecycle.ts:1061`) | Works. Audit has no values — C-2. Locked after submit. |
| **Delete / archive** | `deleteCAPA` exists, soft-delete + audit | **Unreachable — H-6.** No UI caller; `ADMIN_DELETE_ROLES = []`. |
| **Status: open → in_progress** | `startCAPAProgress` (`lifecycle.ts:1817`) | Only reachable via Edit-modal auto-advance when RCA text is present. No explicit control. |
| **Status: → pending_qa_review** | `submitForReview` (`lifecycle.ts:1389`) | Works. Enforces `getCAPAReadiness` server-side. Locks evidence. |
| **Status: → closed** | `signAndCloseCAPA` (`closure.ts:69`) | Works. Part 11 signature, SoD, all-accepted gate, concerns gate. |
| **Reject** | `rejectCAPA` (`lifecycle.ts:1571`) | Works — bounces to `in_progress`, not `rejected`. |
| **Reopen** | `reopenCAPA` (`lifecycle.ts:1859`) | Works. Reason ≥10 chars, unlocks artifacts, audited with old/new. |
| **Assign owner** | `updateCAPA` → `resolveOwnerUserId` → `ownerId` FK + notification | Works. Change not captured in audit values — C-2. |
| **Due date / risk** | `updateCAPA` | Works. Server-side date validation absent — M-5. |
| **Action items** | `action-items.ts` (accept / send back / skip / reassign / cancel / nudge) | Works, individually audited. |
| **Evidence** | `evidence.ts` → `EvidenceItem`/`EvidenceFile`; download via API routes | Works. Size + MIME + hash + retention + lock. |
| **Comments** | `capa-comments.ts` (add / resolve / reopen / edit / soft-delete, concern threads) | Works, audited. |
| **Approvals** | Retired in Phase 4 — Sign & Close *is* the approval | Intentional. `CAPAApproval` model retained for Part 11 immutability. |
| **Effectiveness** | `effectiveness.ts` + `getEffectivenessChecksDue` | Works. Signed. |
| **Audit history** | `getCapaAuditTrail` → modal on detail page | Works. Unindexed query — H-3. |
| **AI** | Ask AI search, Readiness Copilot, AI CAPA lifecycle, AI Generate modal | Mixed — see §15. |

---

## 2. Findings

### CRITICAL

---

**ID: C-1**
**Severity:** CRITICAL
**Title:** AI recurrence engine compares against a hardcoded fixture, then mutates real GxP effectiveness records on an unvalidated LLM-returned identifier
**File/route:** `pharma_glimmora_ai_backend/app/routers/capa_router.py:38-80`, `:163`, `:219-256`; reachable from `src/modules/ai-capa/AiCapaPage.tsx:104` (`capaCreate`)

**Evidence:**
```python
# capa_router.py:38 — the entire comparison corpus
HISTORICAL_CAPAS = [
    {"capa_id": "CAPA-2023-089", "problem_statement": "Coating defects on Coater #3 ...",
     "status": "Closed", "was_effective": False, ...},
    ... 4 more fictional entries ...
]

# :163 — this fixture IS the prompt's history
history = json.dumps(HISTORICAL_CAPAS, indent=2)

# :219 — the LLM's output is then used as a database key
def _check_12_month_recurrence(db, similar_capas, customer_id):
    for sc in similar_capas:                       # sc came from the LLM
        if sc.get("similarity_score", 0) >= 0.75:
            old_capa = db.query(CAPA).filter(
                CAPA.capa_id == sc.get("capa_id"), # unvalidated LLM string
                CAPA.customer_id == customer_id).first()
            if old_capa and old_capa.status == "Closed":
                ...
                eff.effectiveness_rating = "FAILED - Recurrence Detected"
                eff.capa_can_be_closed   = False
                db.commit()
```

**Expected behavior:** Recurrence detection compares a new CAPA against *the tenant's own* CAPA history. No GxP record is altered on the strength of a model output without human confirmation and an audit record.

**Actual behavior:** The LLM reasons entirely over five invented CAPAs. Its `similar_capas[].capa_id` values are fed straight into a `WHERE` clause. Any collision with a real closed CAPA in that tenant flips that CAPA's effectiveness verdict to `"FAILED - Recurrence Detected"` and sets `capa_can_be_closed = False` — committed immediately, with no Prisma `AuditLog` row, no `SignedRecord`, and no reviewer.

**Business/compliance impact:** A falsified quality determination written onto a closed GxP record. "This CAPA was ineffective" is a regulator-visible conclusion that here can originate from a hallucination over fiction. Directly exposed under 21 CFR 211.192 and Part 11 §11.10(a)/(e).

**Security impact:** Model-output-to-SQL-predicate with no allowlist. The write is tenant-scoped, so it is not a cross-tenant issue, but it is an unauthenticated-in-effect mutation of compliance state.

**Recommended fix:** (a) Replace `HISTORICAL_CAPAS` with a tenant-scoped query over real CAPAs. (b) Intersect LLM-returned `capa_id`s against the ids actually supplied in the prompt before any lookup — never trust a model string as a key. (c) Remove the write entirely: recurrence should *raise a flag for QA review*, never mutate an effectiveness verdict. (d) If any write remains, wrap it in an audit record naming the AI actor.

**Production blocker: Yes**

---

**ID: C-2**
**Severity:** CRITICAL
**Title:** CAPA field-change audit records contain no previous value, no new value, and no record title
**File/route:** `src/actions/capas/lifecycle.ts:1297-1307`

**Evidence:** The entire audit payload written for any CAPA edit:
```ts
await prisma.auditLog.create({
  data: {
    tenantId: session.user.tenantId,
    userId: actor.userId, userName: actor.displayName, userRole: actor.role,
    module: "CAPA", action: "CAPA_UPDATED", recordId: id,
    // no oldValue, no newValue, no recordTitle
  },
});
```
Confirmed against `prisma/dev.db`:
```
action              n   nullOld  nullNew  nullTitle
CAPA_UPDATED        2   2        2        2
CAPA_RCA_APPROVED   7   7        7        0
```

**Expected behavior:** 21 CFR Part 11 §11.10(e) requires computer-generated, time-stamped audit trails that record operator entries and actions *and do not obscure previously recorded information*. A change to owner, due date, or risk classification must be reconstructible.

**Actual behavior:** Title, description, risk/severity, owner, due date, RCA text, RCA method, and DI-gate detail all collapse into one valueless `CAPA_UPDATED` row. An inspector asking "who moved this Critical CAPA's due date out by 60 days, and from what?" cannot be answered from the audit trail. `CAPA_RCA_APPROVED` has the same gap.

**Note on partial coverage:** other transitions *do* capture values correctly — `CAPA_REOPENED` (`lifecycle.ts:1906-1907`), `CAPA_PROGRESS_STARTED` (`:1844-1845`), and every `*_BLOCKED_*` row carry `oldValue`/`newValue`. The defect is specific to the field-edit and RCA-approval paths.

**Business/compliance impact:** Part 11 non-conformance on the module's most frequently used mutation. A near-certain 483 observation.

**Recommended fix:** Diff `before` (already fetched at `lifecycle.ts:1124` — widen the `select`) against `parsed.data`, and write `oldValue`/`newValue` as JSON of only the changed fields, plus `recordTitle: before.reference`. Apply the same to `reviewRCA`.

**Production blocker: Yes**

---

### HIGH

---

**ID: H-1**
**Severity:** HIGH
**Title:** "Overdue" excludes CAPAs in QA review — a 70-day-overdue CAPA reports as not overdue
**File/route:** `src/types/capa.ts:40-47`; `src/modules/capa/CAPAPage.tsx:176,184,314`; `src/lib/queries/capas.ts:448`

**Evidence:**
```ts
// types/capa.ts
export function isOverdue(capa) {
  if (capa.status !== "open" && capa.status !== "in_progress") return false;   // ← excludes pending_qa_review
  if (!capa.dueDate) return false;
  return new Date(capa.dueDate) < new Date();
}
```
Live data (tenant `cmq9ezjyi…`, evaluated 2026-08-12):
```
total 15 | non-closed 14 | isOverdue() says 13 | actually past due 14
CAPA-CHN-2026-002  status=pending_qa_review  due=2026-06-03   ← 70 days late, counted as NOT overdue
```

Three different definitions of "overdue" coexist:
- `isOverdue()` — `open|in_progress` only → drives the page header, Metrics "Overdue rate", and the Due-date column badge.
- `getCAPAStats.overdue` (`queries/capas.ts:448`) — same rule, **dead code, zero consumers**.
- `overdueQueue` (`CAPATrackerTab.tsx:152`) — `status !== "closed" && (isOverdue(c) || hasOverdueActionItem(c))` → drives the triage card. Catches the above CAPA *only if* it has an overdue action item.

**Expected behavior:** A CAPA past its committed due date is overdue regardless of which workstation holds it. Ageing does not stop because the record moved to QA's desk.

**Actual behavior:** The moment a CAPA is submitted for review, it disappears from every overdue count. The header, the Metrics KPI, and the triage card can each report a different number for the same tenant.

**Business/compliance impact:** Systematic under-reporting of CAPA ageing — precisely the metric a regulator asks for. A backlog stuck in QA review is invisible.

**Recommended fix:** One exported `isOverdue()` = `status !== "closed" && dueDate < now`. If "in QA review" should be excluded, that must be an explicit, labelled second metric — not the default. Delete `getCAPAStats` or point it at the same helper.

**Production blocker: Yes**

---

**ID: H-2**
**Severity:** HIGH
**Title:** `pending_verification` is unmapped and silently renders as "Open"
**File/route:** `src/lib/mappers/capaMapper.ts:124-138,151`

**Evidence:**
```ts
export const STATUS_MAP: Record<string, CAPAStatus> = {
  open, in_progress, pending_qa_review, closed, rejected,   // pending_verification absent
  Open, "In Progress", "Pending QA Review", Closed,
};
...
status: STATUS_MAP[row.status] ?? "open",   // ← unmapped falls through to "open"
```
`pending_verification` is a live value: `closure.ts:222` accepts it for closure and comments that "legacy CAPAs parked in pending_verification stay closeable"; `verification.ts:64` requires it.

**Expected behavior:** A CAPA awaiting independent verification renders as "Pending Verification" (the label exists in `types/capa.ts:30` and `statusTaxonomy.ts:98`).

**Actual behavior:** It renders as **Open** in the register, is counted in the "Open" slice of the status donut, matches the "Open" status filter, and — because `isOverdue()` accepts `open` — can be flagged Overdue. The detail page handles the status correctly (`CAPADetailPageV2.tsx:461`), so list and detail disagree.

**Business/compliance impact:** Misstated status on a GxP register. Population depends on whether `scripts/backfill-capa-retire-verification.ts` has been run in the target environment — it is a script, not a migration, so this is not guaranteed.

**Recommended fix:** Add `pending_verification: "pending_verification"` to `STATUS_MAP`, and change the fallback from `?? "open"` to a logged unknown rather than a silent coercion.

**Production blocker: Yes** (unless the backfill is verified to have run and is enforced by migration)

---

**ID: H-3**
**Severity:** HIGH
**Title:** `CAPA.tenantId` is unindexed and `AuditLog` has no indexes at all
**File/route:** `prisma/schema.prisma` (CAPA `@@index` block, AuditLog model)

**Evidence:** `sqlite_master` on `prisma/dev.db`:
```
CAPA indexes:  reference_key, findingId_key, verificationSignatureId_key,
               effectivenessSignatureId_key, closureSignatureId_key,
               deviationId_key, effectivenessDate_idx, deletedAt_idx
               → NO index on tenantId, status, dueDate, siteId, ownerId, createdAt

AuditLog indexes: sqlite_autoindex_AuditLog_1 (primary key only)
                  → NO index on tenantId, recordId, createdAt, module, action
AuditLog rows: 1,137 and growing unbounded
```
The two hottest queries in the module:
- `getCAPAs` — `where {tenantId, deletedAt}` + `orderBy createdAt desc` → full scan + filesort, once per list page load.
- `getCapaAuditTrail` — `where {tenantId, recordId}` + `orderBy createdAt desc take 200` → **full `AuditLog` scan**, once per detail page load.

`CAPAActionItem`, by contrast, is properly indexed (`tenantId_capaId`, `capaId_sequence`, `dueDate`, `ownerId`, `deletedAt`) — the omission on `CAPA` and `AuditLog` looks accidental.

**Business impact:** The audit trail is append-only and grows forever. At production volume every CAPA detail page view scans it.

**Recommended fix:** Add `@@index([tenantId, deletedAt, createdAt])`, `@@index([tenantId, status])`, `@@index([tenantId, dueDate])`, `@@index([ownerId])` to `CAPA`; add `@@index([tenantId, recordId, createdAt])` and `@@index([tenantId, createdAt])` to `AuditLog`.

**Production blocker: Yes**

---

**ID: H-4**
**Severity:** HIGH
**Title:** Entire CAPA register loaded unpaginated with children; search/filter client-side; no column sorting
**File/route:** `app/(app)/capa/page.tsx:20`; `src/lib/queries/capas.ts:114-126`; `src/modules/capa/tabs/CAPATrackerTab.tsx:173-193, 273-384`

**Evidence:**
```ts
export const getCAPAs = cache(async (tenantId: string) => {
  return prisma.cAPA.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { deviation: …, finding: …, actionItems: … },   // no take, no skip
  });
});
```
All six filters plus free-text search run in the browser over the full array (`CAPATrackerTab.tsx:173-193`). `DataTableBase` supports per-column `sortable` (`src/components/table/DataTableBase.tsx:76,211,250`) but **no CAPA column sets it**, and `DataTableBase` has no pagination at all.

**Scalability assessment:**
| Volume | Behavior |
|---|---|
| 100 CAPAs | Fine |
| 1,000 CAPAs | Sluggish; large RSC payload; every keystroke re-filters ~1,000 objects with nested arrays |
| 10,000+ CAPAs | Not usable — multi-MB serialized payload, 10,000 DOM rows, unindexed scan + filesort on every load |

Secondary effect: the "Ask AI" search (`src/lib/aiSearch.ts`) executes against the Redux array, so it silently depends on everything being loaded.

**Recommended fix:** Move to `components/table/DataTable`'s server mode (already used by `/audit-trail`, with a `loadAuditTrail`-style fetcher) — server-side paging, filtering, and sorting. Set `sortable: true` on reference/risk/status/owner/due at minimum.

**Production blocker: Yes** for any tenant expected to exceed ~1,000 CAPAs; otherwise HIGH.

---

**ID: H-5**
**Severity:** HIGH
**Title:** Closure deadlocks — single-QA tenants can never close a Critical CAPA, and any edit can self-lock the closer
**File/route:** `roleSets.ts:206,621`; `closure.ts:133-171,177-214`; `sod-override.ts:82-84`; `EditCAPAModal.tsx:101`; `lifecycle.ts:1212-1235`

**Evidence — deadlock A (structural):**
```
CAPA_CREATE_ROLES = ["qa_head"]      CAPA_CLOSE_ROLES = ["qa_head"]
closure.ts:136  → creator === closer is blocked
sod-override.ts:82 → Critical is a hard floor; the single-QA override never applies
```
`prisma/dev.db` contains a tenant with exactly one `qa_head` (`tenant-1784621325266`). For that tenant, every Critical CAPA is created and closable only by the same person, and the override is unavailable → **permanently unclosable**.

**Evidence — deadlock B (accidental self-lock):**
```ts
// EditCAPAModal.tsx:101 — with no rcaMethod and no prior RCA this yields ""
const rcaText = (data.rcaMethod ? rcaDetailToText(...) : "") || (capa.rca ?? "");
// CAPADetailPageV2.tsx:322 sends it unconditionally
rca: data.rca ?? ""
// lifecycle.ts:1212, 1235 — "" !== null counts as an RCA change
const rcaChanged = parsed.data.rca !== undefined && parsed.data.rca !== before.rca;
const rcaAuthorData = (rcaChanged || rcaMethodChanged) ? { rcaEditedById: actor.userId } : {};
// closure.ts:177 — and that stamp blocks closure
if (existing.rcaEditedById && existing.rcaEditedById === session.user.id) { … block … }
```
Editing only the *title* of an RCA-less CAPA makes the editor its recorded "RCA author", after which they may not sign the closure. `rcaEditedById` is currently null on all 16 CAPAs in dev, so this has not yet bitten — it will on the first edit-then-close.

**Business impact:** Critical CAPAs stuck open indefinitely, with no error message that explains a structural impossibility ("Separation of duties requires a different signer" — when no other signer can exist).

**Recommended fix:** (a) Compare trimmed values and treat `""`/`null` as equal before stamping `rcaEditedById`. (b) Detect at tenant level when no eligible independent closer exists and surface an actionable message, or widen `CAPA_CLOSE_ROLES` for Critical to include `regulatory_affairs` (already an approver tier).

**Production blocker: Yes** for single-QA tenants.

---

**ID: H-6**
**Severity:** HIGH
**Title:** Delete / archive is not available to any role and has no UI
**File/route:** `src/lib/permissions/roleSets.ts:202`; `src/actions/capas/lifecycle.ts:1919,1977`

**Evidence:**
```ts
export const ADMIN_DELETE_ROLES: readonly string[] = [];   // emptied
```
`deleteCAPA` and `restoreCAPA` both gate on it and return *"Only an administrator can delete a CAPA."* for every role including `super_admin`. `capaCan.canDelete = has([]) && gxpOk` is always `false`. A repo-wide grep finds **no UI caller for `deleteCAPA`**, and `restoreCAPA` is not even re-exported from the `src/actions/capas.ts` barrel.

**Expected behavior:** A pharma quality system needs a controlled, reason-captured, audited archive path for records raised in error.

**Actual behavior:** A CAPA created by mistake is permanent. The soft-delete columns (`deletedAt`, `deletedById`, `deletedByName`, `deletionReason`), the `deletedAt` index, and the filtered read queries all exist and are all unreachable.

**Recommended fix:** Decide the policy explicitly. If deletion is intentionally forbidden, remove the dead actions and document it. If not, grant a role, build the UI, and make `reason` mandatory (see L-5).

**Production blocker: No** — but it is an unstated gap against the stated scope.

---

**ID: H-7**
**Severity:** HIGH
**Title:** The AI CAPA lifecycle is a parallel, unaudited system of record, open to every role
**File/route:** `app/(app)/ai-capa/[capaId]/page.tsx:7-17`; `src/modules/ai-capa/AiCapaPage.tsx`; `src/modules/capa/tabs/CAPATrackerTab.tsx:365-375`

**Evidence:** `/ai-capa/[capaId]` runs a full second CAPA lifecycle — RCA, action plan, monitoring, effectiveness, closure — against the FastAPI service (`rcaSubmit`, `actionPlanSubmit`, `monitoringCheck`, `effectivenessCheck`, `closureInitiate`). None of these touch Prisma: no `AuditLog` row, no `SignedRecord`, no change to `CAPA.status`.

Its `ALLOWED_ROLES` is every role including **`viewer`**, while the real CAPA module is locked to `qa_head` + `customer_admin` (`roleSets.ts:255`, enforced by `redirect("/worklist")` in both routes). The entry point is a sparkle button rendered on **every** tracker row:
```tsx
onClick={(e) => { e.stopPropagation();
  router.push(`/ai-capa/${encodeURIComponent(c.reference ?? c.id)}`); }}
```
with an in-code acknowledgement that non-AI-tracked CAPAs simply hit an empty state. The AI-side id mapping is cached in `localStorage` (`AiCapaPage.tsx:63-73`).

**Business/compliance impact:** Two divergent lifecycles for the same CAPA. "Closing" a CAPA in the AI lifecycle produces no Part 11 signature and leaves the authoritative record open. Roles deliberately excluded from CAPA can read and drive it.

**Recommended fix:** Align `/ai-capa` route roles with `CAPA_MODULE_VIEW_ROLES`; make the sparkle conditional on an actual AI record; and either reconcile AI-side stage completions back into Prisma with audit rows, or label the page unambiguously as advisory and make it read-only.

**Production blocker: Yes** on the role scope; the architectural split is HIGH.

---

### MEDIUM

**ID: M-1 — No date or period filter exists anywhere in the CAPA module.**
`CAPATrackerTab.tsx:228-241` offers search, site, status, risk, source, assignee, and Clear filters — no date control. `CAPAMetricsTab` has none. The audit brief's Today / Last 7 / 30 / 90 / This month / Previous month / Custom range are **not implemented**, so questions about boundary handling, clear/reset, and invalid ranges are moot. The only time window is a hardcoded rolling 6 months in the Metrics trend (`CAPAPage.tsx:188-197`). *Fix: if period filtering is required, implement it server-side and label each KPI as point-in-time or period-scoped so the "created in the last 30 days" vs "currently overdue" distinction is explicit in the UI.*

**ID: M-2 — Metrics trend mixes local and UTC month boundaries.**
`CAPAPage.tsx:191-193` builds bucket keys from `dayjs()` (browser-local) but assigns CAPAs with `dayjs.utc(c.createdAt).format("MMM YYYY")`. The tenant's configured `org.timezone` — honoured everywhere else in the module — is ignored entirely. CAPAs created near a month boundary land in the wrong bar, and two users in different timezones see different charts.

**ID: M-3 — Due dates shift by a day on edit in non-UTC tenants.**
The table renders `dayjs.utc(c.dueDate).tz(timezone).format(dateFormat)` (`CAPATrackerTab.tsx:341`); the edit form seeds from `dayjs.utc(capa.dueDate).format("YYYY-MM-DD")` (`EditCAPAModal.tsx:74`); the server stores `new Date("YYYY-MM-DD")` = midnight UTC (`lifecycle.ts:1259`). For a tenant at UTC+5:30, a due date displayed as 13 Aug appears as 12 Aug in the form, and saving without touching the field moves it back a day. This also shifts `isOverdue`.

**ID: M-4 — Server accepts any string as a due date; edit form allows past dates.**
`CreateCAPASchema.dueDate: z.string().min(1).optional()` and `UpdateCAPASchema.dueDate: z.string().optional()` — no date-format check, no range check. `AddCAPAModal` uses `<DatePicker min={todayISO}>` (`:215`) but `EditCAPAModal` uses a bare `<input type="date">` with no `min` (`:153`), so past due dates are freely settable on edit and via direct action call on create. A malformed string reaches `new Date(...)` → Invalid Date → Prisma throws → generic *"Failed to update CAPA"*. *Fix: `z.string().datetime()` or an ISO-date regex plus an explicit past-date policy, enforced server-side.*

**ID: M-5 — Every lifecycle action operates on soft-deleted CAPAs.**
Only `deleteCAPA` filters `deletedAt: null` (`lifecycle.ts:1937`). `updateCAPA`, `clearDIGate`, `submitForReview`, `rejectCAPA`, `startCAPAProgress`, `reopenCAPA`, and `signAndCloseCAPA` all omit it, so a deleted CAPA remains fully mutable and closable while invisible in the register. Latent only because H-6 makes deletion unreachable — it becomes live the moment a deleter role is granted.

**ID: M-6 — Effectiveness triage card count is tenant-wide while the table is site-filtered.**
`getEffectivenessChecksDue(tenantId)` (`queries/capas.ts:460`) has no site scope, but `useTenantData` filters `capas` by `selectedSiteId` (`useTenantData.ts:84-92`). With a site selected the card shows the tenant-wide number and clicking it filters the table to a strict subset — count ≠ rows. The Waiting and Overdue cards derive from the same filtered array and are consistent.

**ID: M-7 — Evidence and document downloads are tenant-scoped but not role- or record-scoped.**
`app/api/evidence/files/[id]/route.ts:27-48` and `app/api/documents/[id]/route.ts:19-43` check only `auth()` + tenant match. A `viewer` or `operations_head` — roles that `redirect("/worklist")` off `/capa` — can retrieve any CAPA evidence file in the tenant by iterating ids. Tenant isolation itself is correct (404-shaped response, no existence leak). *Fix: add a capability check mirroring the module's view gate, or an owner/assignee path.*

**ID: M-8 — CAPA reference sequence is allocated globally, not per tenant.**
`lifecycle.ts:572-593` reads the max reference with `where: { reference: { startsWith: \`${prefix}-${year}-\` } }` and **no `tenantId` filter** — a documented trade-off of the global `@unique` on `CAPA.reference`. For tenants with no site code the prefix is `CAPA` for everyone, so all tenants share one sequence. Two consequences: (a) gaps in a tenant's CAPA register, which an inspector will ask about; (b) a low-grade cross-tenant oracle — the gap size between your consecutive references reveals other tenants' creation volume. *Fix: `@@unique([tenantId, reference])` and scope the max lookup.*

**ID: M-9 — On-time closure rate counts unknowns as on-time.**
`CAPAPage.tsx:183`: `!dayjs.utc(c.closedAt || c.dueDate).isAfter(dayjs.utc(c.dueDate))`. A closed CAPA with null `closedAt` compares `dueDate` to itself → not after → **on time**. A null `dueDate` maps to `""` (`capaMapper.ts:150`) → `dayjs.utc("")` is invalid → `isAfter` false → **on time**. Both unknowns inflate the KPI. No such rows exist in dev, so this is latent.

**ID: M-10 — Upload MIME type is trusted from the client.**
`evidence.ts:349` checks `ALLOWED_MIME_TYPES.has(file.type)` — the browser-declared type, with no magic-byte verification. Mitigated by `Content-Disposition: attachment` on both download routes, but neither route sets `X-Content-Type-Options: nosniff`, and `Content-Type` is echoed from the stored value. Everything else about the upload path is strong: size cap, empty check, SHA-256 content hash, `sanitizeFilename`, hash-prefixed storage key (naturally idempotent on duplicates), 7-year retention, evidence-lock check, layered RBAC, and an audit row.

**ID: M-11 — Two dead states and one orphaned stage in the state machine.**
`"rejected"` is never written by any action — `rejectCAPA` bounces to `in_progress` (`lifecycle.ts:1652`), and a grep of every `status: "…"` write across `src/actions/capas/` confirms no producer. Yet it persists in `STATUS_LABEL`, `statusTaxonomy`, `LOCKED_CAPA_STATUSES`, `reopenCAPA`'s guard (`:1876`), and the tracker's reopen-button condition (`CAPATrackerTab.tsx:376`). Likewise `verifyCAPA`/`revokeCAPAVerification` require `pending_verification`, which nothing sets — the entire Independent QA Verification stage is unreachable code that `types/capa.ts:13-19` still documents as live.

**ID: M-12 — Essentially zero automated test coverage for CAPA.**
`npm run test:unit` runs 6 tests, all in `src/actions/frameworks.guard.test.ts`. There are no unit tests for `getCAPAReadiness`, no state-machine tests, no SoD tests, no tenant-isolation tests, and no Playwright specs covering the CAPA path. For the module carrying the product's Part 11 signing flow, this is the largest process gap in the audit.

---

### LOW

| ID | Finding | Location |
|---|---|---|
| **L-1** | `AIGenerateCAPAModal` is dead code. `CAPAPage` passes `onAiOpen`, but `CAPATrackerTab` never destructures it (`:99-104`), so `setAiOpen` is never called and the modal cannot open. | `CAPAPage.tsx:152,362,408` |
| **L-2** | The AI-CAPA degraded path shows a green **success** popup after a server rejection: `createCAPA` failure is caught, a synthetic row is pushed into Redux, and `Popup variant="success"` announces "AI CAPA generated" with the failure as a parenthetical. Latent — unreachable via L-1. | `CAPAPage.tsx:464-515,541` |
| **L-3** | Client `auditLog()` does `String(entry.newValue)`, so the object passed at `CAPAPage.tsx:504` would persist as `"[object Object]"`. Latent via L-1. | `src/lib/audit.ts:33-34` |
| **L-4** | `getCAPAStats` is exported and re-exported from the queries barrel with **zero consumers**. Dead code that also encodes the H-1 overdue bug. | `queries/capas.ts:442`, `queries/index.ts:11` |
| **L-5** | `deleteCAPA(id, reason?)` — reason is optional, unvalidated, and silently truncated to 200 chars. Reopen requires ≥10 chars and reject enforces `REJECT_REASON_MIN`; deletion, the most destructive act, requires nothing. | `lifecycle.ts:1919,1952` |
| **L-6** | `/capa/[id]` has neither `loading.tsx` nor `error.tsx`, while `/capa` has both. The detail route fetches 11 queries with no skeleton. | `app/(app)/capa/[id]/` |
| **L-7** | The triage "Waiting on you" card computes `canApprove` from `usePermissions("capa")` with no `capaRisk`, so `getModuleCapabilities` defaults to the `"High"` approval tier regardless of each CAPA's actual risk. | `CAPATrackerTab.tsx:112,139` |
| **L-8** | AI backend `_next_id` allocates CAPA ids globally across customers — the same class of issue as M-8. | `capa_router.py:84-95` |
| **L-9** | `CAPADetailPage.tsx` (598 lines) is superseded by `CAPADetailPageV2` but still compiled and maintained in parallel; both contain near-identical gate logic. | `src/modules/capa/` |

---

## 3. Answers to the specific questions asked

### KPI semantics (§3)

For every CAPA figure in the module: **all are computed client-side in `CAPAPage.tsx` from the full Redux array, after tenant + accessible-site + selected-site filtering in `useTenantData`, over `deletedAt IS NULL` rows only.** No KPI is date-filtered, because no date filter exists (M-1).

| KPI | Records included | Filters | Deleted excluded? | Tenant-scoped? | Correct? |
|---|---|---|---|---|---|
| Total | all | none | Yes (query) | Yes (query + client) | ✅ |
| Open | `status !== "closed"` | none | Yes | Yes | ⚠️ counts `rejected` (unreachable) and, via H-2, mislabelled `pending_verification` |
| Closed | `status === "closed"` | none | Yes | Yes | ✅ |
| Overdue | `open\|in_progress` AND `dueDate < now` | none | Yes | Yes | ❌ **H-1** |
| Due soon | — | — | — | — | Not implemented |
| Critical open | `risk === "Critical" && status !== "closed"` | none | Yes | Yes | ✅ |
| Completion % | not implemented (on-time closure rate instead) | — | — | — | ❌ **M-9** |
| Average closure time | **not implemented** | — | — | — | Absent |
| Aging | **not implemented** | — | — | — | Absent |
| Status distribution | 4 buckets by status | none | Yes | Yes | ⚠️ omits `pending_verification` and `rejected`; H-2 misroutes the former into Open |
| Priority distribution | **not implemented** (source breakdown instead) | — | — | — | Absent |
| Monthly trend | rolling 6 months by `createdAt` | hardcoded window | Yes | Yes | ❌ **M-2** |

**Is the calculation performed before or after date filtering?** No date filtering exists, so every KPI is unconditionally point-in-time over the full tenant set. This means the module does not currently commit the error the brief warns about (applying a creation-date filter to a point-in-time KPI) — but only because the filter is missing. **If period filtering is added, `Total` / `Closed in period` / trend are period metrics and `Open` / `Overdue` / `Critical open` are point-in-time; they must not share one date control.**

**Timezone issues possible?** Yes — M-2 (trend bucketing) and M-3 (due-date round-trip). `isOverdue` compares raw `Date` objects in server/browser-local time, so a due date at 00:00 UTC flips to overdue at different wall-clock moments for different users.

### State machine (§5) — derived from code, not assumed

```
                    ┌──────────────── reopenCAPA (reason ≥10, qa_head) ─────────┐
                    ▼                                                            │
create ──────► open ──── startCAPAProgress ────► in_progress ──── submitForReview ──► pending_qa_review ──► closed
  │  (no carried RCA)      (Edit-modal auto-advance only)  ▲          (readiness gate)         │      (Part 11 sign)
  │                                                        │                                   │
  └── create with carried RCA ─────────────────────────────┘                                   │
      (deviation/finding rootCause → in_progress)          └──────── rejectCAPA (bounce) ──────┘

DEAD: pending_verification (no producer) · rejected (no producer)
```

- **Valid transitions:** as drawn. Each is guarded by an optimistic-locked `updateMany` re-asserting the source status in the `WHERE`, so concurrent transitions cannot double-fire.
- **Invalid transitions:** blocked and audited (`CAPA_CLOSE_BLOCKED_NOT_APPROVED`, `CAPA_SUBMIT_BLOCKED_NOT_READY`, `CAPA_UPDATE_BLOCKED_LOCKED`, `CAPA_UPDATE_BLOCKED_SOURCE_LOCKED`, `CAPA_CLOSE_BLOCKED_SELF_CLOSE`, `CAPA_CLOSE_BLOCKED_RCA_AUTHOR`, `CAPA_CLOSE_BLOCKED_INCOMPLETE_ACTIONS`). This is genuinely good practice — refused attempts are on record.
- **Can users bypass steps?** No. `updateCAPA` explicitly refuses a `status` field (`lifecycle.ts:1052-1060`), and every transition has a dedicated guarded action. Submission re-runs `getCAPAReadiness` server-side; closure re-checks all-accepted and zero-unresolved-concerns independently of the client.
- **Required fields before transition:** RCA approved, alignment aligned/overridden, DI gate cleared (when applicable), all actions done, ≥1 evidence category answered, ≥1 effectiveness criterion. Enforced identically client and server via one shared module.
- **Closure requirements:** `qa_head` + `gxpSignatory` + password re-auth + signature meaning + closing notes (min 20) + creator ≠ closer + RCA author ≠ closer + all actions accepted/skipped + zero unresolved concerns. Strong.
- **Reopening:** `closed → open` only, reason ≥10, unlocks evidence and criteria, audited with old and new values.
- **Gaps:** no explicit "Start progress" control (only the Edit auto-advance); no `in_progress → open`; two dead states (M-11).

### RBAC matrix (§6)

Verified against `roleSets.ts` and each server action's own gate, not against UI visibility.

| Action | Server gate | Enforced where |
|---|---|---|
| View module | `qa_head`, `customer_admin` | route `redirect()` on both `/capa` and `/capa/[id]` |
| Create | `qa_head` + `requireGxPAuthor` | `lifecycle.ts:419,428` |
| Create from deviation | `qa_head` (`DEVIATION_QA_ROLES`) | `lifecycle.ts:443` |
| Edit | `csv_val_lead`, `qa_head`, `regulatory_affairs` + GxP author + not status-locked | `lifecycle.ts:1078,1083,1148` |
| Assign owner / due date / risk | same as Edit | `lifecycle.ts` |
| Start progress | `COMPLIANCE_AUTHOR_ROLES` | `lifecycle.ts:1819` |
| Submit for review | author role **or** the CAPA's `ownerId` | `lifecycle.ts:1413-1417` |
| Review RCA / alignment | `qa_head` | `CAPA_REVIEW_ROLES` |
| Clear DI gate | `qa_head` | `lifecycle.ts:1340` |
| Reject | `qa_head` | `CAPA_REJECT_ROLES` |
| Sign & close | `qa_head` + `gxpSignatory` + SoD | `closure.ts:84,88,136,177` |
| Reopen | `qa_head` | `lifecycle.ts:1864` |
| Delete / restore | **nobody** (`ADMIN_DELETE_ROLES = []`) | H-6 |
| Upload evidence | author role **or** CAPA assignee **or** action-item owner | `evidence.ts:374-390` |
| Download evidence | **any authenticated tenant user** | ❌ M-7 |
| View audit history | inherits module view gate | route |

`super_admin` is blocked from authoring throughout by `requireGxPAuthor` (a deliberate bright line), and `customer_admin` can view but not author. Frontend flags in `usePermissions` (`canCreateCAPAs: !isCustomerAdmin && !isViewer`) are looser than the server gate but harmless, since the module is only visible to two roles.

**IDOR / BOLA testing:** For `GET /capa/{id}`, every mutating server action, and both file-download routes, the object id is resolved with the tenant in the same `WHERE` clause rather than being fetched and then checked. Substituting another tenant's CAPA id yields `"CAPA not found"` / `notFound()` / a 404-shaped JSON body. **No IDOR or cross-tenant defect was found in the Next.js layer.**

### Multi-tenant isolation (§7)

| Test | Result |
|---|---|
| Tenant A views Tenant B's CAPA | ❌ Blocked — `getCAPA(id, tenantId)` → `notFound()` |
| Tenant A updates Tenant B's CAPA | ❌ Blocked — `where: { id, tenantId }` on every `update`/`updateMany` |
| Tenant A deletes Tenant B's CAPA | ❌ Blocked (and delete is unreachable anyway) |
| Tenant A downloads Tenant B's evidence/document | ❌ Blocked — join to `capa.tenantId` / `doc.tenantId`, 404-shaped |
| Comments / evidence cross tenants | ❌ Blocked — `capa-comments.ts` and `evidence.ts` resolve the parent scoped |
| AI backend cross-tenant read | ❌ Blocked — `resolve_tenant()` ignores the client-supplied `customer_id` and derives it from the JWT; the one cross-tenant endpoint requires `PLATFORM_ADMIN_ROLES` |

**No cross-tenant data exposure found.** Two adjacent issues are reported instead: M-8 (reference sequence shares a global counter, a volume oracle rather than a data leak) and M-7 (within-tenant, cross-role file access).

A note on defense-in-depth: `[id]/page.tsx` queries `evidenceItem` and `cAPAEffectivenessCriterion` by `capaId` alone with no tenant filter. This is safe today because `getCAPA(id, tenantId)` has already returned `notFound()` for a foreign id — and `EvidenceItem` has no `tenantId` column, so it *cannot* be filtered directly. Worth documenting as an invariant.

### Audit trail coverage (§11)

| Event | Audited? | Old/new values? |
|---|---|---|
| CAPA created | ✅ `CAPA_CREATED` (15 rows in dev) | newValue ✅ |
| CAPA edited | ✅ `CAPA_UPDATED` | ❌ **C-2** |
| Owner changed | ⚠️ inside `CAPA_UPDATED` | ❌ **C-2** |
| Due date changed | ⚠️ inside `CAPA_UPDATED` | ❌ **C-2** |
| Priority/risk changed | ⚠️ inside `CAPA_UPDATED` | ❌ **C-2** |
| Status changed | ✅ per-transition action | ✅ (`CAPA_PROGRESS_STARTED`, `CAPA_REOPENED`) |
| Evidence added/removed | ✅ | ✅ |
| Comment added/edited/resolved/deleted | ✅ | ✅ |
| RCA approved | ✅ `CAPA_RCA_APPROVED` | ❌ null old **and** new (7/7 rows) |
| Closure | ✅ `CAPA_CLOSED` + `CAPA_CLOSURE_SIGNED` + `SignedRecord` with content hash | ✅ |
| Reopening | ✅ | ✅ |
| Deletion/archive | ✅ (unreachable — H-6) | partial |
| SoD override used | ✅ `CAPA_SOD_OVERRIDE_USED` + `CAPASODOverride` row | ✅ |
| Blocked attempts | ✅ seven distinct `*_BLOCKED_*` actions | ✅ |
| AI lifecycle stage actions | ❌ **none** | — **H-7** |

Every record carries tenant, userId, userName, userRole, action, recordId, and timestamp. The implementation is a real database trail (`prisma.auditLog`), not UI-only — the client `auditLog()` helper forwards to a server action that re-authenticates. The gap is specifically **previous/new value capture on field edits**.

### UI/UX (§12)

Strong: consistent `capa-card` design system with light/dark tokens; `role="tablist"`/`role="tabpanel"` with correct `aria-selected`/`aria-controls`; `aria-label` on every icon button; `role="alert"` on validation messages; `aria-pressed` on the triage toggles; distinct empty states for "no CAPAs yet" (with a call to action) vs "no matches" (with Clear filters); a route-level loading skeleton; error boundaries around both routes; confirmation dialog before document removal; disabled-with-reason buttons rather than hidden ones (an explicit and good choice — `CAPADetailPageV2.tsx:253-263`); `line-clamp-2` and `truncate` on long titles and filenames.

Issues found:
- **No pagination** on a table that renders every row (H-4).
- **No column sorting**, though the primitive supports it (H-4).
- **No detail-route loading or error file** (L-6).
- **Nested scroll containers:** the table sits in `.capa-card` with `overflow-x-auto` (`CAPATrackerTab.tsx:244`) inside `DataTableBase`'s own `@container overflow-x-auto` wrapper (`DataTableBase.tsx:356`) — two horizontal scroll contexts around one table.
- **`capa-shell` on the detail page uses `min-h-full` with `max-w-[1400px]`** and no responsive column collapse; the 10-column register on a tablet relies entirely on horizontal scroll.
- No sticky table header, so column identity is lost when scrolling a long register — compounded by H-4.
- The Due-date column renders `dayjs.utc("")` as **"Invalid Date"** for any CAPA with a null due date (none exist in dev, but the schema permits it).

I did not run an interactive browser session, so modal/dropdown/date-picker clipping, mobile breakpoints, and keyboard-trap behaviour are **not verified** — those need a manual pass.

### AI features (§15) — real vs mocked

| Feature | Real or mocked? | Tenant data? | Verdict |
|---|---|---|---|
| **Ask AI · CAPA Search** (`CapaSmartSearch` → `SmartRecordSearch` → `/api/ai/search`) | **Real.** Backend translates natural language into a filter spec; `src/lib/aiSearch.ts` executes it client-side against the tenant-scoped Redux array. | ✅ Real tenant CAPAs only | ✅ Sound. Hallucination-proof by construction — the model produces a filter, never an answer. |
| **Readiness Copilot** (`ReadinessCopilotPanel` → `getReadinessGuidance`) | **Real.** Grounded in the same computed `readiness.conditions` the checklist renders. Self-gates on AGI mode. | ✅ | ✅ Sound and explicitly advisory — cannot mark anything met; `submitForReview` re-enforces server-side. |
| **AI CAPA lifecycle** (`/ai-capa/[capaId]`) | **Real backend**, but a **separate system of record** | ✅ tenant-scoped in FastAPI | ❌ **H-7** |
| **AI recurrence / risk scoring** (`_ai_recurrence_check`) | **Real LLM call over a hardcoded fictional corpus** | ❌ **No** | ❌ **C-1** |
| **AI Generate CAPA modal** | Real code, **unreachable** | — | ❌ **L-1** |

Credentials are handled correctly throughout: the browser holds none, `app/api/ai-proxy/[...path]/route.ts` authenticates the session and mints a short-lived HS256 token server-side, drops any client-supplied `auth` header, enforces a path allowlist, blocks `auth/*`, and **fails closed with 503** when `AI_JWT_SECRET` is absent. Prompt-injection surface exists (CAPA description text reaches the recurrence prompt) but the output is JSON-parsed into a fixed shape — the exploitable consequence is C-1's unvalidated `capa_id`, which the C-1 fix closes.

### Testing (§17)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass |
| `npx eslint` (CAPA module, actions, queries, store, mapper, routes) | ✅ Pass, 0 findings |
| `npm run test:unit` | ✅ 6/6 pass — **none cover CAPA** (M-12) |
| `npm run build` | ✅ Pass **after** `npm run db:generate:dev` |
| Database checks | ✅ 16 CAPAs, 4 distinct statuses, 0 orphans, 0 null due dates, 0 soft-deleted |

**T-4 — Build reproducibility note (LOW).** A clean `npm run build` initially failed:
```
./src/actions/capas/sod-override.ts:349:12
Type error: Property 'findingSODOverride' does not exist on type 'TransactionClient'.
```
Root cause: the derived local client (`prisma/schema.dev-sqlite.prisma`, 60 models) was stale against `prisma/schema.prisma` (61 models) — it predates the `20260809160000_add_finding_sod_override` migration. Running `npm run db:generate:dev` regenerated it and the build then succeeded. **This is an environmental artifact, not a source defect**, and CI (Postgres, canonical schema) is unaffected. Worth a `predev`/`prebuild` hook, since `scripts/generate-dev-client.mjs` itself warns that any bare `npx prisma generate` or `npm install` silently reverts it.

### Test matrix

**Happy path — Create → Assign → Investigate → Action → Verify → Close**

| # | Step | Expected | Traced result |
|---|---|---|---|
| 1 | qa_head creates CAPA | Row + reference + evidence categories + audit | ✅ |
| 2 | Assign owner via Edit | `ownerId` FK set, assignee notified | ✅ (audit values missing — C-2) |
| 3 | Set due date / risk | Persisted | ✅ (no date validation — M-4) |
| 4 | Author RCA | `rca` + `rcaEditedById` stamped; auto-advance to `in_progress` | ✅ (over-stamps — H-5B) |
| 5 | QA reviews RCA | `rcaApproved = true` | ✅ (audit values missing) |
| 6 | Alignment review | `alignmentStatus = aligned` | ✅ |
| 7 | Add action items, complete, QA accepts | `status = accepted` | ✅ |
| 8 | Upload evidence | `EvidenceFile` + hash + audit | ✅ |
| 9 | Define effectiveness criterion | ≥1 required | ✅ |
| 10 | Submit for review | Readiness re-enforced server-side; artifacts locked | ✅ |
| 11 | Sign & Close | Password + meaning + notes + `SignedRecord` + `closedAt` + 90-day date | ✅ |
| 12 | *"Verify" (independent verification)* | — | ⚠️ **stage retired**; `verifyCAPA` unreachable (M-11) |

**Negative scenarios**

| Scenario | Expected | Result |
|---|---|---|
| Unauthorized role opens `/capa` | Redirect | ✅ `redirect("/worklist")` |
| Non-qa_head calls `createCAPA` directly | Reject | ✅ *"Only QA Head can create a CAPA."* |
| Cross-tenant CAPA id — read | Not found | ✅ `notFound()` |
| Cross-tenant CAPA id — update/delete | Not found | ✅ `where {id, tenantId}` |
| Cross-tenant evidence file id | 404-shaped | ✅ |
| Invalid transition (close from `open`) | Reject + audit | ✅ `CAPA_CLOSE_BLOCKED_NOT_APPROVED` |
| Submit an already-submitted CAPA | Reject | ✅ optimistic lock, `count === 0` |
| Submit with unmet readiness | Reject + audit | ✅ names each unmet condition |
| Missing required fields (title/description) | Reject | ✅ zod, field-level errors surfaced |
| Empty / whitespace-only title | Reject | ✅ `z.string().trim().min(...)` |
| Direct write to `correctiveActions` | Reject + audit | ✅ `CAPA_UPDATE_BLOCKED_CORRECTIVE_ACTIONS_DEPRECATED` |
| Rewrite source on a gap-raised CAPA | Reject + audit | ✅ `CAPA_UPDATE_BLOCKED_SOURCE_LOCKED` |
| Edit a CAPA under QA review | Reject + audit | ✅ `CAPA_UPDATE_BLOCKED_LOCKED` |
| Self-close (creator == closer) | Reject + audit | ✅ `CAPA_CLOSE_BLOCKED_SELF_CLOSE` |
| Duplicate concurrent create | Retry, no dupe | ✅ P2002 retry loop, 5 attempts |
| Duplicate concurrent transition | One wins | ✅ optimistic `updateMany` |
| Oversized / wrong-type upload | Reject | ✅ 10 MB cap + MIME allowlist (client-declared — M-10) |
| Upload to a locked CAPA | Reject | ✅ `lockedAt` check |
| **Invalid due date (`"garbage"`)** | Field error | ❌ **M-4** — generic *"Failed to update CAPA"* |
| **Past due date on edit** | Rejected or warned | ❌ **M-4** — accepted silently |
| **Overdue CAPA in QA review** | Counted overdue | ❌ **H-1** |
| **Delete a mistaken CAPA** | Soft-delete + audit | ❌ **H-6** — no role can |

---

## 4. Recommended fixes, in priority order

**1 — Security / tenant isolation**
1. **C-1** — remove the fixture corpus; validate LLM-returned ids against the supplied set; delete the effectiveness mutation.
2. **H-7** — align `/ai-capa` route roles with `CAPA_MODULE_VIEW_ROLES`; make the sparkle conditional.
3. **M-7** — add a capability check to both file-download routes; add `X-Content-Type-Options: nosniff`.
4. **M-8** — `@@unique([tenantId, reference])` and scope the max-reference lookup.

**2 — Data correctness**
5. **H-1** — one `isOverdue()` definition; delete or realign `getCAPAStats`.
6. **H-2** — add `pending_verification` to `STATUS_MAP`; stop silently coercing unknown statuses to `open`.
7. **M-2 / M-3** — bucket trends in `org.timezone`; make the due-date round-trip timezone-symmetric.
8. **M-6** — site-scope `getEffectivenessChecksDue`.
9. **M-9** — treat unknown `closedAt`/`dueDate` as excluded, not on-time.

**3 — Compliance / auditability**
10. **C-2** — capture `oldValue`/`newValue`/`recordTitle` on `CAPA_UPDATED` and `CAPA_RCA_APPROVED`.
11. **M-12** — unit tests for `getCAPAReadiness`, the state machine, the SoD gates, and tenant scoping; one Playwright pass over Create → Close.

**4 — Broken workflows**
12. **H-5** — fix the `""`-vs-`null` RCA stamp; resolve the single-QA Critical deadlock.
13. **M-11** — remove the dead `rejected` and `pending_verification` paths, or make them reachable.
14. **L-1 / L-2** — wire up or delete `AIGenerateCAPAModal`; never show a success popup on a server rejection.

**5 — RBAC**
15. **H-6** — decide the delete/archive policy and either implement or remove it.

**6 — Production reliability**
16. **M-4** — real date validation server-side; `min` on the edit date input.
17. **M-5** — add `deletedAt: null` to every CAPA lifecycle `WHERE`.
18. **T-4** — add a `prebuild`/`predev` hook for `db:generate:dev`.

**7 — Performance**
19. **H-3** — add the missing `CAPA` and `AuditLog` indexes. *(Cheapest high-value fix in the list.)*
20. **H-4** — move the register to server-side paging/filtering/sorting; enable column sorting.

**8 — UI/UX**
21. **L-6** — add `loading.tsx` and `error.tsx` to `/capa/[id]`.
22. Collapse the double horizontal scroll container; add a sticky table header.
23. **L-4 / L-7 / L-9** — remove dead code; pass `capaRisk` to the triage permission check; retire `CAPADetailPage.tsx`.
24. Run a manual responsive/keyboard/screen-reader pass — not covered by this static audit.

---

## Production Readiness Verdict

**NOT READY — CRITICAL ISSUES. Do not release today.**

Two defects must be fixed before any production release:

- **C-1** — the AI recurrence engine reasons over five fictional CAPAs and writes a "FAILED — Recurrence Detected" verdict onto real, closed GxP effectiveness records using an LLM-produced identifier that is never validated. This can falsify a quality determination on a regulated record.
- **C-2** — CAPA field-change audit records carry no previous value, no new value, and no record title. Verified in the live database. This does not satisfy 21 CFR Part 11 §11.10(e) on the module's most common mutation.

Three further items should be treated as release-gating for a GxP customer: **H-1** (ageing under-reported — a CAPA 70 days past due reports as on time), **H-2** (a live status renders as the wrong status), and **H-3** (the audit trail is fully unindexed and grows without bound).

The realistic path to release is **C-1, C-2, H-1, H-2, H-3, and the H-5 `""`-vs-`null` fix** — a focused, well-bounded piece of work, since the architecture underneath is sound. **H-4** (pagination) can follow if launch tenants stay under roughly 1,000 CAPAs, but it is a hard ceiling, not a preference. **H-6** (no delete path) and **M-12** (no CAPA tests) are scope and process decisions the team should make consciously rather than inherit.

To be clear about what is *not* wrong: I found **no cross-tenant data exposure, no IDOR, and no missing server-side authorization** in the Next.js layer. Tenant scoping, the Part 11 signing pipeline, the shared readiness gate, evidence handling, and the blocked-attempt audit trail are all genuinely well built. The problems above are specific and fixable — they are not symptoms of a weak foundation.
