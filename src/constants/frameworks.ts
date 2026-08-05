/**
 * Frameworks — the single source of truth for the 9 RESERVED framework keys and
 * their labels. These keys are STABLE public ids already written into
 * Finding.framework across the app; they must never be renamed or dropped.
 *
 * This constant unifies the three former label dictionaries (AddFindingModal
 * FRAMEWORK_LABELS, GapRegisterTab FRAMEWORK_LABELS, the old mockData TRIAGE_FRAMEWORK_
 * LABELS) into one. `frameworkLabel(key)` resolves any key — including a legacy
 * key whose catalog row has since been disabled/removed — so historical
 * findings always render a label (falls back to a prettified key).
 *
 * `name`/`description` are the catalog seed values (from the old FrameworksTab
 * FRAMEWORKS const). `label` is the short form used in dropdowns + badges.
 * Plain-TS, no deps — safe for client and server, and for prisma/seed.ts.
 */

export interface ReservedFramework {
  key: string;
  name: string;
  label: string;
  description: string;
}

export const RESERVED_FRAMEWORKS: ReservedFramework[] = [
  { key: "p210", name: "FDA 21 CFR 210/211", label: "21 CFR 210/211", description: "Manufacturing controls — cGMP for finished pharma" },
  { key: "p11", name: "FDA 21 CFR Part 11", label: "Part 11", description: "Electronic records & e-signatures" },
  { key: "annex11", name: "EU GMP Annex 11", label: "Annex 11", description: "Computerised systems — lifecycle validation" },
  { key: "annex15", name: "EU GMP Annex 15", label: "Annex 15", description: "Qualification & validation — IQ/OQ/PQ, VMP" },
  { key: "ichq9", name: "ICH Q9", label: "ICH Q9", description: "Quality risk management — ICH Q9 scoring" },
  { key: "ichq10", name: "ICH Q10", label: "ICH Q10", description: "Pharmaceutical quality system — management review" },
  { key: "gamp5", name: "GAMP 5 (2nd Ed.)", label: "GAMP 5", description: "Risk-based CSV — categories 1/3/4/5" },
  { key: "who", name: "WHO GMP", label: "WHO GMP", description: "International GMP guidance" },
  { key: "mhra", name: "MHRA Guidelines", label: "MHRA", description: "UK post-Brexit data integrity guidance" },
];

/** The 9 reserved keys — Super Admin add-framework must never collide with these. */
export const RESERVED_FRAMEWORK_KEYS: ReadonlySet<string> = new Set(RESERVED_FRAMEWORKS.map((f) => f.key));

const RESERVED_LABELS: Record<string, string> = Object.fromEntries(RESERVED_FRAMEWORKS.map((f) => [f.key, f.label]));

/** Prettify a slug key ("supplier_quality" → "Supplier Quality"). */
function prettifyKey(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Human label for a framework key. Reserved keys use the canonical short label;
 * any other key (a Super-Admin-added framework, or a legacy value no longer in
 * the catalog) falls back to a prettified key so historical findings still
 * render. Pass an optional catalog name to prefer it for non-reserved keys.
 */
export function frameworkLabel(key: string, catalogName?: string): string {
  if (!key) return "—";
  return RESERVED_LABELS[key] ?? catalogName ?? prettifyKey(key);
}
