/**
 * SINGLE SOURCE OF TRUTH for role-based authorization sets.
 *
 * Imported by BOTH the server actions (src/actions/**) and the client UI
 * (src/hooks/usePermissions.ts) so the two can never drift. Framework-agnostic:
 * NO React, NO Prisma, NO Redux runtime imports — only `import type` (erased at
 * build), so this file is safe to pull into a "use server" action and into a
 * client hook alike.
 *
 * This module CENTRALIZES the pre-existing definitions; it does NOT change what
 * any set CONTAINS. The super_admin GxP-author bright line is expressed here as
 * canAuthorGxP() and is applied by usePermissions for GxP/compliance modules.
 */
import type { ModuleKey } from "@/store/permissions.slice";
import { canApproveCAPA, type ApprovalTier } from "@/lib/capa-approvals";

// Re-export the CAPA tiered-approval gate so the UI imports it from the same
// place the server does — the canonical definition stays in capa-approvals.ts
// (qa_head all tiers; + regulatory_affairs for Critical).
export { canApproveCAPA };
export type { ApprovalTier };

/* ── "qa" (execution-level QA) — INTENTIONALLY in NONE of the sets below ──────
 * qa is a non-privileged observer/executor: it must never author GxP records,
 * approve, sign, reject, close, or delete. That posture is achieved purely by
 * OMISSION — qa is deliberately absent from COMPLIANCE_AUTHOR_ROLES,
 * ADMIN_DELETE_ROLES, the CAPA / CSV / FDA483 and *_MANAGE sets, and the
 * APPROVAL_REQUIREMENTS in capa-approvals.ts — so every `has(SET)` gate and
 * canApproveCAPA() returns false, and getModuleCapabilities' default branch is
 * view-only. qa DOES retain the baseline non-viewer executor abilities the
 * capability layer already grants every non-viewer role: drafting deviations
 * (canWriteDeviation) and creating governance/RAID items, plus working tasks
 * assigned to it (isAssignedToTask). Do not add qa to any set below.
 *
 * ── GxP authoring bright line ──────────────────────────────────────────────
 * super_admin (platform admin) manages tenants; it NEVER authors GxP records.
 * The server enforces this via requireGxPAuthor(resolution.isPlatformAdmin).
 * The pure role-string mirror the UI uses: */
export const PLATFORM_ADMIN_ROLES: readonly string[] = ["super_admin"];
export function isPlatformAdmin(role: string): boolean {
  return PLATFORM_ADMIN_ROLES.includes(role);
}
/** True when the role may author GxP records (everyone except super_admin). */
export function canAuthorGxP(role: string): boolean {
  return !isPlatformAdmin(role);
}

/**
 * Tenant-user predicate. super_admin is a PLATFORM identity (a Tenant row, not a
 * tenant user seat), so it must never appear in — or be a target of — a tenant's
 * user-management paths. Everyone else is a manageable tenant user, which is why
 * a customer_admin keeps full authority over every tenant role (qa_head, qa,
 * csv_val_lead, other customer_admins, …); only super_admin is off-limits.
 */
export function isTenantUserRole(role: string): boolean {
  return role !== "super_admin";
}

/**
 * SME permission model (Pass 2): the two admin identities are VIEW-ONLY on the
 * quality modules (Gap, Deviation, CAPA, CSV/CSA, FDA 483). They keep read
 * visibility but may never create/edit/approve/execute a quality record —
 * customer_admin manages the tenant (users/sites/settings), and super_admin is
 * platform-only. `viewer` is read-only. Everyone else — the functional/QA seat
 * roles — may do baseline quality authoring. Use this for the hardcoded
 * "any non-viewer" write-guards that role sets don't cover (deviation/FDA-483
 * child writes) so those gates match the role-set gates exactly.
 */
export function canWriteQuality(role: string): boolean {
  return role !== "viewer" && role !== "customer_admin" && !isPlatformAdmin(role);
}

