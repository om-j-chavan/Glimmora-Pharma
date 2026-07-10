# Support Module — End-to-End Audit

> Read-only audit of the Support/ticketing module (branch `devAI`). Every claim cites file:line from the actual source. Severity uses the same framing as `PROJECT_AUDIT.md`: tenant-isolation and audit-trail gaps are Critical/High even for a small code delta.

**Headline:** The Support module is **well-built for tenant isolation and audit integrity** — arguably the cleanest module audited so far. Authorization is centralized in one permissions file and applied identically in queries *and* every action; internal notes and the activity timeline are stripped at the **data layer**, not just hidden in the UI; every state-changing action writes a paired `TicketActivity` + central `AuditLog` row inside the same transaction and calls `revalidatePath`. **No Critical or High findings.** The issues are one Medium correctness inconsistency, one Medium dead/broken AI integration, and a few Low drift items.

---

## 1. Inventory — everything in scope

| Area | File(s) | Notes |
|------|---------|-------|
| Server Actions | [src/actions/support.ts](src/actions/support.ts) (926 lines) | 12 exported actions (§4). |
| Read queries | [src/lib/queries/support.ts](src/lib/queries/support.ts) | `getTickets`, `getTicketStats`, `getTicket`, `getSupportTenantOptions`, `getSupportAssigneeOptions`, `getTicketAttachments`, `toQueueRow`. |
| Permissions | [src/lib/support/permissions.ts](src/lib/support/permissions.ts) | `ticketScopeWhere`, `canViewTicket`, `canManageSupport`, `canHandleTicket`, `canHandleFirstLine`, `isRequester`, `isTicketRoutedToRole`, `handlerTierForRole`. |
| Constants / state machine | [src/lib/support/constants.ts](src/lib/support/constants.ts) | statuses, `STATUS_TRANSITIONS`, `canTransition`, priorities, categories, SLA, `SUPPORT_AUDIT_MODULE`. |
| UI | [RaiseTicketModal.tsx](src/modules/support/RaiseTicketModal.tsx), [SupportQueue.tsx](src/modules/support/SupportQueue.tsx), [SupportStatCards.tsx](src/modules/support/SupportStatCards.tsx), [TicketDetailView.tsx](src/modules/support/TicketDetailView.tsx), [_shared.tsx](src/modules/support/_shared.tsx) | 5 components. |
| Prisma models | [schema.prisma:1897-2002](prisma/schema.prisma#L1897) | `Ticket`, `TicketMessage`, `TicketActivity` (§Data model). |
| Notifications | [src/lib/notify.ts](src/lib/notify.ts) | `notify` / `notifyMany` — **in-app only** (no email). |
| Reference / SLA helpers | [src/lib/reference.ts](src/lib/reference.ts), [constants.ts:113](src/lib/support/constants.ts#L113) | `generateReference`, `computeSlaDueAt`. |

**Tickets referenced outside `support.ts`:** the only cross-references are the attachment path — `getTicketAttachments` reads `Document` rows with `linkedModule="Support"` ([queries/support.ts:229-251](src/lib/queries/support.ts#L229)) and the modal uploads via the generic `createDocument` with `linkedModule="Support"` ([RaiseTicketModal.tsx:136-143](src/modules/support/RaiseTicketModal.tsx#L136)). No API route under `app/api/**` references tickets directly (downloads reuse the shared `/api/documents/[id]`).

**FastAPI/AI backend touches Support?** **No.** `grep -riE "ticket|support|triage"` over `backend/app/` returns only unrelated matches (RAG doc prose, a file-type error string, an RCA field label). The *only* intended backend touchpoint is `suggestTriage`, which calls `/api/v1/support-triage/classify` — **an endpoint that does not exist** in the backend (see M-2).

### Prisma models (field list, relations, indexes)
- **`Ticket`** ([1897-1963](prisma/schema.prisma#L1897)): `id` (cuid), `reference` (unique, `TKT-<year>-<NNNNN>`), `tenantId`; content `subject/category/priority/status(@default "New")/description`; requester denorm `requesterId/requesterName/requesterRole`; `assigneeId?/assigneeName?`; **routing** `currentHandler(@default "super_admin")`, escalation trail `escalatedAt?/escalatedById?/escalatedByName?`; optional link `relatedModule?/relatedRecordId?/relatedRecordRef?`; lifecycle `slaDueAt?/resolutionSummary?/resolutionCategory?/resolvedAt?/resolvedById?/autoCloseAfter?/closedAt?/closedById?/reopenReason?/cancelledAt?/cancelReason?`; captured context `appVersion?/originUrl?/userAgent?`; `createdAt/updatedAt`. Relations: `messages TicketMessage[]`, `activities TicketActivity[]`. **Indexes:** `[tenantId,status]`, `[assigneeId]`, `[status]`, `[slaDueAt]`, `[tenantId,createdAt]`.
- **`TicketMessage`** ([1966-1982](prisma/schema.prisma#L1966)): `id`, `ticketId`, `tenantId`, `authorId/authorName/authorRole`, `body`, **`isInternal Boolean @default(false)`**, `createdAt`. Relation `ticket` (onDelete: Cascade). Index `[ticketId,createdAt]`. Append-only (no update/delete action exists).
- **`TicketActivity`** ([1986-2002](prisma/schema.prisma#L1986)): `id`, `ticketId`, `tenantId`, `type`, `actorId?/actorName/actorRole?`, `summary`, `fromValue?/toValue?`, `createdAt`. Relation `ticket` (onDelete: Cascade). Index `[ticketId,createdAt]`. Append-only.

---

## 2. Access control (the main risk area) — findings

### CREATE — scoped to caller's own tenant ✅ (no client-supplied tenant)
`createTicket` sets `tenantId: session.user.tenantId` server-side ([support.ts:225](src/actions/support.ts#L225)) and `requesterId: session.user.id` ([232](src/actions/support.ts#L232)). The `CreateTicketSchema` ([167-178](src/actions/support.ts#L167)) has **no `tenantId`/`requesterId`/`customerId` field** — the client cannot supply them. `currentHandler` is derived from the requester's role, not client input ([206](src/actions/support.ts#L206)). Any role (incl. `viewer`) may raise a ticket ([189-192](src/actions/support.ts#L189)) — intentional (customers raise tickets). **Verdict: sound.**

### VIEW list — filtered by scope, super_admin cross-tenant is a real role gate ✅
Scoping is centralized in `ticketScopeWhere` ([permissions.ts:90-95](src/lib/support/permissions.ts#L90)):
- `super_admin` → `{}` (all tenants) — **gated by an actual role check** (`isCrossTenantSupport(role) === role === "super_admin"`), not by which page renders.
- `customer_admin` → `{ tenantId }` (own tenant, all tickets).
- any other tenant user → `{ tenantId, requesterId: id }` (own tenant AND only tickets they raised).

`getTickets` ([queries/support.ts:49](src/lib/queries/support.ts#L49)) and `getTicketStats` ([110](src/lib/queries/support.ts#L110)) both spread `ticketScopeWhere` as the base `where`. The super_admin-only `tenantId` filter is applied **only** for super_admin ([queries/support.ts:55](src/lib/queries/support.ts#L55)), so a tenant user cannot widen scope by passing `filters.tenantId`. **Verdict: sound.**

### REPLY / add TicketMessage — ownership checked BEFORE the write ✅
`addTicketMessage` calls `loadTicketForView(session, ticketId)` ([support.ts:382](src/actions/support.ts#L382)) which does `findUnique` then `canViewTicket` and returns null if unauthorized ([73-77](src/actions/support.ts#L73)) — **before** the `tx.ticketMessage.create`. Internal notes are additionally gated: `if (isInternal && !isHandler) → "Only support can add internal notes."` ([391-393](src/actions/support.ts#L391)), where `isHandler = canHandleTicket(session, ticket)` ([389](src/actions/support.ts#L389)). **Verdict: sound.**

### Bare `where: { id }` writes — all preceded by an ownership guard ✅
Every state-changing action loads and authorizes the ticket first, then writes by id. This is the same guarded pattern used in `fda483.ts`. Confirmed for each: `addTicketMessage` (load [382](src/actions/support.ts#L382)), `assignTicket` (load [484](src/actions/support.ts#L484) + `canManageSupport` [481](src/actions/support.ts#L481)), `escalateTicket` (load [544](src/actions/support.ts#L544)), `updateTicketStatus` (load [635](src/actions/support.ts#L635) + `canHandleTicket` [640](src/actions/support.ts#L640)), `resolveTicket` (load [681](src/actions/support.ts#L681) + gate [686](src/actions/support.ts#L686)), `confirmResolution` (load [734](src/actions/support.ts#L734) + gate [736](src/actions/support.ts#L736)), `reopenTicket` (load [770](src/actions/support.ts#L770)), `cancelTicket` (load [818](src/actions/support.ts#L818)). The only bare-id writes without a per-row `loadTicketForView` are inside `autoCloseStaleResolvedTickets`, which is `super_admin`-gated ([851](src/actions/support.ts#L851)) and operates on its own server-derived stale set ([855-858](src/actions/support.ts#L855)). **Verdict: no unguarded bare-id path found.**

### Internal notes & activity timeline — stripped at the DATA layer ✅ (with a Medium inconsistency)
`getTicket` ([queries/support.ts:172-191](src/lib/queries/support.ts#L172)) computes `isManager = canManageSupport(role)` and:
- returns `activities` **only** if `isManager`, else `[]` ([183-185](src/lib/queries/support.ts#L183));
- filters `messages` to `!m.isInternal` for non-managers ([188](src/lib/queries/support.ts#L188)).

This is enforced server-side (the response never contains internal notes/activity for a non-manager), not merely hidden in the UI — exactly right, and it means a **requester can never see internal notes or the audit timeline**. The `TicketMessage.isInternal` flag distinguishes internal entries ([schema:1976](prisma/schema.prisma#L1976)). No other `TicketMessage` read path exists in `support.ts` or `queries/support.ts`. **See M-1 for the inconsistency this creates for customer_admin handlers.**

---

## 3. Data-flow trace (raise → staff sees → exchange → resolve/close)

Primary happy path, per hop with file:line. Every state-changing hop is a single `prisma.$transaction` that writes the domain change + `TicketActivity` + `AuditLog` together, followed by fault-isolated `notify` and `revalidatePath`.

**Step 1 — Raise ticket**
`RaiseTicketModal.onSubmit` ([RaiseTicketModal.tsx:115](src/modules/support/RaiseTicketModal.tsx#L115)) → `createTicket` ([support.ts:180](src/actions/support.ts#L180)) → `requireAuth` [184] → `CreateTicketSchema` parse [185] → tx: `generateReference` [214] + `ticket.create` (tenant/requester server-set) [222] + `addActivity "CREATED"` [245] + optional transcript message [248] + `writeAudit "TICKET_CREATED"` [260] → `revalidateSupport(id)` [274]. *Notification:* none to staff on create (the CA/SA tier is not notified of a brand-new ticket — see N-gap below). Optional attachment uploaded **after** via `createDocument` [142].

**Step 2 — Staff sees it**
Queue page → `loadSupportTickets` ([support.ts:143](src/actions/support.ts#L143)) → `getTickets` (scoped) → `toQueueRow`. Stat cards → `getTicketStats` (same scope). A new user-raised ticket lands `currentHandler="customer_admin"` ([support.ts:206](src/actions/support.ts#L206)) so it appears in the tenant CA's "routed to me" queue.

**Step 3 — Message exchange**
`addTicketMessage` ([support.ts:373](src/actions/support.ts#L373)) → `requireAuth` + `MessageSchema` → `loadTicketForView` [382] → handler/internal gate [389-393] → transition calc [397-402] → tx: `ticketMessage.create` [406] + `addActivity REPLY|INTERNAL_NOTE` [417] + optional `ticket.update` status + `STATUS_CHANGED` activity [424-427] + `writeAudit TICKET_REPLY|TICKET_INTERNAL_NOTE` [428] → notify the *other* party (handler→requester [437], requester→handler tier [452-463]; internal notes notify no one) → `revalidateSupport` [466].

**Step 4 — Resolve**
`resolveTicket` ([support.ts:672](src/actions/support.ts#L672)) → gate `canHandleTicket` [686] → `canTransition(from,"Resolved")` [690] → tx: `ticket.update` (Resolved + `autoCloseAfter`) [697] + `addActivity RESOLVED` [708] + `writeAudit TICKET_RESOLVED` [709] → notify requester [711] → revalidate [722].

**Step 5 — Close**
`confirmResolution` ([support.ts:732](src/actions/support.ts#L732)) → gate requester-or-handler [736] → status must be Resolved [740] → tx: update Closed [743] + `addActivity CLOSED` [747] + `writeAudit TICKET_CLOSED` [748] → `notifyParties` [750] → revalidate [751].

**Chain integrity:** every state-changing action writes both an activity row **and** a central `AuditLog` row **inside the transaction** ([writeAudit:106-127](src/actions/support.ts#L106)), and calls `revalidateSupport`. No state change was found that skips the audit log or the revalidation. **One workflow gap (not a broken chain):** `createTicket` emits no notification to the handling tier, so a CA/SA learns of a new ticket only by polling the queue (Low — N-1).

---

## 4. Attachments / file handling

Tickets **do** support attachments, and they **reuse the shared, audited pipeline** — not a separate path:
- **Upload:** `RaiseTicketModal` builds a `FormData` with `linkedModule="Support"`, `linkedRecordId=<new ticket id>` and calls the generic `createDocument` ([RaiseTicketModal.tsx:136-143](src/modules/support/RaiseTicketModal.tsx#L136)) — the same `fileStorage.ts` abstraction used by Evidence. `Document.tenantId` is set server-side by `createDocument` from the session (not client input).
- **List:** `getTicketAttachments` ([queries/support.ts:229-251](src/lib/queries/support.ts#L229)) reads `Document` where `linkedModule="Support"` + `linkedRecordId` + `tenantId: ticket.tenantId` + `deletedAt: null`, and is authorized through `canViewTicket` ([237](src/lib/queries/support.ts#L237)).
- **Download:** via the shared `/api/documents/[id]` route, already verified tenant-scoped in `PROJECT_AUDIT.md` ([documents/[id]/route.ts:41](app/api/documents/[id]/route.ts#L41)).

**Low finding (L-2):** the upload passes a client-supplied `linkedRecordId` (the ticket id) with no server-side check in `createDocument` that the ticket belongs to the caller. Impact is contained — `getTicketAttachments` only surfaces docs where `Document.tenantId === ticket.tenantId` and the viewer passes `canViewTicket`, so a mis-linked doc cannot cross a tenant boundary; worst case is attaching a document to another ticket **within your own tenant that you can already view**. Recommend `createDocument` verify the `linkedRecordId` ticket's tenant when `linkedModule="Support"`.

---

## 5. Lifecycle / state machine

Statuses ([constants.ts:10-18](src/lib/support/constants.ts#L10)): `New, Open, In Progress, Awaiting User, Resolved, Closed, Cancelled`. Transitions are **centralized in one map** `STATUS_TRANSITIONS` ([constants.ts:34-42](src/lib/support/constants.ts#L34)) with a single `canTransition(from,to)` gate ([44-46](src/lib/support/constants.ts#L44)):

```
New          → Open, In Progress, Cancelled
Open         → In Progress, Awaiting User, Resolved, Cancelled
In Progress  → Awaiting User, Resolved, Cancelled
Awaiting User→ In Progress, Resolved, Cancelled
Resolved     → Closed, In Progress   (confirm/auto-close; reopen)
Closed       → In Progress           (reopen)
Cancelled    → (terminal)
```

Every transition action calls `canTransition` server-side before writing: `updateTicketStatus` [647], `resolveTicket` [690], `reopenTicket` [776], `cancelTicket` [824]; `confirmResolution` guards `from === "Resolved"` explicitly [740]. `addTicketMessage`'s auto-transition (New/Open→In Progress on handler reply; Awaiting User→In Progress on user reply) is a constrained subset computed server-side [397-402]. **No client-triggerable transition bypasses the server legality check** — the `status` value in `updateTicketStatus` is a Zod enum limited to `Open|In Progress|Awaiting User` [626] (terminal states are reached only through their dedicated, gated actions). **Verdict: centralized and enforced. Sound.**

Routing (`currentHandler`) is a **separate axis** from status — escalation changes the handler tier without touching status ([support.ts:569](src/actions/support.ts#L569) comment + [562-571](src/actions/support.ts#L562)). Correct modelling.

---

## 6. Notification correctness

- **Recipients are derived server-side** from the ticket's own fields/participants, never from client input:
  - handler→requester reply: `recipientUserId: ticket.requesterId` ([support.ts:439](src/actions/support.ts#L439));
  - requester→handler reply: `handlerRecipients(ticket)` ([452](src/actions/support.ts#L452)), a server query resolving the current tier ([889-897](src/actions/support.ts#L889));
  - assign: the chosen `assigneeId` (staff action, `canManageSupport`-gated) ([508](src/actions/support.ts#L508));
  - escalate: all `super_admin` tenant rows via a server query ([598](src/actions/support.ts#L598));
  - status/close/reopen/cancel: `notifyParties` builds the set from `ticket.requesterId` + `handlerRecipients(ticket)` ([900-925](src/actions/support.ts#L900)).
- **Self-notify suppressed** in every path (`.filter((r) => r !== session.user.id)` / `recipients.delete(session.user.id)` / `notify` guards `recipient === actorUserId`) ([452](src/actions/support.ts#L452), [911](src/actions/support.ts#L911), [notify.ts:60](src/lib/notify.ts#L60)).
- **Cross-tenant leakage:** notifications carry `tenantId: ticket.tenantId` and only non-sensitive fields (`ticket.subject`, reference) — never internal-note bodies. Requester/CA recipients are within the ticket's tenant; the only cross-tenant recipients are `super_admin` platform admins (by design for central support). **No path sends ticket content to a user outside the ticket's tenant** other than platform admins. **Verdict: sound.**
- **Email:** `notify` writes an in-app `Notification` row only — **no email is sent for any ticket event** ([notify.ts:56-73](src/lib/notify.ts#L56)); the union comment marks email as a future channel ([notify.ts:20-21](src/lib/notify.ts#L20)). `mailer.ts` is **not** referenced anywhere in Support. This is by design, but see N-1/L-3.

---

## 7. Dead code / drift

- **M-2 (Medium) — `suggestTriage` targets a non-existent backend endpoint.** [support.ts:325](src/actions/support.ts#L325) POSTs to `${BACKEND_URL}/api/v1/support-triage/classify`, but no `support-triage` router exists (`grep` over `backend/app/routers/` — the 12 routers are auth/ai/voice/capa/rca/action-plan/monitoring/effectiveness/closure/audit/user; none is support-triage). So the Smart Triage feature **always fails** and the modal silently shows no suggestion (graceful, but dead). Additionally the call carries **no auth header** — harmless today because the endpoint 404s, but if it is ever implemented it would receive ticket `subject`/`description` (potentially "Compliance Concern" content) unauthenticated. **Fix:** implement the endpoint with auth, or remove `suggestTriage` and its modal wiring.
- **L-1 (Low) — `NEXT_PUBLIC_APP_VERSION` read but set in no config.** [RaiseTicketModal.tsx:123](src/modules/support/RaiseTicketModal.tsx#L123) sends `appVersion: process.env.NEXT_PUBLIC_APP_VERSION`; it is defined in **no** config (`.env.example`, `render.yaml`, `.do/app.yaml`, `next.config.mjs`). It is a hidden capture field (not shown to the user), so nothing renders blank — but every ticket silently stores `appVersion = null` ([support.ts:240](src/actions/support.ts#L240), `data.appVersion || null`). Correcting the earlier assumption: the UI does not display a blank version; the diagnostic value is just always null. **Fix:** set `NEXT_PUBLIC_APP_VERSION` at build (e.g. from the git SHA/package version) or drop the field.
- **L-3 (Low) — no scheduler for auto-close / SLA.** `autoCloseStaleResolvedTickets` ([support.ts:849](src/actions/support.ts#L849)) is a manual `super_admin` action ("future cron seam", [845-848](src/actions/support.ts#L845)); `slaDueAt` is stored but nothing acts on a breach, and `DUE_SOON`/`OVERDUE` notification types are reserved but unused ([notify.ts:18-19](src/lib/notify.ts#L18)). Resolved tickets will **not** auto-close and SLA breaches raise no alert unless an admin manually runs the sweep. **Fix:** wire a scheduled job (the seam is ready).
- **N-1 (Low) — no notification to staff on ticket creation.** `createTicket` notifies no one; the handling tier discovers new tickets only by viewing the queue ([support.ts:180-280](src/actions/support.ts#L180)). Every other lifecycle event notifies. **Fix:** emit a `TICKET_*` notification to `handlerRecipients` on create.
- All 12 exported actions have UI callers except that `suggestTriage`'s backend dependency is missing (M-2). No orphaned exports or unused fields were found in `support.ts`; the append-only `TicketMessage`/`TicketActivity` models have no update/delete actions (correct for an audit trail).

---

## Findings summary (ranked)

| ID | Sev | Area | Issue | Fix |
|----|-----|------|-------|-----|
| **M-1** | Medium | Access control (correctness) | `getTicket` uses `canManageSupport` (**super_admin only**, [permissions.ts:10](src/lib/support/permissions.ts#L10)) to decide internal-note + activity visibility ([queries/support.ts:177-188](src/lib/queries/support.ts#L177)), but the **write** gate for internal notes / handling is `canHandleTicket` (super_admin **+ in-tenant customer_admin**, [permissions.ts:70-80](src/lib/support/permissions.ts#L70)). A `customer_admin` first-line handler can *create* internal notes/escalation notes and handle tickets, yet when they open the ticket they see **no internal notes and an empty activity timeline** — including notes they wrote. Over-restrictive, not a leak; the compliance record is intact (all events still land in the central `AuditLog`, which a CA can view via the Audit Trail module). | Make the detail-visibility check `canHandleTicket(session, ticket)` (or a shared `canSeeInternal`) instead of `canManageSupport`, so a CA handler sees the internal notes/timeline for tickets routed to their tenant. |
| **M-2** | Medium | Dead/broken integration | `suggestTriage` calls `/api/v1/support-triage/classify`, which does not exist in the backend; feature always fails; unauthenticated call would leak ticket text if implemented. | Implement the endpoint (authenticated) or remove the action + modal wiring. |
| **L-1** | Low | Drift | `NEXT_PUBLIC_APP_VERSION` read but set nowhere → `appVersion` always stored null. | Set at build or remove. |
| **L-2** | Low | Attachments | `createDocument` accepts client `linkedRecordId` for Support with no ticket-ownership check (contained by tenant-scoped read). | Verify ticket tenant on Support-linked uploads. |
| **L-3** | Low | Lifecycle | No scheduler → no auto-close, no SLA-breach alerting. | Wire a cron to the existing seam. |
| **N-1** | Low | Notifications | No staff notification on ticket creation. | Notify `handlerRecipients` on create. |

**No Critical or High findings.** Tenant isolation (`ticketScopeWhere`/`canViewTicket`), the guarded bare-id write pattern, server-side internal-note/activity stripping, the centralized transition map, transactional paired activity+audit logging, and server-derived notification recipients are all correctly implemented.

*Undetermined / assumed:* I did not read `TicketDetailView.tsx` line-by-line, but confirmed the **only** server read path that returns messages/activities is `getTicket`, which strips server-side — so a UI bug there could not expose internal notes the server already withheld. Whether `createDocument` re-checks the Support `linkedRecordId` tenant (L-2) is stated from the call-site; I did not re-read `documents.ts` in this pass.
