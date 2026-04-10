import { useAppSelector } from "./useAppSelector";
import type { TenantOrgConfig, TenantSiteConfig, TenantUserConfig, SubscriptionPlan } from "@/store/auth.slice";
import dayjs from "@/lib/dayjs";

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
    if (currentUser?.role === "customer_admin") return allSites;
    if (currentUser?.role === "qa_head") return allSites;
    return allSites.filter((s) => userConfig.assignedSites.includes(s.id));
  })();

  // ── Subscription helpers ──
  const subscriptionPlans: SubscriptionPlan[] = tenant?.subscriptionPlans ?? [];
  const activePlan = subscriptionPlans.find((p) => p.status === "Active") ?? null;

  const daysRemaining = activePlan
    ? Math.max(0, dayjs.utc(activePlan.endDate).diff(dayjs(), "day"))
    : null;

  const isExpired = activePlan
    ? dayjs().isAfter(dayjs.utc(activePlan.endDate))
    : true;

  const isNearExpiry = daysRemaining !== null && daysRemaining <= 14 && daysRemaining > 0;

  const maxAccounts = activePlan?.maxAccounts ?? 0;
  const usedAccounts = users.length;

  const accountsRemaining = maxAccounts === -1 ? -1 : Math.max(0, maxAccounts - usedAccounts);
  const isAtAccountLimit = maxAccounts !== -1 && usedAccounts >= maxAccounts;

  return {
    tenantId: currentTenantId ?? "",
    tenantName: tenant?.name ?? "Pharma Glimmora",
    tenantPlan: tenant?.plan ?? ("enterprise" as const),
    org: config?.org ?? DEFAULT_ORG,
    sites: accessibleSites,
    allSites,
    users,
    userConfig,
    // subscription
    subscriptionPlans,
    activePlan,
    daysRemaining,
    isExpired,
    isNearExpiry,
    maxAccounts,
    usedAccounts,
    accountsRemaining,
    isAtAccountLimit,
  };
}
