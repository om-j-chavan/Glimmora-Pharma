/**
 * Tenant plan / effective-status helpers (Subscription Phase A).
 *
 * Two orthogonal concepts — keep them separate:
 *  1. LIFECYCLE — the stored Tenant.isActive boolean. true = "Active",
 *     false = "Suspended". This is the only lifecycle state in Phase 1.
 *  2. PLAN STATE — whether the tenant has a usable (present, non-expired)
 *     plan. "No plan" and "Expired" are plan-state badges, NOT lifecycle
 *     states.
 *
 * The login/app gate blocks a tenant's users when EITHER the tenant is
 * suspended OR its plan is unusable — but the two reasons are reported
 * distinctly so the UI can show the right message.
 *
 * These helpers are pure — safe on the server (NextAuth authorize, API
 * routes) and the client (admin console rendering).
 */

interface PlanLike {
  expiryDate?: string;
}

type TenantLike = { active?: boolean; plan?: PlanLike | null };

/** A plan is usable when it exists and has not passed its expiry date. */
export function isPlanUsable(plan: PlanLike | null | undefined): boolean {
  if (!plan) return false;
  const expiry = plan.expiryDate;
  if (!expiry) return false;
  const expiryTs = Date.parse(expiry);
  if (Number.isNaN(expiryTs)) return false;
  return expiryTs > Date.now();
}

/** Returns true if the tenant has a usable plan. */
export function hasValidSubscription(tenant: TenantLike): boolean {
  return isPlanUsable(tenant.plan ?? null);
}

/** Plan-state badge value, independent of lifecycle. */
export function planState(tenant: TenantLike): "none" | "expired" | "ok" {
  if (!tenant.plan) return "none";
  return isPlanUsable(tenant.plan) ? "ok" : "expired";
}

/** Stored lifecycle label — Active (isActive true) or Suspended (false). */
export function lifecycleLabel(active: boolean | undefined): "Active" | "Suspended" {
  return active === false ? "Suspended" : "Active";
}

/**
 * Final "can this tenant's users actually log in and work" flag.
 * Suspended lifecycle OR an unusable plan both block. (Semantics preserved
 * from the pre-Plan gate so auth/AppShell behaviour is unchanged.)
 */
export function isTenantEffectivelyActive(tenant: TenantLike): boolean {
  if (tenant.active === false) return false;
  return hasValidSubscription(tenant);
}

/** Why the tenant is blocked — human-readable reason, or null if usable. */
export function getInactiveReason(tenant: TenantLike): string | null {
  if (tenant.active === false) return "Account has been suspended by the platform admin.";
  switch (planState(tenant)) {
    case "none":
      return "No plan assigned. Please contact your administrator.";
    case "expired":
      return "Your plan has expired. Please contact your administrator to renew.";
    default:
      return null;
  }
}
