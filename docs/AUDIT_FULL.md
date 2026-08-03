# FULL PROJECT AUDIT — Pharma Glimmora (post-merge)

**Scope:** the whole repository after merging 24 remote commits onto 9 local ones across a
SQLite→PostgreSQL fork (~101 files changed). Read-only; nothing was modified producing this report.
**Date:** 2026-07-28 · **Branch:** devAI (in sync with origin/devAI).

**Finding format:** `[SEVERITY] file:line — what's wrong · why it matters · suggested fix`.
Where a claim was not fully verified it is marked **UNCLEAR** with the reason, rather than guessed.

**Method note.** Six section-agents were dispatched but died together on a transient network error
(`ENOTFOUND`); their partial results are folded in only where independently re-verified. The
findings below were confirmed by direct search/reads (grep of the merged tree, the module deep-dive
in `docs/USER_FLOW_AUDIT.md`, `npm audit`, and reads of the cited files). Sections where coverage is
partial say so explicitly.

**Headline:** the **application-layer security and GxP design are sound** — server-side authz on
every action, id-based (not name-based) SoD, tenant-scoped file read-back, a Part 11 signature ledger
with the right fields. The real risks are **merge/config drift** (a SQLite `DATABASE_URL` still in
`.env.example`, stale/missing env vars), **dependency advisories** (next-auth CRITICAL, next/sharp
HIGH), **a cascade that can delete the audit trail**, **an append-only nuance in tenant archival**,
and a large amount of **merge-orphaned dead code**.

---

## SECTION 1 — SECURITY & ACCESS CONTROL

### 1a. Server-action authorization — **PASS (no CRITICAL found)**
Every mutating server action in `src/actions/**` resolves the caller **server-side** from the
NextAuth session and checks role **before** mutating. Confirmed patterns (see `docs/USER_FLOW_AUDIT.md`
for the per-action detail):
- The acting user is resolved via the session + `resolveUserFk`/`requireGxPAuthor(actor)` — **never**
  from a client-supplied `userId`/`role`. Client-sent `owner`/`createdById` are **ignored and
  server-stamped**: findings `findings.ts:50-52,196`; deviations `deviations.ts:265,278`; risks
  `risks.ts:153-155`.
- `requireGxPAuthor(actor)` is called at the top of every quality mutation (the `super_admin` bright
  line), e.g. `findings.ts:139`, `deviations.ts:181`, `capas/lifecycle.ts:426`, `fda483.ts:104`.
- **[LOW]** Client capability mirrors (`usePermissions`) intentionally duplicate the server sets; a
  few widen the button vs the server (FDA-483 "Register Event" shows for any non-viewer but the
  server requires qa_head/RA — `roleSets.ts:610` vs `fda483.ts:99-120`). This is UI-only over-showing
  that the server rejects — annoying, not a breach. *Fix:* tighten the client mirror to the create set.

> No server action was found that authorizes off a client-supplied identity. The one thing to watch
> in future: because authz is per-action (see 1b), a **new** action that forgets `requireAuth`/role
> would be unguarded — there is no central enforcement.

### 1b. Route authorization — **[MEDIUM] no middleware; several routes gate in the UI only**
- **[MEDIUM] no `middleware.ts` exists** (confirmed: `ls middleware.ts src/middleware.ts` → none).
  Auth is enforced **per page** via `requireAuth()`. *Why it matters:* there is no defense-in-depth —
  a route that omits the call is silently public; nothing fails the build. *Fix:* add a
  `middleware.ts` with a `matcher` covering `/(app)` and `/(admin)` that redirects unauthenticated
  requests, as a backstop to the per-page gates.
- **[MEDIUM] UI-only role gating on these pages** — they call `requireAuth()` but **no role gate**:
  `app/(app)/gap-assessment/page.tsx:10`, `app/(app)/deviation/page.tsx:6`,
  `app/(app)/readiness/page.tsx:10`, `app/(app)/settings/page.tsx:6`. A matrix-hidden user who types
  the URL renders the shell. *Mitigation in place:* the underlying queries are visibility-scoped
  (`findingVisibilityWhere`, `deviationVisibilityWhere`, …) so **no data leaks**; the write actions
  re-check role. So this is a "renders an empty shell" issue, not a data breach. *Fix:* add
  `requireRoleOrDeny(...)` to these pages the way `/capa` (`page.tsx:17`) and `/governance`
  (`page.tsx:19`) already do.
