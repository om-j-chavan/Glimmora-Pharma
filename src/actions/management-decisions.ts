"use server";

/**
 * Server Actions for Management Decisions (Governance Phase 3).
 *
 * Follows the Risk Register pattern exactly: requireAuth → Zod → resolveUserFk →
 * role gate → Prisma mutate + audit in ONE transaction → revalidate → return
 * (never throw).
 *
 * PERMISSION MODEL — the same GOVERNANCE_MANAGE_ROLES set as Phases 1-2:
 *   • createManagementDecision  — any non-viewer (`canCreateManagementDecision`).
 *   • updateManagementDecision  — a manage role, OR the meeting's creator
 *                                 (`canEditManagementDecision`). A meeting has no
 *                                 "owner" axis, so creator is the only non-manage
 *                                 editor.
 *   • archiveManagementDecision — manage roles ONLY (`canManageGovernance`), for
 *                                 any meeting. Even its creator cannot archive it.
 *   • documents                 — upload/remove follow `canEditManagementDecision`.
 * Management review is NON-GxP, so `requireGxPAuthor` does not apply and
 * super_admin is a legitimate manager here.
 *
 * VISIBILITY: every mutation re-reads the target through
 * `managementDecisionVisibilityWhere(session)`, so a seat user cannot mutate — or
 * even confirm the existence of — a meeting they may not see.
 *
 * HISTORY: the meeting IS the record. Rows are only ever soft-deleted, and every
 * amendment writes an AuditLog row carrying what changed — including the text of
 * every decision item added or removed — so the minuted history stays
 * reconstructable after any edit.
 */

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import {
  canCreateManagementDecision,
  canEditManagementDecision,
  canManageGovernance,
} from "@/lib/permissions/roleSets";
import { managementDecisionVisibilityWhere } from "@/lib/queries/managementDecisions";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import { generateReference, isReferenceConflict } from "@/lib/reference";
import {
  DECISION_DOC_CATEGORIES,
  DECISION_ITEM_STATUSES,
  DECISION_LINKED_MODULE,
  DECISION_REFERENCE_PREFIX,
  DECISION_SOURCE_MODULE,
} from "@/constants/managementDecision";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/** Generic denial — never reveals whether the id exists. */
const NOT_FOUND = "Management decision not found." as const;

/* ── Validation ──────────────────────────────────────────────────────────── */

/** One minuted decision / action item. `id` present → an existing row to amend. */
const DecisionItemSchema = z.object({
  id: z.string().optional(),
  text: z.string().trim().min(3, "Each decision needs at least 3 characters"),
  ownerId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(DECISION_ITEM_STATUSES).optional(),
});

const CreateDecisionSchema = z.object({
  topic: z.string().trim().min(3, "Topic must be at least 3 characters"),
  meetingDate: z.string().min(1, "Meeting date is required"),
  attendees: z.string().trim().min(1, "At least one attendee is required"),
  chairedById: z.string().optional().nullable(),
  items: z.array(DecisionItemSchema).min(1, "Record at least one decision or action item"),
});

