// Single source of truth for severity / risk taxonomies and their
// badge-colour mapping. Replaces the per-module variant maps that used
// to live in src/lib/badgeVariants.ts (CAPA_RISK_VARIANT,
// DEVIATION_SEVERITY_VARIANT, FINDING_SEVERITY_VARIANT, etc.).
//
// Two canonical taxonomies — each internally consistent, both
// displayed in clean TitleCase:
//
//   GENERIC (Critical / High / Medium / Low)
//     CAPA, ChangeControl, RAID, Site, Finding (gains Medium going
//     forward), CSV/CSA system risk.
//
//   FDA (Critical / Major / Minor)
//     Deviation, FDA483 Observation, AGI Drift, CSV/CSA gxpRelevance.
//     "Critical / Major / Minor" is FDA-regulatory standard language;
//     using High/Medium/Low for these would be incorrect terminology
//     in a regulated product.
//
// Display normalisation accepts any stored value (lowercase, TitleCase,
// UPPERCASE, mixed) and returns the canonical TitleCase label, or
// null if the value isn't recognised for the requested taxonomy. The
// raw value is preserved by callers as a graceful-degrade fallback.
//
// Colour contract — preserved from the prior badgeVariants maps so
// nothing changes visually for the well-known values:
//   Critical             → red
//   High / Major / Medium → amber
//   Low / Minor          → green
//   unknown              → gray
// (The audit's color contract called for yellow + Low=gray. Kept the
// existing palette — Badge has no "yellow" variant today and flipping
// Low to gray would visibly regress every "safe" badge in the product.
// Adopting a yellow tier and re-tone'ing Low can be a separate rung.)

import type { BadgeVariant } from "@/components/ui/Badge";

export const GENERIC_SEVERITY = ["Critical", "High", "Medium", "Low"] as const;
export type GenericSeverity = (typeof GENERIC_SEVERITY)[number];

export const FDA_SEVERITY = ["Critical", "Major", "Minor"] as const;
export type FdaSeverity = (typeof FDA_SEVERITY)[number];

export type SeverityTaxonomy = "generic" | "fda";

type CanonicalLabel = GenericSeverity | FdaSeverity;

// Lowercase → canonical TitleCase map. Used for case-insensitive matching.
const GENERIC_BY_LOWER: Record<string, GenericSeverity> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const FDA_BY_LOWER: Record<string, FdaSeverity> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

// Canonical label → badge variant. The Badge component understands
// red/amber/green/blue/gray/purple; no yellow variant exists today.
export const SEVERITY_BADGE_VARIANT: Record<CanonicalLabel, BadgeVariant> = {
  Critical: "red",
  High: "amber",
  Major: "amber",
  Medium: "amber",
  Low: "green",
  Minor: "green",
};

/**
 * Convert any stored severity/risk value into the canonical TitleCase
 * display label, or null if the value is not recognised for the
 * requested taxonomy. Case-insensitive: accepts "critical", "Critical",
 * "CRITICAL", "criTIcal", etc.
 */
export function normalizeSeverityForDisplay(
  value: string | null | undefined,
  taxonomy: SeverityTaxonomy,
): CanonicalLabel | null {
  if (!value || typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  if (!lower) return null;
  return taxonomy === "fda" ? (FDA_BY_LOWER[lower] ?? null) : (GENERIC_BY_LOWER[lower] ?? null);
}

/**
 * Resolve the Badge variant for any stored severity value. Falls back
 * to "gray" for unknown values so the UI gracefully degrades rather
 * than crashing.
 */
export function getSeverityVariant(
  value: string | null | undefined,
  taxonomy: SeverityTaxonomy,
): BadgeVariant {
  const canonical = normalizeSeverityForDisplay(value, taxonomy);
  return canonical ? SEVERITY_BADGE_VARIANT[canonical] : "gray";
}

// Short pill text shown inside the severity <Dropdown> options. "Maj"/"Min"
// rather than a bare "M" for both — the FDA taxonomy's Major and Minor share a
// first letter, and a badge that reads the same for two different severities is
// worse than no badge at all.
const SEVERITY_BADGE_ABBR: Record<CanonicalLabel, string> = {
  Critical: "C",
  High: "H",
  Medium: "M",
  Low: "L",
  Major: "Maj",
  Minor: "Min",
};

/** The subset of BadgeVariant the ui/Dropdown option badge understands. */
type DropdownBadgeVariant = "default" | "red" | "amber" | "green";

export interface SeverityDropdownOption {
  value: string;
  label: string;
  badge: string;
  badgeVariant: DropdownBadgeVariant;
}

/**
 * Severity <Dropdown> options for a taxonomy, coloured from the SAME
 * SEVERITY_BADGE_VARIANT map the read-only Badges use — so a severity is the
 * same colour whether you are picking it in a form or reading it in a table.
 *
 * Pass "generic" for CAPA / Gap findings / Change Control (Critical → Low) and
 * "fda" for Deviations / 483 observations (Critical / Major / Minor). The
 * taxonomies are NOT interchangeable: FDA regulatory language is Critical /
 * Major / Minor, so a deviation must never be offered High / Medium / Low.
 */
export function severityDropdownOptions(taxonomy: SeverityTaxonomy): SeverityDropdownOption[] {
  const labels: readonly CanonicalLabel[] = taxonomy === "fda" ? FDA_SEVERITY : GENERIC_SEVERITY;
  return labels.map((value) => ({
    value,
    label: value,
    badge: SEVERITY_BADGE_ABBR[value],
    // Every severity maps to red/amber/green, all of which the Dropdown badge
    // supports — the cast just narrows the wider BadgeVariant union.
    badgeVariant: SEVERITY_BADGE_VARIANT[value] as DropdownBadgeVariant,
  }));
}

/**
 * Preprocessor for Zod severity fields that accept legacy lowercase
 * input but persist TitleCase. Returns the canonical TitleCase label
 * if recognised, otherwise returns the original value (letting Zod
 * surface the validation error).
 */
export function coerceSeverityCasing(
  value: unknown,
  taxonomy: SeverityTaxonomy,
): unknown {
  if (typeof value !== "string") return value;
  const normalized = normalizeSeverityForDisplay(value, taxonomy);
  return normalized ?? value;
}
