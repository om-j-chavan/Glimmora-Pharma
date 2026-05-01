"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateSiteSchema = z.object({
  name: z.string().min(2),
  location: z.string().optional(),
  gmpScope: z.string().optional(),
  risk: z.string().default("MEDIUM"),
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
});

function isAdmin(role: string): boolean {
  return role === "customer_admin" || role === "super_admin";
}

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
        userName: session.user.name,
        userRole: session.user.role,
        module: "Settings",
        action: "SITE_CREATED",
        recordId: site.id,
        recordTitle: parsed.data.name,
      },
    });
    revalidatePath("/settings");
    return { success: true, data: site };
  } catch (err) {
    console.error("[action] createSite failed:", err);
    return { success: false, error: "Failed to create site" };
  }
}

export async function deleteSite(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.site.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    await prisma.site.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
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
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
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
        userName: session.user.name,
        userRole: session.user.role,
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
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  // High-value: blocks customer_admin of tenant A from mutating users in tenant B.
  if (session.user.role !== "super_admin") {
    const owned = await prisma.user.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const { password, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (password) data.passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id },
      data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
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

export async function deleteUser(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Access denied" };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.user.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    await prisma.user.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
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
