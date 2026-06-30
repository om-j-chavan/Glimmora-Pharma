"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, COMPLIANCE_AUTHOR_ROLES } from "@/lib/auth";
import { DEVIATION_QA_ROLES, isAssignedToTask } from "@/lib/permissions/roleSets";
import { createDocument } from "@/actions/documents";
import { EVIDENCE_CATEGORIES } from "@/lib/queries/evidence";
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

/** Reject a "YYYY-MM-DD" due date that's in the past. Defense-in-depth behind the
 *  DatePicker's client-side min — floored at YESTERDAY (server-local) so a
 *  client/server timezone skew never false-rejects a legitimate "today" pick. */
function notPastDate(d: string): boolean {
  const f = new Date();
  f.setDate(f.getDate() - 1);
  const floor = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
  return d >= floor;
}

const AssignSchema = z.object({
  assigneeId: z.string().min(1, "Assignee is required"),
  message: z.string().min(5, "Instruction is required (min 5 chars)"),
  dueDate: z.string().refine(notPastDate, "Due date cannot be in the past").optional(),
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
  // Assignees are operational STAFF who do the work — exclude platform/admin
  // roles (super_admin, customer_admin) and viewers. Mirrors the UI pool
  // (useComplianceUsers).
  if (["super_admin", "customer_admin", "viewer"].includes(assignee.role)) {
    return { success: false, error: "Tasks can only be assigned to operational staff, not platform or admin roles." };
  }

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
  // Piece 1 — optional GxP category (one of EVIDENCE_CATEGORIES). Stored on the
  // existing Document.category column so the doc groups in the modal and maps
  // 1:1 to a CAPA evidence category on carryover (Piece 2).
  category?: string,
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

  // Tag the new Document with its GxP category (validated against the shared
  // list). Done as a post-create update so the generic createDocument is
  // untouched. Invalid/absent category leaves Document.category null
  // (renders under "Uncategorized").
  const docId = (created.data as { id?: string } | null)?.id ?? null;
  if (docId && category && (EVIDENCE_CATEGORIES as readonly string[]).includes(category)) {
    await prisma.document.update({ where: { id: docId }, data: { category } });
  }

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
    // Stage 5 — persist QA's rework feedback in the conversation thread so it
    // survives the worker's resubmit (the reworkReason banner is just the
    // "current ask"; the thread is the durable history).
    await prisma.deviationTaskMessage.create({
      data: {
        tenantId: session.user.tenantId,
        taskId,
        authorId: actor.userId,
        authorName: actor.displayName,
        authorRole: actor.role,
        body: parsed.data.reworkReason,
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

const MessageSchema = z.object({
  body: z.string().min(1, "Message cannot be empty").max(2000, "Message too long (2000 char max)"),
});

/**
 * POST MESSAGE — the SIMPLE QA↔worker rework conversation (flat, append-only;
 * NO threading / concern / resolve — the lightweight alternative to CAPAComment).
 * Gated by the existing two-party split: DEVIATION_QA_ROLES (QA) OR the assignee
 * (isAssignedToTask). authorName/authorRole are denormalised so the thread
 * renders without extra lookups; the two voices are told apart by authorRole.
 */
export async function postDeviationTaskMessage(
  taskId: string,
  input: z.input<typeof MessageSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = MessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const task = await prisma.deviationTask.findFirst({
    where: { id: taskId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, assigneeId: true, status: true, deviationId: true },
  });
  if (!task) return { success: false, error: "Task not found" };
  const isQA = DEVIATION_QA_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: task.assigneeId });
  if (!isQA && !isAssignee) {
    return { success: false, error: "Only QA or the assigned user can post on this task." };
  }
  if (task.status === "closed" || task.status === "cancelled") {
    return { success: false, error: "This task is closed; the conversation is read-only." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const created = await prisma.deviationTaskMessage.create({
      data: {
        tenantId: session.user.tenantId,
        taskId,
        authorId: actor.userId,
        authorName: actor.displayName,
        authorRole: actor.role,
        body: parsed.data.body.trim(),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_TASK_MESSAGE_POSTED",
        recordId: task.deviationId,
        newValue: JSON.stringify({ taskId, messageId: created.id }),
      },
    });
    revalidatePath("/worklist");
    revalidatePath("/deviation");
    return { success: true, data: created };
  } catch (err) {
    console.error("[action] postDeviationTaskMessage failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to post message") };
  }
}

/**
 * REMOVE TASK DOCUMENT — soft-delete a doc the worker attached to THEIR task.
 * Gated to the assignee OR QA: the generic deleteDocument is QA/admin-only, which
 * would lock the worker out of managing their own uploads. Verifies the document
 * is a "Deviation Task" doc for THIS task before soft-deleting (Part 11 retention
 * — sets deletedAt, never destroys the row).
 */
export async function removeDeviationTaskDocument(
  taskId: string,
  documentId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const task = await prisma.deviationTask.findFirst({
    where: { id: taskId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, assigneeId: true, status: true, deviationId: true },
  });
  if (!task) return { success: false, error: "Task not found" };
  const isQA = DEVIATION_QA_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: task.assigneeId });
  if (!isQA && !isAssignee) {
    return { success: false, error: "Only QA or the assigned user can manage this task's documents." };
  }
  if (task.status === "closed" || task.status === "cancelled") {
    return { success: false, error: "This task is closed; its documents can no longer be changed." };
  }
  // Only a "Deviation Task" doc linked to THIS task can be removed here (never a
  // parent-deviation doc — those are the deviation's, shown read-only).
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId, tenantId: session.user.tenantId, deletedAt: null,
      linkedModule: "Deviation Task", linkedRecordId: taskId,
    },
    select: { id: true, fileName: true },
  });
  if (!doc) return { success: false, error: "Document not found on this task." };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.document.update({
      where: { id: documentId, tenantId: session.user.tenantId },
      data: { deletedAt: new Date(), deletedBy: session.user.name, deletionReason: "Removed from deviation task" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_TASK_EVIDENCE_REMOVED",
        recordId: task.deviationId,
        recordTitle: doc.fileName,
        newValue: JSON.stringify({ taskId, documentId }),
      },
    });
    revalidatePath("/worklist");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] removeDeviationTaskDocument failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to remove document") };
  }
}
