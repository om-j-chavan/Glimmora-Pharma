"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor, COMPLIANCE_AUTHOR_ROLES } from "@/lib/auth";
import { isAssignedToTask } from "@/lib/permissions/roleSets";
import { sanitizeServerError } from "@/lib/errors";

/**
 * Substage 5.2 Â§5.3 â€” CAPA discussion thread.
 *
 * Comments attached to a CAPA. Comments flagged `isConcern` block final
 * approval until a different reviewer resolves them. Soft-delete only
 * (Part 11 immutability) â€” replies under a deleted parent remain visible
 * with a "[deleted]" placeholder rendered by the UI.
 *
 * State-based blocking: comments may be added / resolved / reopened /
 * edited / soft-deleted while the parent CAPA is in any non-terminal
 * status (open / in_progress / pending_qa_review). Once the CAPA is
 * closed or rejected, the discussion is frozen â€” no mutations allowed,
 * matching the immutability stance of the rest of the CAPA artifacts.
 */

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const AUDIT_MODULE = "CAPA / Discussion";

/** Comments are mutable while the CAPA is investigating or under review;
 *  immutable once the CAPA reaches a terminal state. */
const TERMINAL_CAPA_STATUSES: ReadonlySet<string> = new Set(["closed", "rejected"]);

const RESOLVE_PERMITTED_ROLES: ReadonlySet<string> = new Set([
  "qa_head",
  "regulatory_affairs",
  "customer_admin",
  "super_admin",
]);

// â”€â”€ Schemas â”€â”€

const AddCommentSchema = z.object({
  body: z
    .string()
    .min(5, "Comment must be at least 5 characters")
    .max(4000, "Comment must be 4000 characters or fewer"),
  isConcern: z.boolean().default(false),
  parentId: z.string().min(1).optional(),
  // Phase 2 — optional action-level scope. Null/absent = CAPA-level comment
  // (unchanged). No UI passes this yet.
  actionItemId: z.string().min(1).optional(),
});

const ResolveSchema = z.object({
  resolutionNote: z
    .string()
    .min(5, "Resolution note must be at least 5 characters")
    .max(2000, "Resolution note must be 2000 characters or fewer"),
});

const ReopenSchema = z.object({
  reason: z
    .string()
    .min(10, "Reopen reason must be at least 10 characters")
    .max(2000, "Reopen reason must be 2000 characters or fewer"),
});

const EditSchema = z.object({
  body: z
    .string()
    .min(5, "Comment must be at least 5 characters")
    .max(4000, "Comment must be 4000 characters or fewer"),
});

const DeleteSchema = z.object({
  reason: z
    .string()
    .min(10, "Deletion reason must be at least 10 characters")
    .max(2000, "Deletion reason must be 2000 characters or fewer"),
});

// â”€â”€ Internal helpers â”€â”€

interface ParentCAPA {
  id: string;
  tenantId: string;
  status: string;
  description: string;
  reference: string | null;
  // Phase 3 — CAPA driver FK, for the "driver may comment CAPA-level" path.
  // Optional: only loadCAPAScoped (addCAPAComment) selects it; the other
  // comment actions construct ParentCAPA without it and only need the title.
  ownerId?: string | null;
}

/**
 * Verifies the parent CAPA is reachable for the caller (tenant scope, with
 * super_admin bypass per the convention used in src/actions/evidence.ts).
 * Returns null if the CAPA doesn't exist or the caller can't see it.
 */
async function loadCAPAScoped(
  capaId: string,
): Promise<{ capa: ParentCAPA; userIsSuperAdmin: boolean; session: Awaited<ReturnType<typeof requireAuth>> } | null> {
  const session = await requireAuth();
  const isSuperAdmin = session.user.role === "super_admin";
  const capa = await prisma.cAPA.findFirst({
    where: isSuperAdmin
      ? { id: capaId }
      : { id: capaId, tenantId: session.user.tenantId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      description: true,
      reference: true,
      ownerId: true,
    },
  });
  if (!capa) return null;
  return { capa, userIsSuperAdmin: isSuperAdmin, session };
}

