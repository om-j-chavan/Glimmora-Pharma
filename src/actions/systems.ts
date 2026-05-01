"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateSystemSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(1),
  vendor: z.string().optional(),
  version: z.string().optional(),
  gxpRelevance: z.string().default("Major"),
  gamp5Category: z.string().default("4"),
  riskLevel: z.string().default("MEDIUM"),
  siteId: z.string().optional(),
  intendedUse: z.string().optional(),
  gxpScope: z.string().optional(),
  plannedActions: z.string().optional(),
  owner: z.string().optional(),
  validationStatus: z.string().optional(),
});

const STANDARD_STAGES = ["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR"] as const;

export async function createSystem(
  input: z.input<typeof CreateSystemSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateSystemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const system = await prisma.gxPSystem.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
        validationStatus: "Not Started",
        createdBy: session.user.name,
      },
    });

    await prisma.validationStage.createMany({
      data: STANDARD_STAGES.map((stageName) => ({
        systemId: system.id,
        stageName,
        status: "not_started",
      })),
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "SYSTEM_CREATED",
        recordId: system.id,
        recordTitle: parsed.data.name,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] createSystem failed:", err);
    return { success: false, error: "Failed to create system" };
  }
}

export async function updateSystem(
  id: string,
  input: Partial<z.input<typeof CreateSystemSchema>>,
): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const system = await prisma.gxPSystem.update({
      where: { id, tenantId: session.user.tenantId },
      data: input,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "SYSTEM_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] updateSystem failed:", err);
    return { success: false, error: "Failed to update system" };
  }
}

export async function submitStageForReview(stageId: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "in_review",
        submittedBy: session.user.name,
        submittedDate: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_SUBMITTED_FOR_REVIEW",
        recordId: stageId,
        newValue: stage.stageName,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] submitStageForReview failed:", err);
    return { success: false, error: "Failed to submit stage" };
  }
}

export async function approveStage(stageId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can approve stages" };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "approved",
        approvedBy: session.user.name,
        approvedDate: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_APPROVED",
        recordId: stageId,
        newValue: `${stage.stageName} → approved`,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] approveStage failed:", err);
    return { success: false, error: "Failed to approve stage" };
  }
}

export async function rejectStage(stageId: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can reject stages" };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "rejected",
        rejectedBy: session.user.name,
        rejectionReason: reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_REJECTED",
        recordId: stageId,
        newValue: reason.slice(0, 200),
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] rejectStage failed:", err);
    return { success: false, error: "Failed to reject stage" };
  }
}

export async function deleteSystem(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    await prisma.gxPSystem.delete({
      where: { id, tenantId: session.user.tenantId },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "SYSTEM_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteSystem failed:", err);
    return { success: false, error: "Failed to delete system" };
  }
}

/* ══════════════════════════════════════
 * SKIP STAGE (QA Head only)
 * ══════════════════════════════════════ */

export async function skipStage(stageId: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can skip stages" };
  }
  if (!reason.trim()) {
    return { success: false, error: "Skip reason required" };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "skipped",
        approvedBy: session.user.name,
        approvedDate: new Date(),
        rejectionReason: reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_SKIPPED",
        recordId: stageId,
        newValue: reason.slice(0, 200),
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] skipStage failed:", err);
    return { success: false, error: "Failed to skip stage" };
  }
}

/* ══════════════════════════════════════
 * UPDATE STAGE NOTES
 * ══════════════════════════════════════ */

export async function updateStageNotes(stageId: string, notes: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: { notes },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "STAGE_NOTES_UPDATED",
        recordId: stageId,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] updateStageNotes failed:", err);
    return { success: false, error: "Failed to update notes" };
  }
}

/* ══════════════════════════════════════
 * ROADMAP ACTIVITIES
 *
 * Schema fields: id, systemId, title, type, status,
 * startDate?, endDate?, owner?, completionType?, createdAt, updatedAt.
 * (No `activityType`, `priority`, `completedBy`, or `completedAt` columns —
 * spec assumed those; we omit them.)
 * ══════════════════════════════════════ */

const AddRoadmapActivitySchema = z.object({
  systemId: z.string().min(1),
  title: z.string().min(2),
  type: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  owner: z.string().optional(),
  completionType: z.string().optional(),
});

export async function addRoadmapActivity(
  input: z.input<typeof AddRoadmapActivitySchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AddRoadmapActivitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const activity = await prisma.roadmapActivity.create({
      data: {
        systemId: parsed.data.systemId,
        title: parsed.data.title,
        type: parsed.data.type,
        owner: parsed.data.owner ?? null,
        completionType: parsed.data.completionType ?? null,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        status: "Planned",
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "ROADMAP_ACTIVITY_ADDED",
        recordId: parsed.data.systemId,
        recordTitle: parsed.data.title,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: activity };
  } catch (err) {
    console.error("[action] addRoadmapActivity failed:", err);
    return { success: false, error: "Failed to add activity" };
  }
}

export async function updateRoadmapActivity(id: string, status: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.roadmapActivity.findFirst({
      where: { id, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const activity = await prisma.roadmapActivity.update({
      where: { id },
      data: { status },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "ROADMAP_ACTIVITY_UPDATED",
        recordId: id,
        newValue: status,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: activity };
  } catch (err) {
    console.error("[action] updateRoadmapActivity failed:", err);
    return { success: false, error: "Failed to update activity" };
  }
}
