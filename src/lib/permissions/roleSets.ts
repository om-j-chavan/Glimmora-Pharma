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
 * Contents unchanged — super_admin is listed but blocked at author-time by
 * requireGxPAuthor / canAuthorGxP. */
export const COMPLIANCE_AUTHOR_ROLES: readonly string[] = [
  "csv_val_lead",
  "qa_head",
  "regulatory_affairs",
  "customer_admin",
  "super_admin",
];

/** Admin-tier destructive deletes (findings / CAPA / deviation). Effective
 *  deleter is customer_admin (super_admin blocked by canAuthorGxP). */
export const ADMIN_DELETE_ROLES: readonly string[] = ["customer_admin", "super_admin"];

/* ── CAPA lifecycle role-sets (mirror the inline server checks) ── */
export const CAPA_CLOSE_ROLES: readonly string[] = ["qa_head", "super_admin"];
export const CAPA_REJECT_ROLES: readonly string[] = ["qa_head", "super_admin"];
export const CAPA_DI_GATE_ROLES: readonly string[] = ["qa_head", "super_admin"];
export const CAPA_REOPEN_ROLES: readonly string[] = ["qa_head", "customer_admin", "super_admin"];

/** RCA review + alignment review share the same role-set today. */
export const CAPA_REVIEW_ROLES: readonly string[] = ["qa_head", "super_admin", "customer_admin"];
export function canReviewRCA(role: string): boolean {
  return CAPA_REVIEW_ROLES.includes(role);
}
export function canReviewAlignment(role: string): boolean {
  return CAPA_REVIEW_ROLES.includes(role);
}

/* ── CSV / CSA validation (systems.ts) ── */
export const CSV_SYSTEM_WRITE_ROLES: readonly string[] = ["csv_val_lead", "qa_head", "customer_admin", "super_admin"];
export const CSV_SYSTEM_DELETE_ROLES: readonly string[] = ["customer_admin", "super_admin"];
export const CSV_STAGE_REVIEW_ROLES: readonly string[] = ["qa_head", "customer_admin", "super_admin"];
export const CSV_SIGNOFF_ROLES: readonly string[] = ["qa_head", "super_admin"];
export const CSV_REVOKE_SIGNOFF_ROLES: readonly string[] = ["super_admin"];

/* ── Deviation (deviations.ts) ── create/edit = any non-viewer; QA decisions
 *   (close / reject / CAPA-decision) = qa_head/super_admin. ── */
export const DEVIATION_QA_ROLES: readonly string[] = ["qa_head", "super_admin"];
export function canWriteDeviation(role: string): boolean {
  return role !== "viewer";
}

/* ── FDA 483 (fda483.ts) ── create/edit = any non-viewer; sign & submit =
 *   qa_head/super_admin; delete = qa_head/customer_admin (Phase-6 cleanup
 *   FIX 4 — tightened from "any non-viewer via requireGxPAuthor" to the app's
 *   established admin-delete pattern; super_admin stays excluded by the wall). ── */
export const FDA483_SIGN_ROLES: readonly string[] = ["qa_head", "super_admin"];
export const FDA483_DELETE_ROLES: readonly string[] = ["qa_head", "customer_admin"];

/* ── CAPA module surface (Phase-6 cleanup FIX 1) ── The CAPA module (nav +
 *   /capa routes) is locked to qa_head + customer_admin (the matrix grants
 *   both `capa: full`); every other role reaches their CAPA work through the
 *   Worklist instead. super_admin is walled to /admin. Server action gates are
 *   unchanged (Phases 3-5 own those). */
export const CAPA_MODULE_VIEW_ROLES: readonly string[] = ["qa_head", "customer_admin"];

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

/* ── Governance (RAID) ── non-GxP; create = any non-viewer; manage = admin/QA ── */
export const GOVERNANCE_MANAGE_ROLES: readonly string[] = ["customer_admin", "super_admin", "qa_head"];

/* ── Inspection Readiness ── non-GxP; admin actions = QA Head / admins ── */
export const READINESS_ADMIN_ROLES: readonly string[] = ["qa_head", "customer_admin", "super_admin"];

/* ── Audit Trail ── view gate (route requireRoleOrDeny) ── */
export const AUDIT_TRAIL_VIEW_ROLES: readonly string[] = ["qa_head", "customer_admin", "super_admin"];

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
        canCreate: has(COMPLIANCE_AUTHOR_ROLES) && gxpOk,
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