/**
 * TENANT-WIDE / site-less-by-design roles — they see ALL sites, so a single-site
 * assignment is neither required nor meaningful. Mirrors the "sees all sites"
 * set already used by useTenantConfig (accessibleSites) and tenantMapper
 * (allSites): super_admin (platform, no tenant), customer_admin (tenant admin
 * who ASSIGNS sites), qa_head (tenant-wide QA oversight). Single source of truth.
 */
export const SITELESS_ROLES: readonly string[] = ["super_admin", "customer_admin", "qa_head"];
/**
 * A site-BOUND seat user REQUIRES a site assignment to enter the app (without one
 * they'd see no site-scoped data). True for every role EXCEPT the site-less set
 * above — so the Customer Admins / Super Admins who assign sites are NEVER blocked
 * for lacking one themselves. Reused by the login gate (auth) and the UI.
 */
export function roleRequiresSite(role: string): boolean {
  return !SITELESS_ROLES.includes(role);
}

/**
 * SITE-FIELD-VISIBILITY / cross-site authoring rule — SINGLE SOURCE OF TRUTH.
 *
 * Only the two tenant-wide admin identities may CHOOSE a site when creating a
 * record (they legitimately create across all sites). Every other role — regular
 * seat users, QA of any level, csv_val_lead, etc. — has exactly ONE assigned
 * site, so a picker is dead UI for them: the Add modals HIDE the Site field and
 * the create server actions AUTO-SET siteId from the actor's own assignment.
 *
 * Read by all four Add modals (field visibility) and by the create actions
 * (required-and-validated vs ignored-and-auto-set) so client and server agree.
 */
export function canCreateAcrossSites(role: string): boolean {
  return role === "super_admin" || role === "customer_admin";
}

/* ── Tenant lifecycle access (single source of truth) ───────────────────────
 * Answers "may this account access the app, given its tenant's lifecycle
 * status?". super_admin (any PLATFORM_ADMIN_ROLES) is the PLATFORM account, not
 * a tenant, and is exempt from ALL tenant-status checks — the role is evaluated
 * BEFORE any isActive/deletedAt read, so a null / placeholder / non-active
 * platform row can never block it. Real tenant roles are blocked when their
 * tenant is SUSPENDED (isActive=false) or soft-DELETED (deletedAt set).
 *
 * Pure predicate: NO audit, NO throw, NO side effects — callers keep their own
 * audit/redirect side-effects (e.g. the NextAuth authorize() LOGIN_ACCOUNT_
 * SUSPENDED emit). Null-safe: a missing tenant is inaccessible for non-admins;
 * callers that need a distinct "tenant not found" path should check that first. */
export interface TenantLifecycleFields {
  isActive: boolean;
  deletedAt: Date | null;
}
export function isTenantAccessible(
  tenant: TenantLifecycleFields | null | undefined,
  role: string,
): boolean {
  // Role-based exemption FIRST — never read tenant status for a platform admin.
  if (isPlatformAdmin(role)) return true;
  if (!tenant) return false;
  return tenant.isActive && !tenant.deletedAt;
}

/* ── Owner/assignee access path (Phase 3) ───────────────────────────────────
 * The narrow rule that lets a fixer work the tasks ADDRESSED to them without
 * being in COMPLIANCE_AUTHOR_ROLES. Strictly ID-based — NEVER a display-name
 * comparison (names are not identities; see the SoD createdById migration).
 * A "viewer" is hard-stopped here so the owner path can never resurrect a
 * read-only role even if it is somehow recorded as an owner. Callers still run
 * their own gxp/platform-admin (requireGxPAuthor) and viewer guards first; this
 * is purely the "is this person the assignee?" predicate. */
export function isAssignedToTask(
  session: { user: { id: string; role: string } },
  task: { ownerId: string | null | undefined },
): boolean {
  if (session.user.role === "viewer") return false; // viewer hard-stop
  if (!task.ownerId) return false;
  return session.user.id === task.ownerId;
}

