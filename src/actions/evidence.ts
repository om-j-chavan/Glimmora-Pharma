"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor, COMPLIANCE_AUTHOR_ROLES } from "@/lib/auth";
import { isAssignedToTask, CAPA_REJECT_ROLES } from "@/lib/permissions/roleSets";
import { notifyMany } from "@/lib/notify";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import {
  EVIDENCE_CATEGORIES,
  USER_SETTABLE_EVIDENCE_STATUSES,
  getEvidenceForCAPA,
  getEvidenceNoteHistory,
  type EvidenceStatus,
} from "@/lib/queries/evidence";
import { sanitizeServerError } from "@/lib/errors";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// â”€â”€ Constants / config â”€â”€

const MAX_FILE_MB = Number(process.env.EVIDENCE_MAX_FILE_MB ?? "10");
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
]);

const RETENTION_YEARS = 7;

const AUDIT_MODULE = "CAPA / Evidence";

// â”€â”€ Schemas â”€â”€

const StatusUpdateSchema = z.object({
  // Driver/author-settable statuses only — "REJECTED" is a QA-only disposition
  // set exclusively by rejectCAPA (SoD), never through this author/driver path.
  status: z.enum(USER_SETTABLE_EVIDENCE_STATUSES as readonly [EvidenceStatus, ...EvidenceStatus[]]),
  notes: z.string().max(10_000).optional(),
  // Required when transitioning TO or FROM NOT_APPLICABLE (Part 11 ALCOA+:
  // every NA decision needs an auditable rationale). Server enforces the
  // requirement based on the actual oldStatus â†’ newStatus transition.
  naReason: z.string().min(10).max(2000).optional(),
});

const RemoveFileSchema = z.object({
  reason: z.string().min(10, "Deletion reason must be at least 10 characters"),
});

// â”€â”€ Internal helpers â”€â”€

/**
 * Tenant-scope guard: returns the EvidenceItem joined to its CAPA's tenantId,
 * or null if either the item is missing or it belongs to a different tenant.
 * super_admin bypasses scope (per existing convention in admin actions).
 */
async function loadEvidenceItemScoped(evidenceItemId: string) {
  const session = await requireAuth();
  const item = await prisma.evidenceItem.findUnique({
    where: { id: evidenceItemId },
    include: { capa: { select: { id: true, tenantId: true, description: true, ownerId: true, status: true, reference: true } } },
  });
  if (!item) return { session, item: null as null };
  if (
    session.user.role !== "super_admin" &&
    item.capa.tenantId !== session.user.tenantId
  ) {
    return { session, item: null as null };
  }
  return { session, item };
}

function nowPlusYears(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// â”€â”€ ACTION 1: initialise the 7 evidence rows for a CAPA â”€â”€

export async function initializeEvidenceForCAPA(
  capaId: string,
): Promise<ActionResult<{ created: number }>> {
  const session = await requireAuth();
  // Tenant scope on the parent CAPA. super_admin bypasses.
  const capa = await prisma.cAPA.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id: capaId }
        : { id: capaId, tenantId: session.user.tenantId },
    select: { id: true, ownerId: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };

  // Audit follow-up FIX 1 — was requireAuth-only (any authenticated non-viewer
  // could seed evidence rows). Gate it like the other driver grants: an author
  // role OR the CAPA's driver (ownerId).
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isDriver = isAssignedToTask(session, { ownerId: capa.ownerId });
  if (!isAuthorRole && !isDriver) {
    return { success: false, error: "Your role does not permit this action." };
  }
  const accessBasis: "authorRole" | "capaDriver" = isAuthorRole ? "authorRole" : "capaDriver";
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  let created = 0;
  try {
    // Idempotent â€” skipDuplicates means re-running is a no-op once rows exist.
    const result = await prisma.evidenceItem.createMany({
      data: EVIDENCE_CATEGORIES.map((category) => ({
        capaId,
        category,
        status: "PENDING",
        createdBy: session.user.name,
      })),
      // SQLite does not support ON CONFLICT for createMany in older Prisma,
      // but as of Prisma 5+ skipDuplicates is supported on SQLite for unique
      // constraints. The (capaId, category) unique index is what makes this
      // idempotent.
    });
    created = result.count;
  } catch (err) {
    // If skipDuplicates isn't honoured (older Prisma) we fall back to per-row
    // upsert. Either way, end-state is the same: 7 rows exist.
    for (const category of EVIDENCE_CATEGORIES) {
      try {
        await prisma.evidenceItem.create({
          data: {
            capaId,
            category,
            status: "PENDING",
            createdBy: session.user.name,
          },
        });
        created += 1;
      } catch {
        // P2002 on (capaId, category) â€” already exists, skip.
      }
    }
    if (created === 0) {
      // Genuine error â€” re-throw the original.
      console.error("[action] initializeEvidenceForCAPA failed:", err);
      return { success: false, error: "Failed to initialize evidence categories" };
    }
  }

  // Audit only a real initialization (created > 0); re-runs are silent no-ops.
  if (created > 0) {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "EVIDENCE_INITIALIZED",
        recordId: capaId,
        newValue: JSON.stringify({ created, accessBasis }),
      },
    });
  }
  return { success: true, data: { created } };
}

