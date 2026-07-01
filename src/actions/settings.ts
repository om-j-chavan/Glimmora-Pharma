"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { BCRYPT_COST } from "@/lib/passwords";
import { sanitizeServerError } from "@/lib/errors";
import { assertCanAddUser, assertCanAddSite, type CapBlockCode } from "@/lib/planCaps";
import { scopedWhere } from "@/lib/tenantScope";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateSiteSchema = z.object({
  name: z.string().min(2),
  location: z.string().optional(),
  gmpScope: z.string().optional(),
  risk: z.string().default("MEDIUM"),
});

const UpdateSiteSchema = CreateSiteSchema.partial().extend({
  // Site row.status in the Redux model maps to Prisma Site.isActive.
  // Settings UI sends "Active"/"Inactive"; the tab adapter converts to boolean.
  isActive: z.boolean().optional(),
});

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  username: z.string().min(2),
  role: z.string().min(1),
  siteId: z.string().optional(),
  password: z.string().min(6),
  gxpSignatory: z.boolean().default(false),
});

const UpdateUserSchema = CreateUserSchema.partial().extend({
  password: z.string().min(6).optional(),
  // Status toggle (Active/Inactive) maps to Prisma User.isActive.
  isActive: z.boolean().optional(),
});

function isAdmin(role: string): boolean {
  return role === "customer_admin" || role === "super_admin";
}

// Role-grant ceiling. A customer_admin may provision only site-level roles in
// their own tenant — never another customer_admin or a platform super_admin.
// Only super_admin may create those elevated roles. Mirrors the UI's role
// options (UsersTab TENANT_ROLES_FOR_CUSTOMER_ADMIN); enforced here as the
// authoritative server-side gate.
const CUSTOMER_ADMIN_GRANTABLE_ROLES = new Set<string>([
  "qa_head",
  "qa", // execution-level QA — site-level, customer_admin-grantable
  "qc_lab_director",
  "regulatory_affairs",
  "csv_val_lead",
  "it_cdo",
  "operations_head",
  "viewer",
]);

export async function createSite(
  input: z.input<typeof CreateSiteSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Only Admin can create sites" };
  }
  const parsed = CreateSiteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // Hard cap enforcement (Phase 1) — blocks creation past plan.maxSites, and on
  // no-plan / expired-plan. Runs AFTER the role gate; never a bypass. For
  // super_admin this is the platform tenant (no plan) → NO_PLAN_ASSIGNED.
  const cap = await assertCanAddSite(session.user.tenantId);
  if (!cap.ok) {
    const code: CapBlockCode = cap.code ?? "SITE_CAP_EXCEEDED";
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "SITE_CREATE_BLOCKED",
        recordTitle: parsed.data.name,
        newValue: code,
      },
    });
    return { success: false, error: code };
  }
  try {
    const site = await prisma.site.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "SITE_CREATED",
        recordId: site.id,
        recordTitle: parsed.data.name,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: site };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { success: false, error: "A site with this name already exists" };
    }
    console.error("[action] createSite failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to create site") };
  }
}

export async function updateSite(
  id: string,
  input: z.input<typeof UpdateSiteSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  const parsed = UpdateSiteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (session.user.role !== "super_admin") {
    const owned = await prisma.site.findFirst({
      where: scopedWhere(session, id),
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const site = await prisma.site.update({
      // Tenant-atomic write (closes the check-then-write TOCTOU); super_admin
      // bypass preserved via the flag, matching the pre-check above.
      where: scopedWhere(session, id, { allowPlatformAdmin: true }),
      data: parsed.data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "SITE_UPDATED",
        recordId: id,
        recordTitle: parsed.data.name,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: site };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { success: false, error: "A site with this name already exists" };
    }
    console.error("[action] updateSite failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to update site") };
  }
}

export async function deleteSite(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.site.findFirst({
      where: scopedWhere(session, id),
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.site.delete({ where: scopedWhere(session, id, { allowPlatformAdmin: true }) });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "SITE_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteSite failed:", err);
    return { success: false, error: "Failed to delete site" };
  }
}

export async function createUser(
  input: z.input<typeof CreateUserSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Only Admin can create users" };
  }
  const parsed = CreateUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.flatten().fieldErrors.email?.[0] ?? "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // Role-grant ceiling (privilege-escalation guard). A non-super_admin actor
  // cannot mint a role above the site-level set — blocks a customer_admin from
  // creating a super_admin / customer_admin. Enforced server-side regardless of
  // what the client sends.
  if (session.user.role !== "super_admin" && !CUSTOMER_ADMIN_GRANTABLE_ROLES.has(parsed.data.role)) {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "USER_CREATE_ROLE_DENIED",
        recordTitle: parsed.data.name,
        newValue: parsed.data.role,
      },
    });
    return { success: false, error: "You are not permitted to create a user with that role." };
  }
  // Hard cap enforcement (Phase 1) — blocks creation past plan.maxUsers, and on
  // no-plan / expired-plan. Runs AFTER the role gate; never a bypass. For
  // super_admin this is the platform tenant (no plan) → NO_PLAN_ASSIGNED.
  const cap = await assertCanAddUser(session.user.tenantId);
  if (!cap.ok) {
    const code: CapBlockCode = cap.code ?? "PLAN_CAP_EXCEEDED";
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "USER_CREATE_BLOCKED",
        recordTitle: parsed.data.name,
        newValue: code,
      },
    });
    return { success: false, error: code };
  }
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        username: parsed.data.username,
        role: parsed.data.role,
        siteId: parsed.data.siteId ?? null,
        gxpSignatory: parsed.data.gxpSignatory,
        tenantId: session.user.tenantId,
        passwordHash,
        isActive: true,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "USER_CREATED",
        recordId: user.id,
        recordTitle: parsed.data.name,
        newValue: parsed.data.role,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: user };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { success: false, error: "Email or username already exists" };
    }
    console.error("[action] createUser failed:", err);
    return { success: false, error: "Failed to create user" };
  }
}

