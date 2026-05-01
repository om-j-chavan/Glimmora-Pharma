"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateInspectionSchema = z.object({
  title: z.string().min(3),
  siteName: z.string().min(1),
  agency: z.string().min(1),
  type: z.enum(["announced", "unannounced", "follow_up", "pre_approval"]),
  expectedDate: z.string().optional(),
  inspectionLead: z.string().optional(),
  notes: z.string().optional(),
});

const STANDARD_ACTIONS: Array<{
  title: string;
  lane: string;
  bucket: string;
  priority: string;
}> = [
  { title: "Review previous inspection findings", lane: "documentation", bucket: "12_weeks", priority: "High" },
  { title: "Update master document list", lane: "documentation", bucket: "12_weeks", priority: "High" },
  { title: "Train front room team", lane: "training", bucket: "8_weeks", priority: "High" },
  { title: "Train back room team", lane: "training", bucket: "8_weeks", priority: "High" },
  { title: "Mock inspection simulation", lane: "simulation", bucket: "4_weeks", priority: "Critical" },
  { title: "Close all critical CAPAs", lane: "compliance", bucket: "8_weeks", priority: "Critical" },
  { title: "Verify audit trail coverage", lane: "compliance", bucket: "8_weeks", priority: "Critical" },
  { title: "Update SOPs", lane: "documentation", bucket: "8_weeks", priority: "High" },
  { title: "Prepare inspection room", lane: "logistics", bucket: "1_week", priority: "High" },
  { title: "Assign front room roles", lane: "logistics", bucket: "4_weeks", priority: "High" },
  { title: "Assign back room roles", lane: "logistics", bucket: "4_weeks", priority: "High" },
  { title: "Review data integrity status", lane: "compliance", bucket: "8_weeks", priority: "Critical" },
  { title: "Complete CSV validation backlog", lane: "compliance", bucket: "12_weeks", priority: "High" },
  { title: "Prepare regulatory filing summary", lane: "documentation", bucket: "4_weeks", priority: "Medium" },
  { title: "Test communication protocols", lane: "logistics", bucket: "2_weeks", priority: "Medium" },
  { title: "Final readiness review", lane: "compliance", bucket: "1_week", priority: "Critical" },
];

export async function createInspection(
  input: z.input<typeof CreateInspectionSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateInspectionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const inspection = await prisma.inspection.create({
      data: {
        title: parsed.data.title,
        siteName: parsed.data.siteName,
        agency: parsed.data.agency,
        type: parsed.data.type,
        inspectionLead: parsed.data.inspectionLead ?? null,
        notes: parsed.data.notes ?? null,
        tenantId: session.user.tenantId,
        status: "planning",
        createdBy: session.user.name,
        expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null,
      },
    });

    await prisma.readinessAction.createMany({
      data: STANDARD_ACTIONS.map((a) => ({
        title: a.title,
        lane: a.lane,
        bucket: a.bucket,
        priority: a.priority,
        inspectionId: inspection.id,
        status: "Not Started",
      })),
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Inspection Readiness",
        action: "INSPECTION_CREATED",
        recordId: inspection.id,
        recordTitle: parsed.data.title,
      },
    });
    revalidatePath("/readiness");
    return { success: true, data: inspection };
  } catch (err) {
    console.error("[action] createInspection failed:", err);
    return { success: false, error: "Failed to create inspection" };
  }
}

export async function markActionComplete(actionId: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.readinessAction.findFirst({
      where: { id: actionId, inspection: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const action = await prisma.readinessAction.update({
      where: { id: actionId },
      data: {
        status: "Complete",
        completedBy: session.user.name,
        completedAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Inspection Readiness",
        action: "ACTION_MARKED_COMPLETE",
        recordId: actionId,
        recordTitle: action.title,
      },
    });
    revalidatePath("/readiness");
    return { success: true, data: action };
  } catch (err) {
    console.error("[action] markActionComplete failed:", err);
    return { success: false, error: "Failed to mark complete" };
  }
}

export async function completeInspection(
  id: string,
  outcome: string,
  linkedFDA483Id?: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can complete inspections" };
  }
  try {
    const inspection = await prisma.inspection.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "completed",
        endDate: new Date(),
        notes: outcome,
        ...(linkedFDA483Id ? { linkedFDA483Id } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Inspection Readiness",
        action: "INSPECTION_COMPLETED",
        recordId: id,
        newValue: outcome.slice(0, 200),
      },
    });
    revalidatePath("/readiness");
    revalidatePath("/");
    return { success: true, data: inspection };
  } catch (err) {
    console.error("[action] completeInspection failed:", err);
    return { success: false, error: "Failed to complete inspection" };
  }
}

