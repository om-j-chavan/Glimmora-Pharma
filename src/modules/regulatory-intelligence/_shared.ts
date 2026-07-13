/**
 * Single source of truth for Regulatory Intelligence module constants,
 * shared by the page UI (and, when a real backend is wired, server actions).
 * Mirrors the FDA483_AUDIT_MODULE convention in ../fda-483/_shared.ts.
 */

import type {
  RegulatorySource,
  RegulatoryImpact,
} from "@/lib/ai";

/** Audit-log `module` value. PascalCase-with-spaces, matching "FDA 483". */
export const REGULATORY_INTEL_AUDIT_MODULE = "Regulatory Intelligence" as const;

/** Badge variant per impact tier — keys map to <Badge variant>. */
export const IMPACT_BADGE: Record<
  RegulatoryImpact,
  "red" | "amber" | "blue"
> = {
  high: "red",
  medium: "amber",
  low: "blue",
};

export const IMPACT_LABEL: Record<RegulatoryImpact, string> = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};

/** Accent colour per agency source, for the source chip. */
export const SOURCE_COLOR: Record<RegulatorySource, string> = {
  FDA: "#2563eb",
  EMA: "#7c3aed",
  ICH: "#0891b2",
  MHRA: "#c2410c",
  WHO: "#0d9488",
};
