# ROLES & PERMISSIONS

> Source of truth in code: `src/store/permissions.slice.ts` (the `RoleKey` union + matrix) and `src/lib/permissions/roleSets.ts` (authorization sets + `getModuleCapabilities`). Verified this session.

## The 9 canonical roles

Roles are **free strings** in the DB (`User.role`, `Tenant.role` — SQLite has no enum), but exactly **9** are defined everywhere (`RoleKey` in `src/store/permissions.slice.ts`, labels in `src/lib/labels/roles.ts`, picker in `src/modules/settings/tabs/UsersTab.tsx`):

| Role string | Label | Kind | Notes |
|---|---|---|---|
| `super_admin` | Platform Admin | platform | **Tenant row**, not a User. Manages tenants/plans/support. **Never authors GxP** (hard bright line). Walled to `/admin`. Bypasses MFA. |
| `customer_admin` | Customer Admin | tenant admin | **Tenant row**. Manages the tenant's users/sites/settings. May author GxP. |
| `qa_head` | QA Head | quality authority | Reviews/approves/signs/closes compliance records. The "quality authority" for deviations, CAPA, FDA 483, CSV, etc. |
| `qc_lab_director` | QC / Lab Director | quality (QC lab) | Authors/works records. |
| `regulatory_affairs` | Regulatory Affairs | quality/regulatory | Authors; co-approves **Critical** CAPAs. |
| `csv_val_lead` | CSV / Val Lead | quality (validation) | CSV/CSA system authoring; in `COMPLIANCE_AUTHOR_ROLES`. |
| `it_cdo` | IT / CDO | operational | Non-quality dept head; can author deviations/483 (any non-viewer). |
| `operations_head` | Operations Head | operational | Non-quality dept head; the seeded "non-author fixer" who works tasks assigned to them. |
| `viewer` | Viewer | read-only | Hard-stopped from all writes. |

🚩 **There is no generic "operator / production / QC-analyst" front-line role.** The only operational personas are `it_cdo`, `operations_head` (dept heads) and `qc_lab_director`. Relevant to the deviation redesign (who "does the work").

### Who can be assigned which role
- **super_admin** can assign all 9 (`ROLE_OPTIONS_ALL`).
- **customer_admin** can assign only the 7-role tenant subset (`TENANT_ROLES_FOR_CUSTOMER_ADMIN`): qa_head, qc_lab_director, regulatory_affairs, csv_val_lead, it_cdo, operations_head, viewer. Enforced server-side in `src/actions/settings.ts` (`CUSTOMER_ADMIN_GRANTABLE_ROLES`, audited `USER_CREATE_ROLE_DENIED`).
- `super_admin` / `customer_admin` are **not** tenant-assignable user roles — they're account (Tenant) rows.

## How `roleSets.ts` enforces it

The same file is imported by **both** server actions and the client UI hook (`usePermissions`), so they can never drift. It exports:

- **Role-sets** (string arrays) mirroring the inline server checks, e.g.:
  - `COMPLIANCE_AUTHOR_ROLES` = csv_val_lead, qa_head, regulatory_affairs, customer_admin, super_admin (super_admin blocked at author-time by the GxP bright line).
  - `DEVIATION_QA_ROLES` = qa_head, super_admin. `canWriteDeviation(role)` = any role **except `viewer`**.
  - `CAPA_CLOSE_ROLES`, `CAPA_REVIEW_ROLES`, `CSV_SIGNOFF_ROLES`, `FDA483_SIGN_ROLES`, `DOCUMENT_APPROVE_ROLES`, `ADMIN_DELETE_ROLES`, `SETTINGS_MANAGE_ROLES`, `AUDIT_TRAIL_VIEW_ROLES`, etc.
- **The GxP bright line:** `PLATFORM_ADMIN_ROLES = ["super_admin"]`; `canAuthorGxP(role) = !isPlatformAdmin(role)`. Server actions call `requireGxPAuthor(...)` to block super_admin from authoring GxP records.
- **`getModuleCapabilities(role, gxp, canView, module)`** — the pure function that computes `{canView, canCreate, canEdit, canApprove, canSign, canDelete, canReview}` per module, mirroring the server gates. The client `usePermissions(module)` consumes it; the server actions enforce the same sets. `canSign` additionally requires the user's `gxpSignatory` flag.

