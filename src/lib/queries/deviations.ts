import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthSession } from "@/lib/auth";
import { canSeeAllRecords, resolveVisibilityUid } from "@/lib/permissions/recordVisibility";
import type { WorklistDoc } from "@/lib/queries/worklist";

/**
 * Deviation record-visibility fragment — the COMPOSE TEMPLATE (CSV copies this).
 *
 * The creator lives on Deviation (`createdById`); the assignee lives on the CHILD
 * `DeviationTask` (`assigneeId`), which the shared helper's FLAT `assigneeField`
 * can't express. So a compose-module builds the fragment from the two shared
 * primitives directly:
 *   • see-all role (customer_admin/qa_head/super_admin) → `canSeeAllRecords` true
 *     → `{}` → no narrowing (sees ALL deviations).
 *   • otherwise → one fail-closed `uid` (from `resolveVisibilityUid`) drives BOTH
 *     the flat creator branch `{ createdById: uid }` AND the RELATION assignee
 *     branch `{ tasks: { some: { assigneeId: uid } } }`.
 * Net: a non-see-all user sees only deviations they CREATED or are a TASK-ASSIGNEE
 * on. This is an ADDITIONAL AND on top of the caller's tenant + deletedAt scope.
 * (Phase 3 cleanup — the uid now comes from `resolveVisibilityUid`, not by
 * reaching into `visibilityWhere`'s `OR[0]`. Behaviour is identical.)
 */
export function deviationVisibilityWhere(session: AuthSession): Prisma.DeviationWhereInput {
  if (canSeeAllRecords(session.user.role)) return {}; // see-all → no narrowing
  const uid = resolveVisibilityUid(session);          // shared fail-closed uid
  return {
    OR: [
      { createdById: uid },                     // creator (flat)
      { tasks: { some: { assigneeId: uid } } }, // task-assignee (relation)
    ],
  };
}

export const getDeviations = cache(async (tenantId: string, visibility: Prisma.DeviationWhereInput = {}) => {
  const rows = await prisma.deviation.findMany({
    // Visibility is an ADDITIONAL AND on top of tenant + deletedAt. Default `{}`
    // keeps existing callers (dashboard/search) tenant-wide until their phase.
    where: { tenantId, deletedAt: null, ...visibility },
    orderBy: { createdAt: "desc" },
    // Include the linked CAPA's human-readable reference so the list +
    // detail views can render "CAPA-…" instead of the raw cuid.
    include: { sourcedCAPA: { select: { id: true, reference: true } } },
  });
  if (rows.length === 0) return rows.map((r) => ({ ...r, documents: [], activeTask: null }));

  // Persisted evidence attachments (shared Document pipeline, linked by
  // linkedModule/linkedRecordId — there is no FK relation). ONE tenant-scoped
  // query for ALL deviations (the { in: devIds } form — never N+1 per row).
  const devIds = rows.map((r) => r.id);
  const docs = await prisma.document.findMany({
    where: {
      linkedModule: "Deviation Management",
      linkedRecordId: { in: devIds },
      tenantId,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, fileName: true, originalFileName: true, fileType: true,
      fileExtension: true, fileSize: true, status: true, version: true,
      uploadedBy: true, uploadedAt: true, createdAt: true, linkedRecordId: true,
    },
  });
  const byDev = new Map<string, typeof docs>();
  for (const d of docs) {
    if (!d.linkedRecordId) continue;
    const arr = byDev.get(d.linkedRecordId);
    if (arr) arr.push(d);
    else byDev.set(d.linkedRecordId, [d]);
  }

  // Stage 4 (deviation redesign) — the current ACTIVE low-priority task per
  // deviation (newest non-terminal one), so the detail panel can show its
  // status and QA can review it. ONE tenant-scoped query for ALL deviations.
  const tasks = await prisma.deviationTask.findMany({
    where: {
      tenantId, deviationId: { in: devIds }, deletedAt: null,
      status: { in: ["pending", "in_progress", "submitted", "rework"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, deviationId: true, assignee: true, assigneeId: true, message: true,
      dueDate: true, status: true, completionNotes: true, submittedAt: true, reworkReason: true,
      // Stage 5 — the flat QA↔worker conversation, so the QA task panel shows it too.
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, authorId: true, authorName: true, authorRole: true, body: true, createdAt: true } },
    },
  });
  const taskByDev = new Map<string, (typeof tasks)[number]>();
  for (const t of tasks) {
    if (!taskByDev.has(t.deviationId)) taskByDev.set(t.deviationId, t); // newest active wins
  }

  // Stage 4/5 — the active task's OWN documents (linkedModule="Deviation Task"),
  // grouped per task. Previously only COUNTED, which is why QA saw a doc count
  // but never the worker's uploaded files in the deviation modal. Now serialised
  // to the WorklistDoc shape so the modal reuses GroupedTaskDocs/DocList (grouped
  // by the GxP category the worker tagged at upload). docCount is kept for the
  // raise-CAPA confirm preview, derived from the same set.
  const activeTaskIds = [...taskByDev.values()].map((t) => t.id);
  const taskDocsByTask = new Map<string, WorklistDoc[]>();
  if (activeTaskIds.length > 0) {
    const taskDocs = await prisma.document.findMany({
      where: { tenantId, linkedModule: "Deviation Task", linkedRecordId: { in: activeTaskIds }, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, fileName: true, originalFileName: true, fileType: true, fileExtension: true,
        fileSize: true, uploadedBy: true, uploadedAt: true, createdAt: true, category: true, linkedRecordId: true,
      },
    });
    for (const d of taskDocs) {
      if (!d.linkedRecordId) continue;
      const row: WorklistDoc = {
        id: d.id,
        fileName: d.originalFileName ?? d.fileName,
        fileType: d.fileType,
        fileExtension: d.fileExtension,
        fileSize: d.fileSize,
        uploadedBy: d.uploadedBy,
        uploadedAt: (d.uploadedAt ?? d.createdAt).toISOString(),
        category: d.category,
      };
      const arr = taskDocsByTask.get(d.linkedRecordId);
      if (arr) arr.push(row);
      else taskDocsByTask.set(d.linkedRecordId, [row]);
    }
  }

  return rows.map((r) => {
    const at = taskByDev.get(r.id);
    const taskDocs = at ? (taskDocsByTask.get(at.id) ?? []) : [];
    return {
      ...r,
      documents: byDev.get(r.id) ?? [],
      activeTask: at ? { ...at, docCount: taskDocs.length, taskDocs } : null,
    };
  });
});

export const getDeviation = cache(async (id: string, session: AuthSession) => {
  // Visibility enforced IN THE QUERY (no IDOR): a non-see-all user who is neither
  // the creator nor a task-assignee gets `null` (not-found) even with a valid id.
  return prisma.deviation.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null, ...deviationVisibilityWhere(session) },
  });
});