/* ── Compliance authoring (findings, CAPA, evidence, action items, criteria) ──
 * Canonical home (moved here from src/lib/auth.ts, which now RE-EXPORTS these
 * so every existing `@/lib/auth` importer keeps working with ONE definition).
 * SME Pass 2 — the admin identities are removed: customer_admin is VIEW-ONLY on
 * quality (it manages the tenant, not quality records) and super_admin is
 * platform-only (also blocked by requireGxPAuthor). Only the functional/QA
 * authoring roles remain. */
export const COMPLIANCE_AUTHOR_ROLES: readonly string[] = [
  "csv_val_lead",
  "qa_head",
  "regulatory_affairs",
];

/** Admin-tier destructive deletes (findings / CAPA / deviation). SME Pass 2 —
 *  emptied: customer_admin is view-only on quality and super_admin is
 *  platform-only, so neither admin may delete quality records. (No other role
 *  currently holds quality-delete; grant one here if a deleter is required.) */
export const ADMIN_DELETE_ROLES: readonly string[] = [];

/* ── CAPA lifecycle role-sets (mirror the inline server checks). SME Pass 2 —
 *   the admin identities are removed; these are QA-authority quality actions. ── */
export const CAPA_CLOSE_ROLES: readonly string[] = ["qa_head"];
export const CAPA_REJECT_ROLES: readonly string[] = ["qa_head"];
export const CAPA_DI_GATE_ROLES: readonly string[] = ["qa_head"];
export const CAPA_REOPEN_ROLES: readonly string[] = ["qa_head"];

/** RCA review + alignment review share the same role-set today. */
export const CAPA_REVIEW_ROLES: readonly string[] = ["qa_head"];
export function canReviewRCA(role: string): boolean {
  return CAPA_REVIEW_ROLES.includes(role);
}
export function canReviewAlignment(role: string): boolean {
  return CAPA_REVIEW_ROLES.includes(role);
}

/* ── CSV / CSA validation (systems.ts). SME Pass 2 — admin identities removed
 *   (customer_admin view-only on quality; super_admin platform-only). ── */
export const CSV_SYSTEM_WRITE_ROLES: readonly string[] = ["csv_val_lead", "qa_head"];
// Emptied: quality-record delete is not an admin capability under the SME model.
export const CSV_SYSTEM_DELETE_ROLES: readonly string[] = [];
export const CSV_STAGE_REVIEW_ROLES: readonly string[] = ["qa_head"];
export const CSV_SIGNOFF_ROLES: readonly string[] = ["qa_head"];
// Revoke sign-off was a super_admin oversight override; super_admin is now
// platform-only with no tenant quality write, so this is emptied.
export const CSV_REVOKE_SIGNOFF_ROLES: readonly string[] = [];

/* ── Deviation (deviations.ts) ── create/edit = any FUNCTIONAL role (the admin
 *   identities are view-only per SME Pass 2); QA decisions (close / reject /
 *   CAPA-decision) = qa_head. ── */
export const DEVIATION_QA_ROLES: readonly string[] = ["qa_head"];
export function canWriteDeviation(role: string): boolean {
  return canWriteQuality(role);
}

/* ── FDA 483 (fda483.ts) ── create/edit = any non-viewer; sign & submit =
 *   qa_head/super_admin; delete = qa_head/customer_admin (Phase-6 cleanup
 *   FIX 4 — tightened from "any non-viewer via requireGxPAuthor" to the app's
 *   established admin-delete pattern; super_admin stays excluded by the wall). ── */
// Sign & submit the FDA 483 response + record the FDA outcome. Regulatory
// Affairs owns external regulator communication (Response + Sign-off + Outcome
// stages), so it signs alongside QA Head. RA seed users are gxpSignatory.
export const FDA483_SIGN_ROLES: readonly string[] = ["qa_head", "regulatory_affairs"];
// SME Pass 2 — customer_admin is view-only on quality; delete is qa_head only.
export const FDA483_DELETE_ROLES: readonly string[] = ["qa_head"];

