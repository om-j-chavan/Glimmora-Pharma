import { useAppSelector } from "./useAppSelector";
import type { RoleKey, ModuleKey } from "@/store/permissions.slice";
import {
  getModuleCapabilities,
  computeModuleCanView,
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

    // Governance — customer_admin is read-only outside Settings, so it may read
    // and export the risk register but never manage it (mirrors the tightened
    // GOVERNANCE_MANAGE_ROLES / canCreateRisk server gates).
    canManageRAID: !isViewer && !isCustomerAdmin,
    canExportReports: !isViewer,

    // Training & Simulations — scheduling and scoring are BOTH QA-authority
    // judgments. customer_admin removed from canScheduleSimulation: it may view
    // the training programme but not schedule, score, or log against it.
    canScheduleSimulation: isQAHead,
    canUpdateTraining: isQAHead,
    canCompleteSimulation: isQAHead,
  };
}

export type LegacyPermissions = ReturnType<typeof buildLegacyPermissions>;

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
    const canView = computeModuleCanView(role, module, matrix);
    return getModuleCapabilities(role, gxp, canView, module, opts);
  }

  // Legacy flat object (back-compat for existing callers).
  return buildLegacyPermissions(role, gxp);
}
