import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * The 7 evidence categories per the GxP reference doc, in the order the UI
 * should render them. Kept here (not in the action file) so server queries
 * + UI can both import without coupling either to actions.
 */
export const EVIDENCE_CATEGORIES = [
  "BATCH_RECORDS",
  "TRAINING_RECORDS",
  "EQUIPMENT_LOGS",
  "ENVIRONMENTAL_DATA",
  "DEVIATION_HISTORY",
  "WITNESS_INTERVIEWS",
  "SUPPLIER_DATA",
] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const EVIDENCE_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETE",
  "NOT_APPLICABLE",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export interface EvidenceFileSummary {
  id: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  fileType: string;
  fileExtension: string;
  contentHashSha256: string;
  retainUntil: Date;
  uploadedBy: string;
  createdAt: Date;
}

export interface EvidenceItemSummary {
  id: string;
  category: EvidenceCategory;
  status: EvidenceStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  files: EvidenceFileSummary[];
  deletedFileCount: number;
  isLocked: boolean;
  hasNoteHistory: boolean;
}

/**
 * Returns all 7 evidence items for a CAPA, in canonical category order, each
 * with its non-deleted files and a count of soft-deleted files.
 *
 * Tenant scoping: caller supplies tenantId — query joins through CAPA.tenantId
 * to refuse cross-tenant reads. Returns null if the CAPA doesn't exist or
 * isn't visible to the tenant.
 */
export const getEvidenceForCAPA = cache(async (capaId: string, tenantId: string) => {
  // Verify the CAPA belongs to this tenant before returning evidence.
  const capa = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId },
    select: { id: true },
  });
  if (!capa) return null;

  const items = await prisma.evidenceItem.findMany({
    where: { capaId },
    include: {
      files: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      _count: {
        select: {
          files: { where: { NOT: { deletedAt: null } } },
          noteVersions: true,
        },
      },
    },
  });

  // Sort by canonical category order so the UI doesn't have to.
  const byCategory = new Map(items.map((it) => [it.category, it]));
  return EVIDENCE_CATEGORIES.map((cat): EvidenceItemSummary | null => {
    const it = byCategory.get(cat);
    if (!it) return null;
    return {
      id: it.id,
      category: it.category as EvidenceCategory,
      status: it.status as EvidenceStatus,
      notes: it.notes,
      createdAt: it.createdAt,
      updatedAt: it.updatedAt,
      files: it.files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        originalFileName: f.originalFileName,
        fileSize: f.fileSize,
        fileType: f.fileType,
        fileExtension: f.fileExtension,
        contentHashSha256: f.contentHashSha256,
        retainUntil: f.retainUntil,
        uploadedBy: f.uploadedBy,
        createdAt: f.createdAt,
      })),
      deletedFileCount: it._count.files,
      isLocked: it.lockedAt !== null,
      hasNoteHistory: it._count.noteVersions > 0,
    };
  }).filter((x): x is EvidenceItemSummary => x !== null);
});

/** Returns all snapshot versions of EvidenceItem.notes, newest first. */
export const getEvidenceNoteHistory = cache(
  async (evidenceItemId: string, tenantId: string) => {
    // Tenant-scope guard via the EvidenceItem → CAPA chain.
    const item = await prisma.evidenceItem.findFirst({
      where: { id: evidenceItemId, capa: { tenantId } },
      select: { id: true },
    });
    if (!item) return null;

    return prisma.evidenceNoteVersion.findMany({
      where: { evidenceItemId },
      orderBy: { createdAt: "desc" },
    });
  },
);
