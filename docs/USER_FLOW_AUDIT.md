# USER FLOW AUDIT — Pharma Glimmora

**Purpose:** Source material for the end-user manual. This is a map of what a user can
*actually do*, derived from the code — not from assumptions about how a QMS "should" work.
Where the code does not support something, it is not documented as a feature; it is recorded
under **Dead ends & gaps**.

**Method:** Read-only audit of routes (`app/`), server actions (`src/actions/`), cached
queries (`src/lib/queries/`), permission sets (`src/lib/permissions/roleSets.ts`), status
taxonomy (`src/constants/statusTaxonomy.ts`), and the module UIs (`src/modules/`). Every rule,
permission, and transition is cited to `file:line`. Ambiguities are marked **UNCLEAR**.

**Audit date:** 2026-07-27 · **Branch:** devAI · Nothing was modified producing this document.

> **How to read the citations.** `findings.ts:718` means line 718 of `src/actions/findings.ts`
> (paths are given in full the first time per section). Guard conditions are quoted verbatim so a
> manual writer can confirm them without reading code.

---

## 0. Global concepts (read first)

### 0.1 The ten roles (as named in code)
`src/lib/permissions/roleSets.ts`. Exact strings — use these, not paraphrases:

| Role string | Plain-language name | Notes |
|---|---|---|
| `super_admin` | Platform Admin | A **Tenant** row, not a tenant user. Walled to `/admin`; blank customer-app sidebar (`Sidebar.tsx:131`). Blocked from **all** GxP authoring by `requireGxPAuthor`. |
| `customer_admin` | Customer Admin | Tenant administrator. **View-only on quality** modules (Gap/Deviation/CAPA/CSV/FDA-483) by design — "admin ≠ doer" (`roleSets.ts:60-71`). |
| `qa_head` | QA Head | The quality authority. Assigns, reviews, approves, closes, signs. Site-less (sees all sites). |
| `qa` | QA (execution) | Non-privileged executor. Authors nothing; works tasks assigned to it (`roleSets.ts:23-33`). |
| `csv_val_lead` | CSV / Validation Lead | Functional author. |
| `regulatory_affairs` | Regulatory Affairs | Functional author; co-signs FDA-483 (`roleSets.ts:211`). |
| `qc_lab_director` | QC Lab Director | Functional author. |
| `it_cdo` | IT / CDO | Functional author. |
| `operations_head` | Operations Head | Functional author. |
| `viewer` | Viewer | Read-only everywhere. Hard-stopped on every mutation. |

**Two admin identities, one bright line:** `super_admin` never authors a GxP record
(`requireGxPAuthor(actor)` guards every quality mutation); `customer_admin` may administer the
tenant (users/sites/settings) but is deliberately absent from every quality authoring set.

### 0.2 The sidebar (single navigation surface)
`src/components/layout/Sidebar.tsx:48-163`. `super_admin` gets an **empty** sidebar
(`:131-132`); everyone else sees items filtered per the table. Empty groups are dropped (`:163`).

| Group | Nav label | Route | Who sees it (gate) |
|---|---|---|---|
| Core Compliance | Dashboard | `/` | matrix-driven `allowedPaths` (`:161`) |
| Core Compliance | Gap Assessment | `/gap-assessment` | matrix-driven (`:161`) |
| Core Compliance | Deviation Management | `/deviation` | **all non-super_admin** (`:152-153`) |
| Core Compliance | CAPA Tracker | `/capa` | `CAPA_MODULE_VIEW_ROLES` = qa_head, customer_admin (`:146`) |
| Core Compliance | Worklist | `/worklist` | **all non-super_admin** (`:139`) |
| Core Compliance | CSV/CSA Validation | `/csv-csa` | matrix-driven (`:161`) |
| Core Compliance | Inspections & Regulatory | `/fda-483` | matrix-driven (`:161`) |
| Core Compliance | Evidence & Documents | `/evidence` | matrix-driven (`:161`) |
| Readiness & Governance | Training & Awareness | `/readiness` | **all non-super_admin** (`:152-153`) |
| Readiness & Governance | Governance & KPIs | `/governance` | `canViewGovernance` = qa_head, customer_admin (`:160`) |
| Readiness & Governance | Audit Trail | `/audit-trail` | qa_head, customer_admin (`:154-156`) |
| System & Config | Settings | `/settings` | matrix-driven (`:161`) |
| System & Config | Support | `/support` | **all customer roles incl. viewer** (`:141`) |

> Modules in scope for this audit that are **not** their own nav item: Notifications (bell in the
> Topbar), Auth/Login (pre-app). CSV/CSA, Support, Audit-Trail, Admin, AI-CAPA/AI-Policy,
> Change-Control, Regulatory-Intelligence exist but were out of the requested scope.

### 0.3 Two visibility models — do not assume one applies everywhere
- **Worklist** is purely *user-scoped*: you see only work assigned to you (`ownerId`/`assigneeId`
  = your id), no site widening (`src/lib/queries/worklist.ts:191-262`).
- **Dashboard** is *dual*: aggregate **counts** are tenant-wide; record **content** (rows that seed
  Redux) is visibility-scoped (`app/(app)/page.tsx:23-67`).
- **Quality modules** (Gap/Deviation/FDA-483/Governance/Evidence) apply a `visibilityWhere`
  fragment: "see-all" roles (customer_admin, qa_head, super_admin) see all tenant rows; everyone
  else sees only records they created or are assigned to. Not-visible reads as not-found (no IDOR).

### 0.4 Part 11 signing & audit backbone
Every compliance mutation writes an `auditLog()` row in the same transaction. Signing actions
(deviation close, CAPA close, FDA-483 sign/outcome, document approve, site/user delete, GxP-signatory
toggle) additionally re-verify the actor's password (`verifyPasswordForSigning`) and mint a
`SignedRecord`. A wrong password writes a `SIGNING_PASSWORD_FAILED` audit row and blocks.

---

## 1. AUTH / LOGIN

**Files:** `app/login/page.tsx`, `src/components/auth/LoginPage.tsx`, `src/lib/authClient.ts`,
`app/api/auth/[...nextauth]/route.ts`, `app/site-picker/page.tsx`.

### 1.1 Entry points
- `/login` — `app/login/page.tsx:10` (forced `dynamic = "force-dynamic"`, `:8`). Single form:
  identifier (email **or** bare username) + passcode (`LoginPage.tsx:306+`).
- `/api/auth/[...nextauth]` — the `authorize()` credential authority (`route.ts:113`).
- `/site-picker` — **not** part of the login flow. `finishLogin` auto-selects a site and pushes `/`
  (`LoginPage.tsx:186`); admins are bounced out (`SitePicker.tsx:27-31`). Reachable only via the
  topbar site switcher.

### 1.2 Login flow (actually wired)
1. Enter identifier + passcode → `login()` → NextAuth `signIn("credentials", …)` (`authClient.ts:35`).
2. On success: `super_admin` → `/admin` (`LoginPage.tsx:293`); everyone else → `/` (`:300-303`).
3. No OTP screen, no site-picker step. (See the MFA gap in §1.5.)

Session: JWT, 8-hour max (`route.ts:102`). A tenant-wide `sessionsValidAfter` cutoff invalidates
all existing sessions when MFA is toggled (`route.ts:587-603`) → redirect `/login?session=expired`.

### 1.3 What blocks a login (verbatim guards)
| Block | Condition | Cite | User sees |
|---|---|---|---|
| Ambiguous identifier | `tenantMatches.length > 1` / `userMatches.length > 1` → `throw "AMBIGUOUS_EMAIL"` | `route.ts:135-148, 317-330` | error toast |
| Suspended/deleted tenant | `!isTenantAccessible(tenant, role)` → `throw "ACCOUNT_SUSPENDED"` | `route.ts:164-177, 344-357` | "Your account has been suspended…" |
| Wrong password | `bcrypt.compare` false → `return null` | `route.ts:179-197, 373-387` | **"Incorrect email or password"** (shared with no-such-email; anti-enumeration) |
| Inactive user | `!user.isActive` → `return null` (+ audit) | `route.ts:358-371` | "…inactive…" |
| No site (site-bound role) | `roleRequiresSite(role) && !user.siteId` → `throw "NO_SITE_ASSIGNED"` | `route.ts:397-410` | "No site has been assigned…" |
| Expired/absent plan | non-admin, no plan or `expiryDate <= now` → `throw "SUBSCRIPTION_INACTIVE"` | `route.ts:210-226, 412-429` | "Your subscription has expired…" |
| MFA required | `tenant.mfaEnabled` (non-super_admin) → `throw "OTP_REQUIRED"` | `route.ts:232, 433` | **misleading** — see §1.5 |

