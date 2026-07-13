/**
 * Risk Register (Governance Phase 1) — the authoritative value sets and the
 * legal status transitions for the `Risk` model.
 *
 * The Prisma schema stores category / severity / likelihood / status as plain
 * Strings (project-wide convention — no Prisma enums), so THIS FILE is the
 * enum. Every server action validates against these lists with Zod before
 * touching the DB, and the UI builds its dropdowns from the same arrays, so the
 * client and the server can never drift.
 *
 * Pure data — no React, no Prisma. Safe to import from a server action, a
 * client component, or a test.
 */

/* ── Category ────────────────────────────────────────────────────────────── */

export const RISK_CATEGORIES = [
  "Supplier",
  "Process",
  "DataIntegrity",
  "Equipment",
  "Regulatory",
  "Other",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/** Display labels — only `DataIntegrity` needs de-camel-casing. */
export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  Supplier: "Supplier",
  Process: "Process",
  DataIntegrity: "Data Integrity",
  Equipment: "Equipment",
  Regulatory: "Regulatory",
  Other: "Other",
};

/* ── Severity (impact if it occurs) ──────────────────────────────────────── */

export const RISK_SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

/* ── Likelihood (probability it occurs) ──────────────────────────────────── */

export const RISK_LIKELIHOODS = [
  "Rare",
  "Unlikely",
  "Possible",
  "Likely",
  "AlmostCertain",
] as const;
export type RiskLikelihood = (typeof RISK_LIKELIHOODS)[number];

export const RISK_LIKELIHOOD_LABEL: Record<RiskLikelihood, string> = {
  Rare: "Rare",
  Unlikely: "Unlikely",
  Possible: "Possible",
  Likely: "Likely",
  AlmostCertain: "Almost Certain",
};

/* ── Status + the transition graph ───────────────────────────────────────── */

export const RISK_STATUSES = ["Open", "Mitigating", "Closed", "Converted"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

/**
 * Legal status transitions. `updateRisk` rejects any move not listed here, so a
 * crafted payload cannot drive a risk into an impossible state.
 *
 *   Open       → Mitigating | Closed
 *   Mitigating → Open | Closed          (Open = mitigation abandoned/reset)
 *   Closed     → Open                   (reopen)
 *   Converted  → ∅                      (TERMINAL)
 *
 * "Converted" is UNREACHABLE in Phase 1 — no transition targets it. It is
 * declared now so the enum is stable, and Phase 2's convert action is the only
 * thing that will ever write it (alongside `convertedToType`/`convertedToId`).
 * Because it is terminal here AND unreachable, a Phase-1 risk can never be
 * stuck in it.
 */
export const RISK_STATUS_TRANSITIONS: Record<RiskStatus, readonly RiskStatus[]> = {
  Open: ["Mitigating", "Closed"],
  Mitigating: ["Open", "Closed"],
  Closed: ["Open"],
  Converted: [],
};

/** True when `to` is reachable from `from`. A no-op (from === to) is allowed. */
export function isLegalRiskTransition(from: RiskStatus, to: RiskStatus): boolean {
  if (from === to) return true;
  return RISK_STATUS_TRANSITIONS[from].includes(to);
}

/* ── Badge mapping (shared by the list tab + the detail page) ────────────── */

export const RISK_STATUS_BADGE: Record<RiskStatus, string> = {
  Open: "badge badge-blue",
  Mitigating: "badge badge-amber",
  Closed: "badge badge-green",
  Converted: "badge badge-purple",
};

/* ── Document categories offered by the risk uploader ────────────────────── */

/**
 * Categories for a risk's supporting documents. Intentionally a SEPARATE list
 * from `EVIDENCE_CATEGORIES` (which is GxP batch/training/equipment evidence) —
 * a risk's attachments are assessments and plans, not GxP evidence records.
 */
export const RISK_DOC_CATEGORIES = [
  "RISK_ASSESSMENT",
  "MITIGATION_PLAN",
  "SUPPLIER_DOCUMENTATION",
  "REGULATORY_CORRESPONDENCE",
  "SUPPORTING_ANALYSIS",
  "OTHER",
] as const;
export type RiskDocCategory = (typeof RISK_DOC_CATEGORIES)[number];

export const RISK_DOC_CATEGORY_LABEL: Record<RiskDocCategory, string> = {
  RISK_ASSESSMENT: "Risk Assessment",
  MITIGATION_PLAN: "Mitigation Plan",
  SUPPLIER_DOCUMENTATION: "Supplier Documentation",
  REGULATORY_CORRESPONDENCE: "Regulatory Correspondence",
  SUPPORTING_ANALYSIS: "Supporting Analysis",
  OTHER: "Other",
};

/* ── Module pointers used on the shared polymorphic Document model ───────── */

/** `Document.sourceModule` value for a risk's supporting documents. */
export const RISK_SOURCE_MODULE = "risk-register";
/** `Document.linkedModule` value (legacy pointer, dual-written). */
export const RISK_LINKED_MODULE = "Risk Register";
