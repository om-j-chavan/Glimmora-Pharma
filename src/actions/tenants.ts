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
import { resolvePlanCaps, validateTailoredCaps, resolveExpiry, MIN_TAILORED_RETENTION_YEARS, defaultRoleCapsForPlan, type PlanTier } from "@/lib/plans";
import { CAP_ELIGIBLE_ROLES } from "@/lib/labels/roles";
import { generateReference } from "@/lib/reference";

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
  // Optional client-supplied primary key. When present it becomes the Tenant
  // row's id so the id shown in the UI/Redux matches the DB row — otherwise the
  // client keeps a `tenant-<timestamp>` id that Prisma never persisted, and a
  // later edit hits P2025 ("No record found for an update"). Omit → Prisma cuid.
  id: z.string().min(1).optional(),
  name: z.string().min(2),
  email: z.string().email(),
  username: z.string().min(2),
  // customerCode is no longer accepted from the client — it's the human-readable
  // Tenant ID (TEN-YYYY-NNNN), allocated server-side at creation (see below).
  password: z.string().min(8, "Password must be at least 8 characters"),
  language: z.string().default("en"),
  timezone: z.string().default("Asia/Kolkata"),
  // Regulatory region — super_admin owned, chosen from the central ACTIVE-region
  // lookup. REQUIRED on create (Stage 5) — a tenant must have a region so its
  // effective frameworks resolve. UpdateTenantSchema.partial() keeps it optional
  // on edit (never forces a region onto a legacy null tenant mid-edit).
  // Multi-region: the region SET is the source of truth. `regulatoryRegions` is
  // the new field; the single `regulatoryRegion` is still accepted for back-compat
  // and is derived from regions[0]. "≥1 on create" is enforced in the action so
  // either field can satisfy it (UpdateTenantSchema.partial() keeps both optional).
  regulatoryRegion: z.string().min(1).optional(),
  regulatoryRegions: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().default(true),
});

/** Normalize a region SET from the new array and/or the legacy single field:
 *  trim, drop blanks, de-dupe, preserve order. regions[0] is the PRIMARY (shim). */