// â”€â”€ ACTION 2: update status / notes (with note-version snapshot) â”€â”€

export async function updateEvidenceStatus(
  evidenceItemId: string,
  input: z.input<typeof StatusUpdateSchema>,
): Promise<ActionResult> {
  const parsed = StatusUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { session, item } = await loadEvidenceItemScoped(evidenceItemId);
  if (!item) return { success: false, error: "Evidence item not found" };
  if (item.lockedAt !== null) {
    return {
      success: false,
      error:
        "Evidence is locked because the CAPA has progressed to QA review. Re-open the CAPA to modify.",
    };
  }

  const oldStatus = item.status;
  const oldNotes = item.notes;
  const newStatus = parsed.data.status;
  const newNotes = parsed.data.notes ?? item.notes;
  const notesChanged = oldNotes !== (parsed.data.notes ?? null);
  const statusChanged = oldStatus !== newStatus;

  // NA-transition gate (REQ-1). Reason required moving TO or FROM
  // NOT_APPLICABLE; stored as an extra EvidenceNoteVersion so the rationale
  // is preserved for inspection alongside regular note history.
  const transitioningToNA = statusChanged && newStatus === "NOT_APPLICABLE";
  const transitioningFromNA = statusChanged && oldStatus === "NOT_APPLICABLE";
  const requiresReason = transitioningToNA || transitioningFromNA;
  if (requiresReason && (!parsed.data.naReason || parsed.data.naReason.trim().length < 10)) {
    return {
      success: false,
      error:
        "A reason of at least 10 characters is required when changing to or from Not Applicable",
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // Phase 5 — authorization: author-role OR the CAPA's DRIVER (ownerId), and the
  // driver path is allowed ONLY to mark a category NOT_APPLICABLE (with reason).
  // Everything else (uploading evidence, marking COMPLETE/IN_PROGRESS, undoing
  // N/A) stays author-only. This is the ONE new category-level grant in Phase 5.
  // requireGxPAuthor + the viewer hard-stop in isAssignedToTask precede this.
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isDriver = isAssignedToTask(session, { ownerId: item.capa.ownerId });
  const driverMarkingNA = isDriver && transitioningToNA;
  if (!isAuthorRole && !driverMarkingNA) {
    return { success: false, error: "Your role does not permit this action." };
  }
  const accessBasis: "authorRole" | "capaDriver" = isAuthorRole ? "authorRole" : "capaDriver";
  try {
    await prisma.$transaction(async (tx) => {
      // Snapshot prior notes value when notes changed (existing behaviour;
      // preserves ALCOA+ Original).
      if (notesChanged && oldNotes !== null) {
        await tx.evidenceNoteVersion.create({
          data: {
            evidenceItemId,
            notes: oldNotes,
            statusAtTime: oldStatus,
            createdBy: session.user.name,
          },
        });
      }
      // NA-transition rationale: separate EvidenceNoteVersion row tagged with
      // statusAtTime = "NOT_APPLICABLE" (per spec: store as a note version
      // with statusAtTime "NOT_APPLICABLE" when going to NA; for from-NA,
      // tag with the destination status so the rationale clearly belongs to
      // the exit transition).
      if (requiresReason && parsed.data.naReason) {
        await tx.evidenceNoteVersion.create({
          data: {
            evidenceItemId,
            notes: parsed.data.naReason.trim(),
            statusAtTime: transitioningToNA ? "NOT_APPLICABLE" : newStatus,
            createdBy: session.user.name,
          },
        });
      }
      await tx.evidenceItem.update({
        where: { id: evidenceItemId },
        data: {
          status: newStatus,
          notes: newNotes,
          // Phase 2 — dual-write the N/A rationale to the first-class column
          // (in addition to the note-row above). Set on entry to NOT_APPLICABLE,
          // cleared on exit. Reads still use the note-row path for now.
          ...(transitioningToNA
            ? { naReason: parsed.data.naReason!.trim() }
            : transitioningFromNA
              ? { naReason: null }
              : {}),
          // Per-evidence disposition — re-working the item (any status change)
          // clears the QA rejection so the red "Rejected by QA" pin disappears
          // once the driver answers it again.
          ...(statusChanged
            ? { reviewedById: null, reviewedAt: null, rejectionReason: null }
            : {}),
        },
      });
      // Differentiate audit action so the trail distinguishes status changes
      // from notes-only edits (REQ-2 / REQ-4).
      const auditAction = statusChanged
        ? "EVIDENCE_STATUS_CHANGED"
        : "EVIDENCE_NOTE_UPDATED";
      await tx.auditLog.create({
        data: {
          tenantId: item.capa.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: AUDIT_MODULE,
          action: auditAction,
          recordId: evidenceItemId,
          recordTitle: item.capa.description.slice(0, 80),
          oldValue: statusChanged ? oldStatus : (oldNotes ?? ""),
          newValue: JSON.stringify({
            status: newStatus,
            ...(notesChanged ? { notesChanged: true } : {}),
            ...(parsed.data.naReason ? { naReason: parsed.data.naReason.trim() } : {}),
            accessBasis,
          }),
        },
      });
    });

    revalidatePath(`/capa/${item.capa.id}`);
    revalidatePath("/capa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] updateEvidenceStatus failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to update evidence status") };
  }
}

// â”€â”€ ACTION 3: upload a file â”€â”€

export async function addEvidenceFile(
  evidenceItemId: string,
  formData: FormData,
  // Phase 2 — optional per-action attachment link. When provided, the file is
  // additionally scoped to a specific action item of the same CAPA (it still
  // belongs to its EvidenceItem/category). No UI passes this yet.
  actionItemId?: string,
): Promise<ActionResult<{ id: string; fileName: string }>> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "No file provided" };
  }

  if (file.size === 0) {
    return { success: false, error: "File is empty" };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      success: false,
      error: `File exceeds ${MAX_FILE_MB} MB limit`,
    };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { success: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }

  const { session, item } = await loadEvidenceItemScoped(evidenceItemId);
  if (!item) return { success: false, error: "Evidence item not found" };
  if (item.lockedAt !== null) {
    return {
      success: false,
      error:
        "Evidence is locked because the CAPA has progressed to QA review. Re-open the CAPA to modify.",
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // Authorization: author-role OR the CAPA's single assignee (ownerId) — who may
  // upload to ANY category, picking it in the UI — OR the action-scoped owner
  // path (actionItemId provided AND the session user owns that action item) —
  // "their proof, on their action". requireGxPAuthor (above) already permits a
  // non-QA assignee; the viewer hard-stop is in isAssignedToTask.
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: item.capa.ownerId });
  let ownerOfAction = false;
  if (actionItemId) {
    // Action item must belong to the same CAPA + tenant.
    const ai = await prisma.cAPAActionItem.findFirst({
      where: { id: actionItemId, capaId: item.capa.id, tenantId: item.capa.tenantId },
      select: { id: true, ownerId: true },
    });
    if (!ai) {
      return { success: false, error: "Action item not found on this CAPA." };
    }
    ownerOfAction = isAssignedToTask(session, ai);
  }
  if (!isAuthorRole && !isAssignee && !(actionItemId && ownerOfAction)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  const accessBasis: "authorRole" | "capaAssignee" | "assignedOwner" =
    isAuthorRole ? "authorRole" : isAssignee ? "capaAssignee" : "assignedOwner";
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHashSha256 = createHash("sha256").update(buffer).digest("hex");
    const sanitized = sanitizeFilename(file.name);
    const ext = (() => {
      const i = sanitized.lastIndexOf(".");
      return i > 0 ? sanitized.slice(i).toLowerCase() : "";
    })();

    // Hash-prefixed key naturally idempotent on duplicate uploads of the same
    // file. <capaId>/<itemId>/<hash>-<sanitized>.
    const storageKey = `evidence/${item.capa.id}/${evidenceItemId}/${contentHashSha256}-${sanitized}`;
    const { url } = await fileStorage.save(storageKey, buffer, file.type);

    const created = await prisma.evidenceFile.create({
      data: {
        evidenceItemId,
        fileName: sanitized,
        originalFileName: sanitized,
        fileSize: file.size,
        fileType: file.type,
        fileExtension: ext,
        fileUrl: url,
        contentHashSha256,
        retainUntil: nowPlusYears(RETENTION_YEARS),
        uploadedBy: session.user.name,
        // Phase 2 — authoritative uploader FK (null for admin actors with no
        // User row); the uploadedBy name string stays for display/legacy.
        uploadedById: actor.userId,
        // Phase 2 — optional per-action scope (validated above).
        actionItemId: actionItemId ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: item.capa.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "EVIDENCE_FILE_UPLOADED",
        recordId: created.id,
        recordTitle: item.capa.description.slice(0, 80),
        newValue: JSON.stringify({
          fileName: sanitized,
          fileSize: file.size,
          contentHashSha256,
          ...(actionItemId ? { actionItemId } : {}),
          accessBasis,
        }),
      },
    });

    revalidatePath(`/capa/${item.capa.id}`);
    revalidatePath("/capa");
    return { success: true, data: { id: created.id, fileName: sanitized } };
  } catch (err) {
    console.error("[action] addEvidenceFile failed:", err);
    return { success: false, error: "Failed to upload file" };
  }
}

