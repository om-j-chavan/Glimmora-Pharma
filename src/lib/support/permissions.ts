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

/* ── Two-hop escalation foundation (Phase A) ─────────────────────────────────
 * These are DEFINED but NOT YET WIRED into any action or query — Phase A is
 * schema + permission foundation only. No action opens to customer_admin and no
 * query filters on the tier yet (that's Phase B). `canManageSupport` above is
 * deliberately UNCHANGED (super_admin, cross-tenant). */

/** The two routing tiers a ticket's `currentHandler` can hold. Requesters
 *  ("other roles") occupy no tier — they raise, they don't handle. */
export type HandlerTier = "customer_admin" | "super_admin";

/**
 * NEW tenant-scoped FIRST-LINE handler capability (Phase A). Distinct from
 * `canManageSupport` (super_admin, cross-tenant): a customer_admin is the first
 * hop for their OWN tenant's tickets. super_admin is included because it can do
 * everything a first-liner can. Tenant-scoping itself is still enforced by the
 * existing `ticketScopeWhere` / `canViewTicket` — this predicate only answers
 * "does this role have the first-line capability at all".
 */
export function canHandleFirstLine(role: string): boolean {
  return role === "customer_admin" || role === "super_admin";
}

/** The routing tier a role occupies, or null for a requester (any other role).
 *  Drives the "routed to my tier" queues Phase B will build. */
export function handlerTierForRole(role: string): HandlerTier | null {
  if (role === "super_admin") return "super_admin";
  if (role === "customer_admin") return "customer_admin";
  return null;
}

/** Is this ticket currently routed to the given role's tier?
 *  (`currentHandler` === the role's tier). Takes a minimal shape so it does not
 *  couple to the Prisma Ticket type. */
export function isTicketRoutedToRole(role: string, ticket: { currentHandler: string }): boolean {
  const tier = handlerTierForRole(role);
  return tier !== null && ticket.currentHandler === tier;
}

/**
 * Phase B gate for the FIRST-LINE handler actions (reply-as-support, internal
 * note, status change, resolve/close). True for:
 *   - super_admin — cross-tenant manager, always; OR
 *   - a first-line handler (customer_admin) when the ticket is routed to their
 *     tier (currentHandler === "customer_admin") AND in their OWN tenant.
 * ASSIGNMENT is deliberately NOT gated by this — assign stays `canManageSupport`
 * (super_admin, cross-tenant). Callers must already have loaded the ticket
 * through `canViewTicket` (which tenant-pins a CA); the explicit tenant check
 * here is defence-in-depth so this predicate is safe on its own.
 */
export function canHandleTicket(
  session: AuthSession,
  ticket: { tenantId: string; currentHandler: string },
): boolean {
  if (canManageSupport(session.user.role)) return true;
  return (
    canHandleFirstLine(session.user.role) &&
    ticket.tenantId === session.user.tenantId &&
    isTicketRoutedToRole(session.user.role, ticket)
  );
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
