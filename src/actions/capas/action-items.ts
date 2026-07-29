"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor, COMPLIANCE_AUTHOR_ROLES } from "@/lib/auth";
import { QA_AUTHORITY_ROLES, isAssignedToTask, canExecuteCAPA, canReviewAlignment } from "@/lib/permissions/roleSets";
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
import { TASK_DESCRIPTION_MIN } from "@/constants/capaValidation";

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
  description: z.string().min(TASK_DESCRIPTION_MIN, `Task description must be at least ${TASK_DESCRIPTION_MIN} characters`).max(2000),
  owner: z.string().min(1, "Owner is required"),
  ownerId: z.string().optional(),
  // Item 5 — a NEW action item can never be given a past due date.
  dueDate: z.string().min(1, "Due date is required").refine(isNotPastDueDate, "Due date can't be in the past."),
  sequence: z.number().int().positive().optional(),
});

const UpdateActionItemSchema = z.object({
  description: z.string().min(TASK_DESCRIPTION_MIN, `Task description must be at least ${TASK_DESCRIPTION_MIN} characters`).max(2000).optional(),
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
 *
 * EXPORTED for createCAPA's Item 19 assignment carry, which creates an action
 * item inside its own transaction. Any writer of CAPAActionItem must call this
 * in the same tx or correctiveActions silently drifts from the rows — the join
 * lives here and nowhere else.
 */
export async function syncCorrectiveActions(
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
  | { ok: true; capa: { id: string; status: string; reference: string | null; description: string; dueDate: Date | null } }
  | { ok: false; error: string }
> {
  const capa = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId },
    select: { id: true, status: true, reference: true, description: true, dueDate: true },
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

  // Phase 3 — a task can't be due AFTER its CAPA, or the CAPA can't close on
  // time. Compared on UTC calendar days (same basis as the past-date check).
  // Skipped when the CAPA has no due date (legacy rows).
  if (capa.dueDate && utcDayMs(new Date(parsed.data.dueDate)) > utcDayMs(capa.dueDate)) {
    return {
      success: false,
      error: `Task due date (${parsed.data.dueDate.slice(0, 10)}) can't be after the CAPA due date (${capa.dueDate.toISOString().slice(0, 10)}) — the CAPA can't close on time.`,
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
      capa: { select: { id: true, status: true, reference: true, description: true, dueDate: true } },
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
  // A notes-only save (the worklist "Save notes" button): completionNotes with
  // no status and no structural field. Distinct from isStatusOnlyUpdate — it
  // carries NO status, so it is not a transition at all.
  const isNotesOnlyUpdate =
    parsed.data.completionNotes !== undefined &&
    parsed.data.status === undefined &&
    parsed.data.description === undefined &&
    parsed.data.owner === undefined &&
    parsed.data.ownerId === undefined &&
    parsed.data.dueDate === undefined;

  // Phase 3 — authorization: author-role OR assigned-owner path. The owner
  // path permits ONLY a status-only update to pending|in_progress|complete
  // (+ completionNotes), or a notes-only save. Structural edits (description/
  // owner/dueDate/delete) and the skipped/rework statuses stay author-only.
  // requireGxPAuthor (platform-admin block, above) and the viewer hard-stop
  // baked into isAssignedToTask both precede this check.
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
    if (!ownerStatusOnly && !isNotesOnlyUpdate) {
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
    // Phase 3 — a task can't be due AFTER its CAPA (see addActionItem). Skipped
    // when the CAPA has no due date (legacy rows).
    if (existing.capa.dueDate && nextMs > utcDayMs(existing.capa.dueDate)) {
      return {
        success: false,
        error: `Task due date (${parsed.data.dueDate.slice(0, 10)}) can't be after the CAPA due date (${existing.capa.dueDate.toISOString().slice(0, 10)}) — the CAPA can't close on time.`,
      };
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
  } else if (parsed.data.completionNotes !== undefined) {
    // Notes-only save. Without this branch `data` stayed EMPTY on a
    // completionNotes-only call — the update was a silent no-op that still
    // returned success, so the worklist's "Save notes" reported saved and
    // persisted nothing. Notes are carried WITHOUT touching status or
    // completion attribution: saving a note is not a completion attestation.
    data.completionNotes = parsed.data.completionNotes.trim() || null;
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
    // A notes-only save changes nothing else, so without this the audit row
    // recorded an empty changedFields — a write with no trail of what moved.
    if (isNotesOnlyUpdate) changedFields.push("completionNotes");

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

/* ── Phase 2 — per-person QA review surface ──────────────────────────────────
 *
 * acceptWork / sendWorkBack operate on ALL of one person's items on a CAPA
 * (capaId + ownerId); skipTask / reassignTask operate on a single item. All
 * four are QA-only (CAPA_REVIEW_ROLES — the same gate as reviewRCA/alignment),
 * run during QA review, and each mutation + its audit row commit in one
 * transaction. None mint a SignedRecord — these are review steps, not
 * signatures; only closure is signed.
 */

const AcceptWorkSchema = z.object({
  ownerId: z.string().min(1, "ownerId is required"),
  reviewNotes: z.string().max(2000).optional(),
});

/**
 * QA accepts ALL of one person's `complete` items on a CAPA under review.
 * complete -> accepted. Only `complete` items are touched — unfinished
 * (pending / in_progress) work is never accepted. Atomic; audited
 * (CAPA_WORK_ACCEPTED); NOT a Part 11 signature.
 */
export async function acceptWork(
  capaId: string,
  input: z.input<typeof AcceptWorkSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewAlignment(session.user.role)) {
    return { success: false, error: "Only QA Head can accept work." };
  }
  const parsed = AcceptWorkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const lookup = await getCAPAForActionItemOp(capaId, session.user.tenantId);
  if (!lookup.ok) return { success: false, error: lookup.error };
  const { capa } = lookup;
  if (capa.status !== "pending_qa_review") {
    return { success: false, error: "Work can only be accepted while the CAPA is under QA review." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // ONLY `complete` items for this person. An in_progress / pending item is not
  // finished work and is never accepted.
  const targets = await prisma.cAPAActionItem.findMany({
    where: { capaId, tenantId: session.user.tenantId, ownerId: parsed.data.ownerId, status: "complete", deletedAt: null },
    select: { id: true, owner: true },
  });
  if (targets.length === 0) {
    return { success: false, error: "That person has no completed work to accept on this CAPA." };
  }
  const ownerName = targets[0].owner;
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cAPAActionItem.updateMany({
        where: { capaId, tenantId: session.user.tenantId, ownerId: parsed.data.ownerId, status: "complete", deletedAt: null },
        data: {
          status: "accepted",
          // The QA reviewer who accepted (the worker is the item's owner/ownerId).
          acceptedBy: session.user.name,
          acceptedById: session.user.id,
          acceptedAt: now,
          acceptanceNotes: parsed.data.reviewNotes?.trim() ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: ACTION_ITEMS_AUDIT_MODULE,
          action: "CAPA_WORK_ACCEPTED",
          recordId: capaId,
          recordTitle: (capa.reference ?? capa.description).slice(0, 80),
          newValue: JSON.stringify({
            ownerId: parsed.data.ownerId,
            ownerName,
            itemCount: targets.length,
            itemIds: targets.map((t) => t.id),
            reviewNotes: parsed.data.reviewNotes ?? null,
          }),
        },
      });
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    revalidatePath("/worklist");
    return { success: true, data: { ownerId: parsed.data.ownerId, accepted: targets.length } };
  } catch (err) {
    console.error("[action] acceptWork failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to accept work") };
  }
}

const SendWorkBackSchema = z.object({
  ownerId: z.string().min(1, "ownerId is required"),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(2000),
});

/**
 * QA returns ONE person's work for revision. Reopens ONLY that person's items
 * (complete|accepted -> rework) and unlocks ONLY the evidence categories that
 * hold their files. The CAPA stays in pending_qa_review — this is NOT a
 * whole-CAPA bounce, so everyone else's accepted work is untouched. The reason
 * is written to CAPAActionItem.reworkReason (the same column rejectCAPA uses,
 * read by the worklist) AND pushed as a REWORK_ASSIGNED notification. Atomic.
 */
export async function sendWorkBack(
  capaId: string,
  input: z.input<typeof SendWorkBackSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewAlignment(session.user.role)) {
    return { success: false, error: "Only QA Head can send work back." };
  }
  const parsed = SendWorkBackSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const lookup = await getCAPAForActionItemOp(capaId, session.user.tenantId);
  if (!lookup.ok) return { success: false, error: lookup.error };
  const { capa } = lookup;
  if (capa.status !== "pending_qa_review") {
    return { success: false, error: "Work can only be sent back while the CAPA is under QA review." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  const targets = await prisma.cAPAActionItem.findMany({
    where: {
      capaId,
      tenantId: session.user.tenantId,
      ownerId: parsed.data.ownerId,
      status: { in: ["complete", "accepted"] },
      deletedAt: null,
    },
    select: { id: true, owner: true },
  });
  if (targets.length === 0) {
    return { success: false, error: "That person has no completed or accepted work to send back on this CAPA." };
  }
  const itemIds = targets.map((t) => t.id);
  const ownerName = targets[0].owner;
  const now = new Date();

  // This person's evidence = the categories holding files tied to their items.
  // NOTE: EvidenceItem locks are per-CATEGORY (shared across contributors), so a
  // category with another person's files unlocks for them too — the same
  // granularity rejectEvidenceCategory already accepts. Per-person isolation
  // would need a per-file/per-owner evidence lock (schema follow-up).
  const files = await prisma.evidenceFile.findMany({
    where: { actionItemId: { in: itemIds }, deletedAt: null },
    select: { evidenceItemId: true },
  });
  const evidenceItemIds = Array.from(new Set(files.map((f) => f.evidenceItemId)));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cAPAActionItem.updateMany({
        where: {
          capaId,
          tenantId: session.user.tenantId,
          ownerId: parsed.data.ownerId,
          status: { in: ["complete", "accepted"] },
          deletedAt: null,
        },
        data: {
          status: "rework",
          reworkReason: parsed.data.reason,
          reworkRequestedById: actor.userId,
          reworkRequestedAt: now,
        },
      });
      if (evidenceItemIds.length > 0) {
        // Mirror rejectEvidenceCategory's per-category unlock so the worker can
        // re-upload while the CAPA stays in QA review.
        await tx.evidenceItem.updateMany({
          where: { id: { in: evidenceItemIds }, capaId },
          data: { lockedAt: null, lockedBy: null, lockedSignatureId: null },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: ACTION_ITEMS_AUDIT_MODULE,
          action: "CAPA_WORK_SENT_BACK",
          recordId: capaId,
          recordTitle: (capa.reference ?? capa.description).slice(0, 80),
          newValue: JSON.stringify({
            ownerId: parsed.data.ownerId,
            ownerName,
            reason: parsed.data.reason.slice(0, 200),
            itemCount: targets.length,
            itemIds,
            evidenceCategoriesUnlocked: evidenceItemIds.length,
          }),
        },
      });
    });

    // Reason reaches the worker's Worklist via the reworkReason column (above)
    // AND this notification. Fault-isolated; notify() never throws.
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: parsed.data.ownerId,
      actorUserId: actor.userId,
      type: "REWORK_ASSIGNED",
      title: `Work returned for revision (CAPA ${capa.reference ?? capaId})`,
      body: parsed.data.reason.slice(0, 200),
      linkPath: "/worklist",
      entityType: "CAPA",
      entityId: capaId,
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    revalidatePath("/worklist");
    return { success: true, data: { ownerId: parsed.data.ownerId, sentBack: targets.length } };
  } catch (err) {
    console.error("[action] sendWorkBack failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to send work back") };
  }
}

const SkipTaskSchema = z.object({
  reason: z
    .string()
    .min(20, "A reason of at least 20 characters is required to skip a corrective action")
    .max(2000),
});

/**
 * QA skips a single corrective action (status -> skipped). A skipped item no
 * longer blocks closure (closure accepts accepted|skipped). Reason required
 * (min 20). Atomic; audited (CAPA_TASK_SKIPPED).
 */
export async function skipTask(
  actionItemId: string,
  input: z.input<typeof SkipTaskSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewAlignment(session.user.role)) {
    return { success: false, error: "Only QA Head can skip a task." };
  }
  const parsed = SkipTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.cAPAActionItem.findFirst({
    where: { id: actionItemId, tenantId: session.user.tenantId, deletedAt: null },
    include: { capa: { select: { id: true, status: true, reference: true, description: true } } },
  });
  if (!existing) return { success: false, error: "Action item not found" };
  if (isTerminalStatus(existing.capa.status)) {
    return { success: false, error: ACTION_ITEMS_TERMINAL_MESSAGE };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cAPAActionItem.update({
        where: { id: actionItemId },
        data: {
          status: "skipped",
          completionNotes: parsed.data.reason.trim(),
          completedBy: session.user.name,
          completedByUser: actor.userId ? { connect: { id: actor.userId } } : { disconnect: true },
          completedAt: new Date(),
        },
      });
      await syncCorrectiveActions(tx, existing.capaId, session.user.tenantId);
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: ACTION_ITEMS_AUDIT_MODULE,
          action: "CAPA_TASK_SKIPPED",
          recordId: existing.capa.id,
          recordTitle: (existing.capa.reference ?? existing.capa.description).slice(0, 80),
          oldValue: existing.status,
          newValue: JSON.stringify({ itemId: actionItemId, reason: parsed.data.reason.slice(0, 200) }),
        },
      });
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    revalidatePath("/worklist");
    return { success: true, data: { id: actionItemId } };
  } catch (err) {
    console.error("[action] skipTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to skip task") };
  }
}

