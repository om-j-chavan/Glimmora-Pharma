import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/permissions/roleSets";
import { resolveRoleCap, resolveRoleUsage } from "@/lib/roleLimits";
import { roleLabel } from "@/lib/labels/roles";

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

export type CapBlockCode = "NO_PLAN_ASSIGNED" | "PLAN_EXPIRED" | "PLAN_CAP_EXCEEDED" | "SITE_CAP_EXCEEDED" | "ROLE_CAP_EXCEEDED";

export interface CapResult {
  ok: boolean;
  /** Set when ok === false. Maps to src/lib/labels/errorCodes.ts. */
  code?: CapBlockCode;
  /** Which layer blocked — "total" (plan/site total) or "role" (per-role cap).
   *  Phase C UIs use this to point the user at the right control. */
  cap?: "total" | "role";
  /** Ready-to-render, role-SPECIFIC message for ROLE_CAP_EXCEEDED
   *  (e.g. "QA Head limit reached (2/2)"). Undefined for total blocks. */
  message?: string;
  /** ROLE_CAP_EXCEEDED detail (the role that was full + its usage/cap). */
  role?: string;
  used?: number;
  limit?: number;
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
 * Hard cap check for adding a USER. Order is fixed (Phase B): EXEMPTION → TOTAL →
 * ROLE. Counts ALL users (active + inactive) at BOTH layers — a deactivated user
 * still occupies storage / holds a seat.
 *
 * @param tenantId     the tenant the user is being added to.
 * @param newUserRole  the role of the user being CREATED — drives the per-role
 *                     cap (undefined → total-only check, e.g. a generic pre-check).
 * @param actorRole    the ACTOR's role — ONLY for the isPlatformAdmin exemption.
 *                     Pass it, or a platform-admin actor would be wrongly capped.
 *
 * NOTE the signature change from Phase A: the 2nd arg is now the NEW user's role
 * and the exemption moved to the 3rd (actorRole). Both call sites were updated.
 */
export async function assertCanAddUser(
  tenantId: string,
  newUserRole?: string,
  actorRole?: string,
): Promise<CapResult> {
  // (a) EXEMPTION FIRST — super_admin (platform admin) is not a real tenant and
  // has no plan; exempt it BEFORE any plan lookup so the plan-less platform
  // tenant never returns NO_PLAN_ASSIGNED and is never blocked (the lockout fix).
  if (actorRole && isPlatformAdmin(actorRole)) return { ok: true };
  const { plan, code } = await loadUsablePlan(tenantId);
  if (!plan || code) return { ok: false, code: code ?? "NO_PLAN_ASSIGNED", cap: "total" };
  // (b) TOTAL cap — counts ALL users (active + inactive). The total wins if both
  // total and role are full (checked first, returns first).
  const totalUsers = await prisma.user.count({ where: { tenantId } });
  if (totalUsers >= plan.maxUsers) return { ok: false, code: "PLAN_CAP_EXCEEDED", cap: "total" };
  // (c) ROLE cap — resolver is the single source of truth. Unlimited → PASS (no
  // gate for that role). Else block when role usage (incl. inactive) is at cap.
  if (newUserRole) {
    const roleCap = await resolveRoleCap(tenantId, newUserRole);
    if (roleCap !== "unlimited") {
      const used = await resolveRoleUsage(tenantId, newUserRole);
      if (used >= roleCap) {
        return {
          ok: false,
          code: "ROLE_CAP_EXCEEDED",
          cap: "role",
          role: newUserRole,
          used,
          limit: roleCap,
          message: `${roleLabel(newUserRole)} limit reached (${used}/${roleCap})`,
        };
      }
    }
  }
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
