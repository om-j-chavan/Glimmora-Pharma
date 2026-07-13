import type { PrismaClient } from "@prisma/client";
import {
  PLAN_TIERS,
  LEGACY_TIER_MAXUSERS,
  ROLE_DEFAULT_WEIGHTS,
  distributeExact,
  legacyDefaultRoleCapsForPlan,
  type PlanTier,
} from "../src/lib/plans";
import { CAP_ELIGIBLE_ROLES } from "../src/lib/labels/roles";

/**
 * Seed / migrate per-plan role-cap DEFAULTS so every plan's caps sum EXACTLY to
 * its maxUsers (no ∞, no slack). Shared by prisma/seed.ts and the one-time
 * prisma/backfillRoleLimits.ts.
 *
 * RECONCILIATION RULE (update-defaults without clobbering admin edits):
 *   1. Fixed-tier plans adopt the rebalanced Plan caps (maxUsers/maxSites/retention);
 *      fixed tiers are never admin-editable, so this is safe.
 *   2. A PlanRoleLimit row is treated as ADMIN-EDITED when its cap ≠ the LEGACY
 *      default (what the seed produced before the rebalance, computed from the
 *      plan's OLD maxUsers). Those rows are KEPT verbatim.
 *   3. Every other (untouched) role is re-derived so that
 *      sum(kept edits) + sum(re-derived) == the plan's (new) maxUsers — i.e. the
 *      remaining budget is distributed exactly across the non-edited roles. This
 *      preserves edits AND satisfies sum == total.
 *
 * Idempotent: after migration a row equals the NEW default (≠ legacy), so a
 * re-run sees every row as "edited" and changes nothing.
 */
export async function seedPlanRoleLimits(prisma: PrismaClient): Promise<{ plans: number; plansUpdated: number; created: number; updated: number; keptEdited: number }> {
  const plans = await prisma.plan.findMany({ select: { id: true, tier: true, maxUsers: true } });
  let plansUpdated = 0;
  let created = 0;
  let updated = 0;
  let keptEdited = 0;

  for (const plan of plans) {
    const tier = plan.tier as PlanTier;
    const isFixed = tier !== "TAILORED";

    // (1) Fixed tiers adopt the rebalanced plan caps.
    let newMax = plan.maxUsers;
    if (isFixed) {
      const nt = PLAN_TIERS[tier as Exclude<PlanTier, "TAILORED">];
      newMax = nt.maxUsers;
      if (plan.maxUsers !== nt.maxUsers) plansUpdated += 1;
      await prisma.plan.update({
        where: { id: plan.id },
        data: { maxUsers: nt.maxUsers, maxSites: nt.maxSites, minRetentionYears: nt.minRetentionYears },
      });
    }

    // (2) Detect admin-edited rows (cap ≠ the legacy default at the OLD maxUsers).
    const legacyMax = isFixed ? LEGACY_TIER_MAXUSERS[tier as Exclude<PlanTier, "TAILORED">] : plan.maxUsers;
    const legacyDefaults = legacyDefaultRoleCapsForPlan(legacyMax);
    const existing = await prisma.planRoleLimit.findMany({ where: { planId: plan.id }, select: { role: true, cap: true } });
    const existingByRole = new Map(existing.map((e) => [e.role, e.cap]));

    const editedCaps: Record<string, number> = {};
    for (const role of CAP_ELIGIBLE_ROLES) {
      const cur = existingByRole.get(role);
      if (cur != null && cur !== legacyDefaults[role]) editedCaps[role] = cur;
    }

    // (3) Distribute the remaining budget across non-edited roles so sum == newMax.
    const editedSum = Object.values(editedCaps).reduce((a, b) => a + b, 0);
    const nonEdited = CAP_ELIGIBLE_ROLES.filter((r) => !(r in editedCaps));
    const filled = distributeExact(Math.max(0, newMax - editedSum), nonEdited, ROLE_DEFAULT_WEIGHTS);
    const finalCaps: Record<string, number> = { ...filled, ...editedCaps };

    // (4) Write: create missing, update untouched to the new value, keep edits.
    for (const role of CAP_ELIGIBLE_ROLES) {
      const target = finalCaps[role] ?? 0;
      const cur = existingByRole.get(role);
      if (cur == null) {
        await prisma.planRoleLimit.create({ data: { planId: plan.id, role, cap: target } });
        created += 1;
      } else if (role in editedCaps) {
        keptEdited += 1; // admin-edited — never clobbered
      } else if (cur !== target) {
        await prisma.planRoleLimit.update({ where: { planId_role: { planId: plan.id, role } }, data: { cap: target } });
        updated += 1;
      }
    }
  }

  return { plans: plans.length, plansUpdated, created, updated, keptEdited };
}