const UpdateDecisionSchema = CreateDecisionSchema.partial().extend({
  reason: z.string().optional(),
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** A referenced user must be a real, active, non-viewer member of THIS tenant. */
async function assertUsersInTenant(ids: string[], tenantId: string): Promise<boolean> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return true;
  const found = await prisma.user.count({
    where: { id: { in: unique }, tenantId, isActive: true, role: { not: "viewer" } },
  });
  return found === unique.length;
}

type ItemInput = z.infer<typeof DecisionItemSchema>;

/** Every user id a payload references (chair + item owners), for tenant scoping. */
function referencedUserIds(chairedById: string | null | undefined, items: ItemInput[] | undefined): string[] {
  const ids: string[] = [];
  if (chairedById) ids.push(chairedById);
  for (const i of items ?? []) if (i.ownerId) ids.push(i.ownerId);
  return ids;
}

/* ── CREATE ──────────────────────────────────────────────────────────────── */

export async function createManagementDecision(
  input: z.input<typeof CreateDecisionSchema>,
): Promise<ActionResult<{ id: string; reference: string | null }>> {
  const session = await requireAuth();

  const parsed = CreateDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // CREATE gate: any non-viewer. A seat role may minute a management review.
  if (!canCreateManagementDecision(session.user.role)) {
    return { success: false, error: "Your role cannot record a management decision." };
  }

  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);

  if (!(await assertUsersInTenant(referencedUserIds(parsed.data.chairedById, parsed.data.items), tenantId))) {
    return { success: false, error: "A selected chair or item owner is not an active user in your organization." };
  }

  const MAX_REF_RETRIES = 5;
  let created: { id: string; reference: string | null } | null = null;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    try {
      created = await prisma.$transaction(async (tx) => {
        // Tenant-level reference: MGT-<year>-<NNN>. No <SITE> segment — a
        // management review is a governance-body record, not a site record.
        const reference = await generateReference(DECISION_REFERENCE_PREFIX, new Date(), async (prefix, year) => {
          const row = await tx.managementDecision.findFirst({
            where: { reference: { startsWith: `${prefix}-${year}-` } },
            orderBy: { reference: "desc" },
            select: { reference: true },
          });
          return row?.reference ?? null;
        });

        const decision = await tx.managementDecision.create({
          data: {
            reference,
            tenantId,
            topic: parsed.data.topic,
            meetingDate: new Date(parsed.data.meetingDate),
            attendees: parsed.data.attendees,
            chairedById: parsed.data.chairedById || null,
            // Record-visibility dual-write: the id FK is authoritative, the name
            // is display. Stamped from the SESSION, never the client payload.
            createdById: actor.userId,
            createdBy: session.user.name,
            items: {
              create: parsed.data.items.map((item, position) => ({
                text: item.text,
                ownerId: item.ownerId || null,
                dueDate: item.dueDate ? new Date(item.dueDate) : null,
                status: item.status ?? "open",
                position,
              })),
            },
          },
          select: { id: true, reference: true },
        });

        // Audit inside the SAME transaction (ALCOA+): a meeting can never exist
        // without its MANAGEMENT_DECISION_CREATED row. A reference retry rolls
        // the whole tx back, so no double audit.
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "Governance",
            action: "MANAGEMENT_DECISION_CREATED",
            recordId: decision.id,
            recordTitle: `${decision.reference} — ${parsed.data.topic}`,
            newValue: `${parsed.data.items.length} decision${parsed.data.items.length === 1 ? "" : "s"} / action item${parsed.data.items.length === 1 ? "" : "s"} minuted`,
          },
        });
        return decision;
      });
      break;
    } catch (err) {
      lastErr = err;
      if (isReferenceConflict(err)) continue; // another tx took our number — retry
      console.error("[action] createManagementDecision failed:", err);
      return { success: false, error: "Failed to record the management decision." };
    }
  }

  if (!created) {
    console.error("[action] createManagementDecision exhausted reference retries:", lastErr);
    return { success: false, error: "Failed to allocate a reference. Please retry." };
  }

  revalidatePath("/governance");
  return { success: true, data: created };
}

/* ── UPDATE ──────────────────────────────────────────────────────────────── */

/**
 * Amend a meeting and its items.
 *
 * Item reconciliation is by id: an item WITH an id is updated in place; an item
 * WITHOUT one is created; an existing item absent from the payload is deleted.
 * `position` is re-stamped from the payload order so the minutes keep their
 * sequence.
 *
 * The removed items' TEXT is written into the audit row before they are deleted,
 * so archiving an amendment never loses what was originally minuted.
 */
export async function updateManagementDecision(
  id: string,
  input: z.input<typeof UpdateDecisionSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();

  const parsed = UpdateDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);

  // Visibility-scoped read: a meeting the caller cannot SEE is "not found".
  const existing = await prisma.managementDecision.findFirst({
    where: { id, tenantId, deletedAt: null, ...managementDecisionVisibilityWhere(session) },
    select: { id: true, reference: true, topic: true, createdById: true, items: { select: { id: true, text: true } } },
  });
  if (!existing) return { success: false, error: NOT_FOUND };

  // EDIT gate: manage role, or the creator of THIS meeting.
  if (!canEditManagementDecision(session.user.role, actor.userId, existing)) {
    return { success: false, error: "You do not have permission to edit this management decision." };
  }

  if (!(await assertUsersInTenant(referencedUserIds(parsed.data.chairedById, parsed.data.items), tenantId))) {
    return { success: false, error: "A selected chair or item owner is not an active user in your organization." };
  }

  const items = parsed.data.items;
  const existingIds = new Set(existing.items.map((i) => i.id));
  // Only ids that genuinely belong to THIS meeting may be updated — a crafted
  // payload cannot reach into another meeting's items.
  const keptIds = new Set((items ?? []).map((i) => i.id).filter((x): x is string => !!x && existingIds.has(x)));
  const removed = existing.items.filter((i) => !keptIds.has(i.id));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.managementDecision.update({
        where: { id, tenantId },
        data: {
          ...(parsed.data.topic !== undefined ? { topic: parsed.data.topic } : {}),
          ...(parsed.data.meetingDate !== undefined ? { meetingDate: new Date(parsed.data.meetingDate) } : {}),
          ...(parsed.data.attendees !== undefined ? { attendees: parsed.data.attendees } : {}),
          ...(parsed.data.chairedById !== undefined ? { chairedById: parsed.data.chairedById || null } : {}),
        },
      });

      if (items) {
        if (removed.length > 0) {
          await tx.decisionItem.deleteMany({ where: { id: { in: removed.map((i) => i.id) }, decisionId: id } });
        }
        for (const [position, item] of items.entries()) {
          const data = {
            text: item.text,
            ownerId: item.ownerId || null,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            status: item.status ?? "open",
            position,
          };
          if (item.id && existingIds.has(item.id)) {
            await tx.decisionItem.update({ where: { id: item.id }, data });
          } else {
            await tx.decisionItem.create({ data: { ...data, decisionId: id } });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: "MANAGEMENT_DECISION_UPDATED",
          recordId: id,
          recordTitle: existing.reference ?? id,
          // The removed items' text is preserved HERE, before the rows go away —
          // the amendment history stays complete.
          oldValue: removed.length > 0 ? `Removed: ${removed.map((i) => i.text).join(" | ")}`.slice(0, 500) : null,
          newValue: [
            items ? `${items.length} item${items.length === 1 ? "" : "s"} after amendment` : null,
            parsed.data.reason?.trim(),
          ].filter(Boolean).join(" — ").slice(0, 500) || null,
        },
      });
    });
  } catch (err) {
    console.error("[action] updateManagementDecision failed:", err);
    return { success: false, error: "Failed to update the management decision." };
  }

  revalidatePath("/governance");
  revalidatePath(`/governance/decisions/${id}`);
  return { success: true, data: { id } };
}

