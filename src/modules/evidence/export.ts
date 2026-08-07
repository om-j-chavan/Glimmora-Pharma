import dayjs from "@/lib/dayjs";
import { formatDocumentSource } from "@/lib/labels/documentSource";
import { prettyStatus } from "@/lib/format/text";
import { downloadPDF, downloadExcel } from "@/lib/exportTable";
import type { EvidenceLibraryDoc } from "@/lib/queries/evidenceLibrary";

/**
 * Bulk metadata export for the Evidence library — pure data transformation,
 * lifted out of EvidencePage so the page holds only selection state and JSX.
 *
 * NOTE: a metadata REPORT, not the raw files (mixed types + link-only docs
 * can't merge into one PDF/Excel; bundling raw files would be a ZIP).
 */
export const EXPORT_HEADERS = ["Name", "Type", "Source", "Uploader", "Date", "Status", "Linked URL"];

export function exportSelected(docs: EvidenceLibraryDoc[], format: "pdf" | "excel") {
  if (!docs.length) return;
  const rows = docs.map((d) => [
    d.title,
    d.category ?? "",
    formatDocumentSource(d.originLabel),
    d.uploaderName,
    d.uploadedAt ? dayjs(d.uploadedAt).format("YYYY-MM-DD") : "",
    prettyStatus(d.status),
    d.linkUrl ?? "",
  ]);
  const filename = `evidence-selected-${dayjs().format("YYYY-MM-DD")}`;
  if (format === "pdf") {
    downloadPDF(filename, EXPORT_HEADERS, rows, { title: "Selected documents", subtitle: `${docs.length} document${docs.length === 1 ? "" : "s"}` });
  } else {
    downloadExcel(filename, EXPORT_HEADERS, rows);
  }
}