- **PASS** — `/capa`, `/capa/[id]`, `/governance`, `/audit-trail` have real server-side role gates;
  `app/(app)/layout.tsx:21-23` walls `super_admin` to `/admin`.

### 1c. IDOR — **mostly PASS, one consistency gap**
- **PASS** — list/detail queries apply a tenant + visibility where-clause; not-visible reads as
  not-found. File read-back routes enforce tenant scope:
  - `app/api/evidence/files/[id]/route.ts:42-48` — tenant check via `evidenceItem.capa.tenantId`.
  - `app/api/documents/[id]/route.ts:41-43` — tenant check.
  - `app/api/findings/[id]/evidence/route.ts:39-50` — **re-checks parent-finding visibility**
    (`findingVisibilityWhere`) — the strongest of the three; a non-see-all user can't read a hidden
    finding's evidence by id.
- **[MEDIUM]** `app/api/documents/[id]/route.ts` and `app/api/evidence/files/[id]/route.ts` enforce
  **tenant** scope but **not** the per-record visibility their list queries apply. In the Evidence
  library a non-see-all user sees only docs they uploaded (`uploadedById`), but the download route
  lets any authenticated **co-tenant** user fetch any document/evidence file **by id**. *Why it
  matters:* a user could retrieve a co-tenant document they can't see in the list, if they learn/guess
  its id (ids are cuid, not enumerable, which lowers the risk). *Fix:* mirror the findings route —
  re-apply the same visibility predicate on read-back, or confirm the "all tenant quality staff may
  read any quality file" policy is intended and document it.

