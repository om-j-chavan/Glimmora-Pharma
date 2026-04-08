import { useAppSelector } from "./useAppSelector";
import { useTenantConfig } from "./useTenantConfig";

export function useActiveSite() {
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { allSites } = useTenantConfig();
  return selectedSiteId ? allSites.find((s) => s.id === selectedSiteId) ?? null : null;
}