/* ── CAPA module surface (Phase-6 cleanup FIX 1) ── The CAPA module (nav +
 *   /capa routes) is locked to qa_head + customer_admin (the matrix grants
 *   both `capa: full`); every other role reaches their CAPA work through the
 *   Worklist instead. super_admin is walled to /admin. Server action gates are
 *   unchanged (Phases 3-5 own those). */
export const CAPA_MODULE_VIEW_ROLES: readonly string[] = ["qa_head", "customer_admin"];

/* ── CAPA action EXECUTORS ── Who may be ASSIGNED a CAPA action item (drives the
 *  "Assigned To" dropdown AND the addActionItem/updateActionItem server gate).
 *  Deliberately EXCLUDES qa_head (QA AUTHORITY assigns/approves work — it does
 *  not execute it) and customer_admin / super_admin (admins ≠ doers). What's
 *  left is the functional executor set — i.e. GAP_CREATE_ROLES minus qa_head.
 *  `qa` (execution-level QA) IS assignable here: it authors nothing, but the app
 *  already lets it WORK tasks addressed to it (isAssignedToTask), and an assignee
 *  executes an action item via a status-only updateActionItem. Client filter +
 *  server validation share this ONE set so the UI can't be bypassed and the two
 *  can never drift. */
export const CAPA_EXECUTE_ROLES: readonly string[] = [
  "qa",
  "csv_val_lead",
  "qc_lab_director",
  "regulatory_affairs",
  "it_cdo",
  "operations_head",
];
export function canExecuteCAPA(role: string): boolean {
  return CAPA_EXECUTE_ROLES.includes(role);
}

/* ── Documents (documents.ts) ── approve/sign/reject = qa_head. Delete mirrors
 *   the app-wide GxP delete policy (qa_head + customer_admin, same as
 *   FDA483_DELETE_ROLES). super_admin is walled from every document write by
 *   requireGxPAuthor server-side; removed from this set so the capability map
 *   never advertises a write super_admin can't perform. The GxP capa-evidence
 *   path (evidence.ts) uses COMPLIANCE_AUTHOR_ROLES. */
export const DOCUMENT_APPROVE_ROLES: readonly string[] = ["qa_head"];

/* ── AGI console (agiConsole.ts) ── */
export const AGI_MANAGE_ROLES: readonly string[] = ["customer_admin", "super_admin"];

/* ── Settings ── manage = super_admin/customer_admin; matrix edit = super_admin ── */
export const SETTINGS_MANAGE_ROLES: readonly string[] = ["super_admin", "customer_admin"];
export const PERMISSION_MATRIX_EDIT_ROLES: readonly string[] = ["super_admin"];

/* ══════════════════════════════════════════════════════════════════════════
 * Governance / Risk Register — non-GxP. ONE role set for the whole module.
 *
 * The retired `RAID_MANAGE_ROLES` (a private `Set` inside the old
 * src/actions/raid.ts, membership {customer_admin, qa_head}) DISAGREED with
 * this set — it omitted super_admin, so `usePermissions("governance")` told a
 * super_admin they could edit while the server rejected them. That divergence
 * is gone: RAID_MANAGE_ROLES no longer exists anywhere, and every governance
 * gate — server action, capability map, and UI — now reads GOVERNANCE_MANAGE_ROLES.
 *
 * THE CREATE-vs-MANAGE RULE (Risk Register):
 *   • CREATE (raise a risk)  — any non-viewer. A seat/functional role
 *     (qa, csv_val_lead, operations_head, …) CAN raise a risk. `viewer` cannot.
 *   • MANAGE (edit / archive someone else's risk) — GOVERNANCE_MANAGE_ROLES only.
 *   • A non-manage creator/owner may still edit THEIR OWN risk (creator OR owner),
 *     but may NEVER archive — archive is manage-only, for anyone's risk.
 * Governance is non-GxP, so `requireGxPAuthor` does NOT apply and super_admin
 * is a legitimate manager here (unlike the GxP-authoring modules).
 * ══════════════════════════════════════════════════════════════════════════ */