function normalizeRegions(list?: string[], single?: string | null): string[] {
  const raw = list && list.length ? list : single ? [single] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const v = r.trim();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

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
  // Time-only renewal: when true the write is audited as PLAN_RENEWED instead
  // of PLAN_ASSIGNED. Tier/caps still flow through the same fields unchanged —
  // this is the SAME write path, only the audit action differs.
  renewal: z.boolean().optional(),
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

  // Multi-region: resolve the SET (source of truth); regions[0] is the shim.
  // Required on create — either the new array or the legacy single field satisfies it.
  const regions = normalizeRegions(parsed.data.regulatoryRegions, parsed.data.regulatoryRegion);
  if (regions.length === 0) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: { regulatoryRegions: ["At least one Regulatory Region is required."] },
    };
  }

  // Uniqueness pre-check (case-insensitive) BEFORE the create, so we can return
  // field-specific messages the modal surfaces inline on the right input. The
  // DB @@unique on email + username is the race backstop (handled in the catch
  // below). NOTE: Prisma `mode: "insensitive"` is unsupported on SQLite (this
  // app's local DB), so we compare in JS over the small tenant set.
  {
    const emailLc = parsed.data.email.toLowerCase();
    const unameLc = parsed.data.username.toLowerCase();
    const existing = await prisma.tenant.findMany({ select: { email: true, username: true } });
    const dupFields: Record<string, string[]> = {};
    if (existing.some((t) => t.username.toLowerCase() === unameLc)) {
      dupFields.username = ["This username is already taken."];
    }
    if (existing.some((t) => t.email.toLowerCase() === emailLc)) {
      dupFields.email = ["This email address is already registered."];
    }
    if (Object.keys(dupFields).length > 0) {
      return { success: false, error: "This account already exists.", fieldErrors: dupFields };
    }
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);

    // Allocate the human-readable Tenant ID (customerCode) server-side:
    // TEN-<year>-<NNNN>, unique per year. The customerCode column is @unique,
    // so a concurrent create can collide on the same number — retry (bumping
    // the sequence) on that specific conflict; any other P2002 (email/username)
    // is a real user error and falls through to the catch below.
    let tenant: Awaited<ReturnType<typeof prisma.tenant.create>> | null = null;
    const MAX_CODE_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const customerCode = await generateReference("TEN", new Date(), async (p, year) => {
        const row = await prisma.tenant.findFirst({
          where: { customerCode: { startsWith: `${p}-${year}-` } },
          orderBy: { customerCode: "desc" },
          select: { customerCode: true },
        });
        return row?.customerCode ?? null;
      }, 4);
      try {
        // Tenant + region SET written in ONE transaction so the shim
        // (regulatoryRegion = regions[0]) and the set can never disagree.
        tenant = await prisma.$transaction(async (tx) => {
          const created = await tx.tenant.create({
            data: {
              ...(parsed.data.id ? { id: parsed.data.id } : {}),
              name: parsed.data.name,
              email: parsed.data.email.toLowerCase(),
              username: parsed.data.username,
              customerCode,
              passwordHash,
              role: "customer_admin",
              language: parsed.data.language,
              timezone: parsed.data.timezone,
              regulatoryRegion: regions[0], // PRIMARY shim; the set below is source of truth
              isActive: parsed.data.isActive,
            },
          });
          await tx.tenantRegion.createMany({ data: regions.map((region) => ({ tenantId: created.id, region })) });
          return created;
        });
        break;
      } catch (err) {
        const meta = (err as { code?: string; meta?: { target?: string[] } });
        const codeCollision = meta.code === "P2002" && (meta.meta?.target?.includes("customerCode") ?? false);
        if (codeCollision && attempt < MAX_CODE_RETRIES - 1) continue;
        throw err;
      }
    }
    if (!tenant) {
      return { success: false, error: "Could not allocate a Tenant ID. Please retry." };
    }
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
      // Race backstop for the pre-check above: map the violated unique column
      // to the same field-specific inline message.
      const target = (err as { meta?: { target?: string[] } }).meta?.target ?? [];
      const dupFields: Record<string, string[]> = {};
      if (target.includes("username")) dupFields.username = ["This username is already taken."];
      if (target.includes("email")) dupFields.email = ["This email address is already registered."];
      return {
        success: false,
        error: "This account already exists.",
        fieldErrors: Object.keys(dupFields).length ? dupFields : undefined,
      };
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
    // Multi-region: `regulatoryRegions` is NOT a scalar column — strip it from the
    // tenant update payload and apply it as a set below. Only touch regions when
    // the caller actually sent region info (partial edits leave the set intact).
    delete data.regulatoryRegions;
    const regionsProvided = rest.regulatoryRegions !== undefined || rest.regulatoryRegion !== undefined;
    const newRegions = regionsProvided ? normalizeRegions(rest.regulatoryRegions, rest.regulatoryRegion) : null;
    // Keep the shim in sync in the SAME transaction: regulatoryRegion = regions[0]
    // (empty set → null, preserving the legacy "clear the region" behavior).
    if (newRegions !== null) data.regulatoryRegion = newRegions[0] ?? null;

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

    const tenant = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({ where: { id }, data });
      // Replace-on-update the region SET when region info was supplied.
      if (newRegions !== null) {
        await tx.tenantRegion.deleteMany({ where: { tenantId: id } });
        if (newRegions.length) {
          await tx.tenantRegion.createMany({ data: newRegions.map((region) => ({ tenantId: id, region })) });
        }
      }
      return updated;
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
 * Set (or clear with null) a tenant's logo. Super admin only. The logo is
 * stored as a data URL on Tenant.logoUrl — self-contained (no object storage),
 * which suits the local SQLite setup and keeps the cropped avatar small.
 */