const ReassignTaskSchema = z.object({
  newOwnerId: z.string().min(1, "New owner is required"),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(2000),
});

/**
 * QA reassigns a single action item to a new owner. The new owner must pass the
 * SAME executor gate as the original assign (canExecuteCAPA — drops QA Head /
 * Customer Admin, because assign != execute). Status is unchanged. Audited with
 * an explicit OLD -> NEW owner handoff (CAPA_TASK_REASSIGNED), not a generic
 * update, so the who->whom survives in the append-only trail. Atomic.
 */
export async function reassignTask(
  actionItemId: string,
  input: z.input<typeof ReassignTaskSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewAlignment(session.user.role)) {
    return { success: false, error: "Only QA Head can reassign a task." };
  }
  const parsed = ReassignTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.cAPAActionItem.findFirst({
    where: { id: actionItemId, tenantId: session.user.tenantId, deletedAt: null },
    include: { capa: { select: { id: true, status: true, reference: true, description: true } } },
  });
  if (!existing) return { success: false, error: "Action item not found" };
  if (isTerminalStatus(existing.capa.status)) {
    return { success: false, error: ACTION_ITEMS_TERMINAL_MESSAGE };
  }

  // New owner must exist AND hold a CAPA-executor role (mirrors addActionItem).
  const newOwner = await prisma.user.findFirst({
    where: { id: parsed.data.newOwnerId, tenantId: session.user.tenantId },
    select: { id: true, name: true, role: true },
  });
  if (!newOwner) return { success: false, error: "New owner not found." };
  if (!canExecuteCAPA(newOwner.role)) {
    return { success: false, error: "That person's role can't be assigned CAPA actions — choose a CAPA executor." };
  }
  if (newOwner.id === existing.ownerId) {
    return { success: false, error: "That person already owns this task." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  const oldOwnerId = existing.ownerId;
  const oldOwnerName = existing.owner;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cAPAActionItem.update({
        where: { id: actionItemId },
        data: { owner: newOwner.name, ownerUser: { connect: { id: newOwner.id } } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: ACTION_ITEMS_AUDIT_MODULE,
          action: "CAPA_TASK_REASSIGNED",
          recordId: existing.capa.id,
          recordTitle: (existing.capa.reference ?? existing.capa.description).slice(0, 80),
          oldValue: JSON.stringify({ from: { ownerId: oldOwnerId, ownerName: oldOwnerName } }),
          newValue: JSON.stringify({
            itemId: actionItemId,
            to: { ownerId: newOwner.id, ownerName: newOwner.name },
            reason: parsed.data.reason.slice(0, 200),
          }),
        },
      });
    });

    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: newOwner.id,
      actorUserId: actor.userId,
      type: "ACTION_ASSIGNED",
      title: `Action item reassigned to you (CAPA ${existing.capa.reference ?? existing.capa.id})`,
      body: existing.description.slice(0, 200),
      linkPath: "/worklist",
      entityType: "CAPAActionItem",
      entityId: actionItemId,
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    revalidatePath("/worklist");
    return { success: true, data: { id: actionItemId, from: oldOwnerId, to: newOwner.id } };
  } catch (err) {
    console.error("[action] reassignTask failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to reassign task") };
  }
}