function recordTitleFor(capa: ParentCAPA): string {
  return (capa.reference ?? capa.id).slice(0, 80);
}

// â”€â”€ Read wrapper â”€â”€

/**
 * Client-callable read wrapper â€” mirrors loadApprovalsForCAPA / loadCriteriaForCAPA.
 * Returns the full thread including soft-deleted rows so the UI can render
 * the "[deleted]" placeholder without losing reply chains.
 */
export async function loadCommentsForCAPA(
  capaId: string,
): Promise<ActionResult> {
  const scoped = await loadCAPAScoped(capaId);
  if (!scoped) return { success: false, error: "CAPA not found" };
  const comments = await prisma.cAPAComment.findMany({
    where: { capaId },
    orderBy: { createdAt: "asc" },
  });
  return { success: true, data: comments };
}

// â”€â”€ 1. addCAPAComment â”€â”€

export async function addCAPAComment(
  capaId: string,
  input: z.input<typeof AddCommentSchema>,
): Promise<ActionResult> {
  const parsed = AddCommentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const scoped = await loadCAPAScoped(capaId);
  if (!scoped) return { success: false, error: "CAPA not found" };
  const { capa, session } = scoped;
  if (TERMINAL_CAPA_STATUSES.has(capa.status)) {
    return {
      success: false,
      error: "Discussion is closed â€” the CAPA has reached a terminal state.",
    };
  }
  // If a parent is given, verify it belongs to the same CAPA AND isn't
  // soft-deleted (replying to a deleted parent is disallowed; existing
  // replies stay visible but new ones can't pile on).
  let effectiveParentId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.cAPAComment.findFirst({
      where: { id: parsed.data.parentId, capaId },
      select: { id: true, deletedAt: true, parentId: true },
    });
    if (!parent) {
      return { success: false, error: "Parent comment not found on this CAPA" };
    }
    if (parent.deletedAt !== null) {
      return {
        success: false,
        error: "Cannot reply to a deleted comment.",
      };
    }
    // Batch 3b — max depth = 1 (root → replies). A reply to a reply attaches
    // to the ROOT instead, so the thread never nests beyond one level.
    effectiveParentId = parent.parentId ?? parent.id;
  }

  // If an action item is given, verify it belongs to the same CAPA, and note
  // whether the session user owns it (drives the owner comment path below).
  let ownerOfAction = false;
  if (parsed.data.actionItemId) {
    const ai = await prisma.cAPAActionItem.findFirst({
      where: { id: parsed.data.actionItemId, capaId, tenantId: capa.tenantId },
      select: { id: true, ownerId: true },
    });
    if (!ai) {
      return { success: false, error: "Action item not found on this CAPA." };
    }
    ownerOfAction = isAssignedToTask(session, ai);
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }

  // Phase 3 — authorization: author-role OR an assigned-participant path —
  // either the owner of the specific action item the comment targets, or the
  // CAPA's driver (ownerId) commenting at CAPA level. requireGxPAuthor and the
  // viewer hard-stop (above) precede this. NOTE: this REPLACES the prior
  // "any non-viewer" comment gate with an explicit author-or-assignee rule.
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isCapaDriver = isAssignedToTask(session, { ownerId: capa.ownerId });
  if (!isAuthorRole && !ownerOfAction && !isCapaDriver) {
    return { success: false, error: "Your role does not permit this action." };
  }
  const accessBasis: "authorRole" | "assignedOwner" | "capaDriver" = isAuthorRole
    ? "authorRole"
    : ownerOfAction
      ? "assignedOwner"
      : "capaDriver";

  try {
    const created = await prisma.cAPAComment.create({
      data: {
        tenantId: capa.tenantId,
        capaId,
        parentId: effectiveParentId,
        // Phase 2 — optional action-level scope (validated above).
        actionItemId: parsed.data.actionItemId ?? null,
        body: parsed.data.body,
        isConcern: parsed.data.isConcern,
        authorId: session.user.id,
        authorName: session.user.name,
        authorRole: session.user.role,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: capa.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "CAPA_COMMENT_ADDED",
        recordId: created.id,
        recordTitle: recordTitleFor(capa),
        newValue: JSON.stringify({
          isConcern: parsed.data.isConcern,
          parentId: effectiveParentId,
          actionItemId: parsed.data.actionItemId ?? null,
          accessBasis,
          bodyPreview: parsed.data.body.slice(0, 120),
        }),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: created };
  } catch (err) {
    console.error("[action] addCAPAComment failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to add comment") };
  }
}

