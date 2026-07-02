# REUSABLES — components, logic & patterns to reuse (not rebuild)

> A catalogue of what already exists so future work — **especially the Deviation rebuild** ([STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md#the-deviation-redesign-mid-design--resumable)) — reuses it instead of duplicating. All paths, prop names, and signatures are quoted from the real code on `devAI`. Anything unconfirmed is marked **(unverified)**. **Part D** maps each Deviation-rebuild piece to an existing reusable.

---

# PART A — Reusable UI components

Props quoted from the real TS interfaces. All under `src/components/` unless noted.

## `ui/` — primitives
| Component | File | Key props | Use it when… |
|---|---|---|---|
| **Button** | `ui/Button.tsx` | `variant?: "primary"\|"secondary"\|"ghost"\|"danger"\|"danger-ghost"`, `size?: "xs"\|"sm"\|"md"\|"lg"`, `icon?: LucideIcon`, `iconPosition?`, `loading?`, `fullWidth?`, + native button attrs | any action; `icon` for icon+label, omit `children` for icon-only |
| **Modal** | `ui/Modal.tsx` | `open: boolean`, `onClose: () => void`, `title: string`, `header?`, `children`, `footer?: ReactNode`, `persistent?` | any dialog/confirm; `persistent` for unsaved-form safety |
| **Drawer** | `ui/Drawer.tsx` | `open`, `onClose`, `title`, `children`, `footer?`, `width?: "md"\|"lg"`, `persistent?` | side-panel detail/edit that keeps the page visible |
| **Popup** | `ui/Popup.tsx` | `isOpen`, `variant: "success"\|"error"\|"warning"\|"confirmation"\|"progress"`, `title`, `description?`, `actions?: PopupAction[]`, `progress?`, `onDismiss?` | lightweight confirm (built-in Cancel/Confirm), alert, or progress |
| **Badge** | `ui/Badge.tsx` | `variant: "red"\|"amber"\|"green"\|"blue"\|"gray"\|"purple"`, `children` | a manual-color status/label pill |
| **Input** | `ui/Input.tsx` | `id` (req), `label?`, `type?`, `error?`, `hint?`, `required?`, `icon?`, `rightAdornment?`, + native input attrs | standard text/number field with label + error wiring |
| **Select** | `ui/Select.tsx` | `label` (req), `id` (req), `options: {value,label}[]`, `error?`, `hint?`, `placeholder?` | a simple native dropdown |
| **Dropdown** | `ui/Dropdown.tsx` | `options?`/`sections?`, `value?`/`values?`, `onChange?`/`onChangeMulti?`, `searchable?`, `multi?`, `actionMode?`, `size?: "sm"\|"md"`, `disabled?`, `width?` | styled select needing search/multi/grouping or a `⋮` action menu |
| **DatePicker** | `ui/DatePicker.tsx` | `id`, `value: string` (`"YYYY-MM-DD"`), `onChange: (v)=>void`, `label?`, `error?`, `min?`, `max?`, `disabled?` | any date field (custom calendar, not native) |
| **Checkbox** | `ui/Checkbox.tsx` | `checked`, `onChange:(b)=>void`, `label`, `id`, `description?`, `disabled?`, `error?` | a single labelled boolean opt-in |
| **Toggle** | `ui/Toggle.tsx` | `checked`, `onChange:(b)=>void`, `label`, `id`, `description?`, `disabled?`, `hideLabel?` | an on/off setting (e.g. the MFA toggle) |
| **Toast / useToast** | `ui/Toast.tsx` | `useToast() → { success, error, info, show, dismiss }` | transient feedback after an action (see B4) |
| **Table** | `ui/Table.tsx` | `columns: Column<T>[]`, `data`, `caption` | a quick semantic table (no row-click/empty-state) |
| **Pagination** | `ui/Pagination.tsx` | `page`, `pageSize`, `total`, `onChange:(p)=>void`, `itemLabel?` | client-side paging summary + prev/next |
| **ProgressBar** | `ui/ProgressBar.tsx` | `met?`/`total?` or `value?` (0–1), `tone?`, `aria-label?` | completion/readiness bars |
| **Card** | `ui/Card.tsx` | `children`, `header?`, `footer?`, `padding?: "none"\|"sm"\|"md"` | generic surface wrapper |
| **ExportMenu** | `ui/ExportMenu.tsx` | `filename`, `headers`, `rows`, `formats?: ("csv"\|"excel"\|"pdf")[]` | add CSV/Excel/PDF export to a list |
| **RelativeTime** | `ui/RelativeTime.tsx` | `value: string\|Date` | "2 days ago" with exact UTC in `title` |
| ThemeToggle / DensityToggle / ColorThemePicker | `ui/*` | no props | theme/density/accent switches |

## `shared/` — composed
| Component | File | Key props | Use it when… |
|---|---|---|---|
| **DataTable** (rich, preferred) | `shared/DataTable.tsx` | `columns: Column<T>[]`, `data`, `keyFn:(row)=>string`, `ariaLabel`, `onRowClick?`, `emptyState?`, `variant?` | any list table with row-click/empty-state/alignment. `Column<T> = { key, header, srOnly?, width?, align?, render:(row,i)=>ReactNode }` |
| **StatusBadge** | `shared/StatusBadge.tsx` | `taxonomy: Record<string,StatusDef>`, `status: string` | render a domain status from `@/constants/statusTaxonomy` (color + non-color icon cue) |
| **StatusGuide** | `shared/StatusGuide.tsx` | `module`, `statuses` | a "?" that explains each status in a Modal |
| **StatCard** | `shared/StatCard.tsx` | `icon`, `color`, `label`, `value`, `sub` | a KPI tile |
| **CardSection** | `shared/CardSection.tsx` | `icon`, `iconColor?`, `title`, `badge?`, `children` | an icon-titled card section |
| **PageHeader** | `shared/PageHeader.tsx` | `title`, `subtitle?`, `actions?`, `icon?` | a module page header |
| **EmptyState** | `shared/EmptyState.tsx` | `icon`, `title`, `description`, `actionLabel?`, `onAction?`, `readOnly?` | an empty list/zero-state with a CTA |
| **TabBar** | `shared/TabBar.tsx` | `tabs: Tab[]`, `activeTab`, `onChange:(id)=>void`, `ariaLabel` | tabbed module sections |
| **DocumentUpload** ⭐ | `shared/DocumentUpload.tsx` | `recordId`, `recordTitle`, `module`, `existingDocs: LinkedDocument[]`, `onUpload:(doc)=>void`, `onDelete?`, `onApprove?`, `readOnly?` | the generic drag-drop uploader (versioning + approve/delete; max 25MB). **Note:** the newer deviation-task / gap-finding panels do **not** use this — they use a categorized `Dropdown` + file input + **`DocList`/`GroupedTaskDocs`** (next rows). |
| **DocList / DocItemView** ⭐ | `shared/DocList.tsx` | `docs: DocItemView[]` (`{id, fileName, downloadHref, uploadedBy, uploadedAt}`), `onRemove?:(id)=>void`, `busyId?`, `emptyText?` | **model-agnostic doc list** with optional per-row remove. Used by the deviation/finding work panels + the gap detail modal. |
| **GroupedTaskDocs** | `src/modules/worklist/DeviationTaskPanel.tsx` (exported) | `docs: WorklistDoc[]`, `emptyText`, `onRemove?`, `busyId?` | groups task/finding docs by the 7 GxP `EVIDENCE_CATEGORIES` and renders a labelled `DocList` per group. |
| **TaskThread** | `src/modules/worklist/DeviationTaskPanel.tsx` (exported) | `messages`, `currentUserId?`, `fmt:(iso)=>string` | the flat QA↔worker conversation renderer; shared by deviation tasks + gap findings (drives `DeviationTaskMessage`/`FindingMessage`). |
| (plan popups) | `shared/{NoSitesPopup,PlanLimitPopup,PlanLimitUsageBar,SubscriptionPlansPopup}.tsx` | **(unverified detail)** | plan-limit / subscription surfaces |

## `layout/`, `errors/`, `search/`, `chatbot/`
- **AppShell** `layout/AppShell.tsx` — customer-app shell (Sidebar+Topbar+expiry gate+floating chatbot). Props `{ children?, initialTenant?, initialUser? }`.
- **AdminShell** `src/modules/admin/AdminShell.tsx` (in the admin module, not `components/`) — admin-console shell. Props `{ children? }`.
- **Sidebar** `layout/Sidebar.tsx` `{ onNavigate? }`; **Topbar**, **NotificationBell**, **SiteFilterBanner** (props **(unverified detail)**).
- **ErrorBoundary** `errors/ErrorBoundary.tsx` — class boundary; props `{ children, fallback?, moduleName?, onError? }`. **AsyncBoundary** `errors/AsyncBoundary.tsx` wraps ErrorBoundary+Suspense. Re-exported from `errors/index.ts`.
- **SmartRecordSearch** `search/SmartRecordSearch.tsx` — AI plain-English search; props `{ sources: SearchSource[], title?, defaultScope?, allowCrossModule? }`. Add an AI search bar to any list by supplying a `SearchSource` per module.
- **AIChatbot** `chatbot/AIChatbot.tsx` — floating assistant; **no props**, mounted once by AppShell. The bubble is its own trigger.

---

# PART B — Reusable UI patterns (conventions)

## B1. Form-validation pattern (derived errors) — `src/modules/admin/customer-accounts/_components/AccountModal.tsx`
No `setErrors`; everything is derived each render. Copy this shape:
- **State:** `form`, `touched: Record<string,boolean>`, `submitAttempted: boolean`.
- **`errors` `useMemo(() => {...}, [form, ...])`** — a field-keyed map; each rule sets `e.<field> = "message"`; returns `{}` when valid.
- **`errorVisible(name)`** = `(touched[name] || submitAttempted) && !!errors[name]` — pristine fields stay silent.
- **`canSave`** — a pure boolean mirroring `errors` (for the Save button's disabled cue).
- **`labels: Record<string,string>`** — error-key → human label; drives the footer hint.
- **Footer "Please complete" hint** — `blockingFields = Object.keys(errors).filter(k=>labels[k]).map(k=>labels[k])`; always-rendered amber strip with `visibility: showHint ? "visible":"hidden"`, `role="status" aria-live="polite"`.
- **Save click** = `setSubmitAttempted(true); if (Object.keys(errors).length===0) handleSubmit();` (stays clickable so an invalid click surfaces all errors).
- **`markTouched(field)`** on blur; reset all on `useEffect([open])`.

## B2. Inline field-error + disabled/read-only wiring — `src/modules/admin/customer-accounts/_components/account-form/AccountPlanFields.tsx`
The exact numeric-input shape (mirror for any guarded number field):
```tsx
<input type="number" min={1} max={CEILING}
  value={Number.isFinite(v) ? v : ""}                 // blank (not 0) when empty
  disabled={notEditable}                              // e.g. fixed-tier caps
  onChange={(e) => update({ v: e.target.valueAsNumber })}  // NaN on empty → validation catches it
  onBlur={onVBlur}                                    // markTouched
  aria-invalid={!!vError}
  aria-describedby={vError ? "v-error" : undefined}
  className={`input text-[12px] ${vError ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`} />
{vError && <p id="v-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{vError}</p>}
```
Read-only computed display: `<input type="text" readOnly disabled value={formatted ?? "—"} className="input text-[12px]" />`. The component takes paired `<field>Error?: string` + `on<Field>Blur?: () => void` props per field, fed from the modal's `errorVisible(...) ? errors.<key> : undefined`.

## B3. Modal / confirm-dialog composition — e.g. `CustomerAccountsPage.tsx` suspend confirm
```tsx
<Modal open={...} onClose={close} title="Suspend account?"
  footer={
    <div className="flex items-center justify-end gap-3">
      <Button variant="secondary" size="sm" onClick={close}>Cancel</Button>
      <Button variant="danger" size="sm" icon={PauseCircle} onClick={confirm}>Suspend account</Button>
    </div>
  }>
  {/* warning icon + copy + the record being acted on */}
</Modal>
```
Convention: footer = right-aligned `flex justify-end gap-3` with a `secondary` Cancel + a `danger`/`primary` confirm. `Popup variant="confirmation"` is the lighter alternative (built-in Cancel/Confirm `actions`).

## B4. Toast usage
`import { useToast } from "@/components/ui/Toast"` → `const toast = useToast()` (client only) → `toast.success("Saved.")` / `toast.error(res.error)` / `toast.info("…")`. Provider mounted in `src/components/Providers.tsx`; throws if used outside it.

## B5. Cross-module reusable UI — what EXISTS vs build-new
- **Document/evidence uploader → EXISTS:** `shared/DocumentUpload.tsx` (the one generic uploader).
- **Detail panel → primitive only:** use `ui/Drawer.tsx` or `ui/Modal.tsx`; there is **no** generic "RecordDetailPanel" — each module builds its own on top.
- **Audit-trail viewer → NOT reusable:** `src/modules/audit-trail/AuditTrailPage.tsx` is a full page, not a drop-in widget. **(unverified)** that any smaller widget exists. (The audit *write* helper is `@/lib/audit`, not UI.)
- **Worklist row / TaskPanel → module-specific:** `src/modules/worklist/TaskPanel.tsx` is bound to CAPA action items (props `{ actionItemId, currentUserId, isAuthor, isViewer, onClose, onChanged }`) — a template to mirror, not to reuse directly.

---

# PART C — Reusable logic (server + lib)

## C0. The `ActionResult` write contract
Every server action returns this (defined per-action, e.g. `src/actions/tenants.ts`):
```ts
type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };
```
Standard action body: `requireAuth()` → `resolveUserFk()` → role/GxP guard → Zod `safeParse` → domain guards (SoD/caps) → `prisma.$transaction([...])` → `prisma.auditLog.create(...)` → `revalidatePath(...)` → return `ActionResult`.

## C1. Auth / identity — `src/lib/auth.ts`
```ts
auth(): Promise<AuthSession | null>                       // :33 — session in Server Components/Actions
requireAuth(): Promise<AuthSession>                        // :54 — or redirect("/login")
resolveUserFk(sessionUserId, tenantId, role): Promise<UserFkResolution>  // :135
requireGxPAuthor(resolution): void                         // :188 — throws for super_admin
// AuthSession.user = { id, name, email, role, tenantId, gxpSignatory? }
// UserFkResolution = { userId: string|null, displayName, role, isAdmin, isPlatformAdmin }
```
**Admin-is-a-Tenant nuance:** `super_admin`/`customer_admin` authenticate against the **Tenant** table, so `session.user.id` is a **Tenant.id**. Writing it into a `*ById` User FK throws. `resolveUserFk` maps it to a real `User.id` or `null` (super_admin → `{userId:null, isPlatformAdmin:true}`). **Always** populate User FK columns with `actor.userId` (not `session.user.id`); audit columns use `actor.displayName`/`actor.role`.

## C2. Audit logging
- Inside an action (the dominant pattern) — **direct inline create** so the row carries the right module/recordType:
  ```ts
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  await prisma.auditLog.create({ data: {
    tenantId: session.user.tenantId, userId: actor.userId, userName: actor.displayName, userRole: actor.role,
    module: "CAPA", action: "CAPA_CREATED", recordId: capa.id, recordTitle: ..., newValue: ..., /* oldValue? */ } });
  ```
- Wrappers: `logAuditAction(input)` (`src/actions/auditLogs.ts:10`) generic Server Action; `auditLog(entry)` (`src/lib/audit.ts:25`) fire-and-forget client wrapper; `auditAuthEvent(...)` (`src/lib/auditServer.ts:21`) for pre-session events (login). Human labels: `src/lib/labels/auditEvents.ts`.

## C3. Part 11 e-signature pipeline — `src/lib/signing.ts`
```ts
verifyPasswordForSigning(userId, plaintextPassword): Promise<boolean>   // :33 — bcrypt vs Tenant then User; never throws
computeContentHash(canonicalString): string                            // :63 — SHA-256 hex
canonicalize<RecordType>Content(input): string                         // deterministic sorted-key JSON
createSignedRecord(opts): Promise<SignedRecord>                        // :479 — non-transactional insert
```
Canonicalizers include `canonicalizeDeviationClosureContent` (:373), `…CAPAClosureContent`, `…CAPAApprovalContent`, `…CAPAVerificationContent`, `…FDA483ResponseContent`, `…DocumentApprovalContent`, `…ChangeControlTransitionContent`, `…CSVValidationSignOffContent` (+ revocations). **Transactional callers create `tx.signedRecord.create(...)` directly** so the signature + the record mutation commit atomically; `createSignedRecord` is only for the non-atomic case.

**The signed-close template — `closeDeviation` (`src/actions/deviations.ts:351`):** validate + `DEVIATION_QA_ROLES` gate → load record → `resolveUserFk` + `requireGxPAuthor` → domain gate → `verifyPasswordForSigning` (audit `SIGNING_PASSWORD_FAILED` on fail, zero state change) → `canonicalizeDeviationClosureContent({deviationId,title,severity,rootCause,closingComment,closedAt})` → `computeContentHash` → atomic tx: `tx.signedRecord.create({ recordType:"DEVIATION_CLOSURE", signatureMeaning:"Closed", contentHash, ... })` + `tx.deviation.update({ status:"closed", closureSignatureId: sig.id, ... })` → paired audit rows (`DEVIATION_CLOSED` + `DEVIATION_CLOSED_AND_SIGNED`). IP/UA via `readSigningProvenance()` (`src/actions/capas/_shared`).

## C4. SoD guard pattern (ID-based) — copy this shape
Deviation `guardCapaDecision` (`src/actions/deviations.ts:913-918`) — the cleanest pure-FK form to mirror:
```ts
if (existing.createdById && existing.createdById === session.user.id)
  return { ok: false as const, error: "… cannot be made by the reporter (segregation of duties)." };
if (existing.investigationCompletedById && existing.investigationCompletedById === session.user.id)
  return { ok: false as const, error: "… cannot be made by the investigator (segregation of duties)." };
```
CAPA variants add a **name fallback** for legacy rows (`verification.ts:143-145`, `approvals.ts:146-148`) and an **approver-ledger** check (`prisma.cAPAApproval.findFirst({ where:{ capaId, tenantId, approverId: session.user.id, revokedAt:null } })`, `verification.ts:177-186`). For NEW columns use pure FK comparison (no name fallback needed). Persist actor via `resolveUserFk(...).userId`.

## C5. CAPAActionItem lifecycle — `src/actions/capas/action-items.ts` (the assign→submit→rework template)
- **Statuses** (`ACTION_ITEM_STATUSES`): `"pending" | "in_progress" | "complete" | "skipped" | "rework"`.
- **Assign** — `addActionItem(capaId, input)` (:136): writes `{ tenantId, capaId, sequence, description, owner, ownerId: input.ownerId ?? null, dueDate, status:"pending", createdBy, createdById }`, then `notify({ recipientUserId: created.ownerId, type:"ACTION_ASSIGNED", linkPath:"/worklist", entityType:"CAPAActionItem", entityId: created.id })`.
- **Submit/complete** — `updateActionItem(itemId, input)` (:261): owner self-service limited to `["pending","in_progress","complete"]`; `complete` requires `completionNotes` (≥5); on complete sets `completedBy/completedById/completedAt/completionNotes`. Owner auth via `isAssignedToTask(session, item)` (`roleSets.ts`).
- **Rework** — set in `rejectCAPA` (`lifecycle.ts:864-873`): `updateMany({ data:{ status:"rework", reworkReason, reworkRequestedById: actor.userId, reworkRequestedAt } })` + `REWORK_ASSIGNED` notify.

## C6. createCAPA + CAPA↔Deviation link — `src/actions/capas/lifecycle.ts`
`createCAPA(input)` (:163). `CreateCAPASchema` accepts `linkedDeviationId?: string` (:49). It writes `CAPA.deviationId = linkedDeviationId ?? null` (:272) **and**, in the same `$transaction` (:290-295):
```ts
if (linkedDeviationId) {
  await tx.deviation.update({ where: { id: linkedDeviationId, tenantId: session.user.tenantId },
                              data: { linkedCAPAId: created.id } });
}
```
→ both sides commit atomically; the deviation **stays in its current status** (raising a CAPA doesn't move it). **Reuse as-is** for the high/med deviation path.

## C7. getWorklist aggregation — `src/lib/queries/worklist.ts:65`
`getWorklist(userId, tenantId): Promise<Worklist>`, `Worklist = { groups, openCount, reworkCount, nextDue }`. Two `Promise.all` queries: `cAPAActionItem.findMany({ where:{ ownerId:userId, tenantId, deletedAt:null, capa:{deletedAt:null} } })` and `cAPA.findMany({ where:{ tenantId, ownerId:userId, status:{ in: ACTIVE_STATUSES }, deletedAt:null } })`. **It never reads Deviation.** To union a deviation task: add a third query `prisma.deviationTask.findMany({ where:{ assigneeId:userId, tenantId, deletedAt:null }, include:{ deviation:{ select:{ id,reference,title,status,priority } } } })`, serialize Dates→ISO, and emit a new section/group in the returned object.

## C8. The cached-read query pattern — `src/lib/queries/*`
```ts
export const getDeviations = cache(async (tenantId: string) => {        // deviations.ts:4
  return prisma.deviation.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: "desc" }, include: {...} });
});
export const getDeviation = cache(async (id, tenantId) =>               // :42
  prisma.deviation.findFirst({ where: { id, tenantId, deletedAt: null } }));   // findFirst (tenant-scoped), not findUnique
```
Conventions: `cache()` for per-request memo; **always** `where:{ tenantId, deletedAt:null }` (tenantId from the session, never the client); single-id reads use `findFirst` with the tenant+deletedAt guard; batch related rows with one `{ in: ids }` query.

## C9. Other shared helpers
| Helper | File:sig | Use |
|---|---|---|
| **Reference codes** | `src/lib/reference.ts` — `buildReferencePrefix(moduleCode, siteCode)` (:83) + `generateReference(prefix, now, findLatestForYear)` (:30) + `isReferenceConflict(err)` (:67) | `DEV-{site}-{year}-{NNN}`; compose inside a tx with a P2002 retry loop (see `deviations.ts:189-208`) |
| **Plan caps / expiry** | `src/lib/plans.ts` — `resolvePlanCaps(tier, custom?)` (:72), `resolveExpiry(startISO, months)` (:114) | freeze caps; derive a date from start + months |
| **File storage** | `src/lib/fileStorage.ts` — singleton `fileStorage` (:145): `save(key,Buffer,mime)`, `read(key)`, `delete` (no-op — soft-delete only), `exists(key)` | persist/read uploaded bytes (local FS or DO Spaces by env) |
| **Notifications** | `src/lib/notify.ts` — `notify(input)` (:53), `notifyMany(inputs)` (:86) | one in-app Notification row; fault-isolated (never throws); skips null/self recipient. Call **after** the write commits |
| **GxP evidence categories** | `src/lib/queries/evidence.ts` — `EVIDENCE_CATEGORIES` (the 7 ALCOA+ buckets), `EVIDENCE_CATEGORY_LABEL`, `EvidenceCategory` type | the shared category set for `Document.category` on task/finding docs + CAPA `EvidenceItem` categories |
| **Categorized docs → CAPA evidence** | `convertCategorizedDocsToEvidence(...)` — module-private in `src/actions/capas/lifecycle.ts` (~:197) | **generalized** carryover: converts a deviation's OR a finding's categorized `Document`s into real CAPA `EvidenceItem`+`EvidenceFile` rows (idempotent on `(capaId, category)`, fault-isolated). Pass `linkedModule` + `linkedRecordId`(s). Not exported — call site is `createCAPA`. |

---

# PART D — THE DEVIATION REBUILD (BUILT — now a reuse map for the *next* task)

> ⚠️ **The deviation rebuild is DONE** (see [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md#deviation-redesign--built)). This part is now **history + a reuse map**: it records which existing pieces were reused vs built-new, and it's the template the **gap-finding workflow** then cloned (`DeviationTask`→`Finding` loop, `DeviationTaskMessage`→`FindingMessage`, `deviation-tasks.ts`→the finding actions in `findings.ts`). What shipped: the `DeviationTask` + `DeviationTaskMessage` models, `src/actions/deviation-tasks.ts`, `src/modules/worklist/DeviationTaskPanel.tsx` (exports `GroupedTaskDocs`/`TaskThread`), the `getWorklist` union, and the `capa_pending` coupling. Read below for what each piece reused.

## UI
| Rebuild needs | Reuse / build | Exactly what |
|---|---|---|
| **Assign-to-user modal** (pick user + message) | **Reuse primitives, build the wrapper** | `ui/Modal.tsx` + `ui/Dropdown.tsx` (`searchable`, options = active tenant users) for the assignee + a `<textarea>`/`ui/Input` for the message + the **B3 footer** (Cancel + primary Confirm). No existing assign-modal — compose these. |
| **Task form** (assignee: notes + document, submit) | **Reuse** | `ui/Modal.tsx`/`ui/Drawer.tsx` shell + a notes `<textarea>` + **`shared/DocumentUpload.tsx`** for the document (pass `module:"Deviation Task"`, `recordId: task.id`). |
| **Status badge** (task + `capa_pending`) | **Reuse** | `shared/StatusBadge.tsx` driven by a new task-status taxonomy added to `src/constants/statusTaxonomy.ts` (mirror `DEVIATION_STATUSES`). |
| **Priority badge** (Low/Med/High) | **Reuse** | `ui/Badge.tsx` with a small priority→variant map, or `shared/StatusBadge.tsx` with a priority taxonomy. (Severity already maps via `src/lib/severity.ts` `getSeverityVariant`.) |
| **Worklist item row** | **Build new (mirror)** | No generic row. Mirror `src/modules/worklist/{WorklistPage,TaskPanel}.tsx` structure for a deviation-task section; render rows with `shared/DataTable.tsx` (`onRowClick`). |
| **Review / Close / Rework buttons** | **Reuse** | `ui/Button.tsx` (`variant="primary"` close, `"danger"`/`"secondary"` rework) inside the **B3** confirm-dialog pattern. |
| **Document upload** | **Reuse** | `shared/DocumentUpload.tsx` (the single generic uploader). |
| **Validation on the assign/priority forms** | **Reuse pattern** | the **B1** derived-errors pattern (`errors`/`errorVisible`/`canSave`/`labels`) + **B2** input wiring. |

## Logic
| Rebuild needs | Reuse / build | Exactly what |
|---|---|---|
| **`DeviationTask` model** | **Build new (mirror)** | Mirror `model CAPAActionItem` (`prisma/schema.prisma`) — see the field list in [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md). Swap `capaId`→`deviationId`, `ownerId`→`assigneeId`, add `message`, `reviewedById`/`reviewedAt`, keep the soft-delete quartet + rework fields. |
| **Assign / submit / review actions** | **Reuse pattern, build new actions** | Copy the **C5** lifecycle from `src/actions/capas/action-items.ts` (`addActionItem`/`updateActionItem`) — same `ActionResult` + Zod + `auditLog.create` (**C2**) + `notify` (**C9**) shape. New file e.g. `src/actions/deviation-tasks.ts`. |
| **Notify assignee on assign / rework** | **Reuse** | `notify({ recipientUserId: assigneeId, type:"ACTION_ASSIGNED", linkPath:"/worklist", entityType:"DeviationTask", entityId })` / `notifyMany` (`src/lib/notify.ts`). |
| **Signed QA close (low-priority task path)** | **Reuse** | The existing **C3** `closeDeviation` (`src/actions/deviations.ts:351`) already signs the deviation close (Part 11) — the low-priority QA close routes through the same signed action (low-priority close IS signed). Don't build a new signing path. |
| **SoD: assignee ≠ reviewer** | **Reuse pattern** | The **C4** ID-compare shape: in the review action, `if (task.assigneeId && task.assigneeId === session.user.id) return {success:false, error:"QA reviewer must differ from the assignee (segregation of duties)."}` + a `DEVIATION_QA_ROLES` check; persist `reviewedById = resolveUserFk(...).userId`. |
| **Raise CAPA from a high/med (or escalated low) deviation** | **Reuse as-is** | **C6** `createCAPA({ source:"Deviation", linkedDeviationId, risk: severityToRisk(severity) })` (`src/actions/capas/lifecycle.ts:163`) — writes both link sides atomically and leaves the deviation open. Then set the deviation status to `capa_pending` in the calling action. |
| **Worklist integration** | **Extend existing** | **C7** — add the third `deviationTask where assigneeId==userId` query to `getWorklist` (`src/lib/queries/worklist.ts:65`) and emit a new section. Additive; the CAPA path is untouched. |
| **CAPA-close → deviation unblock** (net-new) | **Build new (small)** | No coupling exists today (CAPA close cascades to `Finding` only). Add a deviation update in the CAPA closure path (`src/actions/capas/closure.ts`) or a check that flips `capa_pending`→ closable; **keep the Part 11 sign-close — no auto-close**. |
| **Auth / actor / GxP gate** | **Reuse** | **C1** `requireAuth` + `resolveUserFk` + `requireGxPAuthor` in every new action. |
| **Reference code** (if `DeviationTask` needs one) | **Reuse (optional)** | **C9** `src/lib/reference.ts`. Likely unnecessary — tasks are children of a referenced Deviation. |

### Net build size (from this mapping)
- **Reuse outright:** DocumentUpload, Modal/Drawer/Dropdown/Button/Badge/DataTable, the B1/B2/B3 patterns, `createCAPA(linkedDeviationId)`, `closeDeviation` (signing), `notify`, `resolveUserFk`/`requireGxPAuthor`, the `auditLog.create` + `cache()` query conventions, the C4 SoD shape, the C5 CAPAActionItem lifecycle as a copy-template.
- **Build new:** the `DeviationTask` model + its `src/actions/deviation-tasks.ts` (mirroring CAPAActionItem), the assign/task UI wrappers + worklist deviation-section row, the `getWorklist` union (additive), and the small CAPA-close→deviation-unblock coupling. The `priority` field + `capa_pending` status registrations are listed in [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md).
