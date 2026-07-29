# Notifications Module — Full Audit

**Date:** 2026-07-23
**Scope:** Entire notification surface of Pharma Glimmora (Next.js 16 App Router app under `Glimmora-Pharma/`).
**Method:** Static code audit — source reading, cross-referencing, schema/migration inspection. The running application was **not** exercised; every claim below cites a file and line so it can be re-verified. Where I infer runtime behaviour from code, I say so.
**Constraint honoured:** no code was modified during this audit.

---

## 0. Headline

Three things must be understood before reading the rest:

1. **There is no notification page.** `app/(app)/` contains no `notifications` route and `app/api/` contains no `notifications` route. The *entire* user-facing notification surface is one dropdown: `src/components/layout/NotificationBell.tsx`, mounted once at `src/components/layout/Topbar.tsx:170`. Phase 2's checklist (pagination, infinite scroll, search, filtering, sorting, grouping) is therefore not "inconsistent" — it is **absent**, because the surface it would live on does not exist.

2. **Two parallel notification systems exist, and one of them is dead code.** A server/DB system (real, works) and a client/Redux system (computes ~15 rules and renders none of them).

3. **There is no scheduler.** Every notification in the product is emitted synchronously inside a user-triggered server action. No cron, no queue, no job runner. All time-based notification categories the domain requires — overdue, due-today, escalation, reminders — do not exist server-side.

---

# Phase 1 — Current Architecture Analysis

## 1.1 The two systems

### System A — Server-side, DB-backed (the real one)

| Layer | File | Notes |
|---|---|---|
| Emitter | `src/lib/notify.ts` | `notify()` / `notifyMany()`; fault-isolated |
| Persistence | `prisma/schema.prisma:2214-2230` | `model Notification` |
| Read API | `src/actions/notifications.ts` | Server Actions (**not** REST) |
| UI | `src/components/layout/NotificationBell.tsx` | Bell + dropdown, 60 s poll |
| Mount | `src/components/layout/Topbar.tsx:170` | Customer app only |

### System B — Client-side, Redux-derived (dead)

| Layer | File | Notes |
|---|---|---|
| Rule engine | `src/hooks/useNotificationEngine.ts` | ~15 derived rules |
| Store | `src/store/notifications.slice.ts` | `MAX_ITEMS = 50` |
| Mount | `src/components/layout/AppShell.tsx:56` | `useNotificationEngine()` |
| Persistence | `src/store/persistence.ts:20-26` | `"notifications"` in `PERSIST_SLICES` → localStorage |
| **Consumers** | **none** | — |

Verified by exhaustive search: the only reader of `s.notifications.items` in the whole repo is the engine's own dedupe check at `useNotificationEngine.ts:17`. The slice's `markRead`, `markAllRead`, `removeNotification`, and `clearAll` reducers (`notifications.slice.ts:40-52`) are **never dispatched anywhere**. System B is write-only.

## 1.2 Data flow (System A)

```
GxP server action (e.g. rejectCAPA)
  └─ prisma.$transaction { domain write + AuditLog }        ← committed first
  └─ notify({ tenantId, recipientUserId, actorUserId, … })  ← AFTER commit, fault-isolated
       ├─ guard: no recipient        → return (no-op)
       ├─ guard: recipient === actor → return (no-op)
       └─ prisma.notification.create(...)   [try/catch → console.error, never rethrows]
  └─ revalidatePath(...)

Client:  NotificationBell
  ├─ setInterval(refreshCount, 60_000) → unreadCount()      → badge only
  ├─ on dropdown open → getNotifications(30)                → list
  ├─ on item click    → optimistic isRead flip → markRead(id) → router.push(linkPath)
  └─ "Mark all read"  → optimistic flip-all → markAllRead()
```

## 1.3 Database schema

`prisma/schema.prisma:2214-2230`:

```prisma
model Notification {
  id              String    @id @default(cuid())
  tenantId        String
  recipientUserId String
  type            String
  title           String
  body            String?
  linkPath        String?
  entityType      String?
  entityId        String?
  isRead          Boolean   @default(false)
  createdAt       DateTime  @default(now())
  readAt          DateTime?

  @@index([recipientUserId, isRead, createdAt])
  @@index([tenantId])
}
```

No relations. No foreign keys. No soft delete. No priority. No category. No channel. No dedupe key. No expiry.

## 1.4 API endpoints

None. There is no `app/api/notifications/` route. All access is via four Server Actions in `src/actions/notifications.ts`:

| Function | Line | Scope |
|---|---|---|
| `getNotifications(limit = 30)` | 26 | `recipientUserId = self AND tenantId = self`, `MAX_LIMIT = 50` |
| `unreadCount()` | 47 | same scope, `isRead: false` |
| `markRead(id)` | 59 | `updateMany` scoped by `(id, self, tenant, isRead:false)` |
| `markAllRead()` | 69 | `updateMany` scoped by `(self, tenant, isRead:false)` |

There is **no** delete, archive, restore, bulk, search, filter, or pagination action.

## 1.5 Providers / channels

| Channel | Status | Evidence |
|---|---|---|
| In-app (bell) | ✅ implemented | `NotificationBell.tsx` |
| Toast (transient) | ✅ separate system, 41 call sites | `src/components/ui/Toast.tsx`, `useToast()` |
| Email | ❌ not wired to notifications | `src/lib/mailer.ts` has exactly **one** consumer: `app/api/auth/[...nextauth]/route.ts:6` (`sendOtpEmail`) |
| SMS / Teams / Slack / Webhook | ❌ absent | no code |
| Web Push | ❌ absent | no service worker, no `PushManager` |

## 1.6 Transport