// ── STEP 2: category-routed upload — one control, a category dropdown ──
//
// The single assignee (or an author) picks one of the 7 GxP categories and the
// file auto-files there. We find-or-create the EvidenceItem for that category
// (same idempotent (capaId, category) key initializeEvidenceForCAPA uses) and
// hand off to the canonical addEvidenceFile path — the Part 11 backbone (hash,
// audit, lock-check, soft-delete) is untouched; the dropdown only chooses WHICH
// item the file attaches to.

export async function addEvidenceFileToCategory(
  capaId: string,
  category: string,
  formData: FormData,
): Promise<ActionResult<{ id: string; fileName: string }>> {
  if (!(EVIDENCE_CATEGORIES as readonly string[]).includes(category)) {
    return { success: false, error: "Unknown evidence category." };
  }
  const session = await requireAuth();
  const capa = await prisma.cAPA.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id: capaId }
        : { id: capaId, tenantId: session.user.tenantId },
    select: { id: true, ownerId: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };

  // Gate BEFORE the upsert so an unauthorized caller can't seed an EvidenceItem
  // row. Mirrors addEvidenceFile's category-level gate (author OR the CAPA's
  // assignee); addEvidenceFile re-checks it below (defense in depth).
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: capa.ownerId });
  if (!isAuthorRole && !isAssignee) {
    return { success: false, error: "Your role does not permit this action." };
  }

  // Normally the 7 rows already exist (seeded at creation), so this resolves to
  // the existing id; create is the fallback for an unseeded category.
  const item = await prisma.evidenceItem.upsert({
    where: { capaId_category: { capaId, category } },
    update: {},
    create: { capaId, category, status: "PENDING", createdBy: session.user.name },
    select: { id: true },
  });

  return addEvidenceFile(item.id, formData);
}

