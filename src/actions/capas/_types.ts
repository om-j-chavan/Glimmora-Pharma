/**
 * Shared types + constants for the CAPA action domain files. Lives in a
 * regular module (no "use server") so the domain files can re-export
 * non-async-function values without violating Next 16's "use
 * server"-files-must-export-only-async-functions rule. See the earlier
 * hotfix that moved Change Control constants out of "use server" — same
 * problem class.
 */

export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// Audit module strings — slash-form per M6 cleanup. Centralised so the
// alignment + approvals + signing rows all reference identical strings.
export const ALIGNMENT_AUDIT_MODULE = "CAPA / Alignment";
export const ALIGNMENT_LOCKED_MESSAGE =
  "Cannot modify alignment review — CAPA has progressed to QA review.";
export const APPROVAL_AUDIT_MODULE = "CAPA / Approvals";
export const SIGNING_AUDIT_MODULE = "CAPA / Approvals";
// SME Section 1, Stage 3 (FULL) — RCA Review module + status constants.
// Tighter status window than alignment: RCA review is only valid while
// the CAPA is in "in_progress" (RCA text exists but full QA review
// hasn't been requested yet).
export const RCA_REVIEW_AUDIT_MODULE = "CAPA / RCA Review";
export const RCA_REVIEW_INVALID_STATUS_MESSAGE =
  "RCA can only be reviewed while the CAPA is in progress — submit the RCA first, and review before the CAPA enters full QA review.";
// SME Section 1, Stage 5 (FULL) — Independent Verification module +
// status invariant message. Only valid during pending_verification.
export const VERIFICATION_AUDIT_MODULE = "CAPA / Verification";
export const VERIFICATION_INVALID_STATUS_MESSAGE =
  "Verification is only valid while the CAPA is pending verification (all approvals collected, awaiting an independent verifier).";
// SME Section 1, Stage 4 (FULL) — Structured Action Plan items.
export const ACTION_ITEMS_AUDIT_MODULE = "CAPA / Action Items";
export const ACTION_ITEMS_LOCKED_MESSAGE =
  "Action plan is locked once the CAPA enters QA review. Status updates (mark complete / skipped) remain available; structural edits do not.";
export const ACTION_ITEMS_TERMINAL_MESSAGE =
  "CAPA has reached a terminal state — action items are read-only.";

export const ACTION_ITEM_STATUSES = [
  "pending",
  "in_progress",
  "complete",
  "skipped",
  // Phase 2 — an item the QA review returned for revision. Flow wiring
  // (targeted reject) is Phase 4; this only registers the value so the zod
  // enum accepts it.
  "rework",
] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

// SME Section 1, Stage 6 (FULL) — Effectiveness review module + verdict.
export const EFFECTIVENESS_AUDIT_MODULE = "CAPA / Effectiveness";
export const EFFECTIVENESS_VERDICTS = [
  "effective",
  "ineffective",
  "partial",
] as const;
export type EffectivenessVerdict = (typeof EFFECTIVENESS_VERDICTS)[number];