Polling only. `POLL_MS = 60_000` (`NotificationBell.tsx:35`), `setInterval` at line 77. No WebSocket, no SSE, no `EventSource` anywhere in `src/` or `app/`.

## 1.7 Background jobs / scheduler

None. `vercel.json` declares only `{"framework":"nextjs"}` (no `crons`). `scripts/` contains backfills and probes only. `DUE_SOON` and `OVERDUE` are declared in the type union (`src/lib/notify.ts:18-19`) with the comment *"reserved for a future scheduler (no cron exists yet)"* and are never emitted.

## 1.8 Preferences / read-unread / counters / badges

- **Preferences:** none. No per-user channel, mute, snooze, digest, or category settings exist anywhere.
- **Read model:** boolean `isRead` + nullable `readAt`. One-way — nothing can mark a notification unread again.
- **Counter:** `unreadCount()` server-side; also recomputed client-side from the fetched page (`NotificationBell.tsx:66`) — see NTF-008.
- **Badge:** `NotificationBell.tsx:128-132`, capped at `"9+"`.

## 1.9 Complete lifecycle

**Creation → Delivery → Read → Dismissal**

1. **Create** — a server action calls `notify()` after its transaction commits. Two silent drops by design: null recipient, and actor === recipient (`notify.ts:59-60`).
2. **Store** — one row. No queue, no retry, no delivery record.
3. **Deliver** — nothing is pushed. The recipient discovers it on their next 60 s badge poll, and only sees content after opening the dropdown.
4. **Read** — click flips `isRead` optimistically then persists; or "Mark all read".
5. **Dismiss** — **does not exist.** There is no delete, archive, snooze, or expiry. A notification's terminal state is `isRead = true`, and the row lives forever.

---

# Phase 2 — UI & UX Audit

Surface audited: `NotificationBell.tsx` (the only one) + the decorative bell in `src/modules/admin/AdminShell.tsx:319-326`.

| Aspect | Finding |
|---|---|
| Layout | Fixed dropdown, `w-[calc(100vw-24px)] sm:w-80`, `max-h-[360px]` scroll (lines 138, 154). Reasonable. |
| Responsive | Adequate — full-width minus gutter on mobile, 320 px on `sm+`. |
| Empty state | ✅ present, line 160-165 ("No notifications"). |
| Loading state | ⚠️ text-only "Loading…" (line 155-159), and **only** when `items.length === 0`. A refresh over existing items shows no indicator. |
| Error state | ❌ **none.** Four separate `catch {}` blocks swallow silently (lines 55, 68, 99, 107). A failed fetch is indistinguishable from "no notifications". |
| Pagination | ❌ none. Hard `getNotifications(30)`, server clamp 50. Nothing beyond row 30 is reachable, ever. |
| Infinite scroll | ❌ none. |
| Search / Filter / Sort | ❌ none. |
| Grouping | ❌ none (no by-day, by-module, or by-type grouping). |
| Icons | ⚠️ `TYPE_CONFIG` (lines 22-33) covers 10 types. All five `TICKET_*` types are missing → every support notification renders the grey fallback bell (line 167). |
| Colour | Hard-coded hexes (`#ef4444`, `#f59e0b`, `#0ea5e9`, `#10b981`) rather than the `var(--danger)/--warning/--brand/--success` tokens used elsewhere in the shell. Cosmetic inconsistency. |
| Typography | Consistent with the app's `text-[12px]/[11px]/[10px]` scale. |
| Accessibility | ❌ **Serious.** Rows are `<div role="button">` with `onClick` and **no `tabIndex`, no `onKeyDown`** (lines 170-180) → unreachable and unactivatable by keyboard. WCAG 2.1.1 (Keyboard) failure. |
| | `role="dialog"` (line 139) with no `aria-modal`, no focus trap, no initial focus, no focus restore. |
| | No `Escape` handler — only outside-`mousedown` closes it (lines 85-91). |
| | No `aria-live` region — a newly arriving notification is announced to nobody. |
| | Unread dot is a bare `<div aria-label="Unread">` (line 187); `aria-label` on a role-less div is widely ignored by AT. |
| | Badge shows `9+` while `aria-label` announces the exact count (lines 118, 130) — divergent sighted vs. announced info. |
| Keyboard nav | ❌ Bell button is focusable; **nothing inside the dropdown is.** |
| Screen reader | ⚠️ Partially usable — the button label is good (`Notifications — N unread`), the content is not operable. |
| Mobile | Dropdown width is handled; tap targets on rows are large enough; no swipe actions (nothing to swipe to — no dismiss exists). |
| Timestamps | `RelativeTime` (line 192) renders relative text with exact **UTC** in `title` — GxP-appropriate, but inconsistent with every module table, which renders `org.timezone` / `org.dateFormat`. |
| Admin console | ❌ `AdminShell.tsx:319-326` renders a `<button aria-label="Notifications">` with **no `onClick`, no badge, no data source**. It is a decoration. |

---

# Phase 3 — Functional Audit

| Feature | Status | Evidence |
|---|---|---|
| Create notification | ✅ works | `notify.ts:56`, 24 call sites |
| Mark as read | ✅ works (optimistic + persisted) | `NotificationBell.tsx:93-102`, `notifications.ts:59` |
| Mark all as read | ✅ works | `NotificationBell.tsx:104-108`, `notifications.ts:69` |
| Mark as **un**read | ❌ not implemented | — |
| Delete | ❌ not implemented | no delete action exists |
| Bulk delete / bulk actions | ❌ not implemented | — |
| Archive / Restore | ❌ not implemented | — |
| Counter | ⚠️ **desyncs** — see NTF-008 | `NotificationBell.tsx:66` |
| Real-time updates | ❌ none | polling only |
| Auto refresh | ⚠️ **badge only.** An open dropdown never updates | `NotificationBell.tsx:74-83` |
| Manual refresh | ❌ no refresh control; closing and reopening is the only way | — |
| Search / Filters / Date / Priority / Category filters | ❌ none | no priority or category column exists |
| Deep linking | ⚠️ **inconsistent** — see NTF-014 | |
| Click opens correct record | ⚠️ CAPA/Support ✅ (`/capa/{id}`, `/support/{id}`); Gap/CSV/Deviation ❌ (module root or `/worklist`) | `findings.ts:465`, `stage-tasks.ts:131,228`, `deviation-tasks.ts:141,245` |
| Notification history | ⚠️ effectively 30 rows; older rows exist in the DB but are unreachable through any UI | `notifications.ts:26` |