/* ── ARCHIVE (soft delete) ───────────────────────────────────────────────── */

/**
 * MANAGE-ONLY, for ANY meeting. A seat role that minuted the meeting may amend it
 * but may NOT archive it — archiving is the irreversible-looking action, so it
 * stays with GOVERNANCE_MANAGE_ROLES. Soft delete: the row (and its items) are
 * retained and simply drop out of every read via `deletedAt: null`.
 */
export async function archiveManagementDecision(id: string, reason?: string): Promise<ActionResult> {
  const session = await requireAuth();
  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);

  // ARCHIVE gate FIRST — a non-manage caller is rejected before any lookup, so
  // the action cannot be used to probe which ids exist.
  if (!canManageGovernance(session.user.role)) {
    return { success: false, error: "You do not have permission to archive management decisions." };
  }

  const existing = await prisma.managementDecision.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: { id: true, reference: true, topic: true },
  });
  if (!existing) return { success: false, error: NOT_FOUND };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.managementDecision.update({
        where: { id, tenantId },
        data: { deletedAt: new Date(), deletedBy: session.user.name, deletionReason: reason?.trim() || null },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: "MANAGEMENT_DECISION_ARCHIVED",
          recordId: id,
          recordTitle: `${existing.reference ?? id} — ${existing.topic}`,
          newValue: reason?.trim()?.slice(0, 200) ?? null,
        },
      });
    });
  } catch (err) {
    console.error("[action] archiveManagementDecision failed:", err);
    return { success: false, error: "Failed to archive the management decision." };
  }

  revalidatePath("/governance");
  return { success: true, data: null };
}

/* ── Action-item status toggle ───────────────────────────────────────────── */

/** Mark one action item open/done. Same gate as editing the parent meeting. */
export async function setDecisionItemStatus(
  decisionId: string,
  itemId: string,
  status: (typeof DECISION_ITEM_STATUSES)[number],
): Promise<ActionResult> {
  const session = await requireAuth();
  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);

  if (!DECISION_ITEM_STATUSES.includes(status)) {
    return { success: false, error: "Invalid status." };
  }

  const decision = await prisma.managementDecision.findFirst({
    where: { id: decisionId, tenantId, deletedAt: null, ...managementDecisionVisibilityWhere(session) },
    select: { id: true, reference: true, createdById: true },
  });
  if (!decision) return { success: false, error: NOT_FOUND };

  if (!canEditManagementDecision(session.user.role, actor.userId, decision)) {
    return { success: false, error: "You do not have permission to update this action item." };
  }

  // Scope the item to THIS meeting — a valid id from another meeting is rejected.
  const item = await prisma.decisionItem.findFirst({
    where: { id: itemId, decisionId },
    select: { id: true, text: true, status: true },
  });
  if (!item) return { success: false, error: "Action item not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.decisionItem.update({ where: { id: itemId }, data: { status } });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: "DECISION_ITEM_STATUS_CHANGED",
          recordId: decisionId,
          recordTitle: decision.reference ?? decisionId,
          oldValue: item.status,
          newValue: `${status} — ${item.text}`.slice(0, 200),
        },
      });
    });
  } catch (err) {
    console.error("[action] setDecisionItemStatus failed:", err);
    return { success: false, error: "Failed to update the action item." };
  }

  revalidatePath(`/governance/decisions/${decisionId}`);
  return { success: true, data: null };
}

