"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, COMPLIANCE_AUTHOR_ROLES } from "@/lib/auth";
import { DEVIATION_QA_ROLES, isAssignedToTask } from "@/lib/permissions/roleSets";
import { createDocument } from "@/actions/documents";
import { notify } from "@/lib/notify";
import { sanitizeServerError } from "@/lib/errors";
import type { ActionResult } from "@/actions/capas/_types";

/**
 * Stage 4 (deviation redesign) — the LOW-priority DeviationTask lifecycle.
 *
 * Mirrors the CAPAActionItem assign → do → submit → review pattern
 * (src/actions/capas/action-items.ts; REUSABLES.md Part D) but for a low-
 * priority deviation worked as ONE lightweight task instead of a full
 * investigation/CAPA. The deviation record stays fully Part 11: the QA
 * "close" outcome is the SIGNED closeDeviation (deviations.ts) — NO close
 * happens in this file.
 *
 * Status machine (DeviationTask.status — app-validated; SQLite has no enums):
 *   pending → in_progress → submitted → (QA review) closed | rework | cancelled
 *   • "closed"    — written ONLY by the signed closeDeviation (Stage 4 part 2).
 *   • "rework"    — QA returns the task (reworkDeviationTask, Stage 4 part 2).
 *   • "cancelled" — the raise-CAPA escalation supersedes the task (createCAPA).
 *
 * This file owns: assign (QA), start + submit + attach-doc (assignee).
 */

const TASK_OPEN_STATUSES = ["pending", "in_progress", "submitted", "rework"];

const AssignSchema = z.object({
  assigneeId: z.string().min(1, "Assignee is required"),
  message: z.string().min(5, "Instruction is required (min 5 chars)"),
  dueDate: z.string().optional(),
});

/**
 * ASSIGN — QA Head assigns a low-priority deviation to a user. Guard:
 * DEVIATION_QA_ROLES (the same set that gates close/reject/CAPA decisions,
 * REUSABLES.md). Assignee pool = ANY active tenant user (broadened from the
 * old compliance-user-only picker).
 */
export async function assignDeviationTask(
  deviationId: string,
  input: z.input<typeof AssignSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can assign deviation tasks." };
  }

  const deviation = await prisma.deviation.findFirst({
    where: { id: deviationId, tenantId: session.user.tenantId },
    select: { id: true, reference: true, title: true, status: true, priority: true },
  });
  if (!deviation) return { success: false, error: "Deviation not found" };
  if (deviation.status === "closed" || deviation.status === "rejected") {
    return { success: false, error: "This deviation is already resolved." };
  }
  // The task path is the LOW-priority branch (Stage 3 routing). High/Medium
  // raise a CAPA instead.
  if (deviation.priority !== "Low") {
    return { success: false, error: "Tasks are for low-priority deviations; high/medium priority raises a CAPA." };
  }
  // One active task at a time — re-assign only after the current one closes,
  // reworks back, or is cancelled.
  const existingOpen = await prisma.deviationTask.findFirst({
    where: { deviationId, tenantId: session.user.tenantId, deletedAt: null, status: { in: TASK_OPEN_STATUSES } },
    select: { id: true },
  });
  if (existingOpen) return { success: false, error: "This deviation already has an open task." };

  // Assignee pool = any active tenant user. Validate membership + active here;
  // viewers can't act on tasks so they're excluded.
  const assignee = await prisma.user.findFirst({
    where: { id: parsed.data.assigneeId, tenantId: session.user.tenantId, isActive: true },
    select: { id: true, name: true, role: true },
  });
  if (!assignee) return { success: false, error: "Assignee must be an active user in your organisation." };
  if (assignee.role === "viewer") return { success: false, error: "Viewers cannot be assigned tasks." };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const created = await prisma.deviationTask.create({
      data: {
        tenantId: session.user.tenantId,
        deviationId,
        assignee: assignee.name,
        assigneeId: assignee.id,
        message: parsed.data.message,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        status: "pending",
        createdById: actor.userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_TASK_ASSIGNED",
        recordId: deviationId,
        recordTitle: (deviation.reference ?? deviation.title).slice(0, 80),
        newValue: JSON.stringify({ taskId: created.id, assigneeId: assignee.id, dueDate: created.dueDate?.toISOString() ?? null }),
      },
    });

    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: assignee.id,
      actorUserId: actor.userId,
      type: "ACTION_ASSIGNED",
      title: `New deviation task assigned to you (${deviation.reference ?? deviationId.slice(0, 8)})`,
      body: parsed.data.message.slice(0, 200),
      linkPath: "/worklist",
      entityType: "DeviationTask",
      entityId: created.id,
    });

    revalidatePath("/deviation");
    revalidatePath("/worklist");
    return { success: true, data: created };
  } catch (err) {
    console.error("[action] assignDeviationTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to assign task") };
  }
}