---

# Phase 4 — Notification Sources (per module)

Emission sites: **24 `notify()`/`notifyMany()` calls across 10 files.**

## Modules that DO emit

| Module | File | Events emitted |
|---|---|---|
| CAPA | `capas/lifecycle.ts:991,1384,1400,1422`, `capas/approvals.ts:396`, `capas/verification.ts:335`, `capas/closure.ts:519`, `capas/action-items.ts:260,557` | assigned, rejected, approved, verified, closed, action-item assigned/reassigned, rework, evidence rejected |
| Deviation (tasks only) | `deviation-tasks.ts:134,238,398` | task assigned, submitted for review, returned for rework |
| Gap / Findings | `findings.ts:462,1043,1124` | assigned, accepted & closed, returned for rework |
| CSV/CSA (stage tasks only) | `stage-tasks.ts:128,225,305` | rework task assigned, submitted for review, returned |
| Evidence | `evidence.ts:596` | evidence rejected |
| Support | `support.ts:472,488,656,768,954` | reply, escalated, resolved, status changed |

## Modules that emit NOTHING

| Module | File with no `notify()` | Notifications that should exist |
|---|---|---|
| **FDA 483** | `actions/fda483.ts` | Event logged, observation assigned, **response deadline approaching/overdue**, commitment due/overdue, response submitted. UI at `modals/AddEventModal.tsx:396` explicitly promises *"Notifications + reminders will go to this person"* — nothing backs it. |
| **Change Control** | `actions/change-control.ts` | CC raised, approval requested, approved/rejected, implementation due |
| **Risk / Governance** | `actions/risks.ts`, `actions/management-decisions.ts` | Risk escalation, risk overdue, decision assigned. Deliberately deferred — documented at `useNotificationEngine.ts:91-98`. |
| **Training / Readiness** | `actions/inspections.ts`, readiness actions | Training assigned, **training overdue**, competency expiring |
| **Document Management** | `actions/documents.ts` | Document approved, review due, periodic-review overdue |
| **CSV Validation (system level)** | `actions/systems.ts` | Validation due, **validation overdue**, Part 11 non-compliance raised |
| **User Management** | `actions/settings.ts` | User invited, role changed, account deactivated |
| **Regulatory Intelligence** | `src/lib/ai/regulatoryAssistant.ts` | New applicable regulation, impact assessment required |
| **Audit Trail / Reports / AI modules / Dashboard** | — | System alerts, export ready, AI job complete |

## Duplicate / incorrect notifications

- **No duplicate-suppression exists.** No unique constraint, no dedupe key, no idempotency token. A retried or double-submitted server action creates two identical rows (NTF-022).
- **Incorrect type usage** — three closure/review events are typed as `ACTION_ASSIGNED` (NTF-012): `findings.ts:1043` (*"accepted and closed"*), `stage-tasks.ts:225` (*"submitted for review"*), `deviation-tasks.ts:242` (*"submitted for review"*). None of these is an assignment; the recipient sees a blue clipboard "assigned" icon for a closure.
- `TICKET_ASSIGNED` is declared (`notify.ts:22`) but never emitted.

---

# Phase 5 — Business Logic Audit

| Rule | Where it lives | Verdict |
|---|---|---|
| Assignment | server actions, per call site | ✅ correct — hard-coded literal strings per site, but semantically right |
| Approval | `capas/approvals.ts:396`, `capas/verification.ts:335` | ✅ correct |
| Rejection / rework | `capas/lifecycle.ts:1384-1434`, `findings.ts:1124`, `deviation-tasks.ts:398`, `stage-tasks.ts:305` | ✅ correct, and correctly fans out to multiple affected parties via `notifyMany` |
| Closure | `capas/closure.ts:519` | ✅ correct |
| Never self-notify | `notify.ts:60` | ✅ correct, enforced centrally |
| Skip null recipient | `notify.ts:59` | ✅ correct (super_admin / tenant-row admins have no `User` FK) |
| **Escalation** | `support.ts:651` only | ⚠️ exists for support tickets; **broken in practice** (NTF-003). No escalation matrix anywhere else. |
| **Overdue reminders** | — | ❌ **do not exist** (no scheduler) |
| **Due-today / due-soon** | — | ❌ **do not exist** (`DUE_SOON` declared, never emitted) |
| **Training overdue** | — | ❌ does not exist |
| **Validation reminders** | — | ❌ does not exist |
| **Risk escalation** | — | ❌ deliberately out of scope, `useNotificationEngine.ts:91-98` |

**Are the rules hard-coded?** Yes, entirely. Every title, body, link, and recipient-selection rule is inline literal code at the call site. There is no template registry, no rule table, no per-tenant configurability, and no i18n. Changing "CAPA was rejected" requires a code change and a deploy.

---

# Phase 6 — RBAC Audit

## What is correct

