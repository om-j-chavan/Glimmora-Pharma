"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateDeviationSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  type: z.enum(["planned", "unplanned"]),
  category: z.enum(["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"]),
  severity: z.enum(["critical", "major", "minor"]),
  area: z.string().min(1),
  immediateAction: z.string().min(5),
  patientSafetyImpact: z.enum(["high", "medium", "low", "none"]),
  productQualityImpact: z.enum(["high", "medium", "low", "none"]),
  regulatoryImpact: z.enum(["high", "medium", "low", "none"]),
  owner: z.string().min(1),
  dueDate: z.string().min(1),
  detectedDate: z.string().optional(),
  siteId: z.string().optional(),
  batchesAffected: z.string().optional(),
});

const UpdateDeviationSchema = CreateDeviationSchema.partial().extend({
  status: z.string().optional(),
  rootCause: z.string().optional(),
  rcaMethod: z.string().optional(),
});

const RejectSchema = z.object({
  reason: z.string().min(5),
});

export async function createDeviation(
  input: z.input<typeof CreateDeviationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateDeviationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const deviation = await prisma.deviation.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        type: parsed.data.type,
        category: parsed.data.category,
        severity: parsed.data.severity,
        area: parsed.data.area,
        immediateAction: parsed.data.immediateAction,
        patientSafetyImpact: parsed.data.patientSafetyImpact,
        productQualityImpact: parsed.data.productQualityImpact,
        regulatoryImpact: parsed.data.regulatoryImpact,
        owner: parsed.data.owner,
        siteId: parsed.data.siteId ?? null,
        batchesAffected: parsed.data.batchesAffected ?? null,
        tenantId: session.user.tenantId,
        status: "open",
        detectedBy: session.user.name,
        detectedDate: parsed.data.detectedDate ? new Date(parsed.data.detectedDate) : new Date(),
        dueDate: new Date(parsed.data.dueDate),
        createdBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_CREATED",
        recordId: deviation.id,
        recordTitle: parsed.data.title,
        newValue: parsed.data.severity,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] createDeviation failed:", err);
    return { success: false, error: "Failed to create deviation" };
  }
}

export async function updateDeviation(
  id: string,
  input: z.input<typeof UpdateDeviationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateDeviationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const { dueDate, detectedDate, ...rest } = parsed.data;
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...rest,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        ...(detectedDate ? { detectedDate: new Date(detectedDate) } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] updateDeviation failed:", err);
    return { success: false, error: "Failed to update deviation" };
  }
}

export async function closeDeviation(id: string, notes?: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can close deviations" };
  }
  try {
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "closed",
        closedBy: session.user.name,
        closedDate: new Date(),
        closureNotes: notes ?? null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_CLOSED",
        recordId: id,
      },
    });
    revalidatePath("/deviation");
    revalidatePath("/");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] closeDeviation failed:", err);
    return { success: false, error: "Failed to close deviation" };
  }
}

export async function rejectDeviation(
  id: string,
  input: z.input<typeof RejectSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can reject deviations" };
  }
  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Rejection reason must be at least 5 characters" };
  }
  try {
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "rejected" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_REJECTED",
        recordId: id,
        newValue: parsed.data.reason.slice(0, 200),
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] rejectDeviation failed:", err);
    return { success: false, error: "Failed to reject deviation" };
  }
}

export async function deleteDeviation(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    await prisma.deviation.delete({
      where: { id, tenantId: session.user.tenantId },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Deviation Management",
        action: "DEVIATION_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteDeviation failed:", err);
    return { success: false, error: "Failed to delete deviation" };
  }
}
