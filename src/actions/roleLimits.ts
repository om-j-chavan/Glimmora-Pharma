"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions/roleSets";
import {
  CAP_ELIGIBLE_ROLES,
  resolveRoleUsage,
  getPlanRoleMatrix,
  getTenantRoleMatrixSummary,
  type RoleMatrixSummary,
} from "@/lib/roleLimits";
import { roleLabel } from "@/lib/labels/roles";
import { planLabel, PLAN_FIELD_BOUNDS, type PlanTier } from "@/lib/plans";

/**
 * Role-Based User Limits — Phase B cap-CONFIG write actions.
 *
 * Two server actions let a Super Admin set per-role caps: PlanRoleLimit defaults
 * and TenantRoleLimit overrides. Their UI is Phase C — these just expose the
 * write path with the two locked invariants enforced server-side. NOT wired into
 * any screen yet.
 *
 * Rules (all locked):
 *   • isPlatformAdmin-gated — ONLY Super Admin configures caps.
 *   • Audit-FIRST — the audit row is written before the mutation.
 *   • cap = null → REMOVE the row; a whole number in [0, maxUsers] → upsert
 *     (0 disables the role). Every cap-eligible role carries a concrete cap.
 *   • INVARIANT 1 (full allocation): the resulting caps must sum EXACTLY to the
 *     plan total (plan.maxUsers) — no unallocated pool, no over-allocation.
 *   • BOUND: each cap ∈ [0, maxUsers].
 *   • INVARIANT 2 (no stranding): a cap being SET must be ≥ that role's CURRENT
 *     usage (incl. inactive) — you can't cap below the people already in the role.
 */

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/* ── READ actions (Phase C UIs call these; they only read the resolver) ── */

export interface RoleLimitPlanOption {
  planId: string;
  tenantId: string;
  tenantName: string;
  tier: string;
  label: string;
  maxUsers: number;
}

/** SA: every tenant's plan, for the Role Limits module selector (grouped by tier). */
export async function listRoleLimitPlans(): Promise<ActionResult<RoleLimitPlanOption[]>> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) return { success: false, error: "Access denied" };
  const plans = await prisma.plan.findMany({
    where: { tenant: { deletedAt: null } },
    select: { id: true, tenantId: true, tier: true, displayName: true, maxUsers: true, tenant: { select: { name: true } } },
    orderBy: [{ tier: "asc" }, { tenant: { name: "asc" } }],
  });
  return {
    success: true,
    data: plans.map((p) => ({
      planId: p.id,
      tenantId: p.tenantId,
      tenantName: p.tenant.name,
      tier: p.tier,
      label: planLabel(p.tier as PlanTier, p.displayName),
      maxUsers: p.maxUsers,
    })),
  };
}

/** SA: plan-DEFAULT matrix for the Role Limits module. */
export async function getPlanRoleMatrixAction(planId: string): Promise<ActionResult<RoleMatrixSummary & { planId: string; tenantId: string }>> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) return { success: false, error: "Access denied" };
  const matrix = await getPlanRoleMatrix(planId);
  if (!matrix) return { success: false, error: "Plan not found" };
  return { success: true, data: matrix };
}

/** SA: effective per-tenant matrix (tenant detail + Add-User dropdown on a tenant). */
export async function getTenantRoleMatrixAction(tenantId: string): Promise<ActionResult<RoleMatrixSummary & { tenantId: string }>> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) return { success: false, error: "Access denied" };
  return { success: true, data: await getTenantRoleMatrixSummary(tenantId) };
}

/**
 * CA (or any authed user): the caller's OWN tenant matrix — READ-ONLY. Scoped to
 * session.user.tenantId, so it can never read another tenant and exposes no write.
 * Powers the CA Subscription tab + the CA Add-User dropdown usage.
 */
export async function getMyRoleMatrix(): Promise<ActionResult<RoleMatrixSummary & { tenantId: string }>> {
  const session = await requireAuth();
  return { success: true, data: await getTenantRoleMatrixSummary(session.user.tenantId) };
}

/** Map of role → cap (a positive int to set, or null to remove/uncap). */
export type RoleLimitInput = Record<string, number | null>;

/** Shared validation: roles must be cap-eligible; caps are whole numbers ≥ 0
 *  (0 = the role is disabled) or null (= remove/unlimited). */
function validateShape(limits: RoleLimitInput): string | null {
  const entries = Object.entries(limits);
  if (entries.length === 0) return "No role limits supplied.";
  for (const [role, cap] of entries) {
    if (!CAP_ELIGIBLE_ROLES.includes(role)) return `Unknown or non-cappable role: ${role}`;
    if (cap !== null && (!Number.isInteger(cap) || cap < 0)) {
      return `${roleLabel(role)} cap must be a whole number of 0 or more (or null to remove it).`;
    }
  }
  return null;
}

/** BOUND — a single role's cap can't exceed the plan total NOR the per-role
 *  ceiling (kills "10,000 for one role" and, for TAILORED, keeps the computed
 *  Total = Σ caps from running away). Min is enforced by validateShape (≥ 0). */
function assertWithinBounds(limits: RoleLimitInput, maxUsers: number): string | null {
  const perRoleMax = PLAN_FIELD_BOUNDS.roleCap.max;
  for (const [role, cap] of Object.entries(limits)) {
    if (cap === null) continue;
    if (cap > maxUsers) {
      return `${roleLabel(role)} cap can't exceed the plan total of ${maxUsers} user${maxUsers === 1 ? "" : "s"}.`;
    }
    if (cap > perRoleMax) {
      return `${roleLabel(role)} cap can't exceed ${perRoleMax} (per-role ceiling).`;
    }
  }
  return null;
}