/* ══════════════════════════════════════
 * TRAINING RECORDS
 * (requires `prisma migrate dev` for the
 * TrainingRecord model added in turn-N)
 * ══════════════════════════════════════ */

const CreateTrainingSchema = z.object({
  inspectionId: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  userRole: z.string().min(1),
  module: z.string().min(1),
});

export async function createTrainingRecord(
  input: z.input<typeof CreateTrainingSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const record = await prisma.trainingRecord.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
        status: "pending",
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Inspection Readiness",
        action: "TRAINING_RECORD_CREATED",
        recordId: record.id,
        recordTitle: `${parsed.data.userName} — ${parsed.data.module}`,
      },
    });
    revalidatePath("/readiness");
    return { success: true, data: record };
  } catch (err) {
    console.error("[action] createTrainingRecord failed:", err);
    return { success: false, error: "Failed to create training record" };
  }
}

export async function completeTrainingRecord(
  id: string,
  score?: number,
  notes?: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.trainingRecord.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const record = await prisma.trainingRecord.update({
      where: { id },
      data: {
        status: "completed",
        completedAt: new Date(),
        score: score ?? null,
        notes: notes ?? null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Inspection Readiness",
        action: "TRAINING_COMPLETED",
        recordId: id,
        newValue: typeof score === "number" ? `Score: ${score}%` : "Completed",
      },
    });
    revalidatePath("/readiness");
    return { success: true, data: record };
  } catch (err) {
    console.error("[action] completeTrainingRecord failed:", err);
    return { success: false, error: "Failed to complete training" };
  }
}

/* ══════════════════════════════════════
 * SIMULATIONS
 * Schema fields: id, inspectionId, title, type, duration,
 * scheduledAt, participants, status, score, notes, createdBy, createdAt.
 * (No `feedback` / `completedAt` columns — score+notes hold the outcome.)
 * ══════════════════════════════════════ */

const CreateSimulationSchema = z.object({
  inspectionId: z.string().min(1),
  title: z.string().min(3),
  type: z.string().min(1),
  duration: z.number().int().optional(),
  scheduledAt: z.string().optional(),
  participants: z.string().optional(),
});

export async function createSimulation(
  input: z.input<typeof CreateSimulationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateSimulationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const sim = await prisma.simulation.create({
      data: {
        inspectionId: parsed.data.inspectionId,
        title: parsed.data.title,
        type: parsed.data.type,
        duration: parsed.data.duration ?? null,
        participants: parsed.data.participants ?? null,
        scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
        status: "Scheduled",
        createdBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Inspection Readiness",
        action: "SIMULATION_SCHEDULED",
        recordId: sim.id,
        recordTitle: parsed.data.title,
      },
    });
    revalidatePath("/readiness");
    return { success: true, data: sim };
  } catch (err) {
    console.error("[action] createSimulation failed:", err);
    return { success: false, error: "Failed to schedule simulation" };
  }
}

export async function completeSimulation(
  id: string,
  score: number,
  notes?: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.simulation.findFirst({
      where: { id, inspection: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const sim = await prisma.simulation.update({
      where: { id },
      data: {
        status: "Completed",
        score,
        notes: notes ?? null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Inspection Readiness",
        action: "SIMULATION_COMPLETED",
        recordId: id,
        newValue: `Score: ${score}%`,
      },
    });
    revalidatePath("/readiness");
    return { success: true, data: sim };
  } catch (err) {
    console.error("[action] completeSimulation failed:", err);
    return { success: false, error: "Failed to complete simulation" };
  }
}

/* ══════════════════════════════════════
 * PLAYBOOKS
 * (requires `prisma migrate dev` for the
 * Playbook model added in turn-N)
 * ══════════════════════════════════════ */

const CreatePlaybookSchema = z.object({
  title: z.string().min(2),
  type: z.string().min(1),
  description: z.string().optional(),
  content: z.string().min(5),
  category: z.string().default("general"),
});

export async function createPlaybook(
  input: z.input<typeof CreatePlaybookSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreatePlaybookSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const playbook = await prisma.playbook.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
        createdBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Inspection Readiness",
        action: "PLAYBOOK_CREATED",
        recordId: playbook.id,
        recordTitle: parsed.data.title,
      },
    });
    revalidatePath("/readiness");
    return { success: true, data: playbook };
  } catch (err) {
    console.error("[action] createPlaybook failed:", err);
    return { success: false, error: "Failed to create playbook" };
  }
}

export async function deletePlaybook(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.playbook.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    await prisma.playbook.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Inspection Readiness",
        action: "PLAYBOOK_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/readiness");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deletePlaybook failed:", err);
    return { success: false, error: "Failed to delete playbook" };
  }
}
