import { useAppSelector } from "./useAppSelector";
import type { RoleKey, ModuleKey } from "@/store/permissions.slice";
import {
  getModuleCapabilities,
  AUDIT_TRAIL_VIEW_ROLES,
  type ModuleCapabilities,
  type PermissionModule,
  type ApprovalTier,
} from "@/lib/permissions/roleSets";

/**
 * usePermissions — the comprehensive, per-module source of truth for UI
 * permission checks, computed FROM the shared role-set module
 * (src/lib/permissions/roleSets.ts) that the SERVER actions also import, so the
 * UI mirrors the server exactly and they can never drift.
 *
 * TWO call forms:
 *
 *   const can = usePermissions("capa", { capaRisk: capa.risk });
 *   // → { canView, canCreate, canEdit, canApprove, canSign, canDelete, canReview }
 *   //   super_admin is GxP-blocked: canCreate/Edit/Approve/Sign/Delete = false
 *   //   on every compliance module (it keeps canView).
 *
 *   const p = usePermissions();
 *   // → the LEGACY flat object (unchanged). Kept so every existing caller keeps
 *   //   working; migrate them to the per-module form in later passes.
 */

// ── Legacy flat API (UNCHANGED behaviour) ──────────────────────────────────
function buildLegacyPermissions(role: string, gxpSignatory: boolean) {
  const isSuperAdmin = role === "super_admin";
  const isCustomerAdmin = role === "customer_admin";
  const isQAHead = role === "qa_head";
  const isViewer = role === "viewer";

  return {
    role,
    isSuperAdmin,
    isCustomerAdmin,
    isQAHead,
    isViewer,

    // Settings
    canManageSettings: isSuperAdmin || isCustomerAdmin,
    canViewSettings: isQAHead || isSuperAdmin || isCustomerAdmin,

    // Gap Assessment
    canCreateFindings: !isCustomerAdmin && !isViewer,
    canApproveFindings: isQAHead || isSuperAdmin,
    canExportFindings: true,

    // CAPA
    canCreateCAPAs: !isCustomerAdmin && !isViewer,
    canEditCAPAs: !isCustomerAdmin && !isViewer,
    canClearDIGate: isQAHead,
    canSignCloseCAPA: isQAHead && gxpSignatory,
    canRejectCAPA: isQAHead,
    canExportCAPAs: true,

    // FDA 483
    canCreateEvents: !isCustomerAdmin && !isViewer,
    canSubmitFDA: isQAHead && gxpSignatory,
    canExportEvents: true,

    // Governance
    canManageRAID: !isViewer,
    canExportReports: !isViewer,

    // Training & Simulations
    canScheduleSimulation: isQAHead || isCustomerAdmin,
    canUpdateTraining: isQAHead,
    canCompleteSimulation: isQAHead,
  };
}

export type LegacyPermissions = ReturnType<typeof buildLegacyPermissions>;

// Matrix-keyed modules (the others — deviation / readiness / audit-trail — are
// not in the permissions matrix and get their canView from role-sets / nav).
const MATRIX_MODULES = new Set<string>([
  "dashboard", "gap", "capa", "csv", "fda483", "evidence", "agi", "governance", "settings",
]);

function computeCanView(
  role: string,
  module: PermissionModule,
  matrix: Record<RoleKey, Record<ModuleKey, string>> | undefined,
): boolean {
  // Modules not in the matrix.
  if (module === "deviation" || module === "readiness") return true; // nav always-on
  if (module === "audit-trail") return AUDIT_TRAIL_VIEW_ROLES.includes(role);
  // Matrix-driven modules: view = access level is not "none".
  if (!MATRIX_MODULES.has(module)) return true;
  const level = matrix?.[role as RoleKey]?.[module as ModuleKey] ?? "none";
  return level !== "none";
}

export function usePermissions(): LegacyPermissions;
export function usePermissions(
  module: PermissionModule,
  opts?: { capaRisk?: ApprovalTier },
): ModuleCapabilities;
export function usePermissions(
  module?: PermissionModule,
  opts?: { capaRisk?: ApprovalTier },
): LegacyPermissions | ModuleCapabilities {
  const user = useAppSelector((s) => s.auth.user);
  const matrix = useAppSelector((s) => s.permissions?.matrix) as
    | Record<RoleKey, Record<ModuleKey, string>>
    | undefined;
  const role = user?.role ?? "viewer";
  const gxp = user?.gxpSignatory === true;

  // New comprehensive per-module capability object.
  if (module) {
    const canView = computeCanView(role, module, matrix);
    return getModuleCapabilities(role, gxp, canView, module, opts);
  }

  // Legacy flat object (back-compat for existing callers).
  return buildLegacyPermissions(role, gxp);
}