`roleRequiresSite` = not in `SITELESS_ROLES = ["super_admin","customer_admin","qa_head"]`
(`roleSets.ts:80-89`). `super_admin` bypasses MFA always (`route.ts:232`).

### 1.4 Actions
- **Log in** — `LoginPage.tsx:196-206` → `authClient.ts:24`.
- **Log out** — Sidebar `handleLogout` (`Sidebar.tsx:165`) with a confirm modal (`:366-369`); local
  state cleared even if the server call fails.
- **Forgot password** — no self-service; modal points to a support email/phone placeholder
  (`LoginPage.tsx:29-34, 592-630`).

### 1.5 Dead ends & gaps
- **CRITICAL — MFA has no client entry path.** The server demands an OTP whenever
  `Tenant.mfaEnabled` and throws `OTP_REQUIRED`/`OTP_INVALID`/`OTP_EXPIRED`/`OTP_LOCKED`
  (`route.ts:232, 433, 247, 262`), but the login form has **no OTP field**
  (`LoginPage.tsx:386-517`), `login()` never sends an `otp` credential (`authClient.ts:35-39`), and
  `runSignIn` has no `OTP_*` branch (`LoginPage.tsx:223-255`). The thrown `OTP_REQUIRED` falls
  through to the generic **"Incorrect email or password"** message. **Any tenant with
  `mfaEnabled=true` cannot log in through this UI, and the error misdescribes why.** No OTP screen
  was found under `src/components/auth`. **Do not document MFA as a usable feature.**

---

## 2. DASHBOARD

**Files:** `app/(app)/page.tsx`, `src/modules/dashboard/DashboardPage.tsx`,
`src/lib/queries/dashboard.ts`, `src/lib/kpi/computeDashboardKPIs.ts`.

### 2.1 Entry & access
- Route `/` (`page.tsx:21`). Any authenticated non-super_admin (super_admin → `/admin`,
  `app/(app)/layout.tsx:21-23`).
- Everyone sees the dashboard. **CAPA content is role-gated:**
  `canViewCAPAs = CAPA_MODULE_VIEW_ROLES.includes(role)` (`page.tsx:69`); CAPA rows are passed only
  when true (`page.tsx:82-83`). Aggregate counts are tenant-wide for all roles by design
  (`page.tsx:23-46`).
- Site filter dropdown shows only for admins (`DashboardPage.tsx:363`); a login-selected site
  restricts other roles.

### 2.2 Actions (all read/drill-down — no writes)
| Element | Backing | Click target |
|---|---|---|
| 5 KPI cards (readiness, critical findings, CAPA overdue, CSV high-risk, training) | `computeDashboardKPIs(...)` over tenant-wide arrays (`DashboardPage.tsx:229-235`) | `/governance?tab=kpis#kpi-…` (`:376-379`); Training card has no link |
| Area readiness heatmap | `computeAreaScore(...)` (`:263-269`) | cell → `/gap-assessment` (`:412`) |
| Severity trend chart | `severityTrend(...)` (`:246`) | tooltip only |
| 90-day action plan | visibility-scoped `actionPlan` IIFE (`:276-295`) | row → module path (`ActionPlanTable.tsx:80-83`) |
| AGI insights rail | `:305-344` (suppressed when AGI mode = manual) | insight → module (`:469`) |
| Risk-signals rail | `:476-502` | quick links to gap/capa/csv/fda-483 |
| "Ask AI" drawer | `SmartRecordSearch` over visibility-scoped Redux | results → `/capa/[id]`, `/deviation`, `/gap-assessment` |
| Filters | time / site (admin) / severity (`:362-366`) | — |

### 2.3 States, notifications
No object lifecycle — derived states only (`isOpen`, `isOverdue`, compliance-score penalty stack
`dashboard.ts:87-88`). The dashboard neither emits nor consumes notifications.

### 2.4 Dead ends & gaps
- **`getDashboardStats` is fetched and discarded.** `page.tsx:57` runs the full server aggregation
  and passes `stats`, but `DashboardPage` never destructures it (`:108-118`) and computes all KPIs
  from `useTenantData()` instead — acknowledged in-code (`DashboardPage.tsx:70-78`). A wasted round
  trip; `recentFindings`/`recentCAPAs`/`recentLogs` are computed server-side and never rendered.
- **`/regulatory-intelligence`** is deep-linked from an AGI insight (`:320-321`) but has no sidebar
  entry (removed, `Sidebar.tsx:148-151`) — reachable only via that insight.
- Cosmetic: High and Medium trend bars share `fill="#f59e0b"` (`:433`) — indistinguishable.

---

## 3. GAP ASSESSMENT (Findings)

**Files:** `app/(app)/gap-assessment/page.tsx`, `src/modules/gap-assessment/GapPage.tsx` +
`tabs/GapRegisterTab.tsx` + `modals/{AddFindingModal,EvidenceLinkModal}.tsx`,
`src/actions/findings.ts`, `src/lib/queries/findings.ts`, `src/lib/finding-close.ts`.

### 3.1 Entry & access
- Route `/gap-assessment` (`page.tsx:10`). Three client tabs: summary / register / evidence
  (`GapPage.tsx:84-89`). Deep link `?open=<id>` opens one finding's detail modal (no per-id route,
  `GapPage.tsx:206-221`).
- Record visibility: see-all roles see all; others see only findings they created or own
  (`queries/findings.ts:11-16`).
- **Route has no server role gate** — `page.tsx:10` calls only `requireAuth()`. Nav is hidden for
  matrix-disallowed roles, but a direct URL renders the shell (data stays scoped). See §3.6.

### 3.2 Status lifecycle
`Open → In Progress → Submitted → Closed`, with `Submitted → Rework → Submitted` loop
(`statusTaxonomy.ts:29-36`).

| From | To | Action | Cite |
|---|---|---|---|
| — | Open | createFinding (forced) | `findings.ts:200` |
| Open | In Progress | assignFinding (Open only) | `findings.ts:541` |
| Open/In Progress/Rework | Submitted | submitFinding (**from Worklist**) | `findings.ts:1284-1298` |
| Submitted | Closed | reviewFinding — Accept (SoD + RCA gate) | `findings.ts:1350` |
| Submitted | Rework | reworkFinding (SoD) | `findings.ts:1418` |
| Open/In Progress | Closed | closeFinding / updateFinding→Closed (RCA gate) | `findings.ts:718, 379` |
| live-CAPA gap | Closed | CAPA cascade (exempt from RCA gate) | `finding-close.ts:42-51` |

There is **no reject/terminal state**; Rework is the only rejection and it loops.

### 3.3 Role × action
| Action | Who (server gate) | SoD / notes |
|---|---|---|
| Create finding | `GAP_CREATE_ROLES` = qa_head, qa, qc_lab_director, regulatory_affairs, csv_val_lead, it_cdo, operations_head (`findings.ts:146`) | owner stamped to creator (`:196`) |
| Edit — full | qa_head (QA authority) (`roleSets.ts:427-437`) | — |
| Edit — limited | the **raiser** (createdById), fields = requirement/purpose/area/targetDate/evidenceLink only (`findings.ts:332-345`) | cannot touch severity/status/linkedCAPAId |
| Assign owner | qa_head only, **Low severity only** (`findings.ts:478`) | **no self-assign** (`:508`); site-bound within own site (`:516`) |
| Write RCA | qa_head always; **raiser only until `assignedAt` is set** (`roleSets.ts:466-477`) | stamps `rcaRecordedById` |
| Raise CAPA | qa_head only (`canCreateCAPA`) | **locks the whole gap** (`findingLockedByCapa`) |
| Submit for review | the assignee (`isAssignedToTask`, `findings.ts:1281`) | **from Worklist, not this module** |
| Review Accept/Rework | qa_head only (`findings.ts:1323, 1397`) | **reviewer ≠ assignee** (`:1338, 1412`) |
| Close | qa_head only (`findings.ts:718`) | **closer ≠ RCA author** (`finding-close.ts:118`) |

