"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor, COMPLIANCE_AUTHOR_ROLES } from "@/lib/auth";
import { QA_AUTHORITY_ROLES, isAssignedToTask, canExecuteCAPA } from "@/lib/permissions/roleSets";
import { LOCKED_CAPA_STATUSES } from "@/lib/evidence-lock";
import {
  ACTION_ITEMS_AUDIT_MODULE,
  ACTION_ITEMS_LOCKED_MESSAGE,
  ACTION_ITEMS_TERMINAL_MESSAGE,
  ACTION_ITEM_STATUSES,
  type ActionItemStatus,
  type ActionResult,
} from "./_types";
import { sanitizeServerError } from "@/lib/errors";
import { notify } from "@/lib/notify";

// NOTE — actor identity (AUDIT Finding #2 / Rung 3E): completedByUser is a
// real User FK (completedById). Never connect `session.user.id` (a Tenant id
// for admin logins) → FK violation. Resolve via resolveUserFk() + gate with
// requireGxPAuthor(). (createdById here is a plain String, no FK — its
// admin-identity correctness is a separate non-crashing follow-up.)

/* â”€â”€ SME Section 1, Stage 4 (FULL) â€” Structured CAPA Action Plan items â”€â”€
 *
 * Replaces the free-text CAPA.correctiveActions blob with tracked rows
 * carrying owner, due date, status, completion attribution. The legacy
 * correctiveActions field stays as a denormalised cache (string-join of
 * descriptions in sequence order); updateCAPA refuses direct writes so
 * the only path to mutate the visible action list is through these
 * actions.
 *
 * Lock states (CAPA-level â†’ action-item-level):
 *   open / in_progress       â†’ full editor (add / edit / delete / status)
 *   pending_qa_review        â†’ status-only updates (complete / skipped)
 *   pending_verification     â†’ status-only updates (complete / skipped)
 *   closed / rejected        â†’ read-only
 *
 * Auto-invalidate: editing a complete item's description, owner, or
 * dueDate reverts it to pending and clears completion attribution â€”
 * the completion attestation no longer applies to the changed content.
 * Same pattern as the RCA review auto-invalidate from Stage 3.
 */

type TxClient = Prisma.TransactionClient | PrismaClient;

// â”€â”€ Due-date helpers (Item 5 â€” past-date rejection) â”€â”€
//
// Due dates are persisted as `new Date(dueDate)` where the client transmits the
// picked calendar day as local-midnight→UTC (dayjs(pick).utc().toISOString()).
// For positive-offset timezones that lands on the PREVIOUS UTC day, so a strict
// start-of-day-UTC comparison would false-reject a legitimate "today" pick. We
// therefore compare on UTC calendar days with a one-day grace to absorb that
// skew; the client DatePicker `min` enforces the strict same-day rule in the UI.
const DAY_MS = 24 * 60 * 60 * 1000;
function utcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/** True when `value` is today or later (UTC day, with the 1-day skew grace). A
 *  malformed string returns true so the `.min(1)`/format check owns that error. */
function isNotPastDueDate(value: string): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return true;
  return utcDayMs(d) >= utcDayMs(new Date()) - DAY_MS;
}

// â”€â”€ Schemas â”€â”€

const AddActionItemSchema = z.object({
  description: z.string().min(3, "Description must be at least 3 characters").max(2000),
  owner: z.string().min(1, "Owner is required"),
  ownerId: z.string().optional(),
  // Item 5 — a NEW action item can never be given a past due date.
  dueDate: z.string().min(1, "Due date is required").refine(isNotPastDueDate, "Due date can't be in the past."),
  sequence: z.number().int().positive().optional(),
});

const UpdateActionItemSchema = z.object({
  description: z.string().min(3).max(2000).optional(),
  owner: z.string().min(1).optional(),
  ownerId: z.string().nullable().optional(),
  dueDate: z.string().min(1).optional(),
  status: z.enum(ACTION_ITEM_STATUSES).optional(),
  completionNotes: z.string().max(2000).optional(),
});

