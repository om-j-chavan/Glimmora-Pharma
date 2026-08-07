import { Badge } from "@/components/ui/Badge";
import type { DocOrigin } from "@/lib/queries/evidenceLibrary";

/**
 * Evidence-module presenters shared by the page and its modals.
 *
 * These are deliberately NOT in src/lib/format/: each one is tied to this
 * module's own vocabulary — the `DocOrigin` union, this module's status words,
 * and <Badge> variants. Generic, module-agnostic formatters (truncate,
 * prettyStatus, formatBytes) live in src/lib/format/ instead. Keep the split:
 * a helper that names an evidence concept belongs here.
 *
 * Mirrors the pattern of src/modules/support/_shared.tsx.
 */

/** Origin → badge colour for the Source column. */
export const ORIGIN_BADGE: Record<DocOrigin, "blue" | "purple" | "amber" | "red"> = {
  evidence: "blue",
  capa: "purple",
  csv: "amber",
  fda483: "red",
};

/** Document status → badge. Unknown/other statuses read as "Current". */
export function statusBadge(status: string) {
  if (status === "approved") return <Badge variant="green">Approved</Badge>;
  if (status === "under_review") return <Badge variant="amber">Under Review</Badge>;
  if (status === "rejected") return <Badge variant="red">Rejected</Badge>;
  if (status === "draft") return <Badge variant="gray">Draft</Badge>;
  return <Badge variant="blue">Current</Badge>;
}

/** Raw mime/extension → a readable label (item 5). */
export function fileTypeLabel(ft: string | null, hasFile: boolean, hasLink: boolean): string {
  if (!ft) return hasFile ? "File" : hasLink ? "Web link" : "—";
  const t = ft.toLowerCase();
  const rules: [RegExp, string][] = [
    [/pdf/, "PDF Document"],
    [/wordprocessingml|msword|(^|\.)docx?$/, "Word Document"],
    [/spreadsheetml|ms-?excel|(^|\.)xlsx?$/, "Excel Spreadsheet"],
    [/csv/, "CSV Spreadsheet"],
    [/png/, "Image (PNG)"],
    [/jpe?g/, "Image (JPEG)"],
    [/gif/, "Image (GIF)"],
    [/text\/plain|(^|\.)txt$/, "Text File"],
  ];
  for (const [re, label] of rules) if (re.test(t)) return label;
  return ft.replace(/^\./, "").toUpperCase();
}