### 3.4 Gates & blockers (plain language)
- **RCA before close.** A finding can't close without a root-cause analysis
  (`finding-close.ts:108`). Enforced on all three close paths (`findings.ts:738, 1344, 379`).
- **Closer ≠ RCA author.** Whoever recorded the RCA can't be the one who closes on it
  (`finding-close.ts:118`): *"You recorded this finding's root cause analysis, so you cannot close
  it. Separation of duties requires a different reviewer."*
- **Reviewer ≠ assignee.** *"…you cannot review a finding assigned to you."* (`findings.ts:1338`).
- **Raiser loses RCA write at hand-off.** Once QA assigns the finding (`assignedAt` set) the raiser
  can no longer change the RCA (`roleSets.ts:475`).
- **Gap locks once a CAPA is raised.** Every mutation refuses with *"This gap is locked — a CAPA
  has been raised from it…"* (`findings.ts:106-111`). A closed/orphan CAPA does not lock.
- **Edit reason ≥ 10 chars** for every edit / evidence-link save / RCA revision
  (`FINDING_EDIT_REASON_MIN`, `capaValidation.ts:33`) — but **not** for first RCA authorship.

### 3.5 Notifications
`assignFinding` → assignee (`findings.ts:577`, link `/gap-assessment`); `reviewFinding` accept →
owner (`:1365`); `reworkFinding` → owner (`:1449`, link `/worklist`). **No notification** on create,
edit, RCA, or on `submitFinding` (QA discovers submissions by browsing).

### 3.6 Dead ends & gaps
- **The worker half of the loop lives in the Worklist, not here.** `submitFinding` (and therefore
  resubmitting a Rework finding) is not imported by the gap UI (`GapRegisterTab.tsx:17-26`). A user
  who opens a Rework finding via `?open=` finds no submit control on this page.
- **`closeFinding`, `saveFindingWorkNotes`, `removeFindingEvidence`, `deleteFinding`,
  `restoreFinding` have no gap-module UI** — server-only or worklist-side.
- **RCA-at-create is dead plumbing.** `createFinding` accepts `rcaMethod`/`rootCause`/`rcaDetail`
  and the Add modal serializes them, but the RCA input is intentionally not rendered
  (`AddFindingModal.tsx:445-448`), so create-time RCA is always empty.
- **`previousCAPAId` (recurrence link)** is validated + audited server-side (`findings.ts:120-135`)
  but no form field collects it.
- **Silent create failure.** `handleAddFinding` on failure only `console.error`s
  (`GapPage.tsx:464-467`) — no toast; the modal just sits there.
- **Route has no server access gate** (§3.1) — matrix-hidden users can reach the URL (data scoped).
- **UNCLEAR:** `updateFinding` accepts `area` (`findings.ts:70`) which the UI locks and `roleSets`
  treats as raiser-editable, yet `area` is not in the QA-only block-list — a crafted raiser payload
  could change `area` despite the locked UI. Confirm intent.

---

## 4. DEVIATION MANAGEMENT

**Files:** `app/(app)/deviation/page.tsx`, `src/modules/deviation/*`, `src/actions/deviations.ts`,
`src/actions/deviation-tasks.ts`, `src/lib/queries/deviations.ts`.

### 4.1 Entry & access
- Route `/deviation` (`page.tsx:6-17`); detail is a modal keyed by `selectedId` (no per-record
  route). Deep link `?open=<id>`.
- Nav visible to **all non-super_admin** roles (`Sidebar.tsx:152`). Route gate is `requireAuth()`
  only; record visibility narrows the list (see-all = customer_admin/qa_head/super_admin; others see
  only their own or task-assigned, `queries/deviations.ts:25-34`).

### 4.2 Status lifecycle
`open → under_investigation → pending_qa_review → (capa_pending) → closed`, plus terminal `rejected`
(`statusTaxonomy.ts:90-97`).

| From | To | Action | Cite |
|---|---|---|---|
| — | open | createDeviation | `deviations.ts:271` |
| open | under_investigation | startInvestigation (open only) | `deviations.ts:979` |
| under_investigation | pending_qa_review | completeInvestigation | `deviations.ts:931` |
| pending_qa_review | capa_pending | Raise CAPA (inside createCAPA) | `capas/lifecycle.ts:834` |
| capa_pending | pending_qa_review | linked CAPA closes (best-effort) | `capas/closure.ts:490` |
| pending_qa_review (or recover from capa_pending, or task submitted) | closed | closeDeviation | `deviations.ts:635` |
| pending_qa_review | rejected | rejectDeviation | `deviations.ts:750` |

**Task lifecycle** (low-priority deviations): `pending → in_progress → submitted → closed | rework |
cancelled` (`deviation-tasks.ts`).

### 4.3 Role × action
| Action | Who (server gate) | SoD / precondition |
|---|---|---|
| Report deviation | `DEVIATION_CREATE_ROLES` (7 functional roles + qa_head) (`deviations.ts:187`) | — |
| Attach evidence | the **reporter only** (`deviations.ts:70-73`) | QA cannot upload evidence here |
| Start investigation | qa_head (`deviations.ts:970`) | open only |
| Complete investigation / RCA | any non-viewer author (`canWriteQuality`) (`deviations.ts:899`) | **investigator ≠ reporter** (`:911`) |
| CAPA decision | qa_head (`deviations.ts:1013`) | **decider ≠ reporter and ≠ investigator** (`:1032-1037`) |
| Raise CAPA | qa_head (`canCreateCAPA`) | parks deviation in `capa_pending`; cancels active task |
| Assign task | qa_head (`deviation-tasks.ts:66`) | Low priority only; one active task; active operational assignee |
| Send task for rework | qa_head (`deviation-tasks.ts:345`) | **reviewer ≠ assignee** (`:359`) |
| Sign & close | qa_head + password (`deviations.ts:409`) | **closer ≠ reporter, ≠ investigator, ≠ task assignee** (`:446-489`) |
| Reject | qa_head + password (`deviations.ts:701`) | only from `pending_qa_review` (`:718`) |

### 4.4 Gates & blockers
- **QA Head owns every disposition** (start, close, reject, assign, rework, CAPA decision).
- **Three-way closer SoD:** the closer cannot be the reporter, the investigator, or the task
  assignee (`deviations.ts:446-489`).
- **Critical deviations cannot close without a linked, back-referencing CAPA** (`deviations.ts:499-572`):
  blocks on no linked CAPA, missing CAPA, or a CAPA whose `deviationId` doesn't match.
- **Close and reject require e-signature** (password re-auth).
- **A deviation can only be rejected while under QA review** (`deviations.ts:718`).

### 4.5 Notifications
Only on tasks: assigned → assignee (`deviation-tasks.ts:134`); submitted → the QA assigner
(`:238`); rework → assignee (`:398`). **No notification on the core deviation lifecycle** — QA is
never actively told a deviation reached `pending_qa_review` awaiting close.

### 4.6 Dead ends & gaps
- **The impact fields are orphaned columns.** `patientSafetyImpact`, `productQualityImpact`,
  `regulatoryImpact` exist on the model (`prisma/schema.prisma:860-862`) but are **not written by
  `createDeviation`** and **not displayed anywhere** — zero references in `src/`/`app/` (independently
  confirmed). `IMPACT_COLOR` in `DeviationPage.constants.ts:21` is unused dead code. *(Known example.)*
- **`rejected` is a terminal dead-end with misleading copy.** `rejectDeviation` sets terminal
  `rejected` (`deviations.ts:752`), yet the modal and success toast say *"returned to investigation"*
  (`DeviationPage.tsx:1119, 510`). Nothing transitions out of `rejected`.
- **`saveInvestigationProgress` has no UI trigger** — the "save draft RCA" server capability is
  unreachable; the only save path calls `completeInvestigation` (`DeviationInvestigation.tsx:302`).
- **CAPA-decision record is not enforced at closure.** `closeDeviation` never checks
  `capaDecisionMade`; only Critical severity forces a linked CAPA. For non-Critical the decision
  section is advisory.
- **RCA-lock-after-CAPA is client-only** — no server guard in `completeInvestigation`
  (`DeviationInvestigation.tsx:271-276`).
