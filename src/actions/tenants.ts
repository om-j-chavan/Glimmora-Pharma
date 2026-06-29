"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { BCRYPT_COST } from "@/lib/passwords";
import { getTenants } from "@/lib/queries/tenants";
import type { Tenant as ReduxTenant } from "@/store/auth.slice";
import { sanitizeServerError } from "@/lib/errors";
import { resolvePlanCaps, validateTailoredCaps, resolveExpiry, type PlanTier } from "@/lib/plans";

export async function listTenants(): Promise<ReduxTenant[]> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    throw new Error("Only Super Admin can list tenants");
  }
  return getTenants();
}

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateTenantSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  username: z.string().min(2),
  customerCode: z.string().min(2),
  password: z.string().min(8, "Password must be at least 8 characters"),
  language: z.string().default("en"),
  timezone: z.string().default("Asia/Kolkata"),
  isActive: z.boolean().default(true),
});

const UpdateTenantSchema = CreateTenantSchema.partial().extend({
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

const AssignPlanSchema = z.object({
  tenantId: z.string().min(1),
  tier: z.enum(["ESSENTIALS", "PROFESSIONAL", "ENTERPRISE", "TAILORED"]),
  // TAILORED only — ignored for fixed tiers (caps come from PLAN_TIERS).
  displayName: z.string().optional(),
  maxUsers: z.number().int().positive().optional(),
  maxSites: z.number().int().positive().optional(),
  minRetentionYears: z.number().int().positive().optional(),
  // Subscription term (>= 1 month). expiryDate is DERIVED server-side
  // (start + durationMonths) and is no longer accepted from the client, so the
  // old "expiry >= start" order refine is gone — a positive term is always
  // ordered (replaces Bug 8's manual-date check).
  durationMonths: z.number().int().positive().optional(),
  startDate: z.string().min(1),
});

export async function createTenant(
  input: z.input<typeof CreateTenantSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Only Super Admin can create tenants" };
  }
  const parsed = CreateTenantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);
    const tenant = await prisma.tenant.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        username: parsed.data.username,
        customerCode: parsed.data.customerCode,
        passwordHash,
        role: "customer_admin",
        language: parsed.data.language,
        timezone: parsed.data.timezone,
        isActive: parsed.data.isActive,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: "TENANT_CREATED",
        recordId: tenant.id,
        recordTitle: parsed.data.name,
      },
    });
    revalidatePath("/admin");
    return { success: true, data: tenant };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { success: false, error: "Email, username, or code already exists" };
    }
    console.error("[action] createTenant failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to create account") };
  }
}

export async function updateTenant(
  id: string,
  input: z.input<typeof UpdateTenantSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Access denied" };
  }
  const parsed = UpdateTenantSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const { password, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (rest.email) data.email = rest.email.toLowerCase();
    if (password) data.passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // Prefer the specific lifecycle event over the generic TENANT_UPDATED when
    // this edit actually flips isActive — "Account suspended/reactivated" reads
    // truer in the compliance trail. Only when the value genuinely changes; a
    // no-op or non-active-state edit stays TENANT_UPDATED.
    let auditAction = "TENANT_UPDATED";
    if (rest.isActive !== undefined) {
      const prior = await prisma.tenant.findUnique({ where: { id }, select: { isActive: true } });
      if (prior && prior.isActive !== rest.isActive) {
        auditAction = rest.isActive ? "TENANT_REACTIVATED" : "TENANT_SUSPENDED";
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: auditAction,
        recordId: id,
      },
    });
    revalidatePath("/admin");
    return { success: true, data: tenant };
  } catch (err) {
    console.error("[action] updateTenant failed:", err);
    return { success: false, error: "Failed to update account" };
  }
}

/**
 * Toggle tenant-level MFA. Super admin only.
 *
 * On a false â†’ true transition, also stamps `sessionsValidAfter = now()` so
 * every existing session in that tenant is invalidated on its next request
 * (the JWT callback in pages/api/auth/[...nextauth].ts compares token.iat
 * against this timestamp and returns an empty token if older). On true â†’
 * false we leave sessions alone â€” relaxing MFA shouldn't punt people out.
 */