**Three enforcement layers:** (1) `proxy.ts` edge gate (route-level: `/admin` vs app), (2) server actions (`requireAuth` + role-sets + `requireGxPAuthor` — **authoritative**), (3) UI capabilities (`usePermissions` — hides/disables, never trusted alone).

## The tenant model

- A **Tenant** is the customer organization **and** the login account for its `super_admin`/`customer_admin`. Its quality staff are **User** rows (`tenantId` FK).
- **Auth dual-lookup:** login checks the Tenant table first (admins), then the User table (staff). So `session.user.id` may be a **Tenant.id** (for admins) — which is why `resolveUserFk()` exists: it maps a session id to a real `User.id` before writing any User FK column (writing a Tenant.id into a `User` FK would crash). See [FLOWS.md](./FLOWS.md#write-path).
- Everything is **tenant-scoped** by `session.user.tenantId`; `super_admin` is cross-tenant in the admin console only.
- **Plan gate:** a tenant's users can't log in if the tenant's plan is missing/expired (except super_admin/customer_admin). See [FLOWS.md](./FLOWS.md#plansubscription-flow).

## Segregation of Duties (SoD)

**Pattern:** store **userId FK columns** on the record and compare them (or compare one against `session.user.id`) inside the guarded server action. **Always ID-based, never name-based** (names aren't identities). Legacy rows with a null FK are skipped (`existing.field && existing.field === ...`). `super_admin` does **not** bypass these.

Concrete enforcements in code:

| Record | SoD rule | Fields (file) |
|---|---|---|
| Deviation investigation | investigator ≠ reporter | `createdById` vs `session.user.id` (`src/actions/deviations.ts`) |
| Deviation CAPA-decision | decider ≠ reporter AND ≠ investigator (+ must be QA) | `createdById`, `investigationCompletedById`, `capaDecisionById` |
| CAPA verification | verifier ≠ creator AND ≠ every approver | `CAPA.createdById`, `CAPAApproval.approverId` (`src/actions/capas/verification.ts`) |
| CAPA approval | approver ≠ creator; no stacked approvals | `createdById`, `approverId` (`src/actions/capas/approvals.ts`) |

**Writing the actor:** persist `resolveUserFk(...).userId` into FK columns (not `session.user.id`, because admins are Tenant rows).

### SoD for the deviation redesign
The new low-priority `DeviationTask` should carry `assigneeId` + `reviewedById` (User FKs) and the review/close action should guard:
```
if (task.assigneeId && task.assigneeId === session.user.id)
  return { error: "QA reviewer must differ from the assignee (segregation of duties)." }
```
plus a `DEVIATION_QA_ROLES` check on the reviewer — a direct reuse of the proven pattern. See [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md#the-deviation-redesign-mid-design--resumable).

## Capability matrix at a glance (effective, GxP bright line applied)

| Module | Create/Edit | Approve/Review | Sign | Close | Delete |
|---|---|---|---|---|---|
| Gap (findings) | COMPLIANCE_AUTHOR_ROLES | — | — | qa_head | ADMIN_DELETE_ROLES |
| CAPA | COMPLIANCE_AUTHOR_ROLES | qa_head (+RA Critical) | qa_head + gxp | qa_head | ADMIN_DELETE_ROLES |
| Deviation | any non-viewer | qa_head | qa_head + gxp | qa_head | ADMIN_DELETE_ROLES |
| CSV/CSA | CSV_SYSTEM_WRITE_ROLES | qa_head/csv stage review | qa_head + gxp | — | customer_admin |
| FDA 483 | any non-viewer | qa_head sign | qa_head + gxp | — | qa_head/customer_admin |
| Evidence/Docs | COMPLIANCE_AUTHOR_ROLES | qa_head (approve) | qa_head + gxp | — | qa_head/customer_admin |
| Governance (RAID) | any non-viewer | — | — | — | GOVERNANCE_MANAGE_ROLES |
| Settings | SETTINGS_MANAGE_ROLES | — | — | — | SETTINGS_MANAGE_ROLES |
| Audit Trail | view-only (qa_head/customer_admin/super_admin) | | | | |

(`super_admin` is excluded from every GxP author/sign action by `canAuthorGxP`; it manages tenants/plans/support instead.)
