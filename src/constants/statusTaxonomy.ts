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
export const FINDING_STATUSES: Record<string, StatusDef> = {
  Open: { value: "Open", label: "Open", color: "#1D4ED8", bg: "#EFF6FF", description: "Finding identified, no action taken yet", nextActions: ["Raise CAPA", "Assign owner"] },
  "In Progress": { value: "In Progress", label: "In Progress", color: "#B45309", bg: "#FEF9EC", description: "Assigned to an owner (or CAPA raised) — corrective work ongoing", nextActions: ["Assign owner", "Raise CAPA", "Monitor progress"] },
  // Gap Step 4 — submit → QA review → rework loop states (mirror the deviation task).
  Submitted: { value: "Submitted", label: "Submitted", color: "#6D28D9", bg: "#F5F3FF", description: "Assignee submitted the work for QA review", nextActions: ["Accept & close", "Send for rework"] },
  Rework: { value: "Rework", label: "Rework", color: "#B91C1C", bg: "#FEF2F2", description: "QA returned the finding for rework", nextActions: ["Address feedback", "Resubmit"] },
  Closed: { value: "Closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "Finding resolved and verified by QA Head", nextActions: [] },
};

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

export const DEVIATION_STATUSES: Record<string, StatusDef> = {
  open: { value: "open", label: "Open", color: "#1D4ED8", bg: "#EFF6FF", description: "Deviation reported, investigation not started", nextActions: ["Start investigation"] },
  under_investigation: { value: "under_investigation", label: "Under Investigation", color: "#B45309", bg: "#FEF9EC", description: "RCA in progress, impact being assessed", nextActions: ["Complete RCA", "Submit for QA review"] },
  pending_qa_review: { value: "pending_qa_review", label: "Pending QA Review", color: "#6D28D9", bg: "#F5F3FF", description: "Investigation complete, QA Head reviewing", nextActions: ["QA Head to close or reject"] },
  capa_pending: { value: "capa_pending", label: "CAPA Pending", color: "#0E7490", bg: "#ECFEFF", description: "CAPA raised; deviation stays open and linked until the CAPA closes", nextActions: ["Close the linked CAPA", "QA Head to sign-close the deviation"] },
  closed: { value: "closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "QA Head satisfied. CAPA raised if required.", nextActions: [] },
  rejected: { value: "rejected", label: "Rejected", color: "#A32D2D", bg: "#FEF2F2", description: "QA Head rejected. Additional investigation needed.", nextActions: ["Rework investigation"] },
};

/* ── TRAINING & AWARENESS — Action statuses ── */

export const READINESS_STATUSES: Record<string, StatusDef> = {
  "Not Started": { value: "Not Started", label: "Not Started", color: "#4B5563", bg: "#F3F4F6", description: "Action not yet initiated", nextActions: ["Begin work"] },
  "In Progress": { value: "In Progress", label: "In Progress", color: "#B45309", bg: "#FEF9EC", description: "Work ongoing, not yet complete", nextActions: ["Mark complete when done"] },
  Complete: { value: "Complete", label: "Complete", color: "#0F6E56", bg: "#E8F5F1", description: "Action completed and verified", nextActions: [] },
  Overdue: { value: "Overdue", label: "Overdue", color: "#A32D2D", bg: "#FEF2F2", description: "Past due date. Immediate action required.", nextActions: ["Escalate to QA Head"] },
  Blocked: { value: "Blocked", label: "Blocked", color: "#B91C1C", bg: "#FEF2F2", description: "Cannot proceed due to dependency or blocker", nextActions: ["Resolve blocker"] },
};

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