- **Read authorization is sound.** Every read is `requireAuth()` + `where { recipientUserId: session.user.id, tenantId: session.user.tenantId }` (`notifications.ts:29, 50, 62, 72`). A user can only ever read and mutate their own rows.
- **No IDOR.** `markRead(id)` uses `updateMany` with the ownership predicate baked into the `where` (line 62) — a foreign id matches zero rows and returns success without leaking existence.
- **Tenant isolation on read is double-enforced** (recipient *and* tenant), as documented at `notifications.ts:22-25`.

## What is broken or unverified

| Role | Finding |
|---|---|
| **Platform Admin (super_admin)** | ❌ **Receives nothing.** Two independent failures: (a) escalation rows are written with the *customer's* `tenantId` but read with the SA's own (NTF-003); (b) the admin console bell is a dead button (NTF-004). |
| **Customer Admin** | ✅ works — session `user.id === Tenant.id` (`app/api/auth/[...nextauth]/route.ts:295-300`) matches `handlerRecipients()`'s `[ticket.tenantId]` (`support.ts:947`). |
| QA / QC / Reg Affairs / CSV Lead / Ops Head | ✅ receive only rows addressed to their own `User.id`. |
| **Viewer** | ⚠️ Not separately gated. A viewer would receive any notification addressed to them; in practice they are never an assignee, so this is latent rather than active. |

## Residual authorization gap

Notifications are **not re-authorized at read time against the linked record.** A user who receives `linkPath: /capa/{id}` and later loses site scope or has their role downgraded still sees the notification title and body (which embed record references and up-to-200 chars of description/rejection reason — `capas/lifecycle.ts:1390`, `evidence.ts`, `support.ts:478`). The *record* page will re-check permission, but the **notification payload itself is a permanent, un-revalidated copy of record content**. This is the most substantive information-disclosure issue in the module.

---

# Phase 7 — Database Audit

| Item | Finding |
|---|---|
| Table | Single `Notification` table, `schema.prisma:2214-2230` |
| Indexes | `([recipientUserId, isRead, createdAt])`, `([tenantId])` |
| Index fit | ⚠️ The **list** query (`{recipientUserId, tenantId}` ORDER BY `createdAt` DESC) has no `isRead` predicate, so only the `recipientUserId` prefix is usable and the sort cannot ride the index. `tenantId` is absent from the composite. The **count** query fits the composite well. |
| Foreign keys | ❌ **None.** `tenantId`, `recipientUserId`, `entityId` are loose strings with no relations — matching the deliberate convention noted at `schema.prisma:2236` for `Notification`/`EmailOTP`. |
| Cascade | ❌ None. `prisma.user.delete()` (`settings.ts:673`) leaves orphaned notification rows permanently. Tenant deletion likewise. |
| Status fields | `isRead: Boolean` only — no state machine, no `deliveredAt`, no `dismissedAt`, no channel status |
| Read timestamp | ✅ `readAt DateTime?`, set on both mark paths |
| Created timestamp | ✅ `createdAt @default(now())` |
| Soft delete | ❌ absent (and hard delete is absent too) |
| Retention policy | ❌ **none.** Zero delete calls exist in the entire codebase. The table grows monotonically forever. |
| Cleanup job | ❌ none (no scheduler at all) |
| Duplicate records | ⚠️ possible — no unique constraint, no dedupe key |
| Missing constraints | No FKs; no `CHECK`/enum on `type` (free string); no length caps on `title`/`body` at the DB level |
| Unused columns | `entityType` / `entityId` are written by every call site but **read by nothing** — the UI navigates by `linkPath` only (`NotificationBell.tsx:101`). They are write-only forensic breadcrumbs today. |
| **Migration lineage** | ❌ **`Notification` is not created by any migration.** `prisma/migrations/` contains exactly one directory, `20260716120000_reconcile_postgres_baseline`, whose SQL creates 20 tables — none of them `Notification`. The lineage presupposes an already-provisioned production database (git log: *"prod already has init+notifications applied"*). A database rebuilt from `prisma migrate deploy` alone would lack the table. |

---

# Phase 8 — Performance Audit

| Issue | Evidence | Impact |
|---|---|---|
| **Dead-code render storm** | `useNotificationEngine.ts:17` subscribes `AppShell` to `s.notifications.items`; lines 24-89 dispatch **one action per matching record**. Each dispatch produces a new array → a re-render of the entire app shell. | A tenant with 50 open critical findings triggers ~50 sequential shell re-renders on every mount, plus a debounced `localStorage` write (`persistence.ts:113`) — for output **nobody renders**. Highest-value optimisation in the module. |
| Stale-rule leak | Engine effects are keyed on `.length` only (`useNotificationEngine.ts:35, 52, 63, 80, 89`). A status change that doesn't change array length never re-evaluates, and the engine only ever *adds*. | Permanently stale entries accumulate to the 50-item cap and persist across sessions. |
| Unconditional polling | `NotificationBell.tsx:77`, no `visibilitychange` gating | One Server Action round-trip per user per minute, forever, including backgrounded tabs. At 500 concurrent users ≈ 30 k requests/hour purely for a badge. |
| No caching | `unreadCount()` hits the DB on every poll; no `unstable_cache`, no client cache, no `revalidate` | Direct DB `COUNT` per user per minute. |
| Open dropdown never refreshes | `NotificationBell.tsx:81-83` | Not a perf issue but the reason users will click repeatedly, multiplying fetches. |
| Missing pagination/virtualization | `getNotifications(30)`, `max-h-[360px]` | Currently harmless (30 rows); becomes a payload problem the moment a notification centre is built on the same action. |
| N+1 queries | ✅ **none found.** All notification reads are single flat queries with no `include`. `notifyMany` fans out `create`s via `Promise.allSettled` — N inserts, but bounded by the affected-party count and off the critical path. |
| Memory leaks | ✅ interval is cleared on unmount (`NotificationBell.tsx:78`); outside-click listener is cleaned up (line 90). |
| WebSocket issues | N/A — none exist. |

