/**
 * Standardised GxP status taxonomy for Pharma Glimmora.
 *
 * Every module's badge colours, labels, and tooltip descriptions
 * are defined here to eliminate inconsistency (MoM Gap #7).
 */

import type { LucideIcon } from "lucide-react";

export interface StatusDef {
  value: string;
  label: string;
  color: string;
  bg: string;
  description: string;
  nextActions: string[];
  /** Optional explicit icon. When unset, StatusBadge derives a semantic
   *  default from the label so every status carries a non-color cue. */
  icon?: LucideIcon;
}

/* ── GAP ASSESSMENT — Finding statuses ── */

// RUNG 3H — Finding.status canonicalised to Title Case ("Open" | "In Progress"
// | "Closed") to match the schema default, the updateFinding enum, and the
// FindingStatus type. The former lowercase duplicate keys (open/in_progress/
// closed) and the unreachable lowercase-only states (pending_verification,
// risk_accepted — never written by any finding action) were removed.
/**
 * THE canonical finding-status vocabulary — one `as const` array that the TS
 * union, the display map, and the user-editable zod subset all derive from.
 *
 * 🔴 HASHED — DO NOT CHANGE ANY LITERAL, ESPECIALLY "Closed".
 * `openFindings` is computed as
 *   `findings.filter((f) => f.status !== "Closed").length`
 * (src/actions/systems.ts:1936, :2020, :2380) and that COUNT is bound into the
 * CSV/CSA sign-off hash (src/lib/signing.ts:526), supplied at signing
 * (systems.ts:2119) and re-derived at verification (systems.ts:2414). Renaming
 * "Closed" — even its casing — silently changes the count on every signed
 * system and breaks verifyCSVSignOff for every existing CSV signature. It is
 * also a hard sign-off gate (systems.ts:2020). Members may be added or removed
 * only deliberately, with a data migration; the strings themselves are frozen.
 */
export const FINDING_STATUS_VALUES = [
  "Open",
  "In Progress",
  "Submitted",
  "Rework",
  "Closed",
] as const;

export type FindingStatusValue = (typeof FINDING_STATUS_VALUES)[number];

/**
 * The subset a user may set DIRECTLY by editing a finding (UpdateFindingSchema
 * in src/actions/findings.ts). Deliberately NARROWER than the full vocabulary —
 * this is a guard, not drift.
 *
 * "Submitted" and "Rework" are written ONLY by submitFinding
 * (src/actions/findings.ts:1264) and reworkFinding (:1388). Those actions carry
 * an assignee-only check, a lock check, source-status preconditions, an audit
 * row (FINDING_SUBMITTED / FINDING_REWORK), and — for rework — a required
 * reason plus a notify() to the assignee. Widening the edit form to accept them
 * would let a client set "Rework" with no reason, no audit entry and no
 * notification: a Part 11 attributability hole. DO NOT add them here.
 *
 * `satisfies readonly FindingStatusValue[]` machine-checks that every editable
 * value is a real finding status, so this subset can never drift from the
 * canonical list above.
 */
export const FINDING_STATUS_USER_EDITABLE = [
  "Open",
  "In Progress",
  "Closed",
] as const satisfies readonly FindingStatusValue[];