// ── STEP 1: standalone per-category QA reject (no whole-CAPA bounce) ──
//
// Unlike rejectCAPA (which bounces the whole CAPA pending_qa_review → in_progress
// and may tag evidence), this rejects ONE category in place: the CAPA stays in
// pending_qa_review and only this category re-opens for the assignee. Reuses the
// exact per-evidence fields + EVIDENCE_REJECTED audit/notify rejectCAPA already
// uses. The clear-on-rework path in updateEvidenceStatus un-rejects it when the
// category is next updated (e.g. QA marking it COMPLETE on re-review).

const RejectEvidenceCategorySchema = z.object({
  reason: z.string().min(5, "A reason of at least 5 characters is required").max(2000),
});

export async function rejectEvidenceCategory(
  evidenceItemId: string,
  input: z.input<typeof RejectEvidenceCategorySchema>,
): Promise<ActionResult> {
  const parsed = RejectEvidenceCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { session, item } = await loadEvidenceItemScoped(evidenceItemId);
  if (!item) return { success: false, error: "Evidence item not found" };

  // QA-only disposition — same role set as the whole-CAPA reject.
  if (!CAPA_REJECT_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can reject evidence." };
  }
  if (item.capa.status !== "pending_qa_review") {
    return { success: false, error: "Only evidence on a CAPA awaiting QA review can be rejected." };
  }
  if (item.status === "REJECTED") {
    return { success: false, error: "This evidence category is already rejected." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.evidenceItem.update({
        where: { id: evidenceItemId },
        data: {
          status: "REJECTED",
          rejectionReason: parsed.data.reason,
          reviewedById: actor.userId,
          reviewedAt: now,
          // Re-open JUST this category for rework while the CAPA stays in QA
          // review and every other category stays locked. Without clearing the
          // lock the assignee couldn't re-upload (lockedAt blocks all
          // mutations). Mirrors unlockEvidenceForCAPA's field-clear, scoped to
          // this one item.
          lockedAt: null,
          lockedBy: null,
          lockedSignatureId: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: item.capa.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: AUDIT_MODULE,
          action: "EVIDENCE_REJECTED",
          recordId: evidenceItemId,
          recordTitle: item.capa.description.slice(0, 80),
          newValue: JSON.stringify({ capaId: item.capa.id, reason: parsed.data.reason.slice(0, 200) }),
        },
      });
    });

    // Notify the assignee (CAPA owner) + anyone who uploaded a file to this
    // category. Fault-isolated (notifyMany never throws; skips the actor + null
    // FKs). Mirrors rejectCAPA's EVIDENCE_REJECTED notify.
    const uploaders = await prisma.evidenceFile.findMany({
      where: { evidenceItemId, deletedAt: null },
      select: { uploadedById: true },
    });
    const recipientIds = Array.from(
      new Set(
        [item.capa.ownerId, ...uploaders.map((f) => f.uploadedById)].filter(
          (v): v is string => !!v,
        ),
      ),
    );
    const capaRef = item.capa.reference ?? item.capa.id;
    await notifyMany(
      recipientIds.map((uid) => ({
        tenantId: item.capa.tenantId,
        recipientUserId: uid,
        actorUserId: actor.userId,
        type: "EVIDENCE_REJECTED" as const,
        title: `Evidence rejected (CAPA ${capaRef})`,
        body: parsed.data.reason.slice(0, 200),
        linkPath: `/capa/${item.capa.id}`,
        entityType: "CAPA",
        entityId: item.capa.id,
      })),
    );

    revalidatePath(`/capa/${item.capa.id}`);
    revalidatePath("/capa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] rejectEvidenceCategory failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to reject evidence") };
  }
}

