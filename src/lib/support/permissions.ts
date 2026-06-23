import type { AuthSession } from "@/lib/auth";

/**
 * Support authorization. Centralised so visibility + management rules are
 * enforced identically in queries AND every server action.
 *
 * SUPPORT_MANAGE_ROLES is the single extension point: adding a future
 * "support_agent" role = add the string here. No call site changes.
 */
export const SUPPORT_MANAGE_ROLES = new Set<string>(["super_admin"]);

export function canManageSupport(role: string): boolean {
  return SUPPORT_MANAGE_ROLES.has(role);
}

/** True when the role sees every tenant's tickets (central support). */
export function isCrossTenantSupport(role: string): boolean {
  return role === "super_admin";
}

/**
 * Prisma `where` fragment scoping a ticket list to what the session may see:
 *  - super_admin            → {} (all tenants)
 *  - customer_admin         → own tenant (all of its tickets)
 *  - any other tenant user  → own tenant AND only tickets they raised
 *
 * Returned as a spreadable object so callers compose it with other filters.
 */
export function ticketScopeWhere(session: AuthSession): Record<string, unknown> {
  const { role, tenantId, id } = session.user;
  if (isCrossTenantSupport(role)) return {};
  if (role === "customer_admin") return { tenantId };
  return { tenantId, requesterId: id };
}

/** Minimal shape needed to authorize an individual ticket. */
export interface TicketAuthFields {
  tenantId: string;
  requesterId: string;
}

/** Can the session VIEW this ticket? (mirrors ticketScopeWhere for one row). */
export function canViewTicket(session: AuthSession, t: TicketAuthFields): boolean {
  const { role, tenantId, id } = session.user;
  if (isCrossTenantSupport(role)) return true;
  if (t.tenantId !== tenantId) return false;
  if (role === "customer_admin") return true;
  return t.requesterId === id;
}

/** The requester (or a manager) — used for confirm-resolution / reopen / cancel. */
export function isRequester(session: AuthSession, t: TicketAuthFields): boolean {
  return t.requesterId === session.user.id;
}