export const GOVERNANCE_MANAGE_ROLES: readonly string[] = ["customer_admin", "super_admin", "qa_head"];

/* ── Governance module VIEW gate (nav visibility + /governance route) ─────────
 * DISTINCT from GOVERNANCE_MANAGE_ROLES. The module is restricted to the two
 * tenant quality-oversight identities — qa_head + customer_admin — only. Note
 * super_admin is deliberately EXCLUDED here (it manages records where present
 * but is platform-only and does not browse the tenant governance module), and
 * it is already walled to /admin regardless. */
export const GOVERNANCE_VIEW_ROLES = ["qa_head", "customer_admin"] as const;
export function canViewGovernance(role: string): boolean {
  return (GOVERNANCE_VIEW_ROLES as readonly string[]).includes(role);
}

/** MANAGE: edit/archive ANY risk in the tenant. Mirrors the server gate. */
export function canManageGovernance(role: string): boolean {
  return GOVERNANCE_MANAGE_ROLES.includes(role);
}

/** CREATE: raise a risk. Any non-viewer — seat roles included, by design. */
export function canCreateRisk(role: string): boolean {
  return role !== "viewer";
}

/* ── Management Decisions (Governance Phase 3) ──────────────────────────────
 * The SAME create-vs-manage split as the Risk Register, on the same
 * GOVERNANCE_MANAGE_ROLES set. Management review is non-GxP, so `requireGxPAuthor`
 * does not apply and super_admin is a legitimate manager here.
 *
 *   • CREATE (minute a meeting)          — any non-viewer.
 *   • EDIT   (amend a meeting + items)   — a manage role, OR the meeting's creator.
 *   • ARCHIVE                            — manage roles ONLY, for any meeting.
 * ────────────────────────────────────────────────────────────────────────── */

/** CREATE: minute a management review. Any non-viewer — seat roles included. */
export function canCreateManagementDecision(role: string): boolean {
  return role !== "viewer";
}

/**
 * EDIT one specific meeting: a manage role edits anything; otherwise the actor
 * must be its creator. A meeting has no "owner" axis (unlike a Risk), so the
 * creator is the only non-manage editor. Pure + id-keyed, so the client mirror
 * and the `updateManagementDecision` server gate call the SAME function.
 * NOTE: EDIT only. ARCHIVE is `canManageGovernance` alone.
 */
export function canEditManagementDecision(
  role: string,
  actorUserId: string | null | undefined,
  decision: { createdById?: string | null },
): boolean {
  if (canManageGovernance(role)) return true;
  if (role === "viewer") return false;
  if (!actorUserId) return false; // fail-closed: never match a null column
  return decision.createdById === actorUserId;
}

/**
 * CONVERT a risk into a Gap / Deviation / CAPA (Governance Phase 2).
 *
 * TWO gates, both required:
 *   1. `canManageGovernance` — conversion is a governance action.
 *   2. The TARGET's own create gate — because conversion calls the target's REAL
 *      create action, which enforces its own role set plus the `requireGxPAuthor`
 *      bright line. Mirrored here so the UI hides exactly what the server rejects.
 *
 * The intersection today is `qa_head` ALONE: `customer_admin` is in no create set
 * ("admin ≠ doer") and `super_admin` cannot author GxP records. Conversion mints a
 * real GxP record, so it must be authored by a real quality authority. We narrow
 * the governance set here; we never widen the GxP one.
 *
 * Pure — the server action and the client both call this exact function.
 */
export function canConvertRiskTo(target: "Gap" | "Deviation" | "CAPA", role: string): boolean {
  if (!canManageGovernance(role)) return false;
  if (target === "Gap") return GAP_CREATE_ROLES.includes(role) && canAuthorGxP(role);
  if (target === "Deviation") return canReportDeviation(role) && canAuthorGxP(role);
  return canCreateCAPA(role); // already folds in canAuthorGxP
}