/** INVARIANT 2 — no cap below current role usage (block-below-usage). */
async function assertNotBelowUsage(tenantId: string, limits: RoleLimitInput): Promise<string | null> {
  for (const [role, cap] of Object.entries(limits)) {
    if (cap === null) continue;
    const used = await resolveRoleUsage(tenantId, role);
    if (cap < used) {
      return `${used} user${used === 1 ? "" : "s"} already hold ${roleLabel(role)}; cap can't be below ${used}.`;
    }
  }
  return null;
}

/**
 * INVARIANT 1 — the resulting caps must sum EXACTLY to the plan total (every user
 * slot allocated to a role; no unallocated pool, no over-allocation). `existing`
 * are the current rows; `limits` is the incoming change (null removes a row).
 * Rejects both under- and over-allocation.
 */
function assertSumEqualsTotal(
  existing: { role: string; cap: number }[],
  limits: RoleLimitInput,
  total: number,
): string | null {
  const merged = new Map<string, number>();
  for (const r of existing) merged.set(r.role, r.cap);
  for (const [role, cap] of Object.entries(limits)) {
    if (cap === null) merged.delete(role);
    else merged.set(role, cap);
  }
  const sum = [...merged.values()].reduce((a, b) => a + b, 0);
  if (sum !== total) {
    return `Role caps must sum to exactly the plan total of ${total} user${total === 1 ? "" : "s"} (currently ${sum} — ${sum > total ? "over" : "under"} by ${Math.abs(sum - total)}).`;
  }
  return null;
}

/**
 * Set a PLAN's DEFAULT per-role caps (PlanRoleLimit). Plan is 1:1 with Tenant,
 * so usage/total are read from that plan's tenant.
 */
export async function setPlanRoleLimits(planId: string, limits: RoleLimitInput): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can configure role limits." };
  }
  const shapeErr = validateShape(limits);
  if (shapeErr) return { success: false, error: shapeErr };

  const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true, tenantId: true, maxUsers: true } });
  if (!plan) return { success: false, error: "Plan not found." };

  const boundsErr = assertWithinBounds(limits, plan.maxUsers);
  if (boundsErr) return { success: false, error: boundsErr };

  const usageErr = await assertNotBelowUsage(plan.tenantId, limits);
  if (usageErr) return { success: false, error: usageErr };

  const existing = await prisma.planRoleLimit.findMany({ where: { planId: plan.id }, select: { role: true, cap: true } });
  const sumErr = assertSumEqualsTotal(existing, limits, plan.maxUsers);
  if (sumErr) return { success: false, error: sumErr };

  // Audit-first.
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "Admin",
      action: "PLAN_ROLE_LIMITS_SET",
      recordId: plan.tenantId,
      newValue: JSON.stringify(limits),
    },
  });

  await applyLimits("plan", plan.id, limits);
  revalidatePath("/admin");
  return { success: true, data: { planId: plan.id, limits } };
}

/**
 * Set a TENANT's per-role cap OVERRIDES (TenantRoleLimit). Also the data path the
 * Phase-C "Tailored at creation" flow uses: the provisioning modal reads
 * resolveTenantRoleMatrix() (which already surfaces plan defaults as the starting
 * values), lets the admin edit, and calls this to persist the overrides.
 */
export async function setTenantRoleLimits(tenantId: string, limits: RoleLimitInput): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can configure role limits." };
  }
  const shapeErr = validateShape(limits);
  if (shapeErr) return { success: false, error: shapeErr };

  // Tenant total = its plan's maxUsers.
  const plan = await prisma.plan.findUnique({ where: { tenantId }, select: { maxUsers: true } });
  if (!plan) return { success: false, error: "This tenant has no plan; assign a plan before setting role limits." };

  const boundsErr = assertWithinBounds(limits, plan.maxUsers);
  if (boundsErr) return { success: false, error: boundsErr };

  const usageErr = await assertNotBelowUsage(tenantId, limits);
  if (usageErr) return { success: false, error: usageErr };

  const existing = await prisma.tenantRoleLimit.findMany({ where: { tenantId }, select: { role: true, cap: true } });
  const sumErr = assertSumEqualsTotal(existing, limits, plan.maxUsers);
  if (sumErr) return { success: false, error: sumErr };

  // Audit-first.
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "Admin",
      action: "TENANT_ROLE_LIMITS_SET",
      recordId: tenantId,
      newValue: JSON.stringify(limits),
    },
  });

  await applyLimits("tenant", tenantId, limits);
  revalidatePath("/admin");
  return { success: true, data: { tenantId, limits } };
}

/** Apply the merged write: upsert numeric caps, delete nulls (uncap). */
async function applyLimits(scope: "plan" | "tenant", ownerId: string, limits: RoleLimitInput): Promise<void> {
  const ops = Object.entries(limits).map(([role, cap]) => {
    if (scope === "plan") {
      return cap === null
        ? prisma.planRoleLimit.deleteMany({ where: { planId: ownerId, role } })
        : prisma.planRoleLimit.upsert({
            where: { planId_role: { planId: ownerId, role } },
            update: { cap },
            create: { planId: ownerId, role, cap },
          });
    }
    return cap === null
      ? prisma.tenantRoleLimit.deleteMany({ where: { tenantId: ownerId, role } })
      : prisma.tenantRoleLimit.upsert({
          where: { tenantId_role: { tenantId: ownerId, role } },
          update: { cap },
          create: { tenantId: ownerId, role, cap },
        });
  });
  await prisma.$transaction(ops);
}