/* ── DOCUMENTS ───────────────────────────────────────────────────────────── */

const DOC_MAX_MB = Number(process.env.EVIDENCE_MAX_FILE_MB ?? "10");
const DOC_MAX_BYTES = DOC_MAX_MB * 1024 * 1024;
const DOC_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

/** Attach one supporting document (agenda / minutes / deck) to a meeting. */
export async function uploadDecisionDocument(
  decisionId: string,
  formData: FormData,
  category?: string,
): Promise<ActionResult<{ fileName: string }>> {
  const session = await requireAuth();
  const tenantId = session.user.tenantId;

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "No file provided." };
  if (file.size === 0) return { success: false, error: "File is empty." };
  if (file.size > DOC_MAX_BYTES) return { success: false, error: `File exceeds the ${DOC_MAX_MB} MB limit.` };
  if (!DOC_ALLOWED_MIME.has(file.type)) return { success: false, error: "File type not allowed." };

  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);
  const decision = await prisma.managementDecision.findFirst({
    where: { id: decisionId, tenantId, deletedAt: null, ...managementDecisionVisibilityWhere(session) },
    select: { id: true, reference: true, createdById: true },
  });
  if (!decision) return { success: false, error: NOT_FOUND };

  if (!canEditManagementDecision(session.user.role, actor.userId, decision)) {
    return { success: false, error: "You do not have permission to add documents to this meeting." };
  }

  const cat = category && (DECISION_DOC_CATEGORIES as readonly string[]).includes(category) ? category : null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const sanitized = sanitizeFilename(file.name);
    const storageKey = `management-decisions/${decisionId}/${contentHash}-${sanitized}`;
    await fileStorage.save(storageKey, buffer, file.type);

    const sizeKb = Math.max(1, Math.round(file.size / 1024));

    await prisma.$transaction(async (tx) => {
      await tx.document.create({
        data: {
          tenantId,
          fileName: sanitized,
          fileType: file.type,
          fileSize: `${sizeKb} KB`,
          version: "v1.0",
          status: "draft",
          uploadedBy: session.user.name,
          uploadedById: actor.userId,
          uploadedAt: new Date(),
          description: `Supporting document for ${decision.reference ?? decisionId}`,
          // Dual-write BOTH pointer pairs (legacy + new), as every module does.
          linkedModule: DECISION_LINKED_MODULE,
          linkedRecordId: decisionId,
          sourceModule: DECISION_SOURCE_MODULE,
          sourceId: decisionId,
          category: cat,
          storageKey,
          sha256: contentHash,
          originalFileName: file.name,
          fileExtension: sanitized.includes(".") ? sanitized.split(".").pop() ?? null : null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: "MANAGEMENT_DECISION_DOCUMENT_ADDED",
          recordId: decisionId,
          recordTitle: decision.reference ?? decisionId,
          newValue: `${sanitized}${cat ? ` (${cat})` : ""}`,
        },
      });
    });
  } catch (err) {
    console.error("[action] uploadDecisionDocument failed:", err);
    return { success: false, error: "Failed to upload document." };
  }

  revalidatePath(`/governance/decisions/${decisionId}`);
  return { success: true, data: { fileName: file.name } };
}

/** Remove (soft-delete) one of a meeting's supporting documents. Same gate. */
export async function removeDecisionDocument(decisionId: string, docId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);

  const decision = await prisma.managementDecision.findFirst({
    where: { id: decisionId, tenantId, deletedAt: null, ...managementDecisionVisibilityWhere(session) },
    select: { id: true, reference: true, createdById: true },
  });
  if (!decision) return { success: false, error: NOT_FOUND };

  if (!canEditManagementDecision(session.user.role, actor.userId, decision)) {
    return { success: false, error: "You do not have permission to remove this document." };
  }

  const doc = await prisma.document.findFirst({
    where: { id: docId, tenantId, sourceModule: DECISION_SOURCE_MODULE, sourceId: decisionId, deletedAt: null },
    select: { id: true, fileName: true },
  });
  if (!doc) return { success: false, error: "Document not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id: docId }, data: { deletedAt: new Date(), deletedBy: session.user.name } });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: "MANAGEMENT_DECISION_DOCUMENT_REMOVED",
          recordId: decisionId,
          recordTitle: decision.reference ?? decisionId,
          oldValue: doc.fileName,
        },
      });
    });
  } catch (err) {
    console.error("[action] removeDecisionDocument failed:", err);
    return { success: false, error: "Failed to remove document." };
  }

  revalidatePath(`/governance/decisions/${decisionId}`);
  return { success: true, data: null };
}
