import { useAppSelector } from "./useAppSelector";
import type { TenantOrgConfig, TenantSiteConfig, TenantUserConfig } from "@/store/auth.slice";

const DEFAULT_ORG: TenantOrgConfig = {
  companyName: "Pharma Glimmora",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  regulatoryRegion: "India",
};

export function useTenantConfig() {
  const currentTenantId = useAppSelector((s) => s.auth.currentTenant);
  const currentUser = useAppSelector((s) => s.auth.user);
  const tenants = useAppSelector((s) => s.auth.tenants);
  const tenant = tenants.find((t) => t.id === currentTenantId);
  const config = tenant?.config;

  const allSites = (config?.sites ?? []) as TenantSiteConfig[];
  const users = (config?.users ?? []) as TenantUserConfig[];

  const userConfig = users.find((u) => u.id === currentUser?.id);

  const accessibleSites = (() => {
    if (!userConfig) return allSites;
    if (userConfig.allSites) return allSites;
    if (currentUser?.role === "super_admin") return allSites;
    if (currentUser?.role === "qa_head") return allSites;
    return allSites.filter((s) => userConfig.assignedSites.includes(s.id));
  })();

  return {
    tenantId: currentTenantId ?? "",
    tenantName: tenant?.name ?? "Pharma Glimmora",
    tenantPlan: tenant?.plan ?? ("enterprise" as const),
    org: config?.org ?? DEFAULT_ORG,
    sites: accessibleSites,
    allSites,
    users,
    userConfig,
  };
}
