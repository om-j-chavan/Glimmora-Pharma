"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isAssignedToTask, CAPA_MODULE_VIEW_ROLES } from "@/lib/permissions/roleSets";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface TaskDetail {
  action: {
    id: string;
    capaId: string;
    sequence: number;
    description: string;
    owner: string;
    ownerId: string | null;
    dueDate: string;
    status: string;
    completionNotes: string | null;
    reworkReason: string | null;
  };
  capa: {
    id: string;
    reference: string | null;
    title: string;
    status: string;
    dueDate: string | null;
    rca: string | null;
    rcaApproved: boolean | null;
    ownerId: string | null;
  };
  files: { id: string; fileName: string; category: string; fileSize: number; uploadedBy: string; uploadedById: string | null; createdAt: string }[];
  comments: { id: string; body: string; authorName: string; authorRole: string; createdAt: string }[];
  /** Storage bucket for action-scoped uploads — the CAPA's first evidence
   *  category, or null when evidence isn't initialised yet. */
  defaultEvidenceItemId: string | null;
}

/**
 * Phase 5 — read the full task context for the Worklist task panel. Access is
 * limited to participants: the action's OWNER, the parent CAPA's DRIVER
 * (ownerId), or a CAPA-module role (qa_head / customer_admin — the roles who
 * can see the CAPA module anyway). Other compliance-author roles (csv_val_lead,
 * regulatory_affairs) do NOT get blanket in-tenant task reads. Read-only; all
 * mutations go through the existing owner/driver server paths.
 */
export async function getActionItemTask(actionItemId: string): Promise<ActionResult<TaskDetail>> {
  const session = await requireAuth();
  const item = await prisma.cAPAActionItem.findFirst({
    where: { id: actionItemId, tenantId: session.user.tenantId },
    include: {
      capa: {
        select: {
          id: true, reference: true, description: true, status: true,
          dueDate: true, rca: true, rcaApproved: true, ownerId: true,
        },
      },
    },
  });
  if (!item) return { success: false, error: "Task not found" };

  const isOwner = isAssignedToTask(session, item);
  const isDriver = isAssignedToTask(session, { ownerId: item.capa.ownerId });
  const isModuleRole = CAPA_MODULE_VIEW_ROLES.includes(session.user.role);
  if (!isOwner && !isDriver && !isModuleRole) {
    return { success: false, error: "You do not have access to this task." };
  }

  const [files, comments, firstEvidence] = await Promise.all([
    prisma.evidenceFile.findMany({
      where: { actionItemId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      // Additive select only (category via evidenceItem, size, uploader FK) for
      // the task panel's file provenance — same pattern as the evidence thread.
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        uploadedBy: true,
        uploadedById: true,
        createdAt: true,
        evidenceItem: { select: { category: true } },
      },
    }),
    // FIX 4 — the fixer's task now shows the CAPA's shared conversation:
    // this action's comments PLUS CAPA-level comments (where QA posts/replies),
    // so QA↔fixer is two-way. Pinned to THIS capaId — no cross-CAPA leak.
    prisma.cAPAComment.findMany({
      where: {
        capaId: item.capaId,
        deletedAt: null,
        OR: [{ actionItemId }, { actionItemId: null }],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, body: true, authorName: true, authorRole: true, createdAt: true },
    }),
    prisma.evidenceItem.findFirst({
      where: { capaId: item.capaId },
      orderBy: { category: "asc" },
      select: { id: true },
    }),
  ]);

  return {
    success: true,
    data: {
      action: {
        id: item.id,
        capaId: item.capaId,
        sequence: item.sequence,
        description: item.description,
        owner: item.owner,
        ownerId: item.ownerId,
        dueDate: item.dueDate.toISOString(),
        status: item.status,
        completionNotes: item.completionNotes,
        reworkReason: item.reworkReason,
      },
      capa: {
        id: item.capa.id,
        reference: item.capa.reference,
        title: item.capa.description,
        status: item.capa.status,
        dueDate: item.capa.dueDate ? item.capa.dueDate.toISOString() : null,
        rca: item.capa.rca,
        rcaApproved: item.capa.rcaApproved,
        ownerId: item.capa.ownerId,
      },
      files: files.map((f) => ({ id: f.id, fileName: f.fileName, category: f.evidenceItem.category, fileSize: f.fileSize, uploadedBy: f.uploadedBy, uploadedById: f.uploadedById, createdAt: f.createdAt.toISOString() })),
      comments: comments.map((c) => ({ id: c.id, body: c.body, authorName: c.authorName, authorRole: c.authorRole, createdAt: c.createdAt.toISOString() })),
      defaultEvidenceItemId: firstEvidence?.id ?? null,
    },
  };
}
