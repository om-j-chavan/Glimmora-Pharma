/**
 * Module label layer. AuditLog.module is a free string written by each writer —
 * a mix of already-readable names ("Gap Assessment", "CAPA", "Admin") and lower
 * slugs ("auth", "agi_console", "ai_capa"). This maps the slugs (and the task's
 * canonical examples) to readable names; anything already readable passes
 * through, and unknown slugs get a prettified fallback so no raw slug reaches
 * the UI. Presentation only — never changes what is stored.
 *
 * Matches the plain-TS convention of src/lib/labels/auditEvents.ts (no deps).
 */

export const MODULE_LABELS: Record<string, string> = {
  auth: "Authentication",
  admin: "Admin",
  capa: "CAPA",
  "fda-483": "FDA 483",
  fda483: "FDA 483",
  "csv-csa": "CSV/CSA",
  "gap-assessment": "Gap Assessment",
  deviation: "Deviation Management",
  governance: "Governance",
  evidence: "Evidence & Documents",
  support: "Support",
  settings: "Settings",
  agi_console: "AGI Console",
  ai_capa: "AI CAPA",
  ai_policy: "AI Policy",
  ai_tools: "AI Tools",
  audit_trail: "Audit Trail",
  inspection: "Inspection Readiness",
};

/** Prettify a lower slug ("agi_console" → "Agi Console"). Values that are
 *  already readable (contain a space or an uppercase letter) pass through. */
function prettifyModule(module: string): string {
  if (/[A-Z ]/.test(module)) return module;
  return module
    .split(/[-_/]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Human label for an AuditLog.module value. */
export function moduleLabel(module: string | null | undefined): string {
  if (!module) return "—";
  return MODULE_LABELS[module] ?? MODULE_LABELS[module.toLowerCase()] ?? prettifyModule(module);
}