- **Delete/restore are doubly dead** — gated on the empty `ADMIN_DELETE_ROLES` (no role passes) and
  have no UI (`deviations.ts:1149, 1198`).
- **Retired conversation thread** — `DeviationTaskMessage` rows are still written and hydrated but
  nothing renders the thread; only the latest rework reason shows.

---

## 5. CAPA (Corrective & Preventive Action)

**Files:** `app/(app)/capa/page.tsx`, `app/(app)/capa/[id]/page.tsx`,
`src/modules/capa/CAPADetailPageV2.tsx`, `src/actions/capas.ts` (barrel over
`src/actions/capas/{lifecycle,closure,alignment,rca-review,verification,action-items,effectiveness}.ts`),
`src/actions/capa-comments.ts`, `src/actions/effectiveness-criteria.ts`, `src/lib/capa-readiness.ts`.

### 5.1 Entry & access
- List `/capa` (`page.tsx`), detail `/capa/[id]` (full page; the modal is retired).
- **Module is locked to `CAPA_MODULE_VIEW_ROLES = qa_head, customer_admin`** (`roleSets.ts:220`);
  both routes `redirect("/worklist")` for anyone else (`page.tsx:17`, `[id]/page.tsx:21`).
- **Access asymmetry:** customer_admin can *view* the module but is absent from every CAPA action
  set — so in practice **qa_head is the only module-viewer who can act.** Everyone else reaches their
  CAPA work through the Worklist (assigned action items).

### 5.2 Status lifecycle
`open → in_progress → pending_qa_review → closed`, with `pending_qa_review → in_progress` on reject
and `closed/rejected → open` on reopen (`statusTaxonomy.ts:40-47`).

| From | To | Action | Cite |
|---|---|---|---|
| — | open | createCAPA | `lifecycle.ts:616` |
| open | in_progress | startCAPAProgress | `lifecycle.ts:1747` |
| in_progress | pending_qa_review | submitForReview | `lifecycle.ts:1453` |
| pending_qa_review | in_progress | rejectCAPA (bounce) | `lifecycle.ts:1568` |
| pending_qa_review \| pending_verification | closed | signAndCloseCAPA | `closure.ts:429` |
| closed \| rejected | open | reopenCAPA (**no UI**) | `lifecycle.ts:1795` |

> **`pending_verification` is unreachable** and **`rejected` is a dead-end status** — see §5.6.

### 5.3 Role × action (the acting role is `qa_head` unless noted)
| Action | Who | SoD / floor |
|---|---|---|
| Create / raise CAPA | qa_head (`CAPA_CREATE_ROLES`, `lifecycle.ts:417`) | title ≥5, description ≥20 |
| Edit CAPA | `COMPLIANCE_AUTHOR_ROLES` (`lifecycle.ts:1051`) | status not editable here; post-submit lock |
| Review RCA (approve/reject) | qa_head (`CAPA_REVIEW_ROLES`) | **reviewer ≠ creator** (`rca-review.ts:131-158`); notes ≥10 |
| Alignment review + override | qa_head | override reason ≥20; override SoD (`alignment.ts:209`) |
| Clear DI gate | qa_head (`lifecycle.ts:1302`) | notes ≥20 (`DI_CLEARANCE_MIN`) |
| Add/assign action item | qa_head assigns (`action-items.ts:206`); assignee must be a **CAPA executor** (`CAPA_EXECUTE_ROLES` = qa, csv_val_lead, qc_lab_director, regulatory_affairs, it_cdo, operations_head) (`:213`) | description ≥10; due ≤ CAPA due |
| Execute/complete action item | the assignee (`isAssignedToTask`) | owner may only move pending→in_progress→complete or save notes |
| Per-person accept / send-back / skip / reassign / nudge | qa_head (`:809, 905, 1043, 1123`) | send-back reason ≥10; skip ≥20 |
| Add effectiveness criteria | `COMPLIANCE_AUTHOR_ROLES` (`effectiveness-criteria.ts:99`) | 5 sub-fields validated |
| Submit for review | author role **or** the CAPA driver (`lifecycle.ts:1375`) | 6-condition readiness gate |
| Sign & close | qa_head + `gxpSignatory` + password (`closure.ts:80-91`) | **closer ≠ creator** (`:123-150`); closing notes ≥20 |
| Reject → rework | qa_head (`lifecycle.ts:1496`) | reason ≥10; bounces to in_progress |
| Comments / concerns | author role or action owner or driver; resolve concern = qa_head/regulatory_affairs (`capa-comments.ts:39`) | body ≥10 |
| Effectiveness review (90-day) | `canApproveCAPA(role, risk)` + password (`effectiveness.ts:129`) | reviewer ≠ closure/verification signer |

### 5.4 Gates & blockers
- **Submit readiness — 6 conditions** (`capa-readiness.ts:86-178`), enforced by both server
  (`submitForReview`, `lifecycle.ts:1414`) and the client checklist:
  1. RCA approved by QA (`rcaApproved === true`).
  2. Alignment aligned or overridden.
  3. DI gate cleared — **only when `capa.diGate` is set** (omitted otherwise).
  4. All action items done (complete/accepted/skipped) — **zero items = not met**.
  5. **At least one** evidence category answered (COMPLETE or NOT_APPLICABLE). *(Note: the file
     header still says "all 7"; the code loosened it to ≥1, `:147-154`.)*
  6. At least one effectiveness criterion defined.
- **Close chain** (`closure.ts`): status ∈ {pending_qa_review, pending_verification} (`:160`); **every
  action item accepted or skipped** — a plain `complete` still blocks (`:231-269`); **any unresolved
  concern blocks closure** (`:277-285`); closer ≠ creator; gxpSignatory + password.
- The change-control dependency gate (6.4) is **commented out / bypassed** (`closure.ts:287-323`).

### 5.5 Notifications
Action assigned/reassigned/nudged → owner; CAPA reassigned → new owner (`lifecycle.ts:1274`);
rework → item owners (`:1683`) + evidence uploaders (`:1705`); rejected → owner (`:1667`); closed →
owner (`closure.ts:579`). **No notification on `submitForReview`** — QA discovers pending reviews by
browsing. `CAPA_VERIFIED` exists but its action is orphaned.

### 5.6 Dead ends & gaps
- **`pending_verification` is unreachable; verification is orphaned server code.** Its only producer,
  `approveCAPA`, was removed (`capas.ts:41`). `verifyCAPA`/`revokeCAPAVerification` require that
  status, so they can never run; the `CAPA_VERIFICATION` SignedRecord path, `verifiedAt`, and
  `VERIFICATION_*` messages are all dead. `pending_verification` handling survives only as legacy
  branches.
- **`rejected` is a dead-end status.** `rejectCAPA` bounces to `in_progress` (`lifecycle.ts:1562`);
  nothing writes `rejected` for new CAPAs. It's exited only via `reopenCAPA`.
- **`reopenCAPA` has no UI trigger** — a closed CAPA's decision zone offers only "Record
  effectiveness". Guarded action exists, no button.
- **`deleteCAPA`/`restoreCAPA` are unreachable** — gated on the empty `ADMIN_DELETE_ROLES`.
- **Dead UI components:** `CAPADetailPage.tsx` (V1), `SignApprovalModal.tsx`, `ApprovalBriefPanel.tsx`
  (the removed approve step), `CCOverrideModal.tsx` — none imported. `CAPA_APPROVED` notification type
  has an icon but no producer.
- **DI-gate status vocabulary drift** (`statusTaxonomy.ts:109-124`): writers use `pending`/`cleared`/
  legacy `open`; `app/api/capas/route.ts:41` casts to Title-case with a **phantom `"Failed"`** nothing
  writes. Readiness only accepts `"cleared"`, so any other spelling silently blocks submit.
- **`getCAPAApprovals` query / `CAPAApproval` model** retain a read path with no writer.

---

## 6. WORKLIST

**Files:** `app/(app)/worklist/page.tsx`, `src/modules/worklist/*`, `src/lib/queries/worklist.ts`,
`src/actions/stage-tasks.ts`.

### 6.1 Entry & access
- Route `/worklist`, nav visible to **all non-super_admin** (`Sidebar.tsx:139`). Data is per-user:
  `getWorklist(session.user.id, tenantId)` (`page.tsx:15`).
- **This is where seat/functional roles do their assigned work** — the counterpart to the modules
  they cannot open (CAPA especially).

