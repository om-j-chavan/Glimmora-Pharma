"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import {
  CSV_SYSTEM_WRITE_ROLES as STAGE_TASK_MANAGE_ROLES,
  isAssignedToTask,
} from "@/lib/permissions/roleSets";
import { notify } from "@/lib/notify";
import { sanitizeServerError } from "@/lib/errors";
import type { ActionResult } from "@/actions/capas/_types";

/**
 * CSV/CSA stage rework tasks — the assignable fix-task lifecycle a Validation
 * Lead uses to delegate a QA-rejected stage's rework to operational staff.
 *
 * 1:1 mirror of the low-priority DeviationTask flow (src/actions/deviation-
 * tasks.ts) scoped to a ValidationStage. Differences by design:
 *   • the ASSIGNER is the Validation Lead (CSV_SYSTEM_WRITE_ROLES), not QA —
 *     the Lead owns stage execution; QA stays at the stage approve/reject level;
 *   • MULTIPLE open tasks per stage are allowed (one rejection → many fix items),
 *     so the deviation "one open task" cap is intentionally NOT carried over;
 *   • worker actions (start/submit) never call requireGxPAuthor — operational
 *     staff are not GxP authors but must be able to work their own task.
 *
 * Status machine (app-validated; SQLite has no enums):
 *   pending → in_progress → submitted → (Lead review) closed | rework
 * The stage's own QA approve/reject is untouched; these tasks gate resubmission
 * (submitStageForReview blocks while any task is still open).
 */

const CSV_MODULE = "CSV/CSA";

// Stage statuses where rework delegation makes sense — i.e. the stage is being
// (re)worked, not under review / approved / skipped / never started.
const REWORKABLE_STAGE_STATUSES = ["in_progress", "draft", "rejected"];

/** Reject a "YYYY-MM-DD" due date that's in the past (floored at yesterday to
 *  absorb client/server timezone skew). Mirrors deviation-tasks.notPastDate. */
function notPastDate(d: string): boolean {
  const f = new Date();
  f.setDate(f.getDate() - 1);
  const floor = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
  return d >= floor;
}

const AssignSchema = z.object({
  assigneeId: z.string().min(1, "Assignee is required"),
  message: z.string().min(5, "Instruction is required (min 5 chars)"),
  findingRef: z.string().max(300).optional(),
  dueDate: z.string().refine(notPastDate, "Due date cannot be in the past").optional(),
});

/**
 * ASSIGN — the Validation Lead delegates one rework item on a (rejected /
 * in-progress) stage to an operational user. Guard: CSV_SYSTEM_WRITE_ROLES.
 */
export async function assignStageReworkTask(
  stageId: string,
  input: z.input<typeof AssignSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!STAGE_TASK_MANAGE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only the Validation Lead can assign rework tasks." };
  }

  const stage = await prisma.validationStage.findFirst({
    where: session.user.role === "super_admin"
      ? { id: stageId }
      : { id: stageId, system: { tenantId: session.user.tenantId } },
    select: { id: true, stageName: true, status: true, systemId: true, system: { select: { reference: true, name: true } } },
  });
  if (!stage) return { success: false, error: "FORBIDDEN" };
  if (!REWORKABLE_STAGE_STATUSES.includes(stage.status)) {
    return { success: false, error: "Rework tasks can only be raised on a stage that is in progress or was returned by QA." };
  }

  // Assignee pool = any active tenant user, excluding platform/admin/viewer
  // (mirrors the deviation assignee rule — tasks go to operational staff).
  const assignee = await prisma.user.findFirst({
    where: { id: parsed.data.assigneeId, tenantId: session.user.tenantId, isActive: true },
    select: { id: true, name: true, role: true },
  });
  if (!assignee) return { success: false, error: "Assignee must be an active user in your organisation." };
  if (["super_admin", "customer_admin", "viewer"].includes(assignee.role)) {
    return { success: false, error: "Tasks can only be assigned to operational staff, not platform or admin roles." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const created = await prisma.validationStageTask.create({
      data: {
        tenantId: session.user.tenantId,
        validationStageId: stageId,
        systemId: stage.systemId,
        assignee: assignee.name,
        assigneeId: assignee.id,
        message: parsed.data.message,
        findingRef: parsed.data.findingRef || null,
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
        module: CSV_MODULE,
        action: "STAGE_REWORK_TASK_ASSIGNED",
        recordId: stage.systemId,
        recordTitle: (stage.system.reference ?? stage.system.name).slice(0, 80),
        newValue: JSON.stringify({ taskId: created.id, stage: stage.stageName, assigneeId: assignee.id }),
      },
    });
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: assignee.id,
      actorUserId: actor.userId,
      type: "ACTION_ASSIGNED",
      title: `New validation rework task (${stage.system.reference ?? stage.stageName})`,
      body: parsed.data.message.slice(0, 200),
      linkPath: "/worklist",
      entityType: "ValidationStageTask",
      entityId: created.id,
    });
    revalidatePath("/csv-csa");
    revalidatePath("/worklist");
    return { success: true, data: created };
  } catch (err) {
    console.error("[action] assignStageReworkTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to assign task") };
  }
}

/** START — the assignee moves pending|rework → in_progress. Assignee-only. */
export async function startStageReworkTask(taskId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const task = await prisma.validationStageTask.findFirst({
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
    const updated = await prisma.validationStageTask.update({
      where: { id: taskId },
      data: { status: "in_progress" },
    });
    revalidatePath("/worklist");
    revalidatePath("/csv-csa");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] startStageReworkTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to start task") };
  }
}

