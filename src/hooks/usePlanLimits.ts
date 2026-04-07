import { useTenantConfig } from "./useTenantConfig";
import { useTenantData } from "./useTenantData";

const PLAN_LIMITS: Record<string, { sites: number; users: number; findings: number; systems: number }> = {
  trial:        { sites: 1,  users: 3,  findings: 50, systems: 3 },
  professional: { sites: 3,  users: 15, findings: -1, systems: -1 },
  enterprise:   { sites: -1, users: -1, findings: -1, systems: -1 },
};

export function usePlanLimits() {
  const { tenantPlan, allSites, users } = useTenantConfig();
  const { findings, systems } = useTenantData();

  const limits = PLAN_LIMITS[tenantPlan] ?? PLAN_LIMITS.trial;

  const counts = {
    sites: allSites.length,
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

  return { limits, tenantPlan, isAtLimit, isNearLimit, getCount, getLimit };
}