### 6.2 What appears (4 aggregated sources, all user-scoped)
1. **CAPA action items** assigned to you (`worklist.ts:193`). *(A whole CAPA reaches the worklist only
   through an assigned action item — never by `CAPA.ownerId`.)*
2. **Deviation tasks** where you're the assignee (`:211`).
3. **CSV/CSA stage rework tasks** (`:238`).
4. **Gap findings** you own, **not yet CAPA-locked**, in an active status (`:251`).

Findings leave the worklist when a CAPA is raised (`linkedCAPAId != null`) or they close.

### 6.3 Actions (from the unified `WorkItemModal`)
| Action | Applies to | Backing |
|---|---|---|
| Open work item | all | reads `getWorklist` |
| Save notes | Finding, CAPA (not deviation) | `saveFindingWorkNotes` / `updateActionItem` |
| Submit to QA | all three | `submitFinding` / `submitDeviationTask` / `updateActionItem({status:complete})` — requires notes ≥5 |
| Upload / remove evidence | all | `uploadFindingEvidence("work")` / `attachDeviationTaskDocument` / `addEvidenceFile` |
| View source record | all | deep-links to `/gap-assessment`, `/capa/[id]`, `/deviation` |
| CSV stage task | read-only strip | navigates to `/csv-csa/systems/[ref]?tab=execute` |

Editability is status-derived (`canWork`); footer buttons hide when not workable.

### 6.4 Notifications & gaps
- The worklist is the landing target for most task notifications (all `linkPath:"/worklist"`). It
  only reads; writes fire from the same actions that emit notifications.
- **Inconsistency:** initial gap-finding *assignment* links to `/gap-assessment` (`findings.ts:584`),
  though the assignee actually works it from the worklist; only the *rework* notification points to
  `/worklist`.
- **Dead code:** `DeviationTaskPanel.tsx` (a fully-built duplicate of the modal's deviation branch —
  only its `GroupedTaskDocs` helper is imported elsewhere); `src/actions/worklist.ts` is a
  types-only `"use server"` file **with no exported action**; retired `TaskThread` — `messages` are
  still fetched into the payload but nothing renders them.

---

## 7. FDA 483 (Inspections & Regulatory)

**Files:** `app/(app)/fda-483/page.tsx`, `src/modules/fda-483/*`, `src/actions/fda483.ts`,
`src/lib/queries/fda483.ts`.

### 7.1 Entry & access
- Route `/fda-483`, nav label "Inspections & Regulatory", matrix-driven visibility. Deep link
  `?event=<id>`; detail tabs overview/observations/investigation/response/audit.
- Visibility: non-see-all users see only events they created or internally own
  (`queries/fda483.ts:15-17`).

### 7.2 Status lifecycle
**Event** (`statusTaxonomy.ts:51-61`) — wired transitions only:
- create → **Open**; save response draft → **Response Drafted**; sign & submit → **Response
  Submitted** (stage → outcome); record outcome → **FDA Acknowledged** / **Closed** / **Warning
  Letter** (terminal) or **Response Drafted** (follow-up).
- Separate `currentStage` axis: intake → investigation → response → outcome → closed.
- **Response Due** is a *computed overlay*, never persisted (`_shared.ts:331-341`).

**Observation** (`statusTaxonomy.ts:65-71`): create → **Open**; raise/link CAPA → **CAPA Linked**;
RCA save → **Response Drafted**; close → **Closed** (but see gaps).

### 7.3 Role × action
| Action | Who (server gate) |
|---|---|
| Create event | `INSPECTION_CREATE_ROLES` = qa_head, regulatory_affairs (`fda483.ts:99-120`) |
| Add observations / RCA / draft / commitments / docs | any non-viewer author (`canWriteQuality`) |
| Raise CAPA from observation | **qa_head only** (via `createCAPA`) |
| Close observation | qa_head only (`fda483.ts:1426`) |
| Sign & submit response | `FDA483_SIGN_ROLES` = qa_head, regulatory_affairs + password (`:821`) |
| Record FDA outcome | `FDA483_SIGN_ROLES` + password (`:1071`) |
| Delete event/observation/commitment | `FDA483_DELETE_ROLES` = qa_head (**no UI**) (`:687, 1533, 1648`) |

### 7.4 Gates & blockers
- **Sign & submit unlock:** all 5 readiness rows done — every observation has RCA + CAPA, ≥1 response
  doc, response draft written, all commitments Complete/Cancelled (`_shared.ts:396-453`).
- **Response draft (Step 1) locked** until every observation has RCA and a linked CAPA.
- **Record locked after submit** (`isEventLocked`, `_shared.ts:320-329`) — **client-side only**; the
  child-write server actions don't re-check event lock (potential gap).
- E-signature (password) required to sign and to record outcome.

### 7.5 Notifications
**Server emits none.** Only client-derived bell alerts: `fda483_deadline`/`_critical`,
`commitment_overdue` (`useNotificationEngine.ts:65-80`) — current viewer only. Stage hand-off does
**not** notify the incoming owner despite a code comment to the contrary (`fda483.ts:962`).

### 7.6 Dead ends & gaps
- **Six server mutations with no UI caller:** `updateFDA483Event`, `deleteFDA483Event`,
  `deleteObservation`, `closeObservation`, `linkCAPAToEvent`, `deleteCommitment`/`reopenCommitment`.
  Because `closeObservation` has no UI, observation status **"Closed" is unreachable in-app**.
- **Captured-but-discarded field:** `AddObservationModal` shows a status picker and `number` field
  but `onObsSave` drops them and the schema rejects `status` — selecting "In Progress"/"Closed" is
  silently ignored.
- **Unreachable statuses:** event **"Under Investigation"** and **"Pending QA Sign-off"** (no writer);
  observation **"In Progress"** (no writer). They appear in the StatusGuide but can never be entered.
- **Client/server create-gate drift:** the "Register Event" button uses `canWriteDeviation` (any
  non-viewer) but the server restricts creation to qa_head/regulatory_affairs — a non-QA/RA author
  sees the button then gets rejected.
- **Stale SoD copy:** *"Only QA Head can sign and submit"* (`ResponseDetailTab.tsx:879`) — RA can too;
  delete error says *"or an administrator"* though only qa_head passes.

---

## 8. EVIDENCE & DOCUMENTS

**Files:** `app/(app)/evidence/page.tsx`, `src/modules/evidence/*`, `src/actions/documents.ts`
(library), `src/actions/evidence.ts` (CAPA 7-category evidence), `src/lib/queries/evidenceLibrary.ts`.

> **Two different models on one page name.** `/evidence` is a **document library** (the `Document`
> model). CAPA's richer 7-category `EvidenceItem`/`EvidenceFile` workflow lives inside the CAPA module
> and appears here only as **read-only mirrors**.

### 8.1 Entry & access
- Route `/evidence`, one aggregated feed `getEvidenceLibrary(session)`.
- Visibility: see-all = customer_admin, qa_head, super_admin (`documents.ts:40-42`); others see only
  docs they uploaded.

### 8.2 Role × action (library)
| Action | Who (server gate) | UI present? |
|---|---|---|
| Upload document | `COMPLIANCE_AUTHOR_ROLES` (csv_val_lead, qa_head, regulatory_affairs) + not viewer (`documents.ts:95`) | Yes ("Add document") |
| Edit metadata | here-origin author (`updateDocument`, `:481`) | Yes |
| Approve / sign (Part 11) | qa_head + password (`approveDocument`, `:205`) | **No UI** |
| Reject | qa_head (`rejectDocument`, `:346`) | **No UI** |
| Delete (soft) | qa_head only (`ADMIN_DELETE_ROLES` empty) + here-origin (`:396`) | Yes |
| Restore | qa_head (`restoreDocument`, `:522`) | **No UI** |

### 8.3 Status lifecycle & gates
- Document status: `draft` (on create) → `approved` / `rejected`. **Because approve/reject have no
  UI, a library document is permanently stuck at `draft`.** `"under_review"` appears in the badge map
  and stats but nothing ever sets it (unreachable).
- **Origin boundary:** only here-origin (`evidence`) docs are editable/deletable; foreign mirrors are
  locked with a reason (`documents.ts:410`).
- **File-OR-link** required on create; 10 MB limit; PDF/PNG/JPEG/XLSX/DOCX/CSV/TXT allowlist; sha256 +
  7-year retention.