/** True when the actor may convert a risk into AT LEAST ONE target (shows the section). */
export function canConvertRiskToAny(role: string): boolean {
  return canConvertRiskTo("Gap", role) || canConvertRiskTo("Deviation", role) || canConvertRiskTo("CAPA", role);
}

/**
 * EDIT one specific risk: a manage role edits anything; otherwise the actor must
 * be the risk's creator or its owner. Pure + id-keyed, so the client capability
 * mirror and the `updateRisk` server gate call the SAME function.
 * NOTE: this governs EDIT only. ARCHIVE is `canManageGovernance` alone.
 */
export function canEditRisk(
  role: string,
  actorUserId: string | null | undefined,
  risk: { createdById?: string | null; ownerId?: string | null },
): boolean {
  if (canManageGovernance(role)) return true;
  if (role === "viewer") return false;
  // Fail-closed: an unresolvable actor id never matches a null column.
  if (!actorUserId) return false;
  return risk.createdById === actorUserId || risk.ownerId === actorUserId;
}

/* ── Inspection Readiness ── non-GxP; admin actions = QA Head / admins ── */
export const READINESS_ADMIN_ROLES: readonly string[] = ["qa_head", "customer_admin", "super_admin"];

/* ── Audit Trail ── view gate (route requireRoleOrDeny) ── */
export const AUDIT_TRAIL_VIEW_ROLES: readonly string[] = ["qa_head", "customer_admin", "super_admin"];

/* ════════════════════════════════════════════════════════════════════════════
 * RESPONSIBILITY-MAP role-sets — 21 CFR Part 11 segregation of duties enforced at
 * the SERVER action layer ("the doer ≠ the approver; the reporter ≠ the closer").
 * super_admin is listed where a platform-oversight exemption is intended; for
 * GxP-AUTHORING actions requireGxPAuthor() still blocks it AFTER the role check.
 * customer_admin is DELIBERATELY excluded from compliance actions — admin ≠
 * quality authority (create/assess/assign/approve/close). See RESPONSIBILITY_MAP.
 * ════════════════════════════════════════════════════════════════════════════ */

/** QA authority — the quality judgments: assess/triage/disposition, ASSIGN work,
 *  APPROVE/return submitted work, CLOSE/verify. qa_head only (+SA oversight). */
export const QA_AUTHORITY_ROLES: readonly string[] = ["qa_head"];

/** Client mirror of the `updateFinding` / `closeFinding` server gate: editing or
 *  assessing a gap finding is a QA authority judgment (QA_AUTHORITY_ROLES) and
 *  never super_admin (canAuthorGxP bright line that requireGxPAuthor enforces) —
 *  i.e. qa_head today. Use this to gate the Edit + evidence-link UI so the button
 *  matches the server. Do NOT reuse the broad `usePermissions("gap").canEdit`
 *  (COMPLIANCE_AUTHOR_ROLES) — that is wider than who may EDIT and dead-ends
 *  csv_val_lead / regulatory_affairs / customer_admin against the server. */
export function canEditFinding(role: string): boolean {
  return QA_AUTHORITY_ROLES.includes(role) && canAuthorGxP(role);
}

/** CREATE gates per the responsibility map (origination of the record). */
// Gap Assessment is DENYLIST-scoped: any functional/seat role OR qa_head may
// originate a gap finding; only the read-only viewer and the two admin
// identities (customer_admin: admin ≠ doer; super_admin: walled from the
// customer app) are blocked. Explicit allow-set = every role EXCEPT
// {viewer, customer_admin, super_admin}.
export const GAP_CREATE_ROLES: readonly string[] = [
  "qa_head", "qa", "qc_lab_director", "regulatory_affairs", "csv_val_lead", "it_cdo", "operations_head",
];
export const CAPA_CREATE_ROLES: readonly string[] = ["qa_head"];           // a CAPA is raised ONLY by QA (super_admin is platform-only)
/** Client mirror of the `createCAPA` server gate: a CAPA may be raised ONLY by
 *  QA (CAPA_CREATE_ROLES) and never by super_admin (the canAuthorGxP bright line
 *  that `requireGxPAuthor` enforces server-side) — i.e. qa_head today. Use this
 *  to hide every "Raise CAPA" trigger (Gap findings, deviations, …) so the
 *  button and the server boundary can never drift. Do NOT reuse the broad
 *  `usePermissions("capa").canCreate` for this — that governs general CAPA
 *  authoring and is deliberately wider than who may CREATE. */