/**
 * Server-side cap pre-check for the Settings → Users "Add user" flow.
 *
 * The Settings UsersTab provisions users through the AI backend + Redux (it
 * does not call createUser), so this lets that flow enforce the SAME hard cap
 * server-side before it proceeds — a disabled button alone is not enforcement.
 * Records a USER_CREATE_BLOCKED audit on a block. Returns the cap block code as
 * `error` (the UI maps it through errorCodeLabel).
 */
export async function checkUserCap(): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  const cap = await assertCanAddUser(session.user.tenantId);
  if (cap.ok) return { success: true, data: null };
  const code: CapBlockCode = cap.code ?? "PLAN_CAP_EXCEEDED";
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "Settings",
      action: "USER_CREATE_BLOCKED",
      newValue: code,
    },
  });
  return { success: false, error: code };
}

export async function updateUser(
  id: string,
  input: z.input<typeof UpdateUserSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  const parsed = UpdateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  // High-value: blocks customer_admin of tenant A from mutating users in tenant B.
  if (session.user.role !== "super_admin") {
    const owned = await prisma.user.findFirst({
      where: scopedWhere(session, id),
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const { password, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (password) data.passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const user = await prisma.user.update({
      // Tenant-atomic write (closes TOCTOU); super_admin bypass via the flag.
      where: scopedWhere(session, id, { allowPlatformAdmin: true }),
      data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "USER_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: user };
  } catch (err) {
    console.error("[action] updateUser failed:", err);
    return { success: false, error: "Failed to update user" };
  }
}

/**
 * Persist a User's GxP signatory authority (Part 11). Granting/revoking
 * signatory authority is itself a Part 11 event, so it writes a dedicated
 * AuditLog row with old→new (module "Settings").
 *
 * Server-side authorization (never trust the client):
 *  (a) tenant isolation — the target is loaded tenant-scoped; a customer_admin
 *      can only touch users in their OWN tenant (super_admin crosses tenants).
 *  (b) role authz — isAdmin (customer_admin | super_admin) only, the same gate
 *      the rest of the user-management actions use.
 *  (c) no self-escalation — an actor cannot flip their own signatory authority.
 */
export async function setUserGxpSignatory(id: string, value: boolean): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) return { success: false, error: "Access denied" };
  if (id === session.user.id) {
    return { success: false, error: "You cannot change your own signatory authority." };
  }
  // Load tenant-scoped — the tenant pin comes from the SESSION, not the client.
  const target = await prisma.user.findFirst({
    where: scopedWhere(session, id, { allowPlatformAdmin: true }),
    select: { id: true, name: true, gxpSignatory: true },
  });
  if (!target) return { success: false, error: "FORBIDDEN" };
  if (target.gxpSignatory === value) return { success: true, data: null };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.user.update({
      where: scopedWhere(session, id, { allowPlatformAdmin: true }),
      data: { gxpSignatory: value },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: value ? "USER_SIGNATORY_GRANTED" : "USER_SIGNATORY_REVOKED",
        recordId: id,
        recordTitle: target.name,
        oldValue: String(target.gxpSignatory),
        newValue: String(value),
      },
    });
    revalidatePath("/settings");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] setUserGxpSignatory failed:", err);
    return { success: false, error: "Failed to update signatory authority" };
  }
}

/**
 * Persist a User's active/inactive status (Prisma User.isActive — an inactive
 * user cannot log in). Writes a dedicated AuditLog row with old→new. Same
 * server-side authz as setUserGxpSignatory (tenant-scoped load, isAdmin only,
 * no self-deactivation).
 */
export async function setUserStatus(id: string, isActive: boolean): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) return { success: false, error: "Access denied" };
  if (id === session.user.id) {
    return { success: false, error: "You cannot change your own account status." };
  }
  const target = await prisma.user.findFirst({
    where: scopedWhere(session, id, { allowPlatformAdmin: true }),
    select: { id: true, name: true, isActive: true },
  });
  if (!target) return { success: false, error: "FORBIDDEN" };
  if (target.isActive === isActive) return { success: true, data: null };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.user.update({
      where: scopedWhere(session, id, { allowPlatformAdmin: true }),
      data: { isActive },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        recordId: id,
        recordTitle: target.name,
        oldValue: String(target.isActive),
        newValue: String(isActive),
      },
    });
    revalidatePath("/settings");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] setUserStatus failed:", err);
    return { success: false, error: "Failed to update user status" };
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.user.findFirst({
      where: scopedWhere(session, id),
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.user.delete({ where: scopedWhere(session, id, { allowPlatformAdmin: true }) });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "USER_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteUser failed:", err);
    return { success: false, error: "Failed to delete user" };
  }
}
