"use server";

/**
 * Server Actions for Gap Assessment findings.
 *
 * Reference implementation — shows the pattern for
 * migrating from Redux dispatch + API routes to
 * Server Actions + revalidatePath.
 *
 * Each action:
 *  1. Checks auth via requireAuth()
 *  2. Validates input with Zod
 *  3. Mutates via Prisma
 *  4. Creates audit log entry
 *  5. Revalidates the page cache
 *  6. Returns result (no throw — return errors)
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// ── Schemas ──

const CreateFindingSchema = z.object({
  requirement: z.string().min(10, "Requirement must be at least 10 characters"),
  area: z.string().min(1, "Area is required"),
  framework: z.string().optional(),
  severity: z.enum(["Critical", "High", "Low"]),
  owner: z.string().min(1, "Owner is required"),
  targetDate: z.string().min(1, "Target date is required"),
  siteId: z.string().optional(),
  evidenceLink: z.string().optional(),
});

const UpdateFindingSchema = z.object({
  requirement: z.string().min(10).optional(),
  area: z.string().min(1).optional(),
  severity: z.enum(["Critical", "High", "Low"]).optional(),
  status: z.enum(["Open", "In Progress", "Closed"]).optional(),
  owner: z.string().min(1).optional(),
  targetDate: z.string().optional(),
  rootCause: z.string().optional(),
  evidenceLink: z.string().optional(),
  linkedCAPAId: z.string().optional(),
});

// ── Return types ──

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// ── Actions ──

export async function createFinding(input: z.input<typeof CreateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const finding = await prisma.finding.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
        status: "Open",
        createdBy: session.user.name,
        targetDate: new Date(parsed.data.targetDate),
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Gap Assessment",
        action: "FINDING_CREATED",
        recordId: finding.id,
        recordTitle: parsed.data.requirement.slice(0, 80),
        newValue: parsed.data.severity,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] createFinding failed:", err);
    return { success: false, error: "Failed to create finding" };
  }
}

export async function updateFinding(id: string, input: z.input<typeof UpdateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const finding = await prisma.finding.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...parsed.data,
        ...(parsed.data.targetDate ? { targetDate: new Date(parsed.data.targetDate) } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Gap Assessment",
        action: "FINDING_UPDATED",
        recordId: id,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] updateFinding failed:", err);
    return { success: false, error: "Failed to update finding" };
  }
}

export async function deleteFinding(id: string): Promise<ActionResult> {
  const session = await requireAuth();

  try {
    await prisma.finding.delete({
      where: { id, tenantId: session.user.tenantId },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Gap Assessment",
        action: "FINDING_DELETED",
        recordId: id,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteFinding failed:", err);
    return { success: false, error: "Failed to delete finding" };
  }
}

export async function closeFinding(id: string): Promise<ActionResult> {
  const session = await requireAuth();

  try {
    const finding = await prisma.finding.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "Closed" },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Gap Assessment",
        action: "FINDING_CLOSED",
        recordId: id,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] closeFinding failed:", err);
    return { success: false, error: "Failed to close finding" };
  }
}
