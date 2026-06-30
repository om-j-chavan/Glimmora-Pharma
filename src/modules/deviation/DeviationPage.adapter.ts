import type { Deviation as PrismaDeviation } from "@prisma/client";
import type { Deviation, DeviationStatus, DeviationSeverity, ImpactLevel } from "@/store/deviation.slice";
import type { LinkedDocument, DocFileType, DocStatus } from "@/components/shared/DocumentUpload";

/** Selected Document fields hydrated by getDeviations for each deviation
 *  (persisted evidence, linked via linkedModule="Deviation Management"). */
export interface DeviationDocRow {
  id: string;
  fileName: string;
  originalFileName: string | null;
  fileType: string | null;
  fileExtension: string | null;
  fileSize: string | null;
  status: string;
  version: string;
  uploadedBy: string;
  uploadedAt: Date | null;
  createdAt: Date;
}

/** Prisma Deviation plus the optional `sourcedCAPA` relation and the persisted
 *  `documents` selected/grouped by getDeviations. */
export type PrismaDeviationWithCapa = PrismaDeviation & {
  sourcedCAPA?: { id: string; reference: string | null } | null;
  documents?: DeviationDocRow[];
};

function toDocFileType(ext: string | null, mime: string | null): DocFileType {
  const e = (ext ?? "").replace(/^\./, "").toLowerCase();
  if (["pdf", "doc", "docx", "xls", "xlsx", "jpg", "png", "txt"].includes(e)) return e as DocFileType;
  if (e === "jpeg") return "jpg";
  if (e === "csv") return "txt";
  const m = mime ?? "";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("spreadsheet")) return "xlsx";
  if (m.includes("word")) return "docx";
  return "txt";
}

// Document.status (draft/approved/under_review/rejected/superseded) → the
// DocumentUpload status union. draft/rejected/unknown → "under_review" (a
// non-approved placeholder; never silently "approved"/"current").
function toUploadStatus(s: string): DocStatus {
  switch (s.trim().toLowerCase()) {
    case "approved": return "approved";
    case "under_review": return "under_review";
    case "superseded": return "superseded";
    case "current": return "current";
    default: return "under_review";
  }
}

/* ── Adapt Prisma Deviation → slice Deviation shape ── */
export function adaptDeviation(p: PrismaDeviationWithCapa): Deviation {
  return {
    id: p.id,
    reference: p.reference ?? undefined,
    tenantId: p.tenantId,
    siteId: p.siteId ?? "",
    title: p.title,
    description: p.description,
    type: p.type as Deviation["type"],
    category: p.category as Deviation["category"],
    severity: p.severity as DeviationSeverity,
    area: p.area,
    detectedBy: p.detectedBy,
    detectedDate: p.detectedDate.toISOString(),
    reportedBy: p.detectedBy,
    reportedDate: p.detectedDate.toISOString(),
    owner: p.owner,
    dueDate: p.dueDate ? p.dueDate.toISOString() : "",
    status: p.status as DeviationStatus,
    immediateAction: p.immediateAction ?? "",
    rootCause: p.rootCause ?? undefined,
    rcaMethod: (p.rcaMethod ?? undefined) as Deviation["rcaMethod"],
    createdById: p.createdById ?? undefined,
    // Tier 2 — investigation + CAPA decision (Dates → ISO strings).
    rcaData: p.rcaData ?? undefined,
    investigationCompletedAt: p.investigationCompletedAt
      ? p.investigationCompletedAt.toISOString()
      : undefined,
    investigationCompletedById: p.investigationCompletedById ?? undefined,
    capaDecisionMade: p.capaDecisionMade,
    capaDecisionRequired: p.capaDecisionRequired ?? undefined,
    capaDecisionReason: p.capaDecisionReason ?? undefined,
    capaDecisionAt: p.capaDecisionAt ? p.capaDecisionAt.toISOString() : undefined,
    capaDecisionById: p.capaDecisionById ?? undefined,
    patientSafetyImpact: (p.patientSafetyImpact ?? "none") as ImpactLevel,
    productQualityImpact: (p.productQualityImpact ?? "none") as ImpactLevel,
    regulatoryImpact: (p.regulatoryImpact ?? "none") as ImpactLevel,
    batchesAffected: p.batchesAffected
      ? p.batchesAffected.split(",").map((b) => b.trim()).filter(Boolean)
      : undefined,
    linkedCAPAId: p.linkedCAPAId ?? undefined,
    linkedCAPARef: p.sourcedCAPA?.reference ?? undefined,
    // Persisted evidence (survives refresh). Download via /api/documents/[id]
    // (the shared auth+tenant+soft-delete route) — not base64.
    documents: (p.documents ?? []).map((d): LinkedDocument => ({
      id: d.id,
      fileName: d.originalFileName ?? d.fileName,
      fileType: toDocFileType(d.fileExtension, d.fileType),
      fileSize: d.fileSize ? `${Math.round(Number(d.fileSize) / 1024)} KB` : "",
      uploadedBy: d.uploadedBy,
      uploadedByRole: "",
      uploadedAt: (d.uploadedAt ?? d.createdAt).toISOString(),
      version: (d.version ?? "v1.0").replace(/^v/i, ""),
      status: toUploadStatus(d.status),
      linkedTo: { module: "Deviation Management", recordId: p.id, recordTitle: p.title },
      dataUrl: `/api/documents/${d.id}`,
    })),
    closedBy: p.closedBy ?? undefined,
    closedDate: p.closedDate ? p.closedDate.toISOString() : undefined,
    closureNotes: p.closureNotes ?? undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