**Optimisations (no business-logic change):** gate the poll on `document.visibilityState`; back `unreadCount()` with a short server cache; add `([tenantId, recipientUserId, createdAt DESC])`; and — largest win — stop mounting the dead engine.

---

# Phase 9 — Security Audit

| Area | Verdict | Detail |
|---|---|---|
| Authentication | ✅ | `requireAuth()` on all four actions |
| Authorization | ✅ | ownership predicate in every `where` |
| Tenant isolation (read) | ✅ | `tenantId` enforced in addition to `recipientUserId` |
| Tenant isolation (write) | ⚠️ | `notify()` trusts the caller's `tenantId` argument. All current callers pass a server-derived value, but the emitter itself performs no validation that `recipientUserId` actually belongs to `tenantId`. |
| IDOR | ✅ | `updateMany` + scoped `where` (`notifications.ts:62`) |
| Notification spoofing | ✅ | `notify()` is server-only (`src/lib/notify.ts` imports `@/lib/prisma`); no client-callable create path |
| XSS | ✅ | `title`/`body` render as React text nodes (`NotificationBell.tsx:186, 190`); no `dangerouslySetInnerHTML` |
| CSRF | ✅ | Next.js Server Actions carry built-in origin/action-id protection |
| Injection | ✅ | Prisma parameterised throughout |
| **Sensitive data exposure** | ⚠️ **Main issue** | Bodies embed up-to-200 chars of GxP record content — rejection reasons (`capas/lifecycle.ts:1390`), completion notes (`deviation-tasks.ts:244`), CAPA descriptions (`lifecycle.ts:997`), ticket subjects (`support.ts:478`). These are snapshot copies never re-authorized against the recipient's *current* permissions, retained forever with no retention policy. |
| Information leakage (client) | ⚠️ | Dead System B writes derived finding IDs and requirement text to `localStorage` under a single non-user-scoped key `glimmora-state` (`persistence.ts:3, 20-26`). Cleared on explicit logout (`auth.slice.ts:210`) but **not** on session expiry or browser close. |
| Open redirect | ⚠️ hardening | `router.push(n.linkPath)` (`NotificationBell.tsx:101`) navigates to a stored string with no allow-list. Every current writer uses a literal template, so this is latent, not live. |
| Rate limiting | ❌ | No throttle on the poll or on emission |

---

# Phase 10 — GxP / 21 CFR Part 11 Audit

| Requirement | Status | Detail |
|---|---|---|
| **Audit-trail integration** | ❌ **Gap** | `notify()` writes **no** `AuditLog` entry, and neither does `markRead`/`markAllRead` (`actions/notifications.ts` imports no audit helper). There is no record that an alert was generated, delivered, or acknowledged. The *triggering* action is audited; the notification is not. |
| E-signature events | ⚠️ | Signing pipeline (`src/lib/signing.ts`) emits no notifications. Approval/verification notifications fire from the surrounding CAPA actions, not from the signature record itself. |
| Training compliance alerts | ❌ | None. No training/readiness module emits. |
| Validation reminders | ❌ | None. `validation_overdue` exists only as a dead System-B rule (`useNotificationEngine.ts:56`). |
| Regulatory alerts | ❌ | None emitted from Regulatory Intelligence. |
| CAPA notifications | ✅ | Best-covered module — assign, reject, approve, verify, close, rework, evidence-reject. |
| Deviation notifications | ⚠️ | Task-level only. The deviation *record* lifecycle (created, closed) emits nothing. |
| Document approval workflow | ❌ | `actions/documents.ts` emits nothing. |
| Audit readiness | ❌ | An inspector asking *"show me that the QA head was alerted when CAPA-2026-014 breached its due date"* cannot be satisfied: no overdue notification exists, and no delivery/acknowledgement record exists. |
| **Data integrity / ALCOA+** | Mixed | **Attributable** ⚠️ recipient recorded, but no delivery/read audit record. **Legible** ✅. **Contemporaneous** ⚠️ `createdAt` is accurate but delivery is up to 60 s late and only on poll. **Original** ⚠️ body is a *copy* of record content that can silently diverge from the source record. **Accurate** ⚠️ same. **Complete** ❌ whole categories of required alerts are missing. **Consistent** ❌ two competing systems, inconsistent types and deep links. **Enduring** ⚠️ rows are never deleted (good for retention) but also never archived or retention-managed (bad for governance). **Available** ❌ only the newest 30 are retrievable through any UI. |

**Verdict: not compliant as an inspection-facing control.** The notification system is currently a convenience feature, not a qualified alerting control. It would not survive a Part 11 assessment as evidence of timely notification, principally because of the missing audit trail, the missing time-based alerts, and the unreachable history.

---

# Phase 11 — Hardcoded, Mock & Dead Implementations

