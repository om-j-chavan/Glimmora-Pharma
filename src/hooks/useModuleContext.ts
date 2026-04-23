import { useAppDispatch } from "./useAppDispatch";
import { useAppSelector } from "./useAppSelector";
import { usePermissions } from "./usePermissions";
import { useRole } from "./useRole";
import { useTenantConfig } from "./useTenantConfig";
import { useTenantData } from "./useTenantData";

/**
 * Shared context hook for module pages.
 * Reduces boilerplate — 6 hook calls → 1.
 */
export function useModuleContext() {
  const dispatch = useAppDispatch();
  const permissions = usePermissions();
  const { role, isViewOnly, canSign, canCloseCapa } = useRole();
  const authUser = useAppSelector((s) => s.auth.user);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const tenantData = useTenantData();
  const tenantConfig = useTenantConfig();

  return {
    dispatch,
    permissions,
    role,
    isViewOnly,
    canSign,
    canCloseCapa,
    authUser,
    isDark,
    selectedSiteId,
    ...tenantData,
    ...tenantConfig,
  };
}