const DeleteActionItemSchema = z.object({
  reason: z.string().min(5, "Reason must be at least 5 characters").max(2000),
});

// â”€â”€ Internal helpers â”€â”€

/**
 * Rebuild CAPA.correctiveActions as a newline-joined string of action
 * item descriptions in sequence order. Keeps the legacy field in sync
 * so any downstream reader (legacy reports, the existing UI fallback)
 * still sees a consistent shape. Called inside the same tx as every
 * action-item write.
 */
async function syncCorrectiveActions(
  tx: TxClient,
  capaId: string,
  tenantId: string,
): Promise<void> {
  const items = await tx.cAPAActionItem.findMany({
    where: { capaId, tenantId, deletedAt: null },
    orderBy: { sequence: "asc" },
    select: { description: true, status: true },
  });
  // Cache reflects live (non-skipped) items only â€” skipped items are
  // dropped from the textual blob because they don't represent active
  // commitments. The CAPAActionItem rows themselves are preserved for
  // the audit trail.
  const live = items
    .filter((i) => i.status !== "skipped")
    .map((i) => i.description)
    .join("\n");
  await tx.cAPA.update({
    where: { id: capaId, tenantId },
    data: { correctiveActions: live.length > 0 ? live : null },
  });
}

async function getCAPAForActionItemOp(
  capaId: string,
  tenantId: string,
): Promise<
  | { ok: true; capa: { id: string; status: string; reference: string | null; description: string } }
  | { ok: false; error: string }
> {
  const capa = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId },
    select: { id: true, status: true, reference: true, description: true },
  });
  if (!capa) return { ok: false, error: "CAPA not found" };
  return { ok: true, capa };
}

function isTerminalStatus(status: string): boolean {
  return status === "closed" || status === "rejected";
}

// â”€â”€ Actions â”€â”€

/**
 * Append a new action item to a CAPA. Blocked when the CAPA is in any
 * LOCKED_CAPA_STATUSES state (structural edits not allowed once the
 * CAPA has left active investigation).
 */
export async function addActionItem(
  capaId: string,
  input: z.input<typeof AddActionItemSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AddActionItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const lookup = await getCAPAForActionItemOp(capaId, session.user.tenantId);
  if (!lookup.ok) return { success: false, error: lookup.error };
  const { capa } = lookup;

  if (LOCKED_CAPA_STATUSES.has(capa.status)) {
    return {
      success: false,
      error: isTerminalStatus(capa.status)
        ? ACTION_ITEMS_TERMINAL_MESSAGE
        : ACTION_ITEMS_LOCKED_MESSAGE,
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // Responsibility map - ASSIGN work is a QA authority action: only QA Head may
  // add (assign) a CAPA action item (QA_AUTHORITY_ROLES; super_admin blocked
  // above by requireGxPAuthor). The ASSIGNEE executes it via updateActionItem
  // status-only (isAssignedToTask), not by authoring.
  if (!QA_AUTHORITY_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can add (assign) a CAPA action item." };
  }
  // Item 4 — the ASSIGNEE must hold a CAPA-executor role (mirrors the client
  // `ownerOptions` filter + CAPA_EXECUTE_ROLES). Blocks assigning QA Head /
  // Customer Admin / super_admin (assign ≠ execute) even if a client bypasses
  // the dropdown, preserving the "UI mirrors server" invariant.
  if (parsed.data.ownerId) {
    const assignee = await prisma.user.findFirst({
      where: { id: parsed.data.ownerId, tenantId: session.user.tenantId },
      select: { role: true },
    });
    if (!assignee) return { success: false, error: "Assignee not found." };
    if (!canExecuteCAPA(assignee.role)) {
      return { success: false, error: "That person's role can't be assigned CAPA actions — choose a CAPA executor." };
    }
  }
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Determine sequence â€” caller may pin; otherwise append after the
      // current highest.
      let sequence = parsed.data.sequence;
      if (sequence === undefined) {
        const last = await tx.cAPAActionItem.findFirst({
          where: { capaId, tenantId: session.user.tenantId },
          orderBy: { sequence: "desc" },
          select: { sequence: true },
        });
        sequence = (last?.sequence ?? 0) + 1;
      }
      const item = await tx.cAPAActionItem.create({
        data: {
          tenantId: session.user.tenantId,
          capaId,
          sequence,
          description: parsed.data.description,
          owner: parsed.data.owner,
          ownerId: parsed.data.ownerId ?? null,
          dueDate: new Date(parsed.data.dueDate),
          status: "pending",
          createdBy: session.user.name,
          createdById: session.user.id,
        },
      });
      await syncCorrectiveActions(tx, capaId, session.user.tenantId);
      return item;
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: ACTION_ITEMS_AUDIT_MODULE,
        action: "CAPA_ACTION_ITEM_ADDED",
        recordId: capaId,
        recordTitle: (capa.reference ?? capa.description).slice(0, 80),
        newValue: JSON.stringify({
          itemId: created.id,
          sequence: created.sequence,
          description: created.description.slice(0, 200),
          owner: created.owner,
          dueDate: created.dueDate.toISOString(),
        }),
      },
    });

    // Phase 2 — notify the assignee when an action item is created with an
    // owner (fault-isolated; notify() skips the actor + null FKs).
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: created.ownerId,
      actorUserId: actor.userId,
      type: "ACTION_ASSIGNED",
      title: `New action item assigned to you (CAPA ${capa.reference ?? capaId})`,
      body: created.description.slice(0, 200),
      linkPath: "/worklist",
      entityType: "CAPAActionItem",
      entityId: created.id,
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: created };
  } catch (err) {
    console.error("[action] addActionItem failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to add action item") };
  }
}