const MAX_LOGO_DATAURL_LEN = 400 * 1024; // ~400 KB — a cropped avatar is far smaller
export async function updateTenantLogo(id: string, logoUrl: string | null): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Access denied" };
  }
  if (logoUrl !== null) {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(logoUrl)) {
      return { success: false, error: "Logo must be a PNG, JPEG, or WebP image." };
    }
    if (logoUrl.length > MAX_LOGO_DATAURL_LEN) {
      return { success: false, error: "Logo image is too large — crop a smaller area." };
    }
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const existing = await prisma.tenant.findUnique({ where: { id }, select: { name: true } });
    if (!existing) {
      return { success: false, error: "Tenant not found" };
    }
    const tenant = await prisma.tenant.update({ where: { id }, data: { logoUrl } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: "TENANT_UPDATED",
        recordId: id,
        recordTitle: existing.name,
        newValue: logoUrl ? "logo updated" : "logo removed",
      },
    });
    revalidatePath("/admin");
    return { success: true, data: tenant };
  } catch (err) {
    console.error("[action] updateTenantLogo failed:", err);
    return { success: false, error: "Failed to update logo" };
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

/**
 * Tenant lifecycle transitions (super_admin only). Three states share one
 * guard/audit shape:
 *   - suspendTenant   → SUSPENDED (isActive=false, deletedAt=null)
 *   - softDeleteTenant→ DELETED   (isActive=false, deletedAt=now) — recoverable
 *   - restoreTenant   → ACTIVE    (isActive=true,  deletedAt=null)
 * SUSPEND and DELETE also bump sessionsValidAfter so any live sessions for the
 * tenant / its users die on the next request. Login is blocked server-side in
 * the NextAuth authorize() guard (isActive=false OR deletedAt set). Every
 * transition is audited. A permanent purge is deleteTenant (below).
 */
type Lifecycle = "suspend" | "delete" | "restore";
const LIFECYCLE_META: Record<Lifecycle, { action: string; killSessions: boolean; data: { isActive: boolean; deletedAt: Date | null } }> = {
  suspend: { action: "TENANT_SUSPENDED", killSessions: true, data: { isActive: false, deletedAt: null } },
  delete: { action: "TENANT_DELETED", killSessions: true, data: { isActive: false, deletedAt: new Date(0) } }, // deletedAt replaced with now() at call time
  restore: { action: "TENANT_RESTORED", killSessions: false, data: { isActive: true, deletedAt: null } },
};

async function transitionTenant(id: string, kind: Lifecycle): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Access denied" };
  }
  if (id === session.user.tenantId) {
    return { success: false, error: "You cannot change your own account status" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const existing = await prisma.tenant.findUnique({ where: { id }, select: { name: true, role: true } });
    if (!existing) {
      return { success: false, error: "Tenant not found" };
    }
    if (existing.role === "super_admin") {
      return { success: false, error: "Platform super-admin accounts cannot be changed" };
    }
    const meta = LIFECYCLE_META[kind];
    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        isActive: meta.data.isActive,
        deletedAt: kind === "delete" ? new Date() : meta.data.deletedAt,
        ...(meta.killSessions ? { sessionsValidAfter: new Date() } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: meta.action,
        recordId: id,
        recordTitle: existing.name,
      },
    });
    revalidatePath("/admin");
    return { success: true, data: tenant };
  } catch (err) {
    console.error(`[action] transitionTenant(${kind}) failed:`, err);
    return { success: false, error: "Failed to update account status" };
  }
}

export async function suspendTenant(id: string) {
  return transitionTenant(id, "suspend");
}
export async function softDeleteTenant(id: string) {
  return transitionTenant(id, "delete");
}
export async function restoreTenant(id: string) {
  return transitionTenant(id, "restore");
}