export function canCreateCAPA(role: string): boolean {
  return CAPA_CREATE_ROLES.includes(role) && canAuthorGxP(role);
}
export const INSPECTION_CREATE_ROLES: readonly string[] = ["qa_head", "regulatory_affairs"];
export const CSV_CREATE_ROLES: readonly string[] = ["csv_val_lead", "qa_head"]; // csv doer OR QA (NOT admin)
/** Deviation is REPORT-FIRST — any functional "doer" role OR qa_head may log one.
 *  Excludes viewer (read-only) and the admins (customer_admin: admin ≠ doer;
 *  super_admin: walled from the customer app). */
export const DEVIATION_CREATE_ROLES: readonly string[] = [
  "qa_head", "qa", "qc_lab_director", "regulatory_affairs", "csv_val_lead", "it_cdo", "operations_head",
];
export function canReportDeviation(role: string): boolean {
  return DEVIATION_CREATE_ROLES.includes(role);
}

/* ════════════════════════════════════════════════════════════════════════════
 * Per-module capability computation — the comprehensive mirror of the server
 * role-sets above, consumed by usePermissions(module). Pure function: same
 * inputs → same output, no React/Redux. canView is passed in by the hook
 * (it reads the permissions matrix); when canView is false every action is
 * false (you cannot act on a module you cannot see).
 * ════════════════════════════════════════════════════════════════════════════ */

/** Modules the capability map understands (matrix modules + the three that are
 *  not in the matrix: deviation / readiness / audit-trail). */
export type PermissionModule = ModuleKey | "deviation" | "readiness" | "audit-trail";

export interface ModuleCapabilities {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canSign: boolean;
  canDelete: boolean;
  canReview: boolean;
}

const NONE: Omit<ModuleCapabilities, "canView"> = {
  canCreate: false,
  canEdit: false,
  canApprove: false,
  canSign: false,
  canDelete: false,
  canReview: false,
};

/**
 * Compute a role's capabilities for one module, mirroring the authoritative
 * server gates. `gxp` = the user's gxpSignatory flag (required for e-signature
 * actions). `opts.capaRisk` tunes CAPA approval to the record's risk tier.
 */