/**
 * Partial update on an action item. Lock behaviour:
 *   - terminal CAPA (closed/rejected): all updates blocked
 *   - locked-non-terminal CAPA (pending_qa_review / pending_verification):
 *     ONLY status-only updates allowed (to "complete" or "skipped")
 *   - other CAPA states: full update allowed
 *
 * Auto-invalidate: if a "complete" item's description / owner / dueDate
 * change, status reverts to pending and completion fields clear â€” the
 * completion attestation no longer covers the new content. Audit row
 * CAPA_ACTION_ITEM_INVALIDATED_BY_EDIT captures the cascade.
 *
 * Completion + skip transitions both require completionNotes. The
 * pending â†’ in_progress transition is the only one that doesn't.
 */
export async function updateActionItem(
  itemId: string,
  input: z.input<typeof UpdateActionItemSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateActionItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const existing = await prisma.cAPAActionItem.findFirst({
    where: { id: itemId, tenantId: session.user.tenantId },
    include: {
      capa: { select: { id: true, status: true, reference: true, description: true } },
    },
  });
  if (!existing) return { success: false, error: "Action item not found" };

  // Rung 3G-2 — resolve the actor once for all audit writes in this action
  // (reused by the completion-authorship guard below).
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Determine what kind of update is being requested.
  const isStatusOnlyUpdate =
    parsed.data.status !== undefined &&
    parsed.data.description === undefined &&
    parsed.data.owner === undefined &&
    parsed.data.ownerId === undefined &&
    parsed.data.dueDate === undefined;
  const targetIsCompleteOrSkipped =
    parsed.data.status === "complete" || parsed.data.status === "skipped";

  // Phase 3 — authorization: author-role OR assigned-owner path. The owner
  // path permits ONLY a status-only update to pending|in_progress|complete
  // (+ completionNotes). Structural edits (description/owner/dueDate/
  // delete) and the skipped/rework statuses stay author-only. requireGxPAuthor
  // (platform-admin block, above) and the viewer hard-stop baked into
  // isAssignedToTask both precede this check.
  // Responsibility map - full edit/reassign of an action item is a QA authority
  // action (QA_AUTHORITY_ROLES). The assignee still makes status-only transitions
  // via the isAssignedOwner branch below.
  const isAuthorRole = QA_AUTHORITY_ROLES.includes(session.user.role);
  const isAssignedOwner = isAssignedToTask(session, existing);
  const OWNER_ALLOWED_STATUSES: readonly string[] = ["pending", "in_progress", "complete"];
  const ownerStatusOnly =
    isStatusOnlyUpdate &&
    parsed.data.status !== undefined &&
    OWNER_ALLOWED_STATUSES.includes(parsed.data.status);
  if (!isAuthorRole) {
    if (!isAssignedOwner) {
      return { success: false, error: "Your role does not permit this action." };
    }
    if (!ownerStatusOnly) {
      return {
        success: false,
        error:
          "As the assigned owner you can only update this task's status (in progress / complete) and add completion notes — not edit its details.",
      };
    }
  }
  const accessBasis: "authorRole" | "assignedOwner" = isAuthorRole ? "authorRole" : "assignedOwner";

  // Lock checks.
  if (isTerminalStatus(existing.capa.status)) {
    return { success: false, error: ACTION_ITEMS_TERMINAL_MESSAGE };
  }
  if (LOCKED_CAPA_STATUSES.has(existing.capa.status)) {
    if (!isStatusOnlyUpdate || !targetIsCompleteOrSkipped) {
      return {
        success: false,
        error: ACTION_ITEMS_LOCKED_MESSAGE,
      };
    }
  }

  // Completion / skip transition: completionNotes required.
  if (targetIsCompleteOrSkipped) {
    if (!parsed.data.completionNotes || parsed.data.completionNotes.trim().length < 5) {
      return {
        success: false,
        error: "Completion notes are required (â‰¥ 5 chars) when marking complete or skipped.",
      };
    }
  }

  // Auto-invalidate detection â€” only fires when CAPA is unlocked AND a
  // content field is changing AND the item is currently complete.
  const descChanged =
    parsed.data.description !== undefined &&
    parsed.data.description !== existing.description;
  const ownerChanged =
    (parsed.data.owner !== undefined && parsed.data.owner !== existing.owner) ||
    (parsed.data.ownerId !== undefined && parsed.data.ownerId !== existing.ownerId);
  const dueDateChanged =
    parsed.data.dueDate !== undefined &&
    new Date(parsed.data.dueDate).toISOString() !== existing.dueDate.toISOString();
  const shouldInvalidate =
    existing.status === "complete" &&
    (descChanged || ownerChanged || dueDateChanged) &&
    parsed.data.status === undefined;

  // Item 4 — a reassignment must target a CAPA-executor role (mirrors addAction
  // Item + the client `ownerOptions` filter). Only checked when a non-null
  // ownerId is being set; the owner's own status-only path never sends ownerId.
  if (parsed.data.ownerId) {
    const assignee = await prisma.user.findFirst({
      where: { id: parsed.data.ownerId, tenantId: session.user.tenantId },
      select: { role: true },
    });
    if (!assignee) return { success: false, error: "Assignee not found." };
    if (!canExecuteCAPA(assignee.role)) {
      return { success: false, error: "That person's role can't be assigned CAPA actions — choose a CAPA executor." };
    }
  }

  // Item 5 — block CHANGING the due date to a past day. A legacy item whose
  // stored due date is already past stays editable as long as its date isn't
  // moved: the Edit modal re-sends the existing day (which can shift by ±1 day
  // via the local-midnight→UTC transform), so only a move of MORE than one UTC
  // day counts as a real edit — and only then is the past-date rule enforced.
  if (parsed.data.dueDate !== undefined) {
    const nextMs = utcDayMs(new Date(parsed.data.dueDate));
    const prevMs = utcDayMs(existing.dueDate);
    const meaningfullyChanged = Math.abs(nextMs - prevMs) > DAY_MS;
    if (meaningfullyChanged && !isNotPastDueDate(parsed.data.dueDate)) {
      return { success: false, error: "Due date can't be in the past." };
    }
  }

  // Build the update payload incrementally.
  const data: Prisma.CAPAActionItemUpdateInput = {};
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.owner !== undefined) data.owner = parsed.data.owner;
  if (parsed.data.ownerId !== undefined) {
    data.ownerUser = parsed.data.ownerId
      ? { connect: { id: parsed.data.ownerId } }
      : { disconnect: true };
  }
  if (parsed.data.dueDate !== undefined) data.dueDate = new Date(parsed.data.dueDate);

  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    if (targetIsCompleteOrSkipped) {
      // Rung 3E — completing an action item authors a GxP completion record;
      // block super_admin authorship (reuses the actor resolved above).
      try {
        requireGxPAuthor(actor);
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
      }
      data.completedBy = session.user.name;
      data.completedByUser = actor.userId ? { connect: { id: actor.userId } } : { disconnect: true };
      data.completedAt = new Date();
      data.completionNotes = parsed.data.completionNotes!.trim();
    } else {
      // Moving back to pending / in_progress clears completion attribution.
      data.completedBy = null;
      data.completedByUser = { disconnect: true };
      data.completedAt = null;
      data.completionNotes = null;
    }
  } else if (shouldInvalidate) {
    data.status = "pending";
    data.completedBy = null;
    data.completedByUser = { disconnect: true };
    data.completedAt = null;
    data.completionNotes = null;
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.cAPAActionItem.update({
        where: { id: itemId },
        data,
      });
      await syncCorrectiveActions(tx, existing.capaId, session.user.tenantId);
      return u;
    });

    // Audit rows â€” main update + paired status-change + paired
    // invalidation row when each fires.
    const changedFields: string[] = [];
    if (descChanged) changedFields.push("description");
    if (ownerChanged) changedFields.push("owner");
    if (dueDateChanged) changedFields.push("dueDate");
    if (parsed.data.status !== undefined) changedFields.push("status");

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: ACTION_ITEMS_AUDIT_MODULE,
        action: "CAPA_ACTION_ITEM_UPDATED",
        recordId: existing.capa.id,
        recordTitle: (existing.capa.reference ?? existing.capa.description).slice(0, 80),
        oldValue: JSON.stringify({
          itemId,
          description: existing.description.slice(0, 200),
          owner: existing.owner,
          dueDate: existing.dueDate.toISOString(),
          status: existing.status,
        }),
        newValue: JSON.stringify({ changedFields, accessBasis }),
      },
    });

    if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: ACTION_ITEMS_AUDIT_MODULE,
          action: "CAPA_ACTION_ITEM_STATUS_CHANGED",
          recordId: existing.capa.id,
          recordTitle: (existing.capa.reference ?? existing.capa.description).slice(0, 80),
          oldValue: existing.status,
          newValue: JSON.stringify({
            itemId,
            from: existing.status,
            to: parsed.data.status,
            completedBy: targetIsCompleteOrSkipped ? session.user.name : null,
            notes: parsed.data.completionNotes ?? null,
            accessBasis,
          }),
        },
      });
    }

    if (shouldInvalidate) {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: ACTION_ITEMS_AUDIT_MODULE,
          action: "CAPA_ACTION_ITEM_INVALIDATED_BY_EDIT",
          recordId: existing.capa.id,
          recordTitle: (existing.capa.reference ?? existing.capa.description).slice(0, 80),
          newValue: JSON.stringify({ itemId, changedFields }),
        },
      });
    }

    // Phase 2 — notify the NEW assignee when ownership changed (fault-isolated;
    // notify() skips the actor + null FKs).
    if (ownerChanged && updated.ownerId) {
      await notify({
        tenantId: session.user.tenantId,
        recipientUserId: updated.ownerId,
        actorUserId: actor.userId,
        type: "ACTION_ASSIGNED",
        title: `Action item assigned to you (CAPA ${existing.capa.reference ?? existing.capa.id})`,
        body: updated.description.slice(0, 200),
        linkPath: "/worklist",
        entityType: "CAPAActionItem",
        entityId: updated.id,
      });
    }

    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] updateActionItem failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to update action item") };
  }
}