/**
 * Part 11-safe purge core (module-local). Destroys the tenant's OPERATIONAL +
 * PII data via the schema `onDelete: Cascade` (users, sites, findings, CAPAs,
 * deviations, evidence, …) but FIRST relocates the immutable AuditLog and
 * SignedRecord trails onto the acting super_admin's (platform) tenant so the
 * `onDelete: Cascade` on AuditLog can NOT wipe them.
 *
 * 21 CFR Part 11: the audit + e-signature ledgers are under retention and must
 * survive a tenant purge. AuditLog has a cascading tenant FK (it WOULD be
 * destroyed); SignedRecord has only a scoping `tenantId` column (no FK, so no
 * cascade) — both are re-parented here so the archived trail stays together and
 * queryable under the platform tenant. The TENANT_PURGED audit is written to
 * the platform tenant BEFORE the delete so the record of the purge itself is
 * never on the row being removed.
 */
async function purgeTenantRetainingAudit(
  id: string,
  archiveTenantId: string,
  actor: Awaited<ReturnType<typeof resolveUserFk>>,
  recordTitle: string | undefined,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: archiveTenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "Admin",
      action: "TENANT_PURGED",
      recordId: id,
      recordTitle,
    },
  });
  // Re-parent the immutable trails off the doomed row (retain, don't destroy).
  await prisma.auditLog.updateMany({ where: { tenantId: id }, data: { tenantId: archiveTenantId } });
  await prisma.signedRecord.updateMany({ where: { tenantId: id }, data: { tenantId: archiveTenantId } });
  // Cascade-delete operational + PII child data via the tenant row removal.
  await prisma.tenant.delete({ where: { id } });
}

/**
 * PERMANENT delete (purge) — super admin only; irreversible. Destroys the
 * tenant's operational + PII data while RETAINING its audit/signature trail
 * (see purgeTenantRetainingAudit). Prefer deleteTenantWithPassword for the
 * user-facing flow (adds the Part 11 identity re-check); this ungated entry
 * point is kept for internal/back-compat callers.
 */
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
      select: { role: true, name: true },
    });
    if (!target) {
      return { success: false, error: "Tenant not found" };
    }
    if (target.role === "super_admin") {
      return { success: false, error: "Platform super-admin accounts cannot be deleted" };
    }
    await purgeTenantRetainingAudit(id, session.user.tenantId, actor, target.name);
    revalidatePath("/admin");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteTenant failed:", err);
    return { success: false, error: "Failed to delete account" };
  }
}

/**
 * PERMANENT delete, gated on the acting Super Admin re-entering THEIR OWN
 * password. The password is verified SERVER-SIDE against the super_admin's real
 * credential (never compared on the client): super_admin authenticates via the
 * Tenant table (nextauth route Path 1), so session.user.id is their Tenant.id
 * and the credential is Tenant.passwordHash — the same bcrypt check login uses.
 * Only on success does it purge (retaining the audit/signature trail). A failed
 * attempt is itself audited.
 */
