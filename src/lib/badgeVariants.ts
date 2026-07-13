// Centralised badge variant lookups for status taxonomies.
//
// Severity / risk colour mapping is no longer maintained here — see
// src/lib/severity.ts for the single source of truth. The per-module
// severity maps (CAPA_RISK_VARIANT, FINDING_SEVERITY_VARIANT,
// DEVIATION_SEVERITY_VARIANT, OBSERVATION_SEVERITY_VARIANT,
// SITE_RISK_VARIANT, CC_RISK_VARIANT) have been removed in favour of
// `getSeverityVariant(value, taxonomy)` + `normalizeSeverityForDisplay`
// from severity.ts.
//
// Status variant maps stay here. Status taxonomies are a separate audit
// category (Cat 2) with its own normalisation rung; they retain their
// per-module shape until that work lands.

import type { CAPAStatus } from "@/types/capa";
import type { ChangeControlStatus } from "@/lib/change-control-constants";

// Convenience re-exports so callers can import severity helpers from
// the same module they previously imported the variant maps from.
export {
  getSeverityVariant,
  normalizeSeverityForDisplay,
  SEVERITY_BADGE_VARIANT,
  GENERIC_SEVERITY,
  FDA_SEVERITY,
  type GenericSeverity,
  type FdaSeverity,
  type SeverityTaxonomy,
} from "@/lib/severity";

export const CAPA_STATUS_VARIANT: Record<CAPAStatus, "blue" | "amber" | "purple" | "green" | "red"> = {
  open: "blue",
  in_progress: "amber",
  pending_qa_review: "purple",
  // SME Section 1, Stage 5 (FULL) — Independent QA Verification.
  // Distinct from pending_qa_review (purple) so users can see at a
  // glance that approvals are done and the CAPA is awaiting an
  // independent verifier. Amber (same as in_progress) keeps the
  // "still actively in flight" semantic.
  pending_verification: "amber",
  closed: "green",
  rejected: "red",
};

// Substage 4.8 — Change Control status. Lifecycle: in-flight =
// blue/amber/purple, terminal-success = green/gray, terminal-failure =
// red. Note: Closed=gray (not green) is intentional — for CCs, "Closed"
// is post-implementation archival, while "Implemented" is the success
// state worth highlighting.
export const CC_STATUS_VARIANT: Record<
  ChangeControlStatus,
  "blue" | "amber" | "green" | "purple" | "gray" | "red"
> = {
  Draft: "blue",
  "In Review": "amber",
  Approved: "purple",
  "In Implementation": "amber",
  Implemented: "green",
  Closed: "gray",
  Rejected: "red",
};
