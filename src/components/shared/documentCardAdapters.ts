import dayjs from "@/lib/dayjs";
import type { DocumentCardView } from "./DocumentCard";
import type { EvidenceLibraryDoc, DocOrigin } from "@/lib/queries/evidenceLibrary";
import type { WorklistDoc } from "@/lib/queries/worklist";
import { EVIDENCE_CATEGORY_LABEL, type EvidenceCategory } from "@/lib/queries/evidence";
import { RISK_DOC_CATEGORY_LABEL, type RiskDocCategory } from "@/constants/risk";
import { formatDocumentSource } from "@/lib/labels/documentSource";

/**
 * Per-source adapters → the shared <DocumentCard>'s normalized DocumentCardView.
 * Each module's doc shape differs (Evidence keys on title/url/hasFile/linkUrl;
 * Worklist/Gap-detail on fileName + the /api/documents/{id} route), so these
 * thin mappers let ONE card serve all of them.
 */

const ORIGIN_TONE: Record<DocOrigin, "blue" | "purple" | "amber" | "red"> = {
  evidence: "blue", capa: "purple", csv: "amber", fda483: "red",
};

/** Evidence & Documents (EvidenceLibraryDoc) → card view. */
export function evidenceDocToCardView(d: EvidenceLibraryDoc): DocumentCardView {
  return {
    id: d.id,
    title: d.title,
    meta: [d.category, d.uploaderName, d.uploadedAt ? dayjs(d.uploadedAt).format("DD MMM YYYY") : ""].filter(Boolean).join(" · "),
    badge: { label: formatDocumentSource(d.originLabel), tone: ORIGIN_TONE[d.origin] },
    locked: d.locked,
    viewHref: d.url,
    downloadHref: d.hasFile ? d.url : null,
    linkUrl: d.linkUrl,
  };
}

/** Worklist / Gap-detail uploaded doc (WorklistDoc) → card view. Category → a
 *  badge (readable label); Author + file info + date → the meta line. */
export function worklistDocToCardView(d: WorklistDoc): DocumentCardView {
  // Default to the Document route; a doc may override (e.g. CAPA-action evidence
  // is an EvidenceFile served from /api/evidence/files/{id}).
  const href = d.href ?? `/api/documents/${d.id}`;
  // Documents carried over from a converted Risk keep the risk-register category
  // vocabulary, so fall back to that map before printing the raw SCREAMING_SNAKE.
  const catLabel = d.category
    ? (EVIDENCE_CATEGORY_LABEL[d.category as EvidenceCategory]
       ?? RISK_DOC_CATEGORY_LABEL[d.category as RiskDocCategory]
       ?? d.category)
    : null;
  const fileInfo = d.fileSize ?? (d.fileType ?? d.fileExtension ?? null);
  return {
    id: d.id,
    title: d.fileName,
    badge: catLabel ? { label: catLabel, tone: "blue" } : undefined,
    // Author · file info · date.
    meta: [d.uploadedBy, fileInfo, d.uploadedAt ? dayjs(d.uploadedAt).format("DD MMM YYYY") : ""].filter(Boolean).join(" · "),
    viewHref: href,
    downloadHref: href,
  };
}
