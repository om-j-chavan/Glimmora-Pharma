// Canonical CAPA status vocabulary. Single source of truth for the type,
// the enumerable list of values, and the human-readable display labels.
//
// Named CAPA_STATUS_VALUES (not CAPA_STATUSES) because the latter is
// already taken by src/constants/statusTaxonomy.ts for the UI metadata
// record (label/colour/description per status). Different shape, same
// name would shadow on co-imports.

export const CAPA_STATUS_VALUES = [
  "open",
  "in_progress",
  "pending_qa_review",
  // SME Section 1, Stage 5 (FULL) — Independent QA Verification.
  // Inserted between pending_qa_review and closed: once all approvals
  // land, approveCAPA auto-flips status to pending_verification. From
  // here the verifier (distinct from creator and from every approver)
  // mints a CAPA_VERIFICATION SignedRecord via verifyCAPA. Closure
  // (signAndCloseCAPA) refuses to proceed unless verifiedAt is set.
  "pending_verification",
  "closed",
  "rejected",
] as const;

export type CAPAStatus = (typeof CAPA_STATUS_VALUES)[number];

export const STATUS_LABEL: Record<CAPAStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  pending_qa_review: "Pending QA Review",
  pending_verification: "Pending Verification",
  closed: "Closed",
  rejected: "Rejected",
};

// Derived: a CAPA is overdue when it's still actively being worked
// (open or in_progress) and the due date has passed. Pending QA review
// and rejected are excluded — at that point the owner has handed off
// or is awaiting rework instructions, so "overdue" no longer applies
// to them by this definition.
export function isOverdue(capa: {
  status: CAPAStatus;
  dueDate: Date | string | null | undefined;
}): boolean {
  if (capa.status !== "open" && capa.status !== "in_progress") return false;
  if (!capa.dueDate) return false;
  return new Date(capa.dueDate) < new Date();
}