export function getModuleCapabilities(
  role: string,
  gxp: boolean,
  canView: boolean,
  module: PermissionModule,
  opts?: { capaRisk?: ApprovalTier },
): ModuleCapabilities {
  if (!canView) return { canView: false, ...NONE };

  const gxpOk = canAuthorGxP(role); // super_admin bright line
  const has = (set: readonly string[]) => set.includes(role);

  switch (module) {
    case "gap":
      return {
        canView,
        // Create uses the shared GAP_CREATE_ROLES denylist (blocks viewer +
        // both admins) — same set the createFinding server action enforces, so
        // the hidden button and the server boundary can never drift.
        canCreate: has(GAP_CREATE_ROLES) && gxpOk,
        canEdit: has(COMPLIANCE_AUTHOR_ROLES) && gxpOk,
        canApprove: false,
        canSign: false,
        canDelete: has(ADMIN_DELETE_ROLES) && gxpOk,
        canReview: false,
      };

    case "capa":
      return {
        canView,
        canCreate: has(COMPLIANCE_AUTHOR_ROLES) && gxpOk,
        canEdit: has(COMPLIANCE_AUTHOR_ROLES) && gxpOk,
        canApprove: canApproveCAPA(role, opts?.capaRisk ?? "High") && gxpOk,
        canSign: has(CAPA_CLOSE_ROLES) && gxpOk && gxp,
        canDelete: has(ADMIN_DELETE_ROLES) && gxpOk,
        canReview: canReviewRCA(role) && gxpOk,
      };

    case "deviation":
      return {
        canView,
        canCreate: canWriteDeviation(role) && gxpOk,
        canEdit: canWriteDeviation(role) && gxpOk,
        canApprove: has(DEVIATION_QA_ROLES) && gxpOk,
        canSign: has(DEVIATION_QA_ROLES) && gxpOk && gxp,
        canDelete: has(ADMIN_DELETE_ROLES) && gxpOk,
        canReview: has(DEVIATION_QA_ROLES) && gxpOk,
      };

    case "csv":
      return {
        canView,
        canCreate: has(CSV_SYSTEM_WRITE_ROLES) && gxpOk,
        canEdit: has(CSV_SYSTEM_WRITE_ROLES) && gxpOk,
        canApprove: has(CSV_STAGE_REVIEW_ROLES) && gxpOk,
        canSign: has(CSV_SIGNOFF_ROLES) && gxpOk && gxp,
        canDelete: has(CSV_SYSTEM_DELETE_ROLES) && gxpOk,
        canReview: has(CSV_STAGE_REVIEW_ROLES) && gxpOk,
      };

    case "fda483":
      return {
        canView,
        canCreate: canWriteDeviation(role) && gxpOk, // server: any non-viewer
        canEdit: canWriteDeviation(role) && gxpOk,
        canApprove: has(FDA483_SIGN_ROLES) && gxpOk,
        canSign: has(FDA483_SIGN_ROLES) && gxpOk && gxp,
        canDelete: has(FDA483_DELETE_ROLES) && gxpOk,
        canReview: false,
      };

    case "evidence":
      return {
        canView,
        canCreate: has(COMPLIANCE_AUTHOR_ROLES) && gxpOk,
        canEdit: has(COMPLIANCE_AUTHOR_ROLES) && gxpOk,
        canApprove: has(DOCUMENT_APPROVE_ROLES) && gxpOk,
        canSign: has(DOCUMENT_APPROVE_ROLES) && gxpOk && gxp,
        // Delete = qa_head OR customer_admin (app-wide GxP delete policy),
        // matching the deleteDocument server gate. super_admin excluded by gxpOk.
        canDelete: (has(DOCUMENT_APPROVE_ROLES) || has(ADMIN_DELETE_ROLES)) && gxpOk,
        canReview: has(DOCUMENT_APPROVE_ROLES) && gxpOk,
      };

    // ── Non-GxP modules — the super_admin authoring block does NOT apply. ──
    case "governance":
      return {
        canView,
        canCreate: role !== "viewer",
        canEdit: has(GOVERNANCE_MANAGE_ROLES),
        canApprove: false,
        canSign: false,
        canDelete: has(GOVERNANCE_MANAGE_ROLES),
        canReview: false,
      };

    case "settings":
      return {
        canView,
        canCreate: has(SETTINGS_MANAGE_ROLES),
        canEdit: has(SETTINGS_MANAGE_ROLES),
        canApprove: false,
        canSign: false,
        canDelete: has(SETTINGS_MANAGE_ROLES),
        canReview: false,
      };

    case "agi":
      return {
        canView,
        canCreate: has(AGI_MANAGE_ROLES),
        canEdit: has(AGI_MANAGE_ROLES),
        canApprove: false,
        canSign: false,
        canDelete: false,
        canReview: false,
      };

    case "readiness":
      return {
        canView,
        canCreate: has(READINESS_ADMIN_ROLES),
        canEdit: has(READINESS_ADMIN_ROLES),
        canApprove: false,
        canSign: false,
        canDelete: has(READINESS_ADMIN_ROLES),
        canReview: false,
      };

    // dashboard + audit-trail are view-only surfaces.
    case "dashboard":
    case "audit-trail":
    default:
      return { canView, ...NONE };
  }
}
