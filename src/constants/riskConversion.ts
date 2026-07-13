/**
 * Risk CONVERSION (Governance Phase 2) — the target vocabulary and the
 * risk→target FIELD MAPPING.
 *
 * A conversion does NOT create a special "risk-record". It pre-fills the target
 * module's own create-form data and calls that module's REAL create action
 * (`createFinding` / `createDeviation` / `createCAPA`), so the result is an
 * ordinary Gap / Deviation / CAPA with its full downstream workflow. The risk
 * only SEEDS the initial values; everything here is editable in the modal before
 * the user confirms, and the target's own Zod schema is the final authority.
 *
 * Pure data + pure functions. No React, no Prisma.
 */

import type { RiskSeverity } from "@/constants/risk";

/* ── Targets ─────────────────────────────────────────────────────────────── */

export const RISK_CONVERT_TARGETS = ["Gap", "Deviation", "CAPA"] as const;
export type RiskConvertTarget = (typeof RISK_CONVERT_TARGETS)[number];

/** Stored verbatim in `Risk.convertedToType`. */
export const RISK_CONVERT_TARGET_LABEL: Record<RiskConvertTarget, string> = {
  Gap: "Gap Assessment",
  Deviation: "Deviation",
  CAPA: "CAPA",
};

/** Where the created record lives, for the "[view →]" links on both sides. */
export function convertedRecordHref(target: RiskConvertTarget, id: string): string {
  switch (target) {
    case "CAPA":
      return `/capa/${id}`;
    // Gap findings and deviations have no per-id route — their detail is a modal
    // on the register page, opened via the module's `open*Id` link-state.
    case "Gap":
      return `/gap-assessment?open=${id}`;
    case "Deviation":
      return `/deviation?open=${id}`;
  }
}

/** Reference prefix each target mints, for optimistic display before refetch. */
export const RISK_CONVERT_TARGET_PREFIX: Record<RiskConvertTarget, string> = {
  Gap: "FND",
  Deviation: "DEV",
  CAPA: "CAPA",
};

/* ── Severity mapping ────────────────────────────────────────────────────── */

/**
 * Risk severity uses the GENERIC taxonomy (Critical/High/Medium/Low), and so do
 * Finding.severity and CAPA.risk — those are IDENTITY maps.
 *
 * Deviation.severity uses the FDA taxonomy (Critical/Major/Minor). Four values
 * must collapse into three. We map CONSERVATIVELY — never downgrade a risk on
 * the way in, because under-classifying a deviation is a regulatory finding
 * waiting to happen:
 *
 *   Critical → Critical
 *   High     → Major
 *   Medium   → Major     ← the merge; deliberately rounds UP, not down
 *   Low      → Minor
 *
 * The modal shows the mapped value and lets the converting QA Head override it
 * before confirming, so the automatic rounding is never the last word.
 */
export const RISK_SEVERITY_TO_FDA: Record<RiskSeverity, "Critical" | "Major" | "Minor"> = {
  Critical: "Critical",
  High: "Major",
  Medium: "Major",
  Low: "Minor",
};

/** Identity — Risk.severity and Finding.severity share the GENERIC taxonomy. */
export const RISK_SEVERITY_TO_GENERIC: Record<RiskSeverity, RiskSeverity> = {
  Critical: "Critical",
  High: "High",
  Medium: "Medium",
  Low: "Low",
};

/* ── Category mapping (Risk → Deviation) ─────────────────────────────────── */

/**
 * Risk categories and Deviation categories are different vocabularies. This is
 * the best-fit seed; the modal exposes it as an editable dropdown.
 *
 *   Supplier      → material        (an incoming-material/supplier failure)
 *   Process       → process
 *   DataIntegrity → documentation   (DI failures are record/audit-trail failures)
 *   Equipment     → equipment
 *   Regulatory    → documentation
 *   Other         → other
 */
export const RISK_CATEGORY_TO_DEVIATION_CATEGORY: Record<string, string> = {
  Supplier: "material",
  Process: "process",
  DataIntegrity: "documentation",
  Equipment: "equipment",
  Regulatory: "documentation",
  Other: "other",
};

