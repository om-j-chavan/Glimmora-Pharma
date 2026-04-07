import { useAppSelector } from "./useAppSelector";
import { useTenantConfig } from "./useTenantConfig";

export function useActiveSite() {
  const activeSiteId = useAppSelector((s) => s.auth.activeSiteId);
  const { allSites } = useTenantConfig();
  return activeSiteId ? allSites.find((s) => s.id === activeSiteId) ?? null : null;
}
