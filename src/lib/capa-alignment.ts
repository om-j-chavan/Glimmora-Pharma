/**
 * Substage 4.7 — Action-to-Cause Alignment Review (manual reviewer version).
 *
 * Validates the CAPA.alignmentStatus column at the application layer. Kept
 * as a plain string in the schema for SQLite portability — same pattern as
 * CAPA.status and EvidenceItem.status. Server actions use this enum via
 * z.enum(ALIGNMENT_STATUSES); the database column itself is a free string.
 *
 * Status meaning:
 *   "aligned"       — reviewer confirmed actions match the root cause
 *   "cosmetic"      — actions don't address the systemic cause; submission
 *                     blocked unless a different QA Head overrides
 *   "needs_review"  — flagged for further work; submission blocked
 */
export const ALIGNMENT_STATUSES = [
  "aligned",
  "cosmetic",
  "needs_review",
] as const;

export type AlignmentStatus = (typeof ALIGNMENT_STATUSES)[number];

/**
 * Minimum length for the cosmetic-flag override reason. The reviewer who
 * overrides another reviewer's "cosmetic" verdict must record a rationale
 * of at least this many characters — Part 11 ALCOA+ requires the override
 * decision to carry its own justification, not just a thumbs-up. Mirrors
 * CC_OVERRIDE_REASON_MIN_LENGTH in src/lib/cc-dependencies.ts; the two
 * stay independent so different override classes can drift in burden if
 * the spec evolves.
 */
export const ALIGNMENT_OVERRIDE_REASON_MIN_LENGTH = 20;