| # | File:line | Finding |
|---|---|---|
| 1 | `src/hooks/useNotificationEngine.ts` (entire file, 100 lines) | **Dead code.** ~15 client-derived rules whose output nothing renders. |
| 2 | `src/store/notifications.slice.ts` (entire file, 57 lines) | **Dead store.** `markRead`/`markAllRead`/`removeNotification`/`clearAll` never dispatched. |
| 3 | `src/components/layout/AppShell.tsx:56` | Mounts the dead engine on every page of the app. |
| 4 | `src/store/persistence.ts:25` | Persists the dead slice to `localStorage`. |
| 5 | `src/modules/admin/AdminShell.tsx:319-326` | **Placeholder UI** — bell button with no handler, no badge, no data. |
| 6 | `src/hooks/useTenantData.ts:144` | `const fda483Events: FDA483Event[] = [];` — hard-coded empty array that makes the engine's entire FDA-483 block (`useNotificationEngine.ts:66-80`) permanently unreachable. Comment at lines 135-142 acknowledges this. |
| 7 | `src/hooks/useTenantData.ts:143, 148-149` | Same pattern for `roadmap`, `driftAlerts`, `driftMetrics` — feeding dead notification rules. |
| 8 | `src/modules/fda-483/modals/AddEventModal.tsx:396` | **Placeholder promise:** *"Notifications + reminders will go to this person"* — no implementation exists. |
| 9 | `src/lib/notify.ts:18-19` | `DUE_SOON` / `OVERDUE` declared with an explicit "no cron exists yet" comment; never emitted. |
| 10 | `src/lib/notify.ts:22` | `TICKET_ASSIGNED` declared; never emitted. |
| 11 | `src/actions/fda483.ts:963` | Comment referencing *"the client notification engine, which reads currentStage"* — describes a mechanism that is dead. |
| 12 | `prisma/schema.prisma:372` | Comment: FDA-483 owner is a *"notifications/reminders target"* — unimplemented. |
| 13 | `src/components/layout/NotificationBell.tsx:22-33` | Hard-coded hex palette + type→icon map with no `TICKET_*` coverage. |
| 14 | All 24 emission sites | Hard-coded English title/body strings; no template layer, no i18n. |

No fabricated/mock notification *data* (fake rows, dummy users, fake timestamps) was found — the dead code is real-data-derived, not seeded. `src/lib/ai/mockData.ts:1024` mentions "notifications" only inside AI sample prose, not as notification data.

---

# Phase 12 — Missing Features (enterprise gap list)

| Capability | Present | Notes |
|---|---|---|
| Notification centre page | ❌ | No route; bell dropdown only, 30-row ceiling |
| Templates | ❌ | Inline literals at 24 sites |
| Categories | ❌ | No column |
| Priority levels | ❌ | No column; all notifications visually equal |
| Email delivery | ❌ | `mailer.ts` exists and works — wired only to OTP |
| SMS | ❌ | |
| Teams / Slack | ❌ | |
| Webhooks | ❌ | |
| Scheduling / reminders | ❌ | No scheduler at all |
| Digest (daily/weekly) | ❌ | |
| Escalation matrix | ❌ | Only a hand-rolled 2-hop support escalation |
| Snooze / Mute | ❌ | |
| User preferences | ❌ | |
| Delivery tracking | ❌ | No `deliveredAt`, no per-channel status |
| Retry / dead-letter | ❌ | `notify()` logs and drops (`notify.ts:74-81`) |
| Read receipts | ⚠️ | `readAt` is stored but never surfaced or audited |
| Real-time | ❌ | 60 s poll |
| Retention / archival | ❌ | Nothing ever deleted |
| Grouping / threading | ❌ | |
| i18n | ❌ | |

---

# Phase 13 — Bug Report

Severity = impact if it occurs. Priority = suggested fix order.