// â”€â”€ ACTION 4: soft-delete a file â”€â”€

export async function removeEvidenceFile(
  fileId: string,
  input: z.input<typeof RemoveFileSchema>,
): Promise<ActionResult> {
  const parsed = RemoveFileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const session = await requireAuth();
  const file = await prisma.evidenceFile.findUnique({
    where: { id: fileId },
    include: {
      evidenceItem: {
        include: { capa: { select: { id: true, tenantId: true, description: true, ownerId: true } } },
      },
    },
  });
  if (!file) return { success: false, error: "File not found" };
  if (
    session.user.role !== "super_admin" &&
    file.evidenceItem.capa.tenantId !== session.user.tenantId
  ) {
    return { success: false, error: "File not found" };
  }
  if (file.deletedAt !== null) {
    return { success: false, error: "File is already removed" };
  }
  if (file.evidenceItem.lockedAt !== null) {
    return {
      success: false,
      error:
        "Evidence is locked because the CAPA has progressed to QA review. Re-open the CAPA to modify.",
    };
  }
  // Retention applies to destroying the file bytes, not to this soft-delete:
  // the row stays (deletedAt + reason + audit row), and fileStorage.delete()
  // is intentionally not called below â€” bytes survive on disk for the full
  // retainUntil window. A future hard-delete/purge job is where the
  // retainUntil check belongs.

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.evidenceFile.update({
        where: { id: fileId },
        data: {
          deletedAt: new Date(),
          deletedBy: session.user.name,
          deletionReason: parsed.data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: file.evidenceItem.capa.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: AUDIT_MODULE,
          action: "EVIDENCE_FILE_SOFT_DELETED",
          recordId: fileId,
          recordTitle: file.evidenceItem.capa.description.slice(0, 80),
          oldValue: JSON.stringify({
            fileName: file.fileName,
            contentHashSha256: file.contentHashSha256,
          }),
          newValue: JSON.stringify({
            deletedAt: new Date().toISOString(),
            deletionReason: parsed.data.reason,
          }),
        },
      });
    });

    // The actual file on disk is preserved â€” ALCOA+ Enduring. fileStorage
    // .delete() is a no-op for the local backend.
    revalidatePath(`/capa/${file.evidenceItem.capa.id}`);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] removeEvidenceFile failed:", err);
    return { success: false, error: "Failed to remove file" };
  }
}