// `satisfies` gives compile-time completeness against the canonical array while
// the exported annotation stays Record<string, StatusDef> — consumers index this
// map with a plain `string` and pass it where a Record<string, StatusDef> is
// expected (ALL_TAXONOMIES, getStatusDef).
const FINDING_STATUS_DEFS = {
  Open: { value: "Open", label: "Open", color: "#1D4ED8", bg: "#EFF6FF", description: "Finding identified, no action taken yet", nextActions: ["Raise CAPA", "Assign owner"] },
  "In Progress": { value: "In Progress", label: "In Progress", color: "#B45309", bg: "#FEF9EC", description: "Assigned to an owner (or CAPA raised) — corrective work ongoing", nextActions: ["Assign owner", "Raise CAPA", "Monitor progress"] },
  // Gap Step 4 — submit → QA review → rework loop states (mirror the deviation task).
  Submitted: { value: "Submitted", label: "Submitted", color: "#6D28D9", bg: "#F5F3FF", description: "Assignee submitted the work for QA review", nextActions: ["Accept & close", "Send for rework"] },
  Rework: { value: "Rework", label: "Rework", color: "#B91C1C", bg: "#FEF2F2", description: "QA returned the finding for rework", nextActions: ["Address feedback", "Resubmit"] },
  Closed: { value: "Closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "Finding resolved and verified by QA Head", nextActions: [] },
} satisfies Record<FindingStatusValue, StatusDef>;

export const FINDING_STATUSES: Record<string, StatusDef> = FINDING_STATUS_DEFS;

/* ── CAPA TRACKER — CAPA statuses ── */

export const CAPA_STATUSES: Record<string, StatusDef> = {
  open: { value: "open", label: "Open", color: "#1D4ED8", bg: "#EFF6FF", description: "CAPA created, root cause analysis not yet started", nextActions: ["Add RCA", "Add action plan"] },
  in_progress: { value: "in_progress", label: "In Progress", color: "#B45309", bg: "#FEF9EC", description: "RCA complete, corrective actions being implemented", nextActions: ["Attach evidence", "Submit for review"] },
  pending_qa_review: { value: "pending_qa_review", label: "Pending QA Review", color: "#6D28D9", bg: "#F5F3FF", description: "Submitted to QA Head for review and sign-off", nextActions: ["QA Head to review"] },
  pending_verification: { value: "pending_verification", label: "Pending Verification", color: "#0369A1", bg: "#F0F9FF", description: "All approvals collected. Awaiting independent QA verification before closure.", nextActions: ["Verifier (distinct from approvers) to sign verification"] },
  closed: { value: "closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "QA Head signed and closed. Effectiveness check due in 90 days.", nextActions: ["Monitor effectiveness"] },
  rejected: { value: "rejected", label: "Rejected", color: "#A32D2D", bg: "#FEF2F2", description: "QA Head rejected. Rework required.", nextActions: ["Review rejection reason", "Rework and resubmit"] },
};

/* ── FDA 483 — Event statuses ── */

export const FDA483_EVENT_STATUSES: Record<string, StatusDef> = {
  Open: { value: "Open", label: "Open", color: "#1D4ED8", bg: "#EFF6FF", description: "FDA 483 received, investigation not started", nextActions: ["Assign team", "Begin investigation"] },
  "Under Investigation": { value: "Under Investigation", label: "Under Investigation", color: "#B45309", bg: "#FEF9EC", description: "Team investigating observations and gathering evidence", nextActions: ["Complete RCA", "Raise CAPAs"] },
  "Response Due": { value: "Response Due", label: "Response Due", color: "#B91C1C", bg: "#FEF2F2", description: "Response deadline approaching \u2014 action required", nextActions: ["Finalize draft", "Submit to QA Head"] },
  "Response Drafted": { value: "Response Drafted", label: "Response Drafted", color: "#6D28D9", bg: "#F5F3FF", description: "Draft response prepared, pending QA Head sign-off", nextActions: ["QA Head to review and sign"] },
  "Pending QA Sign-off": { value: "Pending QA Sign-off", label: "Pending QA Sign-off", color: "#B45309", bg: "#FEF9EC", description: "QA Head reviewing response before submission", nextActions: ["QA Head to sign"] },
  "Response Submitted": { value: "Response Submitted", label: "Response Submitted", color: "#0F6E56", bg: "#E8F5F1", description: "Formal response submitted to FDA within deadline", nextActions: ["Await FDA acknowledgement"] },
  "FDA Acknowledged": { value: "FDA Acknowledged", label: "FDA Acknowledged", color: "#0F6E56", bg: "#E8F5F1", description: "FDA confirmed receipt of response", nextActions: ["Monitor for follow-up"] },
  Closed: { value: "Closed", label: "Closed", color: "#4B5563", bg: "#F3F4F6", description: "FDA satisfied with response. No further action required.", nextActions: [] },
  "Warning Letter": { value: "Warning Letter", label: "Warning Letter", color: "#A32D2D", bg: "#FEF2F2", description: "FDA issued Warning Letter. Immediate escalation required.", nextActions: ["Escalate to leadership", "Engage regulatory counsel"] },
};

/* ── FDA 483 — Observation statuses ── */

export const FDA483_OBS_STATUSES: Record<string, StatusDef> = {
  Open: { value: "Open", label: "Open", color: "#1D4ED8", bg: "#EFF6FF", description: "Observation not yet addressed", nextActions: ["Start RCA"] },
  "In Progress": { value: "In Progress", label: "In Progress", color: "#B45309", bg: "#FEF9EC", description: "RCA being performed", nextActions: ["Complete RCA", "Raise CAPA"] },
  "CAPA Linked": { value: "CAPA Linked", label: "CAPA Linked", color: "#6D28D9", bg: "#F5F3FF", description: "CAPA raised for this observation", nextActions: ["Draft response"] },
  "Response Drafted": { value: "Response Drafted", label: "Response Drafted", color: "#047857", bg: "#E8F5F1", description: "Response drafted", nextActions: [] },
  Closed: { value: "Closed", label: "Closed", color: "#4B5563", bg: "#F3F4F6", description: "Observation fully addressed", nextActions: [] },
};

/* ── CSV/CSA — Validation stage statuses ── */

export const VALIDATION_STATUSES: Record<string, StatusDef> = {
  not_started: { value: "not_started", label: "Not Started", color: "#4B5563", bg: "#F3F4F6", description: "Validation stage not yet initiated", nextActions: ["Upload documents"] },
  draft: { value: "draft", label: "Draft", color: "#1D4ED8", bg: "#EFF6FF", description: "Documents being prepared by CSV/Val Lead", nextActions: ["Submit for review"] },
  in_review: { value: "in_review", label: "In Review", color: "#B45309", bg: "#FEF9EC", description: "Submitted to QA Head for review and approval", nextActions: ["QA Head to approve or reject"] },
  approved: { value: "approved", label: "Approved", color: "#0F6E56", bg: "#E8F5F1", description: "QA Head approved. Stage complete.", nextActions: [] },
  rejected: { value: "rejected", label: "Rejected", color: "#A32D2D", bg: "#FEF2F2", description: "QA Head rejected. Rework required.", nextActions: ["Review rejection", "Resubmit"] },
  skipped: { value: "skipped", label: "Skipped", color: "#4B5563", bg: "#F3F4F6", description: "Not applicable for this system category", nextActions: [] },
  // Backward compat
  pending: { value: "pending", label: "Not Started", color: "#4B5563", bg: "#F3F4F6", description: "Not yet initiated", nextActions: [] },
  complete: { value: "complete", label: "Approved", color: "#0F6E56", bg: "#E8F5F1", description: "Stage complete", nextActions: [] },
  "in-progress": { value: "in-progress", label: "In Review", color: "#B45309", bg: "#FEF9EC", description: "Under review", nextActions: [] },
};

/* ── DEVIATION — Deviation statuses ── */

/**
 * THE canonical deviation-status vocabulary — one `as const` array that the
 * TS union and the display map below both derive from.
 *
 * Pattern (Cat 2 rung): define the values ONCE here; everything else derives.
 *   • TS union  — `DeviationStatus` in src/store/deviation.slice.ts is
 *                 `(typeof DEVIATION_STATUS_VALUES)[number]`.
 *   • Display   — DEVIATION_STATUSES below is checked against this array via
 *                 `satisfies`, so adding a value here fails the build until a
 *                 StatusDef exists for it.
 *   • Zod       — deliberately none. Deviation status is never accepted from a
 *                 client; it is set server-side by the transition actions
 *                 (src/actions/deviations.ts). Do NOT add an input enum here —
 *                 that would introduce validation where none exists today.
 *
 * These string values are PERSISTED (Deviation.status, default "open") and
 * compared inline throughout src/actions/deviations.ts. Never change a literal —
 * only ever add or remove members deliberately, with a data migration.
 */
export const DEVIATION_STATUS_VALUES = [
  "open",
  "under_investigation",
  "pending_qa_review",
  "capa_pending",
  "closed",
  "rejected",
] as const;

export type DeviationStatusValue = (typeof DEVIATION_STATUS_VALUES)[number];

// `satisfies` gives compile-time completeness against the canonical array while
// the exported annotation stays Record<string, StatusDef> — consumers index this
// map with a plain `string` (src/lib/searchSources.tsx:73) and pass it where a
// Record<string, StatusDef> is expected (ALL_TAXONOMIES, getStatusDef).
const DEVIATION_STATUS_DEFS = {
  open: { value: "open", label: "Open", color: "#1D4ED8", bg: "#EFF6FF", description: "Deviation reported, investigation not started", nextActions: ["Start investigation"] },
  under_investigation: { value: "under_investigation", label: "Under Investigation", color: "#B45309", bg: "#FEF9EC", description: "RCA in progress, impact being assessed", nextActions: ["Complete RCA", "Submit for QA review"] },
  pending_qa_review: { value: "pending_qa_review", label: "Pending QA Review", color: "#6D28D9", bg: "#F5F3FF", description: "Investigation complete, QA Head reviewing", nextActions: ["QA Head to close or reject"] },
  capa_pending: { value: "capa_pending", label: "CAPA Pending", color: "#0E7490", bg: "#ECFEFF", description: "CAPA raised; deviation stays open and linked until the CAPA closes", nextActions: ["Close the linked CAPA", "QA Head to sign-close the deviation"] },
  closed: { value: "closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "QA Head satisfied. CAPA raised if required.", nextActions: [] },
  rejected: { value: "rejected", label: "Rejected", color: "#A32D2D", bg: "#FEF2F2", description: "QA Head rejected. Additional investigation needed.", nextActions: ["Rework investigation"] },
} satisfies Record<DeviationStatusValue, StatusDef>;

export const DEVIATION_STATUSES: Record<string, StatusDef> = DEVIATION_STATUS_DEFS;

/* ── TRAINING & AWARENESS — Action statuses ── */

export const READINESS_STATUSES: Record<string, StatusDef> = {
  "Not Started": { value: "Not Started", label: "Not Started", color: "#4B5563", bg: "#F3F4F6", description: "Action not yet initiated", nextActions: ["Begin work"] },
  "In Progress": { value: "In Progress", label: "In Progress", color: "#B45309", bg: "#FEF9EC", description: "Work ongoing, not yet complete", nextActions: ["Mark complete when done"] },
  Complete: { value: "Complete", label: "Complete", color: "#0F6E56", bg: "#E8F5F1", description: "Action completed and verified", nextActions: [] },
  Overdue: { value: "Overdue", label: "Overdue", color: "#A32D2D", bg: "#FEF2F2", description: "Past due date. Immediate action required.", nextActions: ["Escalate to QA Head"] },
  Blocked: { value: "Blocked", label: "Blocked", color: "#B91C1C", bg: "#FEF2F2", description: "Cannot proceed due to dependency or blocker", nextActions: ["Resolve blocker"] },
};

/* ── TODO(debt): CAPA DI-gate status has NO canonical list ──
 *
 * CAPA.diGateStatus is written as {"pending" (createCAPA/seed), "cleared"
 * (clearDIGate), and legacy "open" (Edit modal)} but has no single source of
 * truth — the same root cause as the lowercase-"closed" finding-status bug: one
 * vocabulary written in several places, so it drifted. When this is paid down,
 * add a canonical `DI_GATE_STATUSES = ["pending", "cleared"] as const` here (or
 * a capa-di.ts mirroring src/lib/capa-alignment.ts) and have the schema comment,
 * mapper (src/lib/mappers/capaMapper.ts), Edit form, and the read-API route all
 * import it.
 *
 * A THIRD vocabulary already exists on the read side: app/api/capas/route.ts:41
 * casts diGateStatus to "Pending" | "Cleared" | "Failed" — Title-case plus a
 * phantom "Failed" that NOTHING writes. Fold it into the canonical list at the
 * same time. NOT fixed this phase.
 */

/* ── TRAINING & AWARENESS — Simulation statuses ── */

export const SIMULATION_STATUSES: Record<string, StatusDef> = {
  Scheduled: { value: "Scheduled", label: "Scheduled", color: "#1D4ED8", bg: "#EFF6FF", description: "Practice run booked, not yet conducted", nextActions: ["Conduct the drill", "Score & complete"] },
  Completed: { value: "Completed", label: "Completed", color: "#0F6E56", bg: "#E8F5F1", description: "Simulation run and scored", nextActions: [] },
};

/* ── TRAINING & AWARENESS — Training-record statuses ── */

export const TRAINING_RECORD_STATUSES: Record<string, StatusDef> = {
  pending: { value: "pending", label: "Pending", color: "#4B5563", bg: "#F3F4F6", description: "Competency not yet recorded for this module", nextActions: ["Complete the training"] },
  completed: { value: "completed", label: "Completed", color: "#0F6E56", bg: "#E8F5F1", description: "Competency recorded for this module", nextActions: [] },
};

/* ── Helper: look up any status ── */

export function getStatusDef(taxonomy: Record<string, StatusDef>, status: string): StatusDef {
  return taxonomy[status] ?? { value: status, label: status, color: "#4B5563", bg: "#F3F4F6", description: "", nextActions: [] };
}

/* ── All module taxonomies for StatusGuide ── */

export const ALL_TAXONOMIES: { module: string; statuses: Record<string, StatusDef> }[] = [
  { module: "Gap Assessment", statuses: FINDING_STATUSES },
  { module: "CAPA Tracker", statuses: CAPA_STATUSES },
  { module: "FDA 483 Events", statuses: FDA483_EVENT_STATUSES },
  { module: "FDA 483 Observations", statuses: FDA483_OBS_STATUSES },
  { module: "CSV/CSA Validation", statuses: VALIDATION_STATUSES },
  { module: "Deviation Management", statuses: DEVIATION_STATUSES },
  { module: "Training & Awareness", statuses: READINESS_STATUSES },
  { module: "Training & Awareness — Simulations", statuses: SIMULATION_STATUSES },
  { module: "Training & Awareness — Training Records", statuses: TRAINING_RECORD_STATUSES },
];