- CAPA evidence (`evidence.ts`): PENDING → IN_PROGRESS → COMPLETE / NOT_APPLICABLE, + REJECTED
  (qa_head). NA transitions need a ≥10-char reason. Locks once the CAPA reaches QA review.

### 8.4 Notifications & gaps
- Library actions emit **no** notifications (audit only). CAPA evidence: `rejectEvidenceCategory`
  notifies the CAPA owner + all uploaders (`evidence.ts:594`).
- **Dead ends:** the entire document **approve/reject/restore lifecycle has no UI** — the Part 11
  document-approval `SignedRecord` machinery is unreachable. **Captured-not-exposed:**
  `linkedModule`/`linkedRecordId` are displayed as "Linked record" but the Add form has no field to
  set them, so a user **cannot link a library doc to a CAPA/finding/deviation** from this page. Stale
  copy: delete error says "or an administrator" though only qa_head can delete.

---

## 9. GOVERNANCE (Risk Register + Management Decisions)

**Files:** `app/(app)/governance/page.tsx` + `risks/[id]` + `decisions/[id]`,
`src/modules/governance/*`, `src/actions/{risks,management-decisions,risk-conversion}.ts`.

### 9.1 Entry & access
- Route `/governance`, tabs risks / decisions / kpis. **Route-level gate:** `requireRoleOrDeny(session,
  GOVERNANCE_VIEW_ROLES, …)` where `GOVERNANCE_VIEW_ROLES = qa_head, customer_admin` (`page.tsx:19`,
  `roleSets.ts:286`) — unauthorized roles redirected to `/` before any fetch.
- Non-GxP module, so `requireGxPAuthor` does **not** apply; super_admin is a legitimate *manager* but
  is excluded from *view* (and has a blank sidebar anyway).
- Detail routes `/governance/risks/[id]`, `/governance/decisions/[id]`.

### 9.2 Risk lifecycle
`Open ⇄ Mitigating ⇄ Closed`, and `Converted` (**terminal**) (`constants/risk.ts:81-92`).
`Converted` is written only by the conversion CLAIM (`risk-conversion.ts:147`) and is immutable.

### 9.3 Role × action
| Action | Who |
|---|---|
| Raise risk | any non-viewer (`canCreateRisk`, `risks.ts:107`) |
| Edit risk | manage role, **or** the risk's creator/owner (`canEditRisk`, `roleSets.ts:368-378`) |
| Archive risk | **manage only** — `GOVERNANCE_MANAGE_ROLES` = customer_admin, super_admin, qa_head (`risks.ts:303`) |
| Convert risk → Gap/Deviation/CAPA | **two gates** (see below); net = **qa_head alone** |
| Minute a management decision | any non-viewer (`management-decisions.ts:119`) |
| Amend a decision | manage role, or the meeting's creator (`canEditManagementDecision`) |
| Archive a decision | manage only (`management-decisions.ts:336`) |
| Toggle decision action-item status | edit gate (`setDecisionItemStatus`, `:397`) |

### 9.4 Gates & blockers
- **Conversion two-gate rule** (`risk-conversion.ts:387-396`): must (1) be a governance manager AND
  (2) satisfy the target module's own create gate (`canConvertRiskTo`). The intersection today is
  **qa_head alone** — customer_admin is in no create set, super_admin fails `canAuthorGxP`. The target's
  real create action is also called, so its gate stays authoritative.
- **Archive is manage-only** for both risks and meetings — a creator/owner may edit but never archive.
- **Convertible only** while live and status ∈ {Open, Mitigating}; a Closed risk must be reopened first.

### 9.5 Notifications & gaps
- **No user-to-user notifications** — governance emits AuditLog rows only (surfaced in the detail
  clock modal).
- **Gaps:** archive failures are **silent** (`console.warn` only, no popup); a rolled-back conversion
  can leave a risk `Converted` with a null `convertedToId` — a **genuine dead-end state** (no convert
  buttons, no edit, no history line). customer_admin sees the "Convert this risk" section with all
  three buttons disabled (cosmetic dead surface).

---

## 10. INSPECTION READINESS (Training & Awareness)

**Files:** `app/(app)/readiness/page.tsx`, `src/modules/readiness/*`, `src/actions/inspections.ts`,
`src/lib/queries/inspections.ts`.

### 10.1 Entry & access
- Route `/readiness`, tabs Overview / Tasks / Training / Activity. Nav visible to **all
  non-super_admin incl. viewers** (`Sidebar.tsx:152`). **No route role gate** (`requireAuth()` only).
- Admin actions use `READINESS_ADMIN_ROLES` in the capability map, but the page computes `isAdmin`
  inline and the server actions use **narrower** gates — a mismatch (see gaps).

### 10.2 Actions & lifecycle
| Action | Who (server gate) | Result |
|---|---|---|
| Create inspection | `INSPECTION_CREATE_ROLES` = qa_head, regulatory_affairs (`inspections.ts:69`) | seeds 16 `ReadinessAction`s, status "planning" |
| Mark action complete | any non-viewer owner (`:129-148`); UI restricts to `isAdmin` | Not Started → **Complete** (one-way) |
| Complete inspection | effectively qa_head (`:184-196`) | → "completed" |
| Schedule / complete simulation | any non-viewer author (`:395, 460`) | Scheduled → Completed |