### 1d. Secrets — **PASS (no exposure found)**
- No hardcoded secrets found. `NEXTAUTH_SECRET` is guarded by `assertProductionSecret()` at request
  time (rejects missing/placeholder/<32-char) — `route.ts:18-32`.
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` (`razorpay.ts:227`) is the Razorpay **publishable** key — safe to
  expose; the **secret** (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) is read server-side only
  via `requireEnv(...)` and never `NEXT_PUBLIC_`. Correct separation.
- Other `NEXT_PUBLIC_*` values are non-secret URLs/version strings (`NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_AI_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_VERSION`). No secret material in
  the client bundle was found. *(Locations only — no values inspected or printed.)*

### 1e. File uploads — **PASS**
- Type allow-list + size cap + hash + retention: `documents.ts:40-50` (10 MB; PDF/PNG/JPEG/XLSX/DOCX/
  CSV/TXT; sha256; 7-year `retainUntil`), mirrored for CAPA evidence (`evidence.ts`) and gap evidence
  (`EVIDENCE_MAX_FILE_MB`, `findings.ts:785-797`). Server-action body limit 10 MB
  (`next.config.mjs` `serverActions.bodySizeLimit`).
- **Storage:** files are written **outside `./public`** (local `fileStorage` backend) or to
  DigitalOcean Spaces (`FILE_STORAGE_BACKEND` + `DO_SPACES_*`), so bytes are not reachable by direct
  URL — read-back only through the authenticated routes in 1c.
- **[LOW]** The AI proxy (`app/api/ai-proxy/[...path]/route.ts`) is well-built — auth gate (`:35`),
  upstream path allow-list `api/ai/`,`api/v1/` (`:18,28`), and an explicit forward-header allow-list
  that **drops cookies/session** (`:26,49-53`). Noted as a positive.

---

## SECTION 2 — DATA INTEGRITY & PRISMA

### 2a. Orphan fields / models
- **[MEDIUM] Deviation impact fields are orphaned columns** — `patientSafetyImpact`,
  `productQualityImpact`, `regulatoryImpact` (`prisma/schema.prisma:860-862`). **Zero** references in
  `src/`/`app/`: not in `CreateDeviationSchema`, not in the create data block, never displayed.
  *(Known example, confirmed.)* *Fix:* drop the columns (additive migration) or wire a capture path.
- **[MEDIUM] `CAPAApproval` model is a read-only orphan** — **no writer** (grep for
  `cAPAApproval.create/update` → none); only readers remain (`capas/verification.ts`,
  `queries/capas.ts`, `queries/index.ts`). Its writer `approveCAPA` was removed in the merge
  (`capas.ts:41`). *Why it matters:* a Part-11 approvals model that nothing populates is misleading —
  a reviewer may assume approvals are recorded. *Fix:* remove the model + `getCAPAApprovals`, or
  restore a writer if tiered approval is coming back.
- **[MEDIUM] CAPA verification fields are orphaned** — `verifiedAt`/`verifiedById` are written only by
  `capas/verification.ts` (`:484`), which requires `status="pending_verification"` — a state **nothing
  reaches** since `approveCAPA` was removed. So `verifyCAPA`/`revokeCAPAVerification` and these columns
  are dead. *Fix:* remove verification (model fields, actions, `CAPA_VERIFICATION` signing) or
  reinstate the producer.
- **[LOW]** Worklist `WorklistTaskMessage`/`messages` are fetched into the payload
  (`queries/worklist.ts:233,260`) but never rendered (retired task thread). Dead weight, not unsafe.
- **UNCLEAR (not fully swept):** a complete both-directions orphan sweep of every model
  (FDA483*, EvidenceItem, ReadinessAction, SignedRecord extras) was not exhaustively run. The above
  are the confirmed ones; recommend a `prisma`-field-by-field grep pass before removing anything.

### 2b. Missing indexes — **UNCLEAR (targeted pass recommended)**
- **Confirmed present:** `SignedRecord` is well-indexed — `@@index([recordType, recordId])`,
  `@@index([tenantId, signerId])`, `@@index([createdAt])` (`schema.prisma:2010+`).
- **[MEDIUM] Recommend verifying composite indexes** on the hot visibility queries, which filter on
  `tenantId` + `createdById`/`owner`/`assigneeId`/`ownerId` + `status` + `deletedAt` and order by
  `createdAt`/`dueDate`: `queries/findings.ts`, `queries/deviations.ts`, `queries/worklist.ts:191-262`
  (four per-user `findMany`s), `queries/capas.ts`, `queries/fda483.ts`, `queries/evidenceLibrary.ts`.
  I did **not** enumerate each model's `@@index` lines, so I will not claim a specific index is
  missing — **UNCLEAR**. *Fix / next step:* for each of those queries, confirm a composite
  `@@index` exists on the exact `where`/`orderBy` columns; on Postgres the SQLite-era single-column
  indexes may not cover the merged query shapes.

### 2c. Cascade behaviour
- **[HIGH] Hard-deleting a Tenant cascade-deletes its entire audit trail.**
  `AuditLog.tenant … onDelete: Cascade` (`schema.prisma:~1801`) and every child→Tenant relation is
  `onDelete: Cascade` (User `:86`, and throughout). *Why it matters — GxP:* a raw
  `prisma.tenant.delete` (or a future code path / manual DB op) would silently destroy AuditLog and
  cascade-remove signed records — an append-only/records-retention violation. *Mitigation in place:*
  the archival path **re-parents** audit + signature rows to an archive tenant **before** delete
  (`tenants.ts:460-461`), so the normal flow doesn't lose them — but the cascade is the dangerous
  default if that path is bypassed. *Fix:* set `onDelete: Restrict` (or `NoAction`) on
  AuditLog/SignedRecord→Tenant so the DB refuses to delete a tenant that still owns ledger rows,
  forcing the deliberate re-parent.
- **PASS** — user-attribution FKs are `onDelete: SetNull` (`createdById`, `ownerId`, `assigneeId`,
  etc. — `schema.prisma:492,735-737,784,931-934,967`), so deleting a user **preserves** the record and
  nulls attribution (correct for GxP; SoD guards are fail-closed on the resulting null actor).
- **PASS** — genuine children cascade from their parent record (CAPAActionItem `:776`, DeviationTask
  `:962`, FDA483Observation `:1095`, FindingEdit `:520/533`) — appropriate.

### 2d. Transactions — **PASS (broadly good)**
- Multi-step writes are widely wrapped in `prisma.$transaction`: `findings.ts` (13), `support.ts`
  (12), `capas/action-items.ts` (8), `fda483.ts` (7), `management-decisions.ts` (6), `risks.ts` (5),
  `regions.ts`/`systems.ts` (4), `capas/lifecycle.ts`/`evidence.ts`/`frameworks.ts` (3), etc.
- `capas/closure.ts` uses a single `$transaction` for the whole sign+close+cascade — atomic. Good.
- `risk-conversion.ts` uses a **compensation** pattern (claim → create → link, with rollback) rather
  than one transaction — correct, because it spans a call into another module's create action that
  can't share the tx. Not a finding.
- `notify()` is deliberately **post-commit and fault-isolated** (`notify.ts:56-82`) — correct (a
  failed notification must not roll back the audited write). Not a finding.
- **UNCLEAR:** I did not open every one of the ~90 actions to confirm none has a stray non-tx
  create+audit pair. The sampled high-traffic paths are all transactional.

### 2e. Nullable-vs-required mismatches — **UNCLEAR (partial)**
- The codebase adapts nullable Prisma rows to non-null UI types inside page adapters (e.g. the
  FDA-483 adapter coalesces nullable fields; the readiness adapter defaults `siteId`/`frontRoom` to
  `""` — `ReadinessPage.tsx:125-157`). That pattern is generally safe **as long as the adapter
  coalesces every nullable field**. I could not exhaustively diff every schema field against its TS
  type. *Next step:* a targeted pass comparing `schema.prisma` `Type?` fields against
  `src/types/**` and the mappers for any field typed non-null without a coalesce.

---

## SECTION 3 — AUDIT TRAIL / GxP

### 3a. Mutation → audit coverage — **PASS**
Per the module deep-dive (`docs/USER_FLOW_AUDIT.md`), **every** state transition/mutation across
deviations, deviation-tasks, findings, capas/*, fda483, risks, management-decisions, evidence,
documents, inspections and settings pairs with an `auditLog()`/`AuditLog` create **in the same
transaction** as the write. Signing paths additionally write `_AND_SIGNED` / `SIGNING_PASSWORD_FAILED`
rows. No deviation/CAPA/finding state transition was found **without** an audit entry.
- **[LOW]** Some **client-side** `auditLog()` calls are fire-and-forget (governance report export
  `GovernancePage.tsx:386`; the dead readiness Redux flows `ReadinessPage.tsx:387-455`). These are
  best-effort telemetry, not the transactional GxP trail — but the readiness ones fire from **dead
  UI**, producing audit rows with no corresponding persisted record (audit noise). *Fix:* remove the
  dead-flow audit calls when the dead UI is removed (§4).

### 3b. Append-only integrity — **[HIGH] one controlled mutation of ledger rows + the cascade**
- **[HIGH] `tenants.ts:460-461` updates AuditLog and SignedRecord rows** —
  `prisma.auditLog.updateMany({ … data: { tenantId: archiveTenantId } })` and the same for
  `signedRecord`. It only re-parents `tenantId` during tenant archival (it does **not** edit content),
  but it **is** a write path that mutates otherwise-immutable ledger rows — a Part 11 append-only
  nuance. *Why it matters:* a strict reading of §11.10(e) wants signed records immutable; changing a
  SignedRecord's `tenantId` after signing is an attribute edit. *Fix:* either keep signed rows immutable
  and model tenant-archival differently (e.g. an archive pointer table), or wrap the re-parent in its
  own audited "records migrated" event so the change itself is on the record.
- **PASS otherwise** — no other `auditLog.update/delete` or `signedRecord.update/delete` on **content**
  exists anywhere (grep clean). The only remaining append-only risk is the **cascade** in §2c.

### 3c. Electronic signatures (Part 11 §11.50 / §11.200) — **PASS**
`SignedRecord` captures: signer identity (`signerId`), `signerEmail` (**immutable — captured at
signing time even if the user later changes email**, `schema.prisma:2010+`), `recordType`,
`recordId`, timestamp (`createdAt`), `userAgent`, and the **meaning** of signature (`signatureMeaning`,
required by the signing Zod schemas). Every signing action **re-verifies the password**
(`verifyPasswordForSigning`): deviation close (`deviations.ts:575`), CAPA sign & close
(`closure.ts:328`), FDA-483 sign/outcome (`fda483.ts:839,1092`), document approve (`documents.ts:237`),
GxP-signatory toggle + site/user delete (`settings.ts:571,600,630`). All three §11.200 elements
(who / when / meaning) plus re-authentication are present. **[LOW]** `approveDocument` is compliant but
has no UI (§4) — the signing pipeline exists but is unreachable.

### 3d. Separation of duties — **PASS (server-side, id-based, fail-closed)**
Every SoD rule is enforced **server-side** and compares **user ids** (not display names), failing
closed on a null actor:
| Rule | Guard (verbatim gist) | Cite |
|---|---|---|
| Deviation: investigator ≠ reporter | `existing.createdById && existing.createdById === actor.userId` | `deviations.ts:911` |
| Deviation: CAPA decider ≠ reporter & ≠ investigator | two id compares | `deviations.ts:1032-1037` |
| Deviation: closer ≠ reporter, investigator, task assignee | three id compares | `deviations.ts:446-489` |
| Finding: reviewer ≠ assignee | `finding.owner === actor.userId` | `findings.ts:1338,1412` |
| Finding: closer ≠ RCA author | `actorUserId === finding.rcaRecordedById` | `finding-close.ts:118` |
| CAPA: RCA reviewer ≠ creator | `existing.createdById === session.user.id` | `rca-review.ts:131-158` |
| CAPA: closer ≠ creator | id compare | `closure.ts:123-150` |
| CAPA: effectiveness reviewer ≠ closure/verification signer | reads `SignedRecord.signerId` | `effectiveness.ts:138-183` |
| Stage/deviation task: reviewer ≠ assignee | id compare | `stage-tasks.ts:277`, `deviation-tasks.ts:359` |

- **[MEDIUM] Legacy name-fallback in two CAPA guards.** `closure.ts:123` and `rca-review.ts:131` use
  `existing.createdById ? (=== id) : (existing.createdBy === session.user.name)` — a **display-name**
  comparison for pre-migration rows with a null `createdById`. Names are not identities; two users
  could share a name, and a rename breaks it. *Why it matters:* for old CAPAs the SoD check degrades
  to name equality. *Fix:* backfill `createdById` on legacy CAPAs and drop the name fallback (the
  finding-side already went id-only).

---

## SECTION 4 — CORRECTNESS & MERGE DAMAGE

### 4a. Merge cleanliness — **PASS**
- **No leftover conflict markers** anywhere in `src/`, `app/`, `prisma/`, `backend/` (grep for
  `<<<<<<<`/`=======`/`>>>>>>>` → none).

### 4b. Dead code (merge-orphaned) — **[MEDIUM]** (cleanup, not risk)
Confirmed zero-caller / unreachable (grep-verified):
- CAPA: `CAPADetailPage.tsx` (V1), `SignApprovalModal.tsx`, `ApprovalBriefPanel.tsx`,
  `CCOverrideModal.tsx` (no importer); `verifyCAPA`/`revokeCAPAVerification` (unreachable status);
  `approveCAPA`/`revokeCAPAApproval` removed (`capas.ts:41`).
- Worklist: `DeviationTaskPanel` component (only its `GroupedTaskDocs` helper is imported);
  `src/actions/worklist.ts` — a `"use server"` file that exports **types only, no action**.
- FDA-483: `updateFDA483Event`, `deleteFDA483Event`, `deleteObservation`, `closeObservation`,
  `linkCAPAToEvent`, `deleteCommitment`, `reopenCommitment` — server actions with no UI caller.
- Evidence: `approveDocument`, `rejectDocument`, `restoreDocument` — no UI caller (the whole document
  approval lifecycle is unreachable).
- Deviation: `deleteDeviation`/`restoreDeviation`/`saveInvestigationProgress` — no UI.
- Dashboard: `getDashboardStats` fetched and discarded (`page.tsx:57` → unused).
*Why it matters:* dead server actions still compile and are reachable if a caller is added later;
several imply features that don't exist (approvals, verification). *Fix:* delete in a dedicated
cleanup commit, or gate behind a clearly-labelled "not wired" note.

### 4c. Duplicated logic (both merge sides) — **[LOW/MEDIUM]**
- **Two `DataTable`s share one name** — `src/components/shared/DataTable.tsx` (re-exports the
  `DataTableBase` primitive) vs `src/components/table/DataTable.tsx` (the higher-level widget).
  Resolves correctly by import path today, but is a live foot-gun. *Fix:* rename one.
- **Effectiveness in two files** — `src/actions/effectiveness-criteria.ts` (create/update/delete
  criteria) vs `src/actions/capas/effectiveness.ts` (the 90-day review). Both live; easy to confuse.
  *Fix:* consolidate or rename to disambiguate.
- Razorpay lazy-init was the known duplicate and is **resolved** (`razorpay.ts` — single
  `getRazorpay()` + `isConfigured()`).

### 4d. Status-value inconsistencies — **[MEDIUM]**
- **CAPA `diGateStatus` vocabulary drift** — writers use `pending`/`cleared`/legacy `open`, and
  `app/api/capas/route.ts:41` casts to Title-case `"Pending"|"Cleared"|"Failed"` with a **phantom
  `"Failed"` nothing writes**. Readiness only treats `"cleared"` as met (`capa-readiness.ts:123`), so
  any other spelling silently blocks submit. The in-code TODO (`statusTaxonomy.ts:109-124`) documents
  this. *Fix:* one canonical `DI_GATE_STATUSES` const imported everywhere.
- **Deviation `rejected` copy mismatch** — `rejectDeviation` sets terminal `rejected`
  (`deviations.ts:752`) but the modal + toast say *"returned to investigation"*
  (`DeviationPage.tsx:1119,510`). *Fix:* correct the copy, or implement the implied transition.
- **Unreachable statuses** defined in `statusTaxonomy.ts` with no writer (render in the StatusGuide
  but can never occur): CAPA `pending_verification`, `rejected`; FDA-483 event "Under Investigation",
  "Pending QA Sign-off"; FDA-483 observation "In Progress", "Closed"; Document "under_review";
  Readiness "In Progress", "Blocked". *Fix:* prune the taxonomy to the reachable set, or wire the
  producers.

### 4e. Unsafe typing in user-data paths — **[LOW] (partial sweep)**
- `app/(app)/settings/page.tsx:15-17` — `@ts-expect-error` suppressing a props/Redux mismatch
  (page fetches sites/users, passes them, but `SettingsPage` ignores props and reads Redux). Harmless
  but confusing. *Fix:* consume the props or stop fetching them.
- **UNCLEAR:** a full sweep of `any`/`!`/`@ts-ignore` across `src/actions/**` and mappers was not
  completed. The signing pipeline previously removed its non-null assertions (razorpay). *Next step:*
  `grep -rn ' as any\| as unknown\|!\.\|@ts-ignore' src/actions src/lib/mappers`.

### 4f. Error handling — **[LOW]**
- `notify()` swallows by design (fault-isolated post-commit) — correct.
- **Silent UI failures** (no user feedback on rejection): gap create `GapPage.tsx:464-467`
  (`console.error` only); governance archive `GovernancePage.tsx:287-290,348-351` (`console.warn`);
  readiness create/complete `ReadinessPage.tsx:264-266,292-295` (`console.error`). *Why it matters:*
  a user whose mutation is rejected (race, permission, cap) sees nothing and may retry or assume
  success. *Fix:* surface these via the existing error-popup pattern.

---

## SECTION 5 — FRONTEND & UX

*(This section is partly UNCLEAR — the FE agent died mid-sweep; confirmed items below, gaps flagged.)*

### 5a. Loading & error states — **[LOW] (partial)**
- **Confirmed present:** `loading.tsx` + `error.tsx` siblings exist for `gap-assessment`, `capa`,
  `fda-483`, `evidence`; `ErrorBoundary` wraps the Governance page (`governance/page.tsx:50`).
- **UNCLEAR:** whether every `app/(app)` route has both siblings, and whether every data-fetching
  client component handles the error branch, was not exhaustively verified. *Next step:* enumerate
  `app/(app)/**` and check each folder for the two files.

### 5b. Double-submit on mutations — **[MEDIUM] (highest-priority FE class; partial)**
- **Good pattern exists:** `LoginPage` guards with an `inFlightRef` (`LoginPage.tsx:96,197`); several
  modals disable submit and track a busy flag (e.g. `reviewBusy` in the gap review card
  `GapRegisterTab.tsx:1431`).
- **[MEDIUM] Not verified across all mutating modals.** The Add/Edit/Assign/Close/Sign modals across
  gap/deviation/capa/fda483/governance/settings mostly disable the button on `!isValid`, but
  **`disabled={!isValid}` is not the same as an in-flight guard** — a valid form can still be
  double-clicked before the action resolves, double-writing a GxP record. I did not confirm each modal
  uses a submitting/in-flight latch. *Why it matters most here:* a double-submitted close/sign could
  create two `SignedRecord`s or two audit rows. *Next step / fix:* audit every modal that calls a
  create/close/sign action for a `disabled={submitting}` (not just `!isValid`) guard; add one where
  missing. **UNCLEAR** which specifically lack it.

### 5c. N+1 query patterns — **PASS**
- The query layer batches consistently with `{ in: [...] }` + in-memory `Map` grouping (verified in
  `src/lib/queries/**`, e.g. worklist aggregates four `findMany`s then joins in memory,
  `queries/worklist.ts:191-262`). No per-row query loop was found in the sampled list views.

### 5d. Unnecessary client components — **UNCLEAR**
- Not swept. *Next step:* `grep -rln "^\"use client\"" src/modules src/components` then check each for
  actual state/effect/handler usage; flag large data-pulling components that could be RSC.

---

## SECTION 6 — CONFIG & BUILD

### 6a. `.env.example` vs code — **[HIGH] merge drift**
- **[HIGH] `.env.example` still ships a SQLite `DATABASE_URL` (`file:…`)** while the schema datasource
  and `prisma/migrations/migration_lock.toml` are both **`postgresql`** (verified:
  `schema.prisma:5-8` + `migration_lock.toml` `provider = "postgresql"`). *Why it matters:* a
  developer copying `.env.example` → `.env` gets a URL that `prisma validate` rejects against the
  Postgres schema (the exact `P1012 "the URL must start with postgresql://"` seen during the merge).
  This is the broken-onboarding artifact of the SQLite→Postgres fork. *Fix:* update `.env.example`'s
  `DATABASE_URL` to a `postgresql://…` placeholder. *(Value not printed — protocol prefix only.)*
- **[MEDIUM] Vars read by code but MISSING from `.env.example`** (a fresh deploy could break):
  `EVIDENCE_MAX_FILE_MB`, `STAGE_DOC_MAX_FILE_MB`, `NEXT_PUBLIC_AI_API_URL`, `NEXT_PUBLIC_APP_VERSION`,
  `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_SITE_URL`. *Fix:* add them (with placeholder values) so
  the example is the complete contract.
- **[LOW] Stale vars in `.env.example` that nothing reads:** `KEYCLOAK_CLIENT_ID`,
  `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ISSUER` — the app uses NextAuth **Credentials**, not Keycloak.
  *Why it matters:* misleads operators into provisioning an unused IdP. *Fix:* remove them.
  *(Names only — no values printed.)*
- **PASS:** `DATABASE_URL`, `NEXTAUTH_URL`, `RAZORPAY_*` are consumed (Prisma `env()`, NextAuth,
  `requireEnv`) even though the plain `process.env.X` grep doesn't show them — verified they're read
  via those mechanisms, so **not** stale.

### 6b. Dependencies (`npm audit`) — **[CRITICAL/HIGH]**
`npm audit`: **8 advisories — 1 critical, 6 high, 1 moderate.** Do not auto-fix; upgrade deliberately.
| Severity | Package | Advisory |
|---|---|---|
| **CRITICAL** | `next-auth` | `getToken()` throws an uncaught exception on malformed Bearer auth headers |
| HIGH | `next` | Middleware/Proxy bypass in App Router (Turbopack + single locale) |
| HIGH | `sharp` | inherited libvips CVEs (CVE-2026-33327/33328/35590/35591) |
| HIGH | `postcss` | XSS via unescaped `</style>` in CSS stringify |
| HIGH | `brace-expansion` | DoS via exponential-time expansion |
| HIGH | `shell-quote` | quadratic-complexity DoS in `parse()` |
| HIGH | `concurrently` | via `shell-quote` (dev dependency) |
| MODERATE | `uuid` | missing buffer bounds check in v3/v5/v6 |

- **`next-auth` (CRITICAL)** and **`next` (HIGH)** are the priority — this is an auth-bearing QMS.
  The `next` advisory is a *middleware* bypass and this app has **no middleware**, which lowers direct
  exposure, but the version is still vulnerable — patch it. **`sharp` (HIGH)** matters because it
  processes uploaded images (evidence photos) — a malicious image could hit the libvips CVEs.
  `concurrently`/`shell-quote`/`brace-expansion` are dev/build-time (lower runtime risk).
- *Fix:* `npm audit` then bump `next`, `next-auth`, `sharp`, `postcss` to patched versions and re-run
  the type/build check (Next major/minor bumps can break App Router APIs — test).
- **UNCLEAR:** obviously-unused runtime deps were not enumerated. *Next step:* `depcheck` or a grep of
  each `dependencies` entry for imports.

### 6c. Next.js config & middleware — **mostly PASS, [MEDIUM] CSP gap**
- `next.config.mjs` is solid: security headers present (`X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`,
  `Permissions-Policy` locking camera/geo), `no-store` on `/(app)`, `serverActions.bodySizeLimit:
  10mb`. **No `ignoreBuildErrors` / `eslint.ignoreDuringBuilds`.** Good.
- **[MEDIUM] No `Content-Security-Policy` header.** For a regulated app, a CSP is meaningful
  defense-in-depth against XSS/data exfiltration. *Fix:* add a CSP (start report-only) — note the AI
  voice assistant needs `microphone=(self)` (already in Permissions-Policy) and any external origins
  must be allow-listed.
- **[MEDIUM] No `middleware.ts`** (repeat of 1b) — auth is per-page; add a matcher-based backstop.

### 6d. tsconfig / CI strictness — **[HIGH] strict is on but not enforced**
- `tsconfig.json`: `strict: true`, `skipLibCheck: true` (normal). No `ignoreBuildErrors` in the Next
  config. So the type contract is nominally strict.
- **[HIGH] But CI (lint → tsc → build) is red and has been overridden** (project memory:
  *"the lint→tsc→build pipeline fails at step one and the signal has been ignored"*). A strict tsconfig
  that isn't enforced is a false sense of safety — type errors are shipping. *Why it matters — GxP:*
  the build/verification signal for a regulated product is being bypassed. *Fix:* make CI green (fix or
  explicitly quarantine the known dead `app/api/*/route.ts` noise) and gate merges on it. **UNCLEAR:**
  I did not run `tsc` here (slow, and the merged tree's known-noise is legacy dead routes per memory);
  treat the exact current error count as unverified in this pass.

---

## APPENDIX — what was verified directly vs. carried from the flow audit / marked UNCLEAR

- **Directly verified this pass:** conflict markers (none); append-only mutation sites; schema cascade
  directives; `$transaction` usage counts; env-var read-vs-example diff; `.env.example` DB protocol;
  schema/migration_lock provider; the four file read-back routes + AI proxy; `npm audit` per-package;
  `CAPAApproval`/`verifiedAt` orphan status; `next.config.mjs`; `tsconfig` strictness; middleware
  absence.
- **Carried from `docs/USER_FLOW_AUDIT.md` (already file:line-cited there):** per-action authz,
  audit-coverage, SoD guards, dead-code inventory, status-reachability, silent-failure UX.
- **Explicitly UNCLEAR / needs a targeted follow-up pass:** exhaustive missing-index review (2b);
  full nullable-vs-required diff (2e); full `any`/`!`/`@ts-ignore` sweep (4e); complete
  loading/error-sibling coverage (5a); per-modal in-flight double-submit guard (5b); `use client`
  sweep (5d); unused-dependency enumeration (6b); current exact `tsc` error count (6d).

*(End of full audit. Companion one-pager: `docs/AUDIT_SUMMARY.md`.)*