/**
 * A materialized risk is by definition an UNPLANNED event — a planned deviation
 * is a pre-approved, pre-authored departure, which a risk conversion never is.
 * Seeded (and editable) as "unplanned".
 */
export const RISK_TO_DEVIATION_TYPE = "unplanned" as const;

/**
 * `CAPA.source` is a fixed enum in `CreateCAPASchema` with no "Risk Register"
 * member. We seed "Other" rather than widen that enum, because `CAPA.source`
 * drives the source-breakdown charts on the CAPA page and a new member would
 * silently reshape them. The provenance is NOT lost: the CAPA carries
 * `raisedFromRiskId` and renders "Raised from RISK-…" on its detail page.
 */
export const RISK_TO_CAPA_SOURCE = "Other" as const;

/* ── Areas offered when converting (the target modules' own vocabularies) ── */

/** Gap Assessment areas — mirrors the AREAS list in GapPage.tsx. */
export const GAP_AREAS = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT"] as const;
/** Deviation areas — mirrors AREAS in DeviationPage.constants.ts. */
export const DEVIATION_AREAS = ["QC Lab", "Manufacturing", "Warehouse", "Utilities", "QMS", "R&D", "Packaging"] as const;
export const DEVIATION_CATEGORIES = [
  "process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other",
] as const;
export const DEVIATION_TYPES = ["planned", "unplanned"] as const;
export const DEVIATION_IMPACTS = ["high", "medium", "low", "none"] as const;

/* ── Dates ───────────────────────────────────────────────────────────────── */

/**
 * All three create actions reject a target/due date in the past. A risk's
 * `targetDate` is optional and may well be historical, so the seed is:
 *   risk.targetDate, if it is today or later; otherwise today + 30 days.
 * Returned as "YYYY-MM-DD" (the DatePicker's format).
 */
export const CONVERT_DEFAULT_DUE_DAYS = 30;

export function seedDueDate(riskTargetDate: string | null, now: Date): string {
  const today = now.toISOString().slice(0, 10);
  if (riskTargetDate) {
    const d = riskTargetDate.slice(0, 10);
    if (d >= today) return d;
  }
  const future = new Date(now.getTime() + CONVERT_DEFAULT_DUE_DAYS * 86_400_000);
  return future.toISOString().slice(0, 10);
}

/* ── Document carry-over capability ──────────────────────────────────────── */

/**
 * Whether a target can receive copies of the risk's supporting documents.
 *
 * Gap and Deviation both surface attachments as `Document` rows keyed by
 * `linkedModule`/`linkedRecordId`, so a risk's documents can be copied across as
 * new Document rows (see `copyRiskDocuments`).
 *
 * CAPA does NOT read `Document` at all — its attachments are `EvidenceItem` /
 * `EvidenceFile` rows constrained to the GxP evidence taxonomy
 * (BATCH_RECORDS, TRAINING_RECORDS, EQUIPMENT_LOGS, …). A risk's documents use a
 * deliberately different vocabulary (RISK_ASSESSMENT, MITIGATION_PLAN, …) because
 * they are assessments and plans, not GxP evidence records. Copying them into
 * CAPA evidence would mean inventing a semantic mapping between two taxonomies
 * that do not correspond — in a regulated product that is worse than not copying.
 * The documents stay on the risk and remain one click away via the CAPA's
 * "Raised from RISK-…" back-link.
 */
export const TARGET_SUPPORTS_DOC_CARRYOVER: Record<RiskConvertTarget, boolean> = {
  Gap: true,
  Deviation: true,
  CAPA: false,
};

export const CAPA_DOC_CARRYOVER_REASON =
  "CAPA evidence is a controlled record keyed to the GxP evidence taxonomy, which a risk's documents don't use. They stay on the risk — reachable from the CAPA's “Raised from” link.";

/** `Document.linkedModule` / `sourceModule` pointers the copies must carry. */
export const TARGET_DOC_POINTERS: Record<RiskConvertTarget, { linkedModule: string; sourceModule: string } | null> = {
  Gap: { linkedModule: "Gap Assessment", sourceModule: "gap-assessment" },
  Deviation: { linkedModule: "Deviation Management", sourceModule: "deviation" },
  CAPA: null,
};