export async function toggleTenantMFA(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const existing = await prisma.tenant.findUnique({
      where: { id },
      select: { mfaEnabled: true, name: true },
    });
    if (!existing) {
      return { success: false, error: "Tenant not found" };
    }
    const wasOff = !existing.mfaEnabled;
    const turningOn = wasOff && enabled === true;

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        mfaEnabled: enabled,
        ...(turningOn ? { sessionsValidAfter: new Date() } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: enabled ? "MFA_ENABLED" : "MFA_DISABLED",
        recordId: id,
        recordTitle: existing.name,
        oldValue: existing.mfaEnabled ? "enabled" : "disabled",
        newValue: enabled ? "enabled" : "disabled",
      },
    });
    revalidatePath("/admin");
    return { success: true, data: tenant };
  } catch (err) {
    console.error("[action] toggleTenantMFA failed:", err);
    return { success: false, error: "Failed to update MFA setting" };
  }
}

export async function deleteTenant(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Access denied" };
  }
  if (id === session.user.tenantId) {
    return { success: false, error: "You cannot delete your own account" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const target = await prisma.tenant.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!target) {
      return { success: false, error: "Tenant not found" };
    }
    if (target.role === "super_admin") {
      return { success: false, error: "Platform super-admin accounts cannot be deleted" };
    }
    await prisma.tenant.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: "TENANT_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/admin");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteTenant failed:", err);
    return { success: false, error: "Failed to delete account" };
  }
}

/**
 * Subscription Phase A — assign (or replace) a tenant's single plan.
 *
 * Caps are FROZEN onto the row at assignment: fixed tiers copy from
 * PLAN_TIERS; TAILORED uses the supplied custom caps, validated against the
 * ceilings. Lifecycle (Active/Suspended) stays on Tenant.isActive and is NOT
 * touched here. No purge logic — minRetentionYears is a promise only.
 */
export async function assignPlan(
  input: z.input<typeof AssignPlanSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Access denied" };
  }
  const parsed = AssignPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const tier = parsed.data.tier as PlanTier;

  // TAILORED custom caps must be within ceilings; fixed tiers ignore them.
  if (tier === "TAILORED") {
    const reason = validateTailoredCaps({
      maxUsers: parsed.data.maxUsers,
      maxSites: parsed.data.maxSites,
      minRetentionYears: parsed.data.minRetentionYears,
    });
    if (reason) return { success: false, error: reason };
  }

  const caps = resolvePlanCaps(tier, {
    maxUsers: parsed.data.maxUsers,
    maxSites: parsed.data.maxSites,
    minRetentionYears: parsed.data.minRetentionYears,
    durationMonths: parsed.data.durationMonths,
  });

  // Bug 2 — a usable plan must grant at least one user account and one site,
  // regardless of tier. validateTailoredCaps above only guards TAILORED; assert
  // the resolved caps here so a 0/empty account cap can never persist as a plan.
  if (caps.maxUsers < 1 || caps.maxSites < 1) {
    return { success: false, error: "A plan must allow at least one user account and one site." };
  }

  const displayName = tier === "TAILORED" ? (parsed.data.displayName?.trim() || null) : null;

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const frozen = {
      tier,
      displayName,
      maxUsers: caps.maxUsers,
      maxSites: caps.maxSites,
      minRetentionYears: caps.minRetentionYears,
      durationMonths: caps.durationMonths,
      startDate: new Date(parsed.data.startDate),
      // DERIVED, never hand-entered: expiry = start + the frozen duration.
      expiryDate: new Date(resolveExpiry(parsed.data.startDate, caps.durationMonths)),
    };
    const plan = await prisma.plan.upsert({
      where: { tenantId: parsed.data.tenantId },
      update: frozen,
      create: { tenantId: parsed.data.tenantId, ...frozen },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: "PLAN_ASSIGNED",
        recordId: parsed.data.tenantId,
        newValue: JSON.stringify({ tier, maxUsers: caps.maxUsers, maxSites: caps.maxSites, minRetentionYears: caps.minRetentionYears }),
      },
    });
    revalidatePath("/admin");
    return { success: true, data: plan };
  } catch (err) {
    console.error("[action] assignPlan failed:", err);
    return { success: false, error: "Failed to save plan" };
  }
}
