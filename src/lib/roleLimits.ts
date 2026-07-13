import { prisma } from "@/lib/prisma";
import { CAP_ELIGIBLE_ROLES } from "@/lib/labels/roles";

/**
 * Role-Based User Limits — Phase A resolver (INERT foundation).
 *
 * This is the SINGLE SOURCE OF TRUTH for "what is role R's effective cap for
 * tenant T, and how much is used". It is DEFINED-BUT-UNWIRED in Phase A: nothing
 * in the create-user path, the UI, or any gate calls it yet (grep-confirmed).
 * Enforcement (extending assertCanAddUser), the config-time invariants, and the
 * matrix UI all land in Phase B/C. Adding this file changes NO behavior.
 *
 * Locked design:
 *   • HYBRID storage — PlanRoleLimit (plan defaults) + TenantRoleLimit (per-tenant
 *     overrides). See prisma/schema.prisma.
 *   • Resolution order — tenant override → plan default → UNLIMITED.
 *   • Uncapped = unlimited. Absence of a row means "no cap", NEVER cap = 0.
 *     A not-configured tenant (zero rows in both tables) is total-only, unchanged.
 *   • Counts INCLUDE inactive users — identical semantics to assertCanAddUser's
 *     total count (`prisma.user.count({ where: { tenantId } })`, no isActive filter),
 *     so a per-role count and the total count never disagree on who holds a seat.
 *
 * PURITY: these functions do NO gating. The super_admin / isPlatformAdmin
 * exemption is an ENFORCEMENT concern and lives in Phase B (the caller), never
 * here — the resolver just reports caps and usage.
 */

/** Effective cap for a role: a concrete number, or the "unlimited" sentinel. */
export type RoleCap = number | "unlimited";

/**
 * Canonical role vocabulary eligible for capping. Defined in the pure
 * `@/lib/labels/roles` (so client components can import it without pulling
 * Prisma through this server module) and re-exported here for server callers.
 */
export { CAP_ELIGIBLE_ROLES };

/**
 * Effective cap for (tenant, role): tenant override → plan default → unlimited.
 * Pure read; no gating. Returns "unlimited" when neither table has a row.
 */
export async function resolveRoleCap(tenantId: string, role: string): Promise<RoleCap> {
  // 1) Per-tenant override wins.
  const override = await prisma.tenantRoleLimit.findUnique({
    where: { tenantId_role: { tenantId, role } },
    select: { cap: true },
  });
  if (override) return override.cap;

  // 2) Plan default (Plan is 1:1 with Tenant — look it up by tenantId).
  const plan = await prisma.plan.findUnique({ where: { tenantId }, select: { id: true } });
  if (plan) {
    const planDefault = await prisma.planRoleLimit.findUnique({
      where: { planId_role: { planId: plan.id, role } },
      select: { cap: true },
    });
    if (planDefault) return planDefault.cap;
  }

  // 3) No row anywhere → unlimited (parity default).
  return "unlimited";
}

/**
 * Users currently holding (tenant, role). INCLUDES inactive users — same rule as
 * assertCanAddUser's total count (no isActive filter), so per-role and total
 * counts stay in lockstep.
 */
export async function resolveRoleUsage(tenantId: string, role: string): Promise<number> {
  return prisma.user.count({ where: { tenantId, role } });
}

/** One matrix row: the effective cap, current usage, and remaining headroom. */
export interface RoleMatrixRow {
  role: string;
  cap: RoleCap;
  used: number;
  /** cap - used (floored at 0), or "unlimited" when the role is uncapped. */
  remaining: RoleCap;
}

/**
 * The per-tenant role matrix Phase C's UIs will read: for every cap-eligible
 * role → { cap | "unlimited", used, remaining }. Built now, left UNCONSUMED.
 *
 * Batched (constant number of queries regardless of role count) but preserves
 * the exact resolution order of resolveRoleCap: override → plan default →
 * unlimited. Usage via groupBy counts ALL users (active + inactive).
 */