/**
 * Phase 5 — QA nudges the assignee of an action item (a reminder). NO state
 * change: notify + audit CAPA_TASK_NUDGED only. It's the middle escalation
 * between Reassign and Skip on the Assignments tab. Same QA gate as the other
 * review actions. RATE-LIMITED to one nudge per item per 24h so the audit trail
 * doesn't fill with CAPA_TASK_NUDGED noise and the worker isn't spammed.
 */
export async function nudgeActionItemOwner(actionItemId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewAlignment(session.user.role)) {
    return { success: false, error: "Only QA Head can nudge an assignee." };
  }
  const existing = await prisma.cAPAActionItem.findFirst({
    where: { id: actionItemId, tenantId: session.user.tenantId, deletedAt: null },
    include: { capa: { select: { id: true, reference: true, description: true } } },
  });
  if (!existing) return { success: false, error: "Action item not found" };
  if (!existing.ownerId) return { success: false, error: "This task has no assignee to nudge." };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Rate-limit — one nudge per item per 24h. Reads the prior CAPA_TASK_NUDGED
  // audit for THIS item (newValue carries the itemId), so it's the same trail
  // the Assignments tab shows — no separate counter to drift.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.auditLog.findFirst({
    where: {
      tenantId: session.user.tenantId,
      action: "CAPA_TASK_NUDGED",
      recordId: existing.capa.id,
      newValue: { contains: actionItemId },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (recent) {
    return { success: false, error: "This assignee was already nudged for this task in the last 24 hours." };
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: ACTION_ITEMS_AUDIT_MODULE,
        action: "CAPA_TASK_NUDGED",
        recordId: existing.capa.id,
        recordTitle: (existing.capa.reference ?? existing.capa.description).slice(0, 80),
        newValue: JSON.stringify({ itemId: actionItemId, ownerId: existing.ownerId, owner: existing.owner }),
      },
    });
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: existing.ownerId,
      actorUserId: actor.userId,
      type: "ACTION_ASSIGNED",
      title: `Reminder: your CAPA task needs attention (CAPA ${existing.capa.reference ?? existing.capa.id})`,
      body: existing.description.slice(0, 200),
      linkPath: "/worklist",
      entityType: "CAPAActionItem",
      entityId: actionItemId,
    });
    revalidatePath("/worklist");
    revalidatePath(`/capa/${existing.capa.id}`);
    return { success: true, data: { id: actionItemId } };
  } catch (err) {
    console.error("[action] nudgeActionItemOwner failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to nudge assignee") };
  }
}

// Used in the actions/capas.ts barrel.
export type ActionItemStatusType = ActionItemStatus;
