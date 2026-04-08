import { useAppSelector } from "./useAppSelector";
import type { RoleKey, ModuleKey } from "@/store/permissions.slice";

export type UserRole = RoleKey;

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  customer_admin: "Customer Admin",
  qa_head: "QA Head",
  qc_lab_director: "QC/Lab Director",
  regulatory_affairs: "Regulatory Affairs",
  csv_val_lead: "CSV/Val Lead",
  it_cdo: "IT/CDO",
  operations_head: "Operations Head",
  viewer: "Viewer",
};

/** Maps module keys to route paths for sidebar/nav */
const MODULE_PATHS: Record<ModuleKey, string> = {
  dashboard: "/",
  gap: "gap-assessment",
  capa: "capa",
  csv: "csv-csa",
  fda483: "fda-483",
  evidence: "evidence",
  agi: "agi-console",
  governance: "governance",
  settings: "settings",
};

export function useRole() {
  const user = useAppSelector((s) => s.auth.user);
  const matrix = useAppSelector((s) => s.permissions?.matrix);
  const role = (user?.role ?? "viewer") as RoleKey;

  function getAccess(mod: ModuleKey) {
    return matrix?.[role]?.[mod] ?? "none";
  }

  function canAccessModule(mod: ModuleKey) {
    return getAccess(mod) !== "none";
  }

  function canEdit(mod: ModuleKey) {
    const level = getAccess(mod);
    return level === "full" || level === "limited";
  }

  // Legacy path-based canAccess for sidebar/router compatibility
  function canAccess(path: string) {
    // Check if path matches any module
    for (const [mod, p] of Object.entries(MODULE_PATHS)) {
      if (p === path || path === `/${p}`) {
        return canAccessModule(mod as ModuleKey);
      }
    }
    // Default allow for root path
    if (path === "/") return canAccessModule("dashboard");
    return true;
  }

  const allowedPaths = (Object.entries(MODULE_PATHS) as [ModuleKey, string][])
    .filter(([mod]) => canAccessModule(mod))
    .map(([, path]) => path);

  const gxp = user?.gxpSignatory === true;

  return {
    role,
    getAccess,
    canAccessModule,
    canEdit,
    canAccess,
    canSign: gxp && canEdit("capa"),
    canCloseCapa: gxp && (role === "qa_head" || role === "super_admin" || role === "customer_admin"),
    canApproveDocs: gxp && canEdit("evidence"),
    canEditSettings: canEdit("settings"),
    canViewAGI: canAccessModule("agi"),
    canView483: canAccessModule("fda483"),
    isViewOnly: role === "viewer" || (matrix?.[role] ? Object.values(matrix[role]).every((v) => v === "readonly" || v === "none") : false),
    allowedPaths,
  };
}
