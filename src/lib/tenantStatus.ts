/**
 * Tenant subscription / effective-status helpers.
 *
 * Rule: a customer_admin (and anyone else in that tenant) should be treated
 * as INACTIVE when the tenant has no subscription plan, or the active plan
 * is past its expiry date. The super_admin's manual `tenant.active` flag is
 * still honoured on top of that.
 *
 * These helpers are pure — safe to call on the server (NextAuth authorize,
 * API routes) or on the client (admin console rendering).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TenantLike = { active?: boolean; subscriptionPlans?: any[] };

interface SubPlanLike {
  status?: "Active" | "Inactive";
  expiryDate?: string;
  endDate?: string;
  startDate?: string;
}

/** Returns true if the plan is marked Active AND has a future expiry. */
export function isPlanUsable(plan: SubPlanLike | null | undefined): boolean {
  if (!plan) return false;
  if (plan.status && plan.status !== "Active") return false;
  const expiry = plan.expiryDate ?? plan.endDate;
  if (!expiry) return false;
  const expiryTs = Date.parse(expiry);
  if (Number.isNaN(expiryTs)) return false;
  return expiryTs > Date.now();
}

/** Returns true if the tenant has at least one usable subscription plan. */
export function hasValidSubscription(tenant: TenantLike): boolean {
  const plans = tenant.subscriptionPlans ?? [];
  if (plans.length === 0) return false;
  return plans.some((p) => isPlanUsable(p));
}

/**
 * Final "can this tenant's users actually log in and work" flag.
 * Super admin's manual flag × subscription validity.
 */
export function isTenantEffectivelyActive(tenant: TenantLike): boolean {
  if (tenant.active === false) return false;
  return hasValidSubscription(tenant);
}

/** Why the tenant is inactive — human-readable reason, or null if active. */
export function getInactiveReason(tenant: TenantLike): string | null {
  if (tenant.active === false) return "Account has been deactivated by the platform admin.";
  const plans = tenant.subscriptionPlans ?? [];
  if (plans.length === 0) return "No subscription plan configured. Please contact your administrator.";
  if (!plans.some((p) => isPlanUsable(p))) {
    // Distinguish expired vs never-active
    const hasActive = plans.some((p) => p.status === "Active");
    if (!hasActive) return "No active subscription plan. Please contact your administrator.";
    return "Your subscription plan has expired. Please contact your administrator to renew.";
  }
  return null;
}