/**
 * Hard-delete only allowed while no item on the CAPA has been completed
 * (i.e. the CAPA is still in open or in_progress AND this item is not
 * complete). Otherwise the item must be soft-deleted via
 * status="skipped" with a documented reason so the audit chain stays
 * intact.
 */
export async function deleteActionItem(
  itemId: string,
  input: z.input<typeof DeleteActionItemSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = DeleteActionItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const existing = await prisma.cAPAActionItem.findFirst({
    where: { id: itemId, tenantId: session.user.tenantId, deletedAt: null },
    include: {
      capa: { select: { id: true, status: true, reference: true, description: true } },
    },
  });
  if (!existing) return { success: false, error: "Action item not found" };

  if (LOCKED_CAPA_STATUSES.has(existing.capa.status)) {
    return {
      success: false,
      error: isTerminalStatus(existing.capa.status)
        ? ACTION_ITEMS_TERMINAL_MESSAGE
        : ACTION_ITEMS_LOCKED_MESSAGE,
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      // Soft-delete (Part 11 retention) — row retained; syncCorrectiveActions
      // (now filtering deletedAt) rebuilds the cache from live items only.
      await tx.cAPAActionItem.update({
        where: { id: itemId },
        data: {
          deletedAt: new Date(),
          deletedById: actor.userId,
          deletedByName: actor.displayName,
          deletionReason: parsed.data.reason ? parsed.data.reason.slice(0, 200) : null,
        },
      });
      await syncCorrectiveActions(tx, existing.capaId, session.user.tenantId);
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: ACTION_ITEMS_AUDIT_MODULE,
        action: "CAPA_ACTION_ITEM_DELETED",
        recordId: existing.capa.id,
        recordTitle: (existing.capa.reference ?? existing.capa.description).slice(0, 80),
        oldValue: JSON.stringify({
          itemId,
          description: existing.description.slice(0, 200),
          status: existing.status,
        }),
        newValue: JSON.stringify({ reason: parsed.data.reason }),
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    return { success: true, data: { id: itemId } };
  } catch (err) {
    console.error("[action] deleteActionItem failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to delete action item") };
  }
}

