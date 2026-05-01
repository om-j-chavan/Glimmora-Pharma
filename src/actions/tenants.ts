"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateTenantSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  username: z.string().min(2),
  customerCode: z.string().min(2),
  password: z.string().min(6),
  language: z.string().default("en"),
  timezone: z.string().default("Asia/Kolkata"),
  isActive: z.boolean().default(true),
});

const UpdateTenantSchema = CreateTenantSchema.partial().extend({
  password: z.string().min(6).optional(),
});

const CreateSubscriptionSchema = z.object({
  tenantId: z.string().min(1),
  maxAccounts: z.number().int().positive(),
  startDate: z.string().min(1),
  expiryDate: z.string().min(1),
  status: z.enum(["Active", "Inactive"]).default("Active"),
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
      error: parsed.error.flatten().fieldErrors.email?.[0] ?? "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
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
        userName: session.user.name,
        userRole: session.user.role,
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
    return { success: false, error: "Failed to create account" };
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
  try {
    const { password, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (rest.email) data.email = rest.email.toLowerCase();
    if (password) data.passwordHash = await bcrypt.hash(password, 10);

    const tenant = await prisma.tenant.update({
      where: { id },
      data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Admin",
        action: "TENANT_UPDATED",
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
 * On a false → true transition, also stamps `sessionsValidAfter = now()` so
 * every existing session in that tenant is invalidated on its next request
 * (the JWT callback in pages/api/auth/[...nextauth].ts compares token.iat
 * against this timestamp and returns an empty token if older). On true →
 * false we leave sessions alone — relaxing MFA shouldn't punt people out.
 */
export async function toggleTenantMFA(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "FORBIDDEN" };
  }
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
        userName: session.user.name,
        userRole: session.user.role,
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
  try {
    await prisma.tenant.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
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

export async function createSubscription(
  input: z.input<typeof CreateSubscriptionSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Access denied" };
  }
  const parsed = CreateSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const sub = await prisma.subscription.upsert({
      where: { tenantId: parsed.data.tenantId },
      update: {
        maxAccounts: parsed.data.maxAccounts,
        startDate: new Date(parsed.data.startDate),
        expiryDate: new Date(parsed.data.expiryDate),
        status: parsed.data.status,
      },
      create: {
        tenantId: parsed.data.tenantId,
        maxAccounts: parsed.data.maxAccounts,
        startDate: new Date(parsed.data.startDate),
        expiryDate: new Date(parsed.data.expiryDate),
        status: parsed.data.status,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Admin",
        action: "SUBSCRIPTION_UPSERTED",
        recordId: parsed.data.tenantId,
        newValue: parsed.data.status,
      },
    });
    revalidatePath("/admin");
    return { success: true, data: sub };
  } catch (err) {
    console.error("[action] createSubscription failed:", err);
    return { success: false, error: "Failed to save subscription" };
  }
}