// â”€â”€ 2. resolveCAPAComment â”€â”€

export async function resolveCAPAComment(
  commentId: string,
  input: z.input<typeof ResolveSchema>,
): Promise<ActionResult> {
  const parsed = ResolveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const session = await requireAuth();
  if (!RESOLVE_PERMITTED_ROLES.has(session.user.role)) {
    return {
      success: false,
      error:
        "Only QA Head, Regulatory Affairs, Customer Admin, or Super Admin can resolve concerns.",
    };
  }
  const comment = await prisma.cAPAComment.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id: commentId }
        : { id: commentId, tenantId: session.user.tenantId },
    include: {
      capa: {
        select: {
          id: true,
          tenantId: true,
          status: true,
          description: true,
          reference: true,
        },
      },
    },
  });
  if (!comment) return { success: false, error: "Comment not found" };
  if (TERMINAL_CAPA_STATUSES.has(comment.capa.status)) {
    return {
      success: false,
      error: "Discussion is closed â€” the CAPA has reached a terminal state.",
    };
  }
  if (comment.deletedAt !== null) {
    return { success: false, error: "Cannot resolve a deleted comment." };
  }
  if (!comment.isConcern) {
    return {
      success: false,
      error: "Only concern comments can be resolved.",
    };
  }
  if (comment.resolvedAt !== null) {
    return { success: false, error: "Concern is already resolved." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const updated = await prisma.cAPAComment.update({
      where: { id: commentId },
      data: {
        resolvedAt: new Date(),
        resolvedById: session.user.id,
        resolvedByName: session.user.name,
        resolvedComment: parsed.data.resolutionNote,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: comment.capa.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "CAPA_COMMENT_RESOLVED",
        recordId: commentId,
        recordTitle: recordTitleFor(comment.capa),
        oldValue: JSON.stringify({
          isConcern: true,
          resolved: false,
          authorId: comment.authorId,
        }),
        newValue: JSON.stringify({
          resolvedById: session.user.id,
          resolutionNote: parsed.data.resolutionNote,
        }),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${comment.capa.id}`);
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] resolveCAPAComment failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to resolve concern") };
  }
}

// â”€â”€ 3. reopenCAPAComment â”€â”€

export async function reopenCAPAComment(
  commentId: string,
  input: z.input<typeof ReopenSchema>,
): Promise<ActionResult> {
  const parsed = ReopenSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const session = await requireAuth();
  if (!RESOLVE_PERMITTED_ROLES.has(session.user.role)) {
    return {
      success: false,
      error:
        "Only QA Head, Regulatory Affairs, Customer Admin, or Super Admin can reopen concerns.",
    };
  }
  const comment = await prisma.cAPAComment.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id: commentId }
        : { id: commentId, tenantId: session.user.tenantId },
    include: {
      capa: {
        select: {
          id: true,
          tenantId: true,
          status: true,
          description: true,
          reference: true,
        },
      },
    },
  });
  if (!comment) return { success: false, error: "Comment not found" };
  if (TERMINAL_CAPA_STATUSES.has(comment.capa.status)) {
    return {
      success: false,
      error: "Discussion is closed â€” the CAPA has reached a terminal state.",
    };
  }
  if (comment.deletedAt !== null) {
    return { success: false, error: "Cannot reopen a deleted comment." };
  }
  if (comment.resolvedAt === null) {
    return { success: false, error: "Concern is not currently resolved." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const priorResolution = {
      resolvedById: comment.resolvedById,
      resolvedByName: comment.resolvedByName,
      resolvedComment: comment.resolvedComment,
    };
    const updated = await prisma.cAPAComment.update({
      where: { id: commentId },
      data: {
        resolvedAt: null,
        resolvedById: null,
        resolvedByName: null,
        resolvedComment: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: comment.capa.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "CAPA_COMMENT_REOPENED",
        recordId: commentId,
        recordTitle: recordTitleFor(comment.capa),
        oldValue: JSON.stringify(priorResolution),
        newValue: JSON.stringify({ reason: parsed.data.reason }),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${comment.capa.id}`);
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] reopenCAPAComment failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to reopen concern") };
  }
}

// â”€â”€ 4. editCAPAComment â”€â”€

export async function editCAPAComment(
  commentId: string,
  input: z.input<typeof EditSchema>,
): Promise<ActionResult> {
  const parsed = EditSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const session = await requireAuth();
  const comment = await prisma.cAPAComment.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id: commentId }
        : { id: commentId, tenantId: session.user.tenantId },
    include: {
      capa: {
        select: {
          id: true,
          tenantId: true,
          status: true,
          description: true,
          reference: true,
        },
      },
    },
  });
  if (!comment) return { success: false, error: "Comment not found" };
  if (TERMINAL_CAPA_STATUSES.has(comment.capa.status)) {
    return {
      success: false,
      error: "Discussion is closed â€” the CAPA has reached a terminal state.",
    };
  }
  if (comment.deletedAt !== null) {
    return { success: false, error: "Cannot edit a deleted comment." };
  }
  // Author OR super_admin can edit. Anyone else (including other QAs) can't
  // alter someone else's words â€” Part 11 spirit even though not literal.
  const isAuthor = comment.authorId === session.user.id;
  const isSuperAdmin = session.user.role === "super_admin";
  if (!isAuthor && !isSuperAdmin) {
    return {
      success: false,
      error: "Only the comment author or Super Admin can edit a comment.",
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const originalBody = comment.body;
    const updated = await prisma.cAPAComment.update({
      where: { id: commentId },
      data: { body: parsed.data.body },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: comment.capa.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "CAPA_COMMENT_EDITED",
        recordId: commentId,
        recordTitle: recordTitleFor(comment.capa),
        oldValue: originalBody,
        newValue: parsed.data.body,
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${comment.capa.id}`);
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] editCAPAComment failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to edit comment") };
  }
}

// â”€â”€ 5. softDeleteCAPAComment â”€â”€

export async function softDeleteCAPAComment(
  commentId: string,
  input: z.input<typeof DeleteSchema>,
): Promise<ActionResult> {
  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const session = await requireAuth();
  const comment = await prisma.cAPAComment.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id: commentId }
        : { id: commentId, tenantId: session.user.tenantId },
    include: {
      capa: {
        select: {
          id: true,
          tenantId: true,
          status: true,
          description: true,
          reference: true,
        },
      },
    },
  });
  if (!comment) return { success: false, error: "Comment not found" };
  if (TERMINAL_CAPA_STATUSES.has(comment.capa.status)) {
    return {
      success: false,
      error: "Discussion is closed â€” the CAPA has reached a terminal state.",
    };
  }
  if (comment.deletedAt !== null) {
    return { success: false, error: "Comment is already deleted." };
  }
  const isAuthor = comment.authorId === session.user.id;
  const isSuperAdmin = session.user.role === "super_admin";
  if (!isAuthor && !isSuperAdmin) {
    return {
      success: false,
      error: "Only the comment author or Super Admin can delete a comment.",
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const updated = await prisma.cAPAComment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
        deletedById: session.user.id,
        deletedByName: session.user.name,
        deletionReason: parsed.data.reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: comment.capa.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "CAPA_COMMENT_SOFT_DELETED",
        recordId: commentId,
        recordTitle: recordTitleFor(comment.capa),
        oldValue: JSON.stringify({
          authorId: comment.authorId,
          isConcern: comment.isConcern,
          resolved: comment.resolvedAt !== null,
          bodyPreview: comment.body.slice(0, 120),
        }),
        newValue: JSON.stringify({ reason: parsed.data.reason }),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${comment.capa.id}`);
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] softDeleteCAPAComment failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to delete comment") };
  }
}