// â”€â”€ ACTION 5: read note-version history â”€â”€

export async function loadEvidenceNoteHistory(
  evidenceItemId: string,
): Promise<ActionResult<{
  current: { notes: string | null; status: EvidenceStatus };
  versions: Array<{ id: string; notes: string; statusAtTime: string; createdBy: string; createdAt: Date }>;
}>> {
  const { session, item } = await loadEvidenceItemScoped(evidenceItemId);
  if (!item) return { success: false, error: "Evidence item not found" };

  const versions = await getEvidenceNoteHistory(evidenceItemId, item.capa.tenantId);
  if (!versions) return { success: false, error: "Evidence item not found" };

  void session;
  return {
    success: true,
    data: {
      current: { notes: item.notes, status: item.status as EvidenceStatus },
      versions: versions.map((v) => ({
        id: v.id,
        notes: v.notes,
        statusAtTime: v.statusAtTime,
        createdBy: v.createdBy,
        createdAt: v.createdAt,
      })),
    },
  };
}

// â”€â”€ Client-callable read wrapper for the Evidence panel â”€â”€

export async function loadEvidenceForCAPA(capaId: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Use session.user.tenantId so the caller can't pass an arbitrary one.
  const tenantId =
    session.user.role === "super_admin"
      ? // For super_admin, look up the CAPA's actual tenant rather than scoping to their own.
        (await prisma.cAPA.findUnique({ where: { id: capaId }, select: { tenantId: true } }))?.tenantId
      : session.user.tenantId;
  if (!tenantId) return { success: false, error: "CAPA not found" };

  // Lazy initialization for CAPAs created before this feature shipped.
  const existingCount = await prisma.evidenceItem.count({ where: { capaId } });
  if (existingCount === 0) {
    await initializeEvidenceForCAPA(capaId);
  }

  const items = await getEvidenceForCAPA(capaId, tenantId);
  if (!items) return { success: false, error: "CAPA not found" };
  return { success: true, data: items };
}
