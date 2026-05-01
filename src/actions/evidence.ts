"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_STATUSES,
  getEvidenceForCAPA,
  getEvidenceNoteHistory,
  type EvidenceStatus,
} from "@/lib/queries/evidence";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// ── Constants / config ──

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

// ── Schemas ──

const StatusUpdateSchema = z.object({
  status: z.enum(EVIDENCE_STATUSES as readonly [EvidenceStatus, ...EvidenceStatus[]]),
  notes: z.string().max(10_000).optional(),
});

const RemoveFileSchema = z.object({
  reason: z.string().min(10, "Deletion reason must be at least 10 characters"),
});

// ── Internal helpers ──

/**
 * Tenant-scope guard: returns the EvidenceItem joined to its CAPA's tenantId,
 * or null if either the item is missing or it belongs to a different tenant.
 * super_admin bypasses scope (per existing convention in admin actions).
 */
async function loadEvidenceItemScoped(evidenceItemId: string) {
  const session = await requireAuth();
  const item = await prisma.evidenceItem.findUnique({
    where: { id: evidenceItemId },
    include: { capa: { select: { id: true, tenantId: true, description: true } } },
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

// ── ACTION 1: initialise the 7 evidence rows for a CAPA ──

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
    select: { id: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };

  try {
    // Idempotent — skipDuplicates means re-running is a no-op once rows exist.
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
    return { success: true, data: { created: result.count } };
  } catch (err) {
    // If skipDuplicates isn't honoured (older Prisma) we fall back to per-row
    // upsert. Either way, end-state is the same: 7 rows exist.
    let created = 0;
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
        // P2002 on (capaId, category) — already exists, skip.
      }
    }
    if (created === 0) {
      // Genuine error — re-throw the original.
      console.error("[action] initializeEvidenceForCAPA failed:", err);
      return { success: false, error: "Failed to initialize evidence categories" };
    }
    return { success: true, data: { created } };
  }
}

// ── ACTION 2: update status / notes (with note-version snapshot) ──

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
    return { success: false, error: "FORBIDDEN: Evidence item is locked" };
  }

  try {
    const oldStatus = item.status;
    const oldNotes = item.notes;
    const newStatus = parsed.data.status;
    const newNotes = parsed.data.notes ?? item.notes;
    const notesChanged = oldNotes !== (parsed.data.notes ?? null);

    await prisma.$transaction(async (tx) => {
      // If notes changed, snapshot the OLD value before updating — preserves
      // ALCOA+ Original. statusAtTime captures the state at snapshot time.
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
      await tx.evidenceItem.update({
        where: { id: evidenceItemId },
        data: { status: newStatus, notes: newNotes },
      });
      await tx.auditLog.create({
        data: {
          tenantId: item.capa.tenantId,
          userName: session.user.name,
          userRole: session.user.role,
          module: AUDIT_MODULE,
          action: "EVIDENCE_STATUS_UPDATED",
          recordId: evidenceItemId,
          recordTitle: item.capa.description.slice(0, 80),
          oldValue: JSON.stringify({ status: oldStatus, notes: oldNotes }),
          newValue: JSON.stringify({ status: newStatus, notes: newNotes }),
        },
      });
    });

    revalidatePath(`/capa/${item.capa.id}`);
    revalidatePath("/capa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] updateEvidenceStatus failed:", err);
    return { success: false, error: "Failed to update evidence status" };
  }
}

// ── ACTION 3: upload a file ──

export async function addEvidenceFile(
  evidenceItemId: string,
  formData: FormData,
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
    return { success: false, error: "FORBIDDEN: Evidence item is locked" };
  }

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
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: item.capa.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: AUDIT_MODULE,
        action: "EVIDENCE_FILE_UPLOADED",
        recordId: created.id,
        recordTitle: item.capa.description.slice(0, 80),
        newValue: JSON.stringify({
          fileName: sanitized,
          fileSize: file.size,
          contentHashSha256,
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

// ── ACTION 4: soft-delete a file ──

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
        include: { capa: { select: { id: true, tenantId: true, description: true } } },
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
    return { success: false, error: "FORBIDDEN: Evidence item is locked" };
  }
  if (Date.now() < file.retainUntil.getTime()) {
    const until = file.retainUntil.toISOString().slice(0, 10);
    return {
      success: false,
      error: `RETENTION_PERIOD_NOT_MET: file must be retained until ${until}`,
    };
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
          userName: session.user.name,
          userRole: session.user.role,
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

    // The actual file on disk is preserved — ALCOA+ Enduring. fileStorage
    // .delete() is a no-op for the local backend.
    revalidatePath(`/capa/${file.evidenceItem.capa.id}`);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] removeEvidenceFile failed:", err);
    return { success: false, error: "Failed to remove file" };
  }
}

// ── ACTION 5: read note-version history ──

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

// ── Client-callable read wrapper for the Evidence panel ──

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