export async function restoreActionItem(itemId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const existing = await prisma.cAPAActionItem.findFirst({
    where: { id: itemId, tenantId: session.user.tenantId },
    include: { capa: { select: { id: true, status: true } } },
  });
  if (!existing) return { success: false, error: "Action item not found" };
  if (!existing.deletedAt) return { success: false, error: "Action item is not deleted." };
  if (LOCKED_CAPA_STATUSES.has(existing.capa.status)) {
    return { success: false, error: ACTION_ITEMS_LOCKED_MESSAGE };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.cAPAActionItem.update({
        where: { id: itemId },
        data: { deletedAt: null, deletedById: null, deletedByName: null, deletionReason: null },
      });
      await syncCorrectiveActions(tx, existing.capaId, session.user.tenantId);
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: ACTION_ITEMS_AUDIT_MODULE,
        action: "CAPA_ACTION_ITEM_RESTORED",
        recordId: existing.capa.id,
        oldValue: JSON.stringify({ itemId }),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    return { success: true, data: { id: itemId } };
  } catch (err) {
    console.error("[action] restoreActionItem failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to restore action item") };
  }
}

/**
 * Client-callable read for the ActionItemsSection UI. Mirrors the
 * loadApprovalsForCAPA / loadCommentsForCAPA pattern. Tenant-scoped
 * via the parent-CAPA existence check.
 */
export async function loadActionItemsForCAPA(
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const capa = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };
  const items = await prisma.cAPAActionItem.findMany({
    where: { capaId, tenantId: session.user.tenantId, deletedAt: null },
    orderBy: { sequence: "asc" },
  });
  return { success: true, data: items };
}

// Used in the actions/capas.ts barrel.
export type ActionItemStatusType = ActionItemStatus;