export async function deleteTenantWithPassword(id: string, password: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Access denied" };
  }
  if (id === session.user.tenantId) {
    return { success: false, error: "You cannot delete your own account" };
  }
  if (!password) {
    return { success: false, error: "Enter your password to confirm." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const target = await prisma.tenant.findUnique({
      where: { id },
      select: { role: true, name: true },
    });
    if (!target) {
      return { success: false, error: "Tenant not found" };
    }
    if (target.role === "super_admin") {
      return { success: false, error: "Platform super-admin accounts cannot be deleted" };
    }
    // Server-side identity re-check against the acting super_admin's own hash.
    const me = await prisma.tenant.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });
    const valid = !!me && (await bcrypt.compare(password, me.passwordHash));
    if (!valid) {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Admin",
          action: "TENANT_PURGE_DENIED",
          recordId: id,
          recordTitle: target.name,
          newValue: "wrong_password",
        },
      });
      return { success: false, error: "Incorrect password. Permanent delete cancelled." };
    }
    await purgeTenantRetainingAudit(id, session.user.tenantId, actor, target.name);
    revalidatePath("/admin");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteTenantWithPassword failed:", err);
    return { success: false, error: "Failed to permanently delete account" };
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

  // TAILORED only — a custom cap must NOT be set BELOW the tenant's CURRENT
  // active usage (equal is allowed). Fixed tiers use preset caps the admin
  // can't edit, so they're out of scope. Counts mirror planCaps.ts: ACTIVE
  // rows are occupied seats (a deactivated user/site frees its seat).
  if (tier === "TAILORED") {
    const [userCount, siteCount] = await Promise.all([
      prisma.user.count({ where: { tenantId: parsed.data.tenantId, isActive: true } }),
      prisma.site.count({ where: { tenantId: parsed.data.tenantId, isActive: true } }),
    ]);
    if (caps.maxUsers < userCount) {
      return { success: false, error: `Cannot set Max users below current usage: ${userCount} user${userCount === 1 ? "" : "s"} active` };
    }
    if (caps.maxSites < siteCount) {
      return { success: false, error: `Cannot set Max sites below current usage: ${siteCount} site${siteCount === 1 ? "" : "s"} active` };
    }
    // Retention is a COMPLIANCE FLOOR (not a usage count): a TAILORED plan must
    // not promise less than the 7-year Part 11 retention the data layer keeps.
    // Equal allowed (strict <). Independent of duration and usage.
    if (caps.minRetentionYears < MIN_TAILORED_RETENTION_YEARS) {
      return { success: false, error: `Retention must be at least ${MIN_TAILORED_RETENTION_YEARS} years (Part 11 compliance floor)` };
    }
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

    // Seed this plan's per-role default caps (PlanRoleLimit) for any role that
    // lacks one, so the role-limit resolver returns CONCRETE caps instead of
    // falling through to "unlimited" (∞) in the tenant View. ROOT-CAUSE FIX:
    // previously ONLY the batch seed (prisma/roleLimitsSeed.ts) wrote these, so
    // any plan created/assigned AFTER a seed run had ZERO PlanRoleLimit rows and
    // every cap-eligible role showed ∞. Create-MISSING only — an existing (or
    // admin-edited) cap is never overwritten; a re-run creates nothing (idempotent).
    // defaultRoleCapsForPlan(maxUsers) yields concrete caps summing to maxUsers,
    // matching the batch seed's Professional/Enterprise defaults.
    const roleDefaults = defaultRoleCapsForPlan(caps.maxUsers);
    const existingRoles = new Set(
      (await prisma.planRoleLimit.findMany({ where: { planId: plan.id }, select: { role: true } })).map((r) => r.role),
    );
    const missingRoles = CAP_ELIGIBLE_ROLES.filter((r) => !existingRoles.has(r));
    if (missingRoles.length > 0) {
      // SQLite has no createMany skipDuplicates — create the missing rows in one tx.
      await prisma.$transaction(
        missingRoles.map((role) => prisma.planRoleLimit.create({ data: { planId: plan.id, role, cap: roleDefaults[role] ?? 0 } })),
      );
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: parsed.data.renewal ? "PLAN_RENEWED" : "PLAN_ASSIGNED",
        recordId: parsed.data.tenantId,
        newValue: JSON.stringify({ tier, maxUsers: caps.maxUsers, maxSites: caps.maxSites, minRetentionYears: caps.minRetentionYears, durationMonths: caps.durationMonths, startDate: frozen.startDate, expiryDate: frozen.expiryDate }),
      },
    });
    revalidatePath("/admin");
    return { success: true, data: plan };
  } catch (err) {
    console.error("[action] assignPlan failed:", err);
    return { success: false, error: "Failed to save plan" };
  }
}
