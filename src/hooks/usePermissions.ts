import { useAppSelector } from "./useAppSelector";

export function usePermissions() {
  const user = useAppSelector((s) => s.auth.user);
  const role = user?.role ?? "viewer";

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
    canSignCloseCAPA: isQAHead && user?.gxpSignatory === true,
    canRejectCAPA: isQAHead,
    canExportCAPAs: true,

    // FDA 483
    canCreateEvents: !isCustomerAdmin && !isViewer,
    canSubmitFDA: isQAHead && user?.gxpSignatory === true,
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