/**
 * START — the assignee moves their task pending|rework → in_progress. Only the
 * assignee (isAssignedToTask, REUSABLES.md; viewer hard-stopped inside it).
 */
export async function startDeviationTask(taskId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const task = await prisma.deviationTask.findFirst({
    where: { id: taskId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, assigneeId: true, status: true },
  });
  if (!task) return { success: false, error: "Task not found" };
  if (!isAssignedToTask(session, { ownerId: task.assigneeId })) {
    return { success: false, error: "Only the assigned user can start this task." };
  }
  if (task.status !== "pending" && task.status !== "rework") {
    return { success: false, error: "Only a pending or reworked task can be started." };
  }
  try {
    const updated = await prisma.deviationTask.update({
      where: { id: taskId, tenantId: session.user.tenantId },
      data: { status: "in_progress" },
    });
    revalidatePath("/worklist");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] startDeviationTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to start task") };
  }
}

const SubmitSchema = z.object({
  completionNotes: z.string().min(5, "Completion notes are required (min 5 chars)"),
});

/**
 * SUBMIT — the assignee submits the completed work with completionNotes,
 * status → submitted. Assignee-only (isAssignedToTask). Notifies the QA who
 * assigned it (createdById) that it's ready for review.
 */
export async function submitDeviationTask(
  taskId: string,
  input: z.input<typeof SubmitSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const task = await prisma.deviationTask.findFirst({
    where: { id: taskId, tenantId: session.user.tenantId, deletedAt: null },
    include: { deviation: { select: { id: true, reference: true, title: true } } },
  });
  if (!task) return { success: false, error: "Task not found" };
  if (!isAssignedToTask(session, { ownerId: task.assigneeId })) {
    return { success: false, error: "Only the assigned user can submit this task." };
  }
  if (task.status !== "pending" && task.status !== "in_progress" && task.status !== "rework") {
    return { success: false, error: "This task can no longer be submitted." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const updated = await prisma.deviationTask.update({
      where: { id: taskId, tenantId: session.user.tenantId },
      data: {
        status: "submitted",
        completionNotes: parsed.data.completionNotes,
        submittedAt: new Date(),
        submittedById: actor.userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_TASK_SUBMITTED",
        recordId: task.deviation.id,
        recordTitle: (task.deviation.reference ?? task.deviation.title).slice(0, 80),
        newValue: JSON.stringify({ taskId }),
      },
    });
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: task.createdById,
      actorUserId: actor.userId,
      type: "ACTION_ASSIGNED",
      title: `Deviation task submitted for review (${task.deviation.reference ?? task.deviation.id.slice(0, 8)})`,
      body: parsed.data.completionNotes.slice(0, 200),
      linkPath: "/deviation",
      entityType: "DeviationTask",
      entityId: taskId,
    });
    revalidatePath("/worklist");
    revalidatePath("/deviation");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] submitDeviationTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to submit task") };
  }
}

/**
 * ATTACH DOCUMENT — the assignee (or QA) attaches evidence to the task.
 *
 * Upload gate is BROADENED beyond attachDeviationDocument's author-only set:
 * the assigned user may attach even if their role isn't a GxP author (e.g.
 * operations_head). It reuses isAssignedToTask (REUSABLES.md) and the shared
 * createDocument pipeline via its server-only bypassAuthorGate option (the
 * super_admin/viewer stops inside createDocument still apply). Document links
 * generically: linkedModule = "Deviation Task", linkedRecordId = task id.
 */