`ReadinessAction`: **only** `Not Started → Complete` is wired — no reopen. "Overdue" is derived, never
stored (and seeded actions have no due date, so it's unreachable). "In Progress"/"Blocked" exist in
the taxonomy but nothing writes them.

### 10.3 Dead ends & gaps (this module is the most affected)
- **"Add action" is invisible.** The non-viewer "Add action" button dispatches Redux `addCard`
  (`ReadinessPage.tsx:437-444`); the only surface that renders `cards` is wrapped in `{false && …}`
  (`:589`). The action succeeds and is invisible to everyone.
- **Two entire Redux simulation modals are dead** — their open-setters are never called; the real
  flow is the Prisma-backed Training tab.
- **`createTrainingRecord`/`completeTrainingRecord` have no UI** — the Training tab only displays
  records; the write path is unreachable. Same for `createPlaybook`/`deletePlaybook` (only surfaced
  via the Resources drawer).
- **Prisma actions can't be reopened** — a completed `ReadinessAction` is a terminal UI dead-end.
- **Role/UI-vs-server mismatches (silent no-ops):** "New Inspection" shows for **customer_admin** but
  the server rejects it (failure is `console.error` only); **regulatory_affairs can create
  server-side but the button is hidden** for it. "Complete Inspection" shows for customer_admin but
  the server rejects.
- **No readiness-score floor** blocks completing an inspection — only an outcome is required.

---

## 11. NOTIFICATIONS

**Files:** `src/lib/notify.ts` (emitter), `src/components/layout/NotificationBell.tsx` (bell),
`src/actions/notifications.ts` (reads).

### 11.1 Entry, access, actions
- Bell in the Topbar; polls unread count every 60s, fetches the list (max 50) on open. Hidden when
  logged out. Any authenticated user sees only their own notifications (self + tenant scoped,
  `notifications.ts:29`).
- Actions: view, open item (optimistic mark-read + navigate to `linkPath`), mark-all-read. All
  best-effort/silent on failure.

### 11.2 Master trigger list (who gets notified, when)
The only `prisma.notification.create` is `notify.ts:62`; `notify()` is fault-isolated, post-commit,
never notifies the actor, and skips a null recipient (so admins with a null User FK get nothing).

| Source event | Type | Recipient | Cite |
|---|---|---|---|
| CAPA action item assigned / owner changed / reassigned / nudged | `ACTION_ASSIGNED` | new/existing item owner | `action-items.ts:276, 601, 1189, 1269` |
| CAPA action returned for rework | `REWORK_ASSIGNED` | item owner | `action-items.ts:1004` |
| CAPA owner changed | `CAPA_ASSIGNED` | new CAPA owner | `lifecycle.ts:1274` |
| CAPA rejected | `CAPA_REJECTED` | CAPA owner | `lifecycle.ts:1667` |
| CAPA bulk rework | `REWORK_ASSIGNED` | each rework item owner | `lifecycle.ts:1683` |
| CAPA evidence rejected | `EVIDENCE_REJECTED` | evidence uploaders (+ owner) | `lifecycle.ts:1705`, `evidence.ts:594` |
| CAPA closed | `CAPA_CLOSED` | CAPA owner/driver | `closure.ts:579` |
| Gap finding assigned | `ACTION_ASSIGNED` | assignee | `findings.ts:577` |
| Gap finding accepted & closed | `ACTION_ASSIGNED` | finding owner | `findings.ts:1365` |
| Gap finding returned for rework | `REWORK_ASSIGNED` | finding owner | `findings.ts:1449` |
| Deviation task assigned / submitted / returned | `ACTION_ASSIGNED` / `REWORK_ASSIGNED` | assignee / QA assigner / assignee | `deviation-tasks.ts:134, 238, 398` |
| CSV stage task assigned / submitted / returned | `ACTION_ASSIGNED` / `REWORK_ASSIGNED` | assignee / reviewer / assignee | `stage-tasks.ts:124, 221, 301` |
| Support ticket reply / escalated / resolved / status changed | `TICKET_*` | requester / handler tier | `support.ts:472, 656, 764, 709` |

### 11.3 Dead ends & gaps
- **Defined-but-never-emitted types:** `CAPA_APPROVED`, `TICKET_ASSIGNED`, `DUE_SOON`, `OVERDUE`
  (the last two reserved for a scheduler that doesn't exist, `notify.ts:5-8`).
- **Ticket creation emits no notification** — a new ticket doesn't alert the handler tier.
- `TYPE_CONFIG` lacks `TICKET_*` entries → those notifications render with a neutral fallback icon.
- **No push/email transport** — in-app only.

---

## 12. SETTINGS

**Files:** `app/(app)/settings/page.tsx`, `src/modules/settings/*`, `src/actions/settings.ts`,
`src/actions/roleLimits.ts`.

### 12.1 Entry & access
- Route `/settings` (`requireAuth()` only — no route role gate). Tabs: Organization, Sites, Users &
  Roles, Subscription, Frameworks, AGI Policy, Permissions.
- Non-managers see a read-only banner: *"Settings can only be modified by Customer Admin"*
  (`SettingsPage.tsx:56-63`). **Manage** = `SETTINGS_MANAGE_ROLES` = super_admin, customer_admin
  (`roleSets.ts:256`) — in the customer app, that's customer_admin.

### 12.2 Actions (server-backed vs Redux-only)
| Tab / action | Persists server-side? | Who |
|---|---|---|
| Add/Edit/Delete **Site** | **Yes** (`settings.ts:72, 135, 185`); delete needs password | customer_admin |
| Add/Edit/Delete **User** | **Yes** (`createUser`/`updateUser`/`deleteUser`); delete needs password | customer_admin (role-grant ceiling; cannot mint super/customer_admin) |
| **GxP signatory** toggle | **Yes**, password-gated (`:630`); cannot change own (`:451`) | customer_admin |
| Activate/Deactivate user | **Yes** (`:495`); cannot change own | customer_admin |
| Enable/disable **Framework** | **Yes** (`FrameworksTab.tsx:61`) | customer_admin |
| **Organization** edit | **No — Redux only** (`OrgTab.tsx:99`) | (button doesn't even render for customer_admin) |
| **AGI Policy** | **No — Redux only** (`AGIPolicyTab.tsx:193`) | customer_admin / it_cdo |
| **Permissions matrix** | **No — Redux only**, and tab hidden for everyone | super_admin (in theory) |
| **Role limits** | server actions exist but **not wired to any Settings screen** (`roleLimits.ts:22-24`) | super_admin |

### 12.3 Gates & blockers
- Password re-auth on delete-site, delete-user, and GxP-signatory change.
- No self-mutation of your own status or signatory authority.
- Plan caps + a role-grant ceiling block user/site creation server-side.
- Permission-matrix edit is super_admin-only **and** the tab is hidden → no in-app path.

### 12.4 Dead ends & gaps
- **Organization edits never persist** (Redux-only; the Edit button doesn't render for customer_admin
  — Org is effectively view-only in the customer app).
- **AGI Policy edits never persist** to the server (Redux-only, confirmed by the module CLAUDE.md).
- **Permissions matrix is a dead surface** — hidden for everyone, edits Redux-only.
- **Role-limit write actions have no Settings UI** and revalidate `/admin`, not `/settings`.
- **CLAUDE.md drift** — the module doc describes 5 tabs / 8 roles; the code has 7 tabs / 10 roles.
- `settings/page.tsx` fetches sites/users and passes them, but `SettingsPage` ignores the props and
  reads Redux (suppressed with `@ts-expect-error`).

---

## 13. END-TO-END FLOWS (multi-role journeys)

Each step names the acting role and the gate that must clear before the next step. "QA Head" = the
`qa_head` role; a "functional author" is any of qa/csv_val_lead/qc_lab_director/regulatory_affairs/
it_cdo/operations_head.

### Flow A — Deviation: raised → investigated → CAPA → closed
1. **Reporter** (functional author or QA Head) — *Report Deviation* on `/deviation`
   (`createDeviation`). → status **open**. *Gate to proceed:* QA Head must start the investigation.
2. **QA Head** — *Start Investigation* (`startInvestigation`). → **under_investigation**. *Gate:* the
   deviation must be `open`.
3. **Investigator** (any functional author who is **not** the reporter) — *Complete Investigation /
   RCA* (`completeInvestigation`; `rcaMethod` + `rootCause` required). → **pending_qa_review**.
   *Gate:* investigator ≠ reporter (`deviations.ts:911`).
4. **QA Head** (not the reporter, not the investigator) — *CAPA Decision = required*
   (`saveCAPADecision`). *Gate:* decider ≠ reporter and ≠ investigator (`:1032-1037`).
5. **QA Head** — *Raise CAPA* (`createCAPA`). → deviation parked at **capa_pending**, `linkedCAPAId`
   set, any active task cancelled. *Gate:* only QA Head may create a CAPA.
6. **CAPA runs its own lifecycle** (Flow B'). When the CAPA is signed & closed, the deviation returns
   to **pending_qa_review** (best-effort, `capas/closure.ts:490`).
7. **QA Head** (not reporter/investigator/task-assignee) — *Sign & Close Deviation*
   (`closeDeviation`, password). → **closed**. *Gate:* for **Critical** severity, a linked CAPA that
   back-references this deviation must exist (`deviations.ts:499-572`); three-way closer SoD.

> Low-priority variant: instead of a CAPA, QA Head *Assigns a Task* (step 5'), the **assignee** works
> and *Submits* it from the Worklist, and QA Head signs the close on the submitted task.

### Flow B — Gap/finding: identified → RCA → evidence → closed
1. **Raiser** (`GAP_CREATE_ROLES`) — *Create finding* on `/gap-assessment` (`createFinding`). →
   **Open**. Owner = the raiser.
2. **Raiser or QA Head** — *Write RCA* in the finding's RCA section (`saveFindingRCA`). Stamps
   `rcaRecordedById`. *Gate:* the raiser may author it **only until QA assigns the finding**
   (`assignedAt`).
3. **QA Head** — *Assign owner* (Low severity; `assignFinding`). → **In Progress**, sets `assignedAt`.
   *Gate:* QA Head only; no self-assign. *(High/Medium/Critical skip assignment — QA raises a CAPA
   instead, which locks the gap and closes it via the CAPA cascade.)*
4. **Assignee** — from the **Worklist**: upload evidence, save notes, *Submit for review*
   (`submitFinding`, notes ≥5). → **Submitted**. *Gate:* only the assignee may submit.
5. **QA Head** (not the assignee) — *Accept & close* (`reviewFinding`) → **Closed**, or *Send for
   rework* (`reworkFinding`) → **Rework** (loops to step 4 from the Worklist). *Gate to close:* an RCA
   exists **and** the closer ≠ the RCA's author (`finding-close.ts`).

### Flow C — FDA-483: observation → response
1. **QA Head or Regulatory Affairs** — *Register Event* on `/fda-483` (`createFDA483Event`). →
   **Open**, stage *intake*.
2. **Any functional author** — *Add observations* (or *Import from 483 PDF*). Observations → **Open**.
3. **Author** — hand off intake → investigation; perform *RCA per observation* (`updateObservation`).
   Each observation → **Response Drafted**.
4. **QA Head** — *Raise CAPA per observation* (`raiseCAPAFromObservation`). Observation → **CAPA
   Linked**. *Gate:* only QA Head may raise a CAPA.
5. **Author** — *Draft response* (`saveResponseDraft`). Event → **Response Drafted**. *Gate:* every
   observation must have an RCA **and** a linked CAPA before Step 1 unlocks.
6. **QA Head or Regulatory Affairs** — *Sign & Submit to FDA* (`signSubmitFDA483Response`, password).
   → **Response Submitted**, stage *outcome*. *Gate:* all 5 readiness rows done.
7. **QA Head or Regulatory Affairs** — *Record FDA Outcome* (`recordFDA483Outcome`, password). →
   **FDA Acknowledged** / **Closed** / **Warning Letter** (terminal), or **Response Drafted** if
   follow-up requested.

### Flow D — Document / evidence: upload → linked to a record
There is **no single "upload then link"** journey on the Evidence page. The real linkage paths are:
1. **CAPA evidence** — inside a CAPA, the **assignee or a compliance author** uploads an
   `EvidenceFile` to one of the 7 categories (`addEvidenceFile`), optionally tied to their action
   item. It appears in the Evidence library as a **read-only mirror**.
2. **Finding/deviation task docs** — from the **Worklist**, the **assignee** uploads
   (`uploadFindingEvidence("work")` / `attachDeviationTaskDocument`), which links the file to that
   record.
3. **Standalone library document** — on `/evidence`, a **compliance author** uploads a `Document`
   (`createDocument`) — **but the form exposes no field to link it to a record**, and there is no
   approve step, so it stays at **draft**. *(This is a gap, not a supported flow — see §8.4.)*

### Flow E — Governance: risk raised → converted to a quality record
1. **Any non-viewer** — *Raise a risk* on `/governance` (`createRisk`). → **Open**.
2. **QA Head** — on the risk detail, *Convert this risk* → Gap / Deviation / CAPA
   (`convertRiskTo…`). *Gate:* the two-gate rule resolves to **qa_head alone**; the target's own
   create action runs and enforces its gate. → risk becomes **Converted** (terminal); a real,
   back-linked quality record is minted. From there the record follows Flow A/B.

---

## 14. CONSOLIDATED DEAD-ENDS & GAPS REGISTER

For a manual writer: **do not document these as working features.** Grouped by severity of the trap.

### 14.1 Features that look usable but are not reachable
| # | Where | What | Cite |
|---|---|---|---|
| 1 | **Auth** | **MFA/OTP has no client entry path** — MFA-enabled tenants cannot log in; error misdescribes why | `route.ts:232,433`; `LoginPage.tsx:223-255` |
| 2 | **Evidence** | **Document approve / reject / restore have no UI** — library docs stuck at `draft`; Part 11 doc-approval unreachable | `documents.ts:205,346,522` |
| 3 | **CAPA** | **`pending_verification` unreachable → `verifyCAPA` orphaned** (producer `approveCAPA` removed) | `capas.ts:41`; `verification.ts:72` |
| 4 | **CAPA** | **`reopenCAPA` has no UI trigger**; `deleteCAPA`/`restoreCAPA` gated on empty role set | `lifecycle.ts:1795,1838` |
| 5 | **Readiness** | **"Add action" writes to Redux and is invisible**; training-record & playbook writes have no UI; two dead sim modals | `ReadinessPage.tsx:437-444,589` |
| 6 | **FDA-483** | **6 mutations with no UI** (edit/delete event, delete/close observation, link existing CAPA, delete/reopen commitment) → observation "Closed" unreachable | `fda483.ts:196,676,1522,1419,1471,1637` |
| 7 | **Deviation** | **Delete/restore** doubly dead (empty role set + no UI); **`saveInvestigationProgress`** unreachable | `deviations.ts:1149,817` |
| 8 | **Gap** | `closeFinding`/`saveFindingWorkNotes`/`deleteFinding` no in-module UI; submit/resubmit only from Worklist | `findings.ts:707,1047,597` |
| 9 | **Settings** | Organization, AGI Policy, Permissions matrix, Role limits — **Redux-only or hidden, never persist** | `OrgTab.tsx:99`; `AGIPolicyTab.tsx:193` |

### 14.2 Unreachable states (defined in the taxonomy, no writer)
- **CAPA:** `pending_verification`, `rejected` (new CAPAs bounce to `in_progress` instead).
- **FDA-483 event:** "Under Investigation", "Pending QA Sign-off" (and "Response Due" is computed,
  never stored). **Observation:** "In Progress", "Closed".
- **Deviation:** `rejected` is terminal but its UI copy says "returned to investigation".
- **Readiness action:** "In Progress", "Blocked"; "Overdue" is derived and effectively unreachable.
- **Document:** "under_review".

### 14.3 Captured-but-not-displayed / not-collected fields
- **Deviation** impact fields (`patientSafetyImpact`/`productQualityImpact`/`regulatoryImpact`) —
  orphaned columns, no write path, no display *(the known example)*.
- **Gap** `previousCAPAId` (recurrence link) and create-time RCA — accepted server-side, no form field.
- **FDA-483** observation `status`/`number` — collected in the modal, dropped before save.
- **Evidence** `linkedModule`/`linkedRecordId` — displayed as "Linked record", no field to set them.
- **Dashboard** `getDashboardStats` result (incl. `recentFindings`/`recentCAPAs`/`recentLogs`) —
  fetched and discarded.
- **Worklist** `messages` (retired task thread) — fetched into the payload, never rendered.

### 14.4 Client/UI vs server drift (button shows, server rejects — or copy is stale)
- **FDA-483 create:** "Register Event" shows for any non-viewer, server allows only qa_head/RA.
- **Readiness:** "New Inspection"/"Complete Inspection" show for customer_admin, server rejects
  (silent `console.error`); RA can create server-side but the button is hidden.
- **Stale role copy:** FDA-483 "Only QA Head can sign…" (RA can too) and delete "or an administrator";
  Evidence delete "or an administrator" (qa_head only). CAPA `super_admin`-as-decider shown client-side
  though the server always rejects it.

### 14.5 Silent-failure UX (no feedback on rejection)
- **Gap** create failure — `console.error` only, modal stays open.
- **Governance** archive failure — `console.warn` only, no popup.
- **Readiness** create/complete failures for the wrong role — `console.error` only.

### 14.6 Dead code (renders/exists, no live path)
- **CAPA:** `CAPADetailPage.tsx` (V1), `SignApprovalModal.tsx`, `ApprovalBriefPanel.tsx`,
  `CCOverrideModal.tsx`.
- **Worklist:** `DeviationTaskPanel.tsx` (duplicate of the modal's deviation branch);
  `src/actions/worklist.ts` (types-only `"use server"` with no action).
- **Notifications:** `CAPA_APPROVED`, `TICKET_ASSIGNED`, `DUE_SOON`, `OVERDUE` types with no emitter.

### 14.7 Genuine dead-end states (a record can get stuck)
- **Governance:** a rolled-back conversion can leave a risk `Converted` with null `convertedToId` — no
  convert buttons, no edit, no history line.
- **Deviation `rejected`** and **Readiness completed action** — terminal with no exit.
- **Evidence library document** — permanently `draft` (no approve UI).

---

## 15. OPEN QUESTIONS FOR THE PRODUCT OWNER (verify before writing the manual)

1. **MFA** (§1.5) — is it meant to be live? If so, the OTP screen is missing; if not, it should be
   disabled at the tenant level so no one is locked out.
2. **Document approval** (§8) — is the library approve/reject/restore lifecycle intended to ship? If
   yes, it needs UI; if no, remove "Approved/Rejected/Under Review" from the status legend.
3. **CAPA verification** (§5.6) — is the 2-step approve→verify→close model retired for good? If yes,
   `pending_verification` and the verification code should be removed from the UI vocabulary.
4. **Deviation impact assessment** (§4.6) — restore a capture path, or drop the columns?
5. **Readiness** (§10.3) — the module has more dead surfaces than live ones; confirm which of
   Add-action, simulations, training records, and playbooks are supposed to be user-facing.
6. **`area` editability by a finding raiser** (§3.6) — intended or an oversight?

*(End of audit. Written to `docs/USER_FLOW_AUDIT.md`. No source files were modified.)*