const SubmitSchema = z.object({
  completionNotes: z.string().min(5, "Completion notes are required (min 5 chars)"),
});

/** SUBMIT — the assignee submits completed work; status → submitted. Notifies
 *  the Lead who assigned it (createdById). Assignee-only. */
export async function submitStageReworkTask(
  taskId: string,
  input: z.input<typeof SubmitSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const task = await prisma.validationStageTask.findFirst({
    where: { id: taskId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, assigneeId: true, status: true, systemId: true, createdById: true, validationStage: { select: { stageName: true, system: { select: { reference: true } } } } },
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
    const updated = await prisma.validationStageTask.update({
      where: { id: taskId },
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
        module: CSV_MODULE,
        action: "STAGE_REWORK_TASK_SUBMITTED",
        recordId: task.systemId,
        newValue: JSON.stringify({ taskId, stage: task.validationStage.stageName }),
      },
    });
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: task.createdById,
      actorUserId: actor.userId,
      type: "REVIEW_REQUESTED",
      title: `Rework task submitted for review (${task.validationStage.system.reference ?? task.validationStage.stageName})`,
      body: parsed.data.completionNotes.slice(0, 200),
      linkPath: "/csv-csa",
      entityType: "ValidationStageTask",
      entityId: taskId,
    });
    revalidatePath("/worklist");
    revalidatePath("/csv-csa");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] submitStageReworkTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to submit task") };
  }
}

const ReviewSchema = z.object({
  decision: z.enum(["close", "rework"]),
  reworkReason: z.string().max(2000).optional(),
});

/**
 * REVIEW — the Validation Lead reviews a SUBMITTED task and either CLOSES it
 * (rework done) or sends it back for REWORK with a reason. Guard:
 * CSV_SYSTEM_WRITE_ROLES + Separation of Duties (reviewer must NOT be the
 * assignee — ID-based compare).
 */
export async function reviewStageReworkTask(
  taskId: string,
  input: z.input<typeof ReviewSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!STAGE_TASK_MANAGE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only the Validation Lead can review rework tasks." };
  }
  if (parsed.data.decision === "rework" && (parsed.data.reworkReason ?? "").trim().length < 5) {
    return { success: false, error: "A rework reason (min 5 chars) is required to send a task back." };
  }
  const task = await prisma.validationStageTask.findFirst({
    where: { id: taskId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, assigneeId: true, status: true, systemId: true, validationStage: { select: { stageName: true } } },
  });
  if (!task) return { success: false, error: "Task not found" };
  if (task.status !== "submitted") {
    return { success: false, error: "Only a submitted task can be reviewed." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // SoD — the reviewer cannot be the task assignee.
  if (task.assigneeId && task.assigneeId === actor.userId) {
    return { success: false, error: "Separation of duties: you cannot review a task assigned to you. A different reviewer must close it." };
  }
  const isClose = parsed.data.decision === "close";
  try {
    const updated = await prisma.validationStageTask.update({
      where: { id: taskId },
      data: isClose
        ? { status: "closed", reviewedAt: new Date(), reviewedById: actor.userId, closedAt: new Date() }
        : { status: "rework", reviewedAt: new Date(), reviewedById: actor.userId, reworkReason: parsed.data.reworkReason!.trim() },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_MODULE,
        action: isClose ? "STAGE_REWORK_TASK_CLOSED" : "STAGE_REWORK_TASK_REWORK",
        recordId: task.systemId,
        newValue: JSON.stringify({ taskId, stage: task.validationStage.stageName, decision: parsed.data.decision }),
      },
    });
    if (!isClose) {
      await notify({
        tenantId: session.user.tenantId,
        recipientUserId: task.assigneeId,
        actorUserId: actor.userId,
        type: "REWORK_ASSIGNED",
        title: `Validation rework task returned`,
        body: (parsed.data.reworkReason ?? "").slice(0, 200),
        linkPath: "/worklist",
        entityType: "ValidationStageTask",
        entityId: taskId,
      });
    }
    revalidatePath("/worklist");
    revalidatePath("/csv-csa");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] reviewStageReworkTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to review task") };
  }
}

/** CANCEL — the Validation Lead soft-deletes a task that is no longer needed
 *  (e.g. duplicate, or the rework was folded into another task). Part 11
 *  retention: sets deletedAt, never destroys the row. Closed tasks stay. */
export async function cancelStageReworkTask(taskId: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!STAGE_TASK_MANAGE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only the Validation Lead can cancel rework tasks." };
  }
  if ((reason ?? "").trim().length < 5) {
    return { success: false, error: "A cancellation reason (min 5 chars) is required." };
  }
  const task = await prisma.validationStageTask.findFirst({
    where: { id: taskId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, status: true, systemId: true },
  });
  if (!task) return { success: false, error: "Task not found" };
  if (task.status === "closed") {
    return { success: false, error: "A closed task cannot be cancelled." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.validationStageTask.update({
      where: { id: taskId },
      data: { deletedAt: new Date(), deletedById: actor.userId, deletedByName: actor.displayName, deletionReason: reason.trim(), status: "cancelled" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_MODULE,
        action: "STAGE_REWORK_TASK_CANCELLED",
        recordId: task.systemId,
        newValue: JSON.stringify({ taskId, reason: reason.trim().slice(0, 200) }),
      },
    });
    revalidatePath("/worklist");
    revalidatePath("/csv-csa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] cancelStageReworkTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to cancel task") };
  }
}