| Bug ID | Sev | Module | Issue | Expected | Root Cause | Files Affected | Recommended Fix | Pri |
|---|---|---|---|---|---|---|---|---|
| NTF-001 | **Critical** | Client engine | ~15 notification rules compute on every page load and are rendered by nothing | Either surface them or remove them | Redux slice has no consumer; the bell reads the DB instead | `hooks/useNotificationEngine.ts` (all), `store/notifications.slice.ts` (all), `layout/AppShell.tsx:56`, `store/persistence.ts:25` | Delete System B, or migrate its rules server-side into `notify()` | P0 |
| NTF-002 | **Critical** | Platform | No scheduler ⇒ no overdue / due-soon / reminder / escalation notifications anywhere | Time-based GxP alerts delivered reliably | No cron/queue; `DUE_SOON`/`OVERDUE` declared but never emitted | `lib/notify.ts:18-19`, `vercel.json`, `scripts/` | Add a scheduled job (Vercel Cron / worker) that sweeps due dates and calls `notify()` | P0 |
| NTF-003 | **High** | Support / RBAC | Ticket-escalation notifications to platform admins are permanently invisible | SA sees escalations | Row written with `tenantId = ticket.tenantId`; read filters `tenantId = session.user.tenantId` (the SA's own) | `actions/support.ts:651-668`, `actions/notifications.ts:29` | Store platform-scoped notifications under the recipient's own tenant, or relax the read filter for `super_admin` | P0 |
| NTF-004 | **High** | Admin console | Admin bell is a decorative button — no handler, badge, or data | Working notification surface | Placeholder never implemented | `modules/admin/AdminShell.tsx:319-326` | Mount `<NotificationBell />` (after NTF-003) or hide the button | P1 |
| NTF-005 | **High** | FDA 483 | UI promises notifications + reminders; module emits none | Owner alerted on assignment and deadline | No `notify()` in `actions/fda483.ts`; engine path dead via `fda483Events = []` | `modules/fda-483/modals/AddEventModal.tsx:396`, `actions/fda483.ts`, `hooks/useTenantData.ts:144` | Emit on owner assignment; add deadline reminders under NTF-002; or remove the promise | P1 |
| NTF-006 | **High** | UI / a11y | Notification rows cannot be reached or activated by keyboard | Full keyboard operability (WCAG 2.1.1) | `<div role="button">` with no `tabIndex`/`onKeyDown` | `components/layout/NotificationBell.tsx:170-180` | Use `<button>`, or add `tabIndex={0}` + Enter/Space handling | P1 |
| NTF-007 | Medium | UI / a11y | Dropdown is `role="dialog"` with no `aria-modal`, focus trap, initial focus, or Escape | Standard dialog/menu semantics | Incomplete implementation | `NotificationBell.tsx:85-91, 136-141` | Switch to a menu pattern or complete the dialog contract | P2 |
| NTF-008 | Medium | Counter | Badge undercounts when >30 unread | Badge always reflects the true server count | `refreshList` overwrites the authoritative count with `rows.filter(!isRead).length` over only 30 fetched rows | `NotificationBell.tsx:66` | Don't derive the count from the page; call `unreadCount()` | P2 |
| NTF-009 | Medium | Real-time | An open dropdown never updates | New notifications appear while open | Poll refreshes only the count | `NotificationBell.tsx:74-83` | Refresh the list too while open, or add a manual refresh control | P2 |
| NTF-010 | Medium | Perf | Poll runs in hidden/backgrounded tabs forever | Poll pauses when not visible | No `visibilitychange` gating | `NotificationBell.tsx:74-79` | Gate on `document.visibilityState`; consider backoff | P2 |
| NTF-011 | Medium | Feature | No delete / archive / bulk / history / search / filter / pagination; no notification page | A usable notification centre | Never built | `actions/notifications.ts` (all), `app/(app)/` | Add `/notifications` + the supporting actions | P2 |
| NTF-012 | Medium | Taxonomy | Closure and review events are typed `ACTION_ASSIGNED` | Types match the event | Type reused as a catch-all | `actions/findings.ts:1043`, `actions/stage-tasks.ts:225`, `actions/deviation-tasks.ts:242` | Add `FINDING_CLOSED`, `REVIEW_REQUESTED`; map icons | P2 |
| NTF-013 | Medium | UI | All five `TICKET_*` types render the grey fallback icon | Per-type icon and colour | `TYPE_CONFIG` lacks ticket entries | `NotificationBell.tsx:22-33` | Add the entries; use CSS tokens instead of hexes | P3 |
| NTF-014 | Medium | Deep linking | Gap/CSV/Deviation notifications land on a module root or `/worklist`, not the record; SA ticket links point at the customer route | Click opens the exact record | Inconsistent `linkPath` conventions | `actions/findings.ts:465`, `stage-tasks.ts:131,228`, `deviation-tasks.ts:141,245`, `support.ts:971` | Standardise on record-level deep links; branch the support link by recipient tier | P2 |
| NTF-015 | Medium | Privacy | Dead derived notifications (finding IDs + requirement text) persist in `localStorage` under one shared key; stale entries never pruned | No orphaned record content in browser storage | Slice persisted; engine only ever adds; effects keyed on `.length` | `store/persistence.ts:20-26`, `store/notifications.slice.ts:29`, `useNotificationEngine.ts:35,52,63,80,89` | Resolved for free by NTF-001 | P1 |
| NTF-016 | Medium | Perf | One dispatch per matching record re-renders the whole app shell N times on mount | No wasted renders | `AppShell` subscribes to `s.notifications.items` via the engine | `useNotificationEngine.ts:17-21` | Resolved for free by NTF-001 | P1 |
| NTF-017 | Medium | DB | No retention or cleanup — the table grows forever | Defined retention aligned to the GxP record policy | Feature absent | `prisma/schema.prisma:2214`, `actions/notifications.ts` | Add archival + a retention sweep under NTF-002 | P3 |
| NTF-018 | Medium | DB | No FKs; user deletion orphans rows permanently | Referential integrity / defined cascade | Loose-string design | `prisma/schema.prisma:2214-2230`, `actions/settings.ts:673` | Add relations + `onDelete` policy, or an explicit cleanup in the delete path | P3 |
| NTF-019 | Low | DB perf | List query cannot use the composite index for its sort; `tenantId` absent from it | Index-served ordering | Index optimised for the count query only | `prisma/schema.prisma:2228` | Add `@@index([tenantId, recipientUserId, createdAt])` | P3 |
| NTF-020 | Medium | Release | `Notification` is created by no migration; the lineage assumes a pre-existing prod DB | Schema rebuildable from migrations | Squashed/reconcile-only lineage | `prisma/migrations/20260716120000_reconcile_postgres_baseline/` | Add a forward migration so a clean DB provisions the table | P2 |
| NTF-021 | Medium | GxP | Notification generation and acknowledgement are not audit-trailed | Part 11 traceability of alerts | `notify()`/`markRead` write no `AuditLog` | `lib/notify.ts:62`, `actions/notifications.ts:59,69` | Write audit entries for emit + acknowledge | P2 |
| NTF-022 | Low | Integrity | Duplicate notifications possible on retry/double-submit | Exactly-once per event | No unique constraint or dedupe key | `lib/notify.ts:62`, `prisma/schema.prisma:2214` | Add a dedupe key `(type, entityId, recipientUserId, window)` | P3 |
| NTF-023 | Low | Feature | No preferences, no email/SMS/Teams/Slack/webhook/push | Multi-channel with user control | Never built; `mailer.ts` wired only to OTP | `lib/mailer.ts`, `lib/notify.ts` | Add a transport layer behind `notify()` + a preferences table | P3 |
| NTF-024 | Low | UX | All fetch/persist failures are silent | Visible error + retry | Four empty `catch` blocks | `NotificationBell.tsx:55,68,99,107` | Add an error state and a retry affordance | P3 |
| NTF-025 | Low | UX | Bell shows UTC while module tables show tenant timezone | Consistent timestamps | `RelativeTime` is UTC-only | `components/ui/RelativeTime.tsx:27` | Accept tenant timezone/format | P4 |
| NTF-026 | Low | a11y | Badge shows `9+` while `aria-label` announces the exact count; unread dot uses `aria-label` on a role-less div | Parity between visual and announced | Minor markup issues | `NotificationBell.tsx:118,130,187` | Align the strings; give the dot a role or use visually-hidden text | P4 |
| NTF-027 | Low | Reliability | `notify()` failures are console-logged and dropped — no retry, no dead-letter | At-least-once delivery | Deliberate fault isolation with no follow-up | `lib/notify.ts:74-81` | Keep isolation; add an outbox/retry queue | P3 |
| NTF-028 | Low | Security | `router.push(linkPath)` has no allow-list | Only internal paths navigable | No validation on a stored string | `NotificationBell.tsx:101` | Assert `linkPath.startsWith("/")` before pushing | P3 |

---

# Phase 14 — Final Report

### 1. Current architecture
A DB-backed, poll-driven, in-app-only notification system: `notify()` → `Notification` table → four Server Actions → one bell dropdown. Alongside it, a second, entirely dead client-side Redux engine that computes rules nobody renders. No API routes, no scheduler, no real-time transport, no channels beyond in-app.

### 2. Existing features
Emit on GxP lifecycle events (24 sites, 6 modules); per-user tenant-scoped read; unread badge; mark-one-read; mark-all-read; optimistic UI; deep link on click; correct actor-suppression and null-recipient guards; genuinely good fault isolation so notification failures can never roll back a GxP write.

### 3. Missing features
Notification centre page; delete/archive/snooze/mute; preferences; priority and category; search/filter/sort/group; pagination and history beyond 30 rows; real-time; scheduling and reminders; digests; escalation matrix; email/SMS/Teams/Slack/webhook/push; delivery tracking, retry, and read receipts; templates and i18n; retention.

### 4. UI/UX issues
No error state; loading state only when empty; keyboard-inoperable rows (**WCAG failure**); incomplete dialog semantics; no `aria-live`; missing icon mappings for all support types; hard-coded hexes off the design tokens; a decorative dead bell in the admin console; timestamp convention inconsistent with the rest of the app.

### 5. Functional bugs
NTF-003 (SA escalations invisible), NTF-008 (counter desync >30 unread), NTF-009 (open dropdown never refreshes), NTF-012 (wrong types), NTF-014 (deep links land on module roots), NTF-005 (FDA-483 promises what it doesn't deliver).

### 6. Security issues
No critical vulnerability found — authentication, authorization, tenant isolation on read, IDOR resistance, XSS, CSRF, and injection are all handled correctly. Real concerns are **information-lifecycle** ones: notification bodies are permanent, never-re-authorized snapshots of GxP record content; dead client-side notifications persist record text in `localStorage`; `notify()` does not validate that recipient and tenant agree; `linkPath` is unvalidated at navigation.

### 7. Performance issues
The dead engine's per-record dispatch storm (N shell re-renders per mount) is the single largest waste. Then: ungated 60 s polling in hidden tabs, uncached per-minute `COUNT` queries, and an index that doesn't serve the list query's sort.

### 8. GxP compliance gaps
No audit trail for generation or acknowledgement; no time-based alerts at all (overdue CAPA, training, validation, FDA-483 deadline); no notifications from Document Management, Change Control, Training, Risk, or Regulatory Intelligence; history unreachable past 30 rows; no retention policy. **Not currently defensible as a Part 11 alerting control.**

### 9. Hardcoded / mock implementations
14 occurrences catalogued in Phase 11 — dominated by the dead engine/slice/persistence trio, the `fda483Events = []` stub, the placeholder admin bell, and the unbacked "Notifications + reminders" copy in `AddEventModal.tsx:396`. No fabricated data was found.

### 10. Technical debt
Two competing notification systems; a type union with three never-emitted members; `entityType`/`entityId` written everywhere and read nowhere; 24 copies of hard-coded message strings; a migration lineage that cannot rebuild the table; no FKs.

### 11. Refactoring recommendations
1. **Delete System B** (`useNotificationEngine.ts`, `notifications.slice.ts`, the `AppShell` mount, the persistence entry). Fixes NTF-001, 015, 016 at once and removes ~160 lines. Port any rule worth keeping into a server-side sweep.
2. **Introduce a template/registry layer** behind `notify()` — `notify({ template: "CAPA_REJECTED", params })` — killing the 24 hard-coded strings and enabling i18n and per-tenant wording.
3. **Add a transport abstraction** inside `notify()` so email (via the already-working `mailer.ts`), and later Teams/webhook, become configuration rather than call-site changes.
4. **Normalise the type taxonomy** and drive icon/colour/deep-link from one map shared by emitter and UI.
5. **Standardise `linkPath`** to record-level deep links and branch by recipient tier.

### 12. Enterprise improvement roadmap

**P0 — correctness & the compliance floor**
- Delete the dead engine (NTF-001, 015, 016)
- Add a scheduler + due-date sweep → `DUE_SOON`/`OVERDUE` (NTF-002)
- Fix super-admin escalation scoping (NTF-003)

**P1 — make it usable and lawful**
- Keyboard/a11y fixes on the dropdown (NTF-006, 007)
- Audit-trail notification emit + acknowledge (NTF-021)
- Real admin-console bell or remove it (NTF-004)
- FDA-483 emissions, or drop the promise (NTF-005)
- Forward migration for the `Notification` table (NTF-020)

**P2 — the notification centre**
- `/notifications` page: pagination, search, filter by module/type/date, grouping, bulk read/archive/delete (NTF-011)
- Counter, refresh, deep-link, and type-taxonomy fixes (NTF-008, 009, 012, 014)
- Visibility-gated polling + cached counts (NTF-010)

**P3 — enterprise channels & governance**
- Priority + category columns; user preferences (channel, mute, snooze, digest)
- Email transport, then webhook/Teams/Slack
- Outbox with retry and delivery tracking (NTF-027)
- Retention/archival policy + cleanup sweep; FKs and cascade (NTF-017, 018, 019, 022)

**P4 — polish**
- Real-time (SSE over the existing poll), i18n, escalation matrix, timestamp/locale consistency (NTF-025, 026)