export async function attachDeviationTaskDocument(
  taskId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAuth();
  const task = await prisma.deviationTask.findFirst({
    where: { id: taskId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, assigneeId: true, status: true, deviationId: true },
  });
  if (!task) return { success: false, error: "Task not found" };

  const isAssignee = isAssignedToTask(session, { ownerId: task.assigneeId });
  const isAuthor = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  if (!isAssignee && !isAuthor) {
    return { success: false, error: "Only the assigned user or QA can attach evidence to this task." };
  }
  if (task.status === "closed" || task.status === "cancelled") {
    return { success: false, error: "This task is closed; evidence can no longer be attached." };
  }

  formData.set("linkedModule", "Deviation Task");
  formData.set("linkedRecordId", taskId);
  // The assignee is authorized above via isAssignedToTask, so bypass the
  // author-role gate in createDocument (its super_admin + viewer stops remain).
  const created = await createDocument(formData, { bypassAuthorGate: isAssignee });
  if (!created.success) return created;

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "Deviation Management",
      action: "DEVIATION_TASK_EVIDENCE_ATTACHED",
      recordId: task.deviationId,
      newValue: JSON.stringify({ taskId, documentId: (created.data as { id?: string } | null)?.id ?? null }),
    },
  });
  revalidatePath("/worklist");
  return created;
}

const ReworkSchema = z.object({
  reworkReason: z.string().min(5, "Rework reason is required (min 5 chars)"),
});

/**
 * REVIEW → REWORK — QA returns a SUBMITTED task to the assignee. Guard:
 * DEVIATION_QA_ROLES + Separation of Duties (the reviewer must NOT be the task
 * assignee — ID-based FK compare, REUSABLES.md). The CLOSE review outcome is
 * NOT here: it is the Part 11 signed closeDeviation (deviations.ts), which also
 * completes the task and enforces the same SoD.
 */
export async function reworkDeviationTask(
  taskId: string,
  input: z.input<typeof ReworkSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ReworkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can review deviation tasks." };
  }
  const task = await prisma.deviationTask.findFirst({
    where: { id: taskId, tenantId: session.user.tenantId, deletedAt: null },
    include: { deviation: { select: { id: true, reference: true, title: true } } },
  });
  if (!task) return { success: false, error: "Task not found" };
  if (task.status !== "submitted") {
    return { success: false, error: "Only a submitted task can be sent back for rework." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // SoD — the reviewer cannot be the task assignee (ID-based FK compare; reject
  // if equal). REUSABLES.md.
  if (task.assigneeId && task.assigneeId === actor.userId) {
    return { success: false, error: "Separation of duties: you cannot review a task assigned to you. A different QA Head must review it." };
  }
  try {
    const updated = await prisma.deviationTask.update({
      where: { id: taskId, tenantId: session.user.tenantId },
      data: {
        status: "rework",
        reworkReason: parsed.data.reworkReason,
        reworkAt: new Date(),
        reworkById: actor.userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_TASK_REWORK",
        recordId: task.deviation.id,
        recordTitle: (task.deviation.reference ?? task.deviation.title).slice(0, 80),
        newValue: JSON.stringify({ taskId, reason: parsed.data.reworkReason.slice(0, 200) }),
      },
    });
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: task.assigneeId,
      actorUserId: actor.userId,
      type: "REWORK_ASSIGNED",
      title: `Deviation task returned for rework (${task.deviation.reference ?? task.deviation.id.slice(0, 8)})`,
      body: parsed.data.reworkReason.slice(0, 200),
      linkPath: "/worklist",
      entityType: "DeviationTask",
      entityId: taskId,
    });
    revalidatePath("/worklist");
    revalidatePath("/deviation");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] reworkDeviationTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to send task for rework") };
  }
}
