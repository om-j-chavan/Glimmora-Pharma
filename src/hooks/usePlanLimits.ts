import { useTenantConfig } from "./useTenantConfig";
import { useTenantData } from "./useTenantData";

export function usePlanLimits() {
  // Subscription Phase A — caps come from the tenant's assigned plan (frozen
  // at assignment), not hardcoded tier constants. findings/systems are not
  // capped in Phase A, so they read as unlimited (-1).
  const { plan, planTier, allSitesIncludingInactive, users } = useTenantConfig();
  const { findings, systems } = useTenantData();

  const limits = {
    sites: plan?.maxSites ?? 0,
    users: plan?.maxUsers ?? 0,
    findings: -1,
    systems: -1,
  };

  const counts = {
    sites: allSitesIncludingInactive.length,
    users: users.length,
    findings: findings.length,
    systems: systems.length,
  };

  type Resource = keyof typeof limits;

  function getCount(r: Resource) { return counts[r]; }
  function getLimit(r: Resource) { return limits[r]; }

  function isAtLimit(r: Resource) {
    const l = limits[r];
    return l !== -1 && counts[r] >= l;
  }

  function isNearLimit(r: Resource) {
    const l = limits[r];
    return l !== -1 && counts[r] / l >= 0.8;
  }

  return { limits, tenantPlan: planTier, isAtLimit, isNearLimit, getCount, getLimit };
}
