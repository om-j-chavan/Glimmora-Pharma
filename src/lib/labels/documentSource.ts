/**
 * DISPLAY-ONLY label formatter for the Evidence & Documents source/category tag.
 *
 * Documents arrive with an inconsistent source label (`originLabel`): fixed origin
 * labels ("CAPA evidence", "CSV/CSA validation", "Inspection", "Evidence &
 * Documents") mixed with RAW `sourceModule` keys ("gap-assessment", "deviation",
 * "risk-register", "management-decisions", "Deviation Task", …). This normalizes
 * them to consistent Title Case for rendering ONLY — it never changes stored
 * values, filter keys, or queries.
 */

/** Acronyms that keep canonical casing in a source label (keyed by UPPERCASE form).
 *  GxP is intentionally mixed-case. */
const ACRONYM_FORMS: Record<string, string> = {
  CAPA: "CAPA", CSV: "CSV", CSA: "CSA", RCA: "RCA", FDA: "FDA",
  GXP: "GxP", KPI: "KPI", QA: "QA", QC: "QC", SOP: "SOP", OOS: "OOS", DI: "DI",
};

/** Known source labels → their canonical Title-Case form (keyed case-insensitively).
 *  Covers every distinct value the evidence library emits today; the generic
 *  fallback below handles anything new. */
const SOURCE_LABELS: Record<string, string> = {
  "gap-assessment": "Gap Assessment",
  "gap assessment": "Gap Assessment",
  "risk-register": "Risk Register",
  "management-decisions": "Management Decisions",
  "capa evidence": "CAPA Evidence",
  "capa": "CAPA",
  "deviation": "Deviation",
  "deviation management": "Deviation Management",
  "deviation task": "Deviation Task",
  "support": "Support",
  "inspection": "Inspection",
  "evidence & documents": "Evidence & Documents",
  "csv/csa validation": "CSV/CSA Validation",
  "validation": "Validation",
  "linked": "Linked",
};

function titleCaseWord(w: string): string {
  if (!w) return w;
  const up = w.toUpperCase();
  if (ACRONYM_FORMS[up]) return ACRONYM_FORMS[up];
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/**
 * Consistent Title-Case label for a document source/category tag. Known values map
 * explicitly; unknown ones fall back to a generic Title-Case (split on `-`, `_`, and
 * whitespace; Title-case each word; preserve acronyms and any `/`). Display only.
 */
export function formatDocumentSource(raw: string | null | undefined): string {
  if (!raw) return "";
  const key = raw.trim().toLowerCase();
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  return raw
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.split("/").map(titleCaseWord).join("/"))
    .join(" ");
}