export async function resolveTenantRoleMatrix(tenantId: string): Promise<RoleMatrixRow[]> {
  const plan = await prisma.plan.findUnique({ where: { tenantId }, select: { id: true } });
  const [overrides, planDefaults, usageRows] = await Promise.all([
    prisma.tenantRoleLimit.findMany({ where: { tenantId }, select: { role: true, cap: true } }),
    plan
      ? prisma.planRoleLimit.findMany({ where: { planId: plan.id }, select: { role: true, cap: true } })
      : Promise.resolve([] as { role: string; cap: number }[]),
    // INCLUDES inactive — no isActive filter (matches the total-count semantics).
    prisma.user.groupBy({ by: ["role"], where: { tenantId }, _count: { _all: true } }),
  ]);

  const overrideByRole = new Map(overrides.map((o) => [o.role, o.cap]));
  const defaultByRole = new Map(planDefaults.map((d) => [d.role, d.cap]));
  const usageByRole = new Map(usageRows.map((u) => [u.role, u._count._all]));

  return CAP_ELIGIBLE_ROLES.map((role) => {
    const cap: RoleCap = overrideByRole.has(role)
      ? overrideByRole.get(role)!
      : defaultByRole.has(role)
        ? defaultByRole.get(role)!
        : "unlimited";
    const used = usageByRole.get(role) ?? 0;
    const remaining: RoleCap = cap === "unlimited" ? "unlimited" : Math.max(0, cap - used);
    return { role, cap, used, remaining };
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * Phase C read helpers — presentation-facing views over the resolver. These
 * DERIVE status/summary from resolver output (cap + used); they do NOT
 * recompute the override→default→unlimited resolution (that stays in
 * resolveRoleCap / resolveTenantRoleMatrix). All shapes are JSON-safe so a
 * server component / action can hand them straight to a client component.
 * ──────────────────────────────────────────────────────────────────────── */

export type RoleCapStatus = "unlimited" | "ok" | "near" | "full";

/** Traffic-light status for a role row — purely a function of cap + used. */
export function roleCapStatus(cap: RoleCap, used: number): RoleCapStatus {
  if (cap === "unlimited") return "unlimited";
  if (cap <= 0 || used >= cap) return "full";
  if (used / cap >= 0.8) return "near";
  return "ok";
}

export interface RoleMatrixSummary {
  /** Plan total (maxUsers) this matrix is measured against. */
  total: number;
  /** Sum of the numeric role caps (uncapped roles contribute 0). */
  allocated: number;
  /** total − allocated (may be negative if mis-allocated; signed on purpose). */
  unallocated: number;
  /** allocated ≤ total. */
  withinTotal: boolean;
  rows: RoleMatrixRow[];
}

function summarize(rows: RoleMatrixRow[], total: number): RoleMatrixSummary {
  const allocated = rows.reduce((s, r) => s + (r.cap === "unlimited" ? 0 : r.cap), 0);
  return { total, allocated, unallocated: total - allocated, withinTotal: allocated <= total, rows };
}

/**
 * PLAN-DEFAULT matrix (the PlanRoleLimit layer only) + usage on the plan's
 * tenant. Feeds the SA "Role Limits" module, which configures plan defaults.
 * Returns null if the plan doesn't exist.
 */
export async function getPlanRoleMatrix(
  planId: string,
): Promise<(RoleMatrixSummary & { planId: string; tenantId: string }) | null> {
  const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true, tenantId: true, maxUsers: true } });
  if (!plan) return null;
  const [defaults, usageRows] = await Promise.all([
    prisma.planRoleLimit.findMany({ where: { planId }, select: { role: true, cap: true } }),
    prisma.user.groupBy({ by: ["role"], where: { tenantId: plan.tenantId }, _count: { _all: true } }),
  ]);
  const capByRole = new Map(defaults.map((d) => [d.role, d.cap]));
  const usageByRole = new Map(usageRows.map((u) => [u.role, u._count._all]));
  const rows: RoleMatrixRow[] = CAP_ELIGIBLE_ROLES.map((role) => {
    const cap: RoleCap = capByRole.has(role) ? capByRole.get(role)! : "unlimited";
    const used = usageByRole.get(role) ?? 0;
    const remaining: RoleCap = cap === "unlimited" ? "unlimited" : Math.max(0, cap - used);
    return { role, cap, used, remaining };
  });
  return { planId: plan.id, tenantId: plan.tenantId, ...summarize(rows, plan.maxUsers) };
}

/**
 * EFFECTIVE tenant matrix (override→default→unlimited via resolveTenantRoleMatrix)
 * + the plan total, summarized. Feeds the tenant-detail section and the CA
 * read-only view. Returns total=0 when the tenant has no plan.
 */
export async function getTenantRoleMatrixSummary(
  tenantId: string,
): Promise<RoleMatrixSummary & { tenantId: string }> {
  const [plan, rows] = await Promise.all([
    prisma.plan.findUnique({ where: { tenantId }, select: { maxUsers: true } }),
    resolveTenantRoleMatrix(tenantId),
  ]);
  return { tenantId, ...summarize(rows, plan?.maxUsers ?? 0) };
}
