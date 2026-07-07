import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/permissions/roleSets";

/**
 * Server-side plan-cap enforcement (Phase 1 exit gate).
 *
 * Caps are stored frozen on the tenant's plan (Plan.maxUsers / Plan.maxSites,
 * see src/lib/plans.ts). These helpers HARD-block creation past the cap; the
 * UI's >=80% amber treatment is a separate soft cue and is not relied upon
 * here. USER counts include ALL rows (active + inactive) — an inactive user
 * retains data / occupies storage, so it still holds a seat. SITE counts are of
 * ACTIVE rows only — a deactivated (isActive=false) site does NOT occupy a seat.
 */

export type CapBlockCode = "NO_PLAN_ASSIGNED" | "PLAN_EXPIRED" | "PLAN_CAP_EXCEEDED" | "SITE_CAP_EXCEEDED";

export interface CapResult {
  ok: boolean;
  /** Set when ok === false. Maps to src/lib/labels/errorCodes.ts. */
  code?: CapBlockCode;
}

/** The tenant's assigned plan, or null. */
export function resolveTenantPlan(tenantId: string) {
  return prisma.plan.findUnique({ where: { tenantId } });
}

/** Plan must exist and not be past its expiry date. */
async function loadUsablePlan(tenantId: string): Promise<{ plan: Awaited<ReturnType<typeof resolveTenantPlan>>; code?: CapBlockCode }> {
  const plan = await resolveTenantPlan(tenantId);
  if (!plan) return { plan: null, code: "NO_PLAN_ASSIGNED" };
  // Past expiry → blocked (mirrors the login / AppShell plan gate).
  if (new Date(plan.expiryDate).getTime() < Date.now()) return { plan, code: "PLAN_EXPIRED" };
  return { plan };
}

/**
 * Hard cap check for adding a USER. Counts ALL users (active + inactive) — a
 * deactivated user still occupies storage and retains their data, so they keep
 * consuming a seat. Returns { ok:true } or the block code.
 */
export async function assertCanAddUser(tenantId: string, role?: string): Promise<CapResult> {
  // super_admin (platform admin) is not a real tenant and has no plan — exempt
  // it BEFORE the plan lookup so the plan-less platform tenant never returns
  // NO_PLAN_ASSIGNED. Role-based, mirrors the tenant-lifecycle exemption.
  if (role && isPlatformAdmin(role)) return { ok: true };
  const { plan, code } = await loadUsablePlan(tenantId);
  if (!plan || code) return { ok: false, code: code ?? "NO_PLAN_ASSIGNED" };
  // Count ALL users (active + inactive). Inactive users still count toward the
  // plan limit — they retain data and occupy storage.
  const totalUsers = await prisma.user.count({ where: { tenantId } });
  if (totalUsers >= plan.maxUsers) return { ok: false, code: "PLAN_CAP_EXCEEDED" };
  return { ok: true };
}

/**
 * Hard cap check for adding a SITE. Counts ACTIVE sites only (isActive=true).
 */
export async function assertCanAddSite(tenantId: string, role?: string): Promise<CapResult> {
  // super_admin exemption — see assertCanAddUser (platform tenant has no plan).
  if (role && isPlatformAdmin(role)) return { ok: true };
  const { plan, code } = await loadUsablePlan(tenantId);
  if (!plan || code) return { ok: false, code: code ?? "NO_PLAN_ASSIGNED" };
  const activeSites = await prisma.site.count({ where: { tenantId, isActive: true } });
  if (activeSites >= plan.maxSites) return { ok: false, code: "SITE_CAP_EXCEEDED" };
  return { ok: true };
}
