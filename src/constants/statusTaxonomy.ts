/**
 * Standardised GxP status taxonomy for Pharma Glimmora.
 *
 * Every module's badge colours, labels, and tooltip descriptions
 * are defined here to eliminate inconsistency (MoM Gap #7).
 */

export interface StatusDef {
  value: string;
  label: string;
  color: string;
  bg: string;
  description: string;
  nextActions: string[];
}

/* ── GAP ASSESSMENT — Finding statuses ── */

export const FINDING_STATUSES: Record<string, StatusDef> = {
  open: { value: "open", label: "Open", color: "#3B82F6", bg: "#EFF6FF", description: "Finding identified, no action taken yet", nextActions: ["Raise CAPA", "Assign owner"] },
  in_progress: { value: "in_progress", label: "In Progress", color: "#F59E0B", bg: "#FEF9EC", description: "CAPA raised and corrective actions ongoing", nextActions: ["Monitor CAPA progress"] },
  pending_verification: { value: "pending_verification", label: "Pending Verification", color: "#8B5CF6", bg: "#F5F3FF", description: "Fix implemented, awaiting QA verification", nextActions: ["QA Head to verify"] },
  closed: { value: "closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "Finding resolved and verified by QA Head", nextActions: [] },
  risk_accepted: { value: "risk_accepted", label: "Risk Accepted", color: "#6B7280", bg: "#F3F4F6", description: "Risk assessed and formally accepted by QA Head. No CAPA required.", nextActions: [] },
  // Backward compat
  Open: { value: "Open", label: "Open", color: "#3B82F6", bg: "#EFF6FF", description: "Finding identified, no action taken yet", nextActions: ["Raise CAPA"] },
  "In Progress": { value: "In Progress", label: "In Progress", color: "#F59E0B", bg: "#FEF9EC", description: "Corrective actions ongoing", nextActions: [] },
  Closed: { value: "Closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "Finding resolved", nextActions: [] },
};

/* ── CAPA TRACKER — CAPA statuses ── */

export const CAPA_STATUSES: Record<string, StatusDef> = {
  open: { value: "open", label: "Open", color: "#3B82F6", bg: "#EFF6FF", description: "CAPA created, root cause analysis not yet started", nextActions: ["Add RCA", "Add action plan"] },
  in_progress: { value: "in_progress", label: "In Progress", color: "#F59E0B", bg: "#FEF9EC", description: "RCA complete, corrective actions being implemented", nextActions: ["Attach evidence", "Submit for review"] },
  pending_di_review: { value: "pending_di_review", label: "Pending DI Review", color: "#EF4444", bg: "#FEF2F2", description: "Data integrity review required before QA can close", nextActions: ["QA Head to clear DI gate"] },
  pending_qa_review: { value: "pending_qa_review", label: "Pending QA Review", color: "#8B5CF6", bg: "#F5F3FF", description: "Submitted to QA Head for review and sign-off", nextActions: ["QA Head to review"] },
  closed: { value: "closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "QA Head signed and closed. Effectiveness check due in 90 days.", nextActions: ["Monitor effectiveness"] },
  rejected: { value: "rejected", label: "Rejected", color: "#A32D2D", bg: "#FEF2F2", description: "QA Head rejected. Rework required.", nextActions: ["Review rejection reason", "Rework and resubmit"] },
  overdue: { value: "overdue", label: "Overdue", color: "#A32D2D", bg: "#FEF2F2", description: "Past due date. Immediate action required.", nextActions: ["Escalate to QA Head"] },
  // Backward compat
  Open: { value: "Open", label: "Open", color: "#3B82F6", bg: "#EFF6FF", description: "CAPA created", nextActions: [] },
  "In Progress": { value: "In Progress", label: "In Progress", color: "#F59E0B", bg: "#FEF9EC", description: "Corrective actions ongoing", nextActions: [] },
  "Pending QA Review": { value: "Pending QA Review", label: "Pending QA Review", color: "#8B5CF6", bg: "#F5F3FF", description: "Awaiting QA sign-off", nextActions: [] },
  Closed: { value: "Closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "Closed by QA Head", nextActions: [] },
};

/* ── FDA 483 — Event statuses ── */

export const FDA483_EVENT_STATUSES: Record<string, StatusDef> = {
  Open: { value: "Open", label: "Open", color: "#3B82F6", bg: "#EFF6FF", description: "FDA 483 received, investigation not started", nextActions: ["Assign team", "Begin investigation"] },
  "Under Investigation": { value: "Under Investigation", label: "Under Investigation", color: "#F59E0B", bg: "#FEF9EC", description: "Team investigating observations and gathering evidence", nextActions: ["Complete RCA", "Raise CAPAs"] },
  "Response Due": { value: "Response Due", label: "Response Due", color: "#EF4444", bg: "#FEF2F2", description: "Response deadline approaching \u2014 action required", nextActions: ["Finalize draft", "Submit to QA Head"] },
  "Response Drafted": { value: "Response Drafted", label: "Response Drafted", color: "#8B5CF6", bg: "#F5F3FF", description: "Draft response prepared, pending QA Head sign-off", nextActions: ["QA Head to review and sign"] },
  "Pending QA Sign-off": { value: "Pending QA Sign-off", label: "Pending QA Sign-off", color: "#F59E0B", bg: "#FEF9EC", description: "QA Head reviewing response before submission", nextActions: ["QA Head to sign"] },
  "Response Submitted": { value: "Response Submitted", label: "Response Submitted", color: "#0F6E56", bg: "#E8F5F1", description: "Formal response submitted to FDA within deadline", nextActions: ["Await FDA acknowledgement"] },
  "FDA Acknowledged": { value: "FDA Acknowledged", label: "FDA Acknowledged", color: "#0F6E56", bg: "#E8F5F1", description: "FDA confirmed receipt of response", nextActions: ["Monitor for follow-up"] },
  Closed: { value: "Closed", label: "Closed", color: "#6B7280", bg: "#F3F4F6", description: "FDA satisfied with response. No further action required.", nextActions: [] },
  "Warning Letter": { value: "Warning Letter", label: "Warning Letter", color: "#A32D2D", bg: "#FEF2F2", description: "FDA issued Warning Letter. Immediate escalation required.", nextActions: ["Escalate to leadership", "Engage regulatory counsel"] },
};

/* ── FDA 483 — Observation statuses ── */

export const FDA483_OBS_STATUSES: Record<string, StatusDef> = {
  Open: { value: "Open", label: "Open", color: "#3B82F6", bg: "#EFF6FF", description: "Observation not yet addressed", nextActions: ["Start RCA"] },
  "In Progress": { value: "In Progress", label: "In Progress", color: "#F59E0B", bg: "#FEF9EC", description: "RCA being performed", nextActions: ["Complete RCA", "Raise CAPA"] },
  "RCA In Progress": { value: "RCA In Progress", label: "RCA In Progress", color: "#F59E0B", bg: "#FEF9EC", description: "Root cause analysis in progress", nextActions: ["Finalize RCA"] },
  "CAPA Linked": { value: "CAPA Linked", label: "CAPA Linked", color: "#8B5CF6", bg: "#F5F3FF", description: "CAPA raised for this observation", nextActions: ["Draft response"] },
  "Response Ready": { value: "Response Ready", label: "Response Ready", color: "#10B981", bg: "#E8F5F1", description: "Draft response complete for this observation", nextActions: ["Include in response package"] },
  "Response Drafted": { value: "Response Drafted", label: "Response Drafted", color: "#10B981", bg: "#E8F5F1", description: "Response drafted", nextActions: [] },
  Closed: { value: "Closed", label: "Closed", color: "#6B7280", bg: "#F3F4F6", description: "Observation fully addressed", nextActions: [] },
};

/* ── CSV/CSA — Validation stage statuses ── */

export const VALIDATION_STATUSES: Record<string, StatusDef> = {
  not_started: { value: "not_started", label: "Not Started", color: "#6B7280", bg: "#F3F4F6", description: "Validation stage not yet initiated", nextActions: ["Upload documents"] },
  draft: { value: "draft", label: "Draft", color: "#3B82F6", bg: "#EFF6FF", description: "Documents being prepared by CSV/Val Lead", nextActions: ["Submit for review"] },
  in_review: { value: "in_review", label: "In Review", color: "#F59E0B", bg: "#FEF9EC", description: "Submitted to QA Head for review and approval", nextActions: ["QA Head to approve or reject"] },
  approved: { value: "approved", label: "Approved", color: "#0F6E56", bg: "#E8F5F1", description: "QA Head approved. Stage complete.", nextActions: [] },
  rejected: { value: "rejected", label: "Rejected", color: "#A32D2D", bg: "#FEF2F2", description: "QA Head rejected. Rework required.", nextActions: ["Review rejection", "Resubmit"] },
  skipped: { value: "skipped", label: "Skipped", color: "#6B7280", bg: "#F3F4F6", description: "Not applicable for this system category", nextActions: [] },
  // Backward compat
  pending: { value: "pending", label: "Not Started", color: "#6B7280", bg: "#F3F4F6", description: "Not yet initiated", nextActions: [] },
  complete: { value: "complete", label: "Approved", color: "#0F6E56", bg: "#E8F5F1", description: "Stage complete", nextActions: [] },
  "in-progress": { value: "in-progress", label: "In Review", color: "#F59E0B", bg: "#FEF9EC", description: "Under review", nextActions: [] },
};

/* ── DEVIATION — Deviation statuses ── */

export const DEVIATION_STATUSES: Record<string, StatusDef> = {
  draft: { value: "draft", label: "Draft", color: "#6B7280", bg: "#F3F4F6", description: "Deviation report being prepared", nextActions: ["Complete and submit"] },
  open: { value: "open", label: "Open", color: "#3B82F6", bg: "#EFF6FF", description: "Deviation reported, investigation not started", nextActions: ["Start investigation"] },
  under_investigation: { value: "under_investigation", label: "Under Investigation", color: "#F59E0B", bg: "#FEF9EC", description: "RCA in progress, impact being assessed", nextActions: ["Complete RCA", "Submit for QA review"] },
  pending_qa_review: { value: "pending_qa_review", label: "Pending QA Review", color: "#8B5CF6", bg: "#F5F3FF", description: "Investigation complete, QA Head reviewing", nextActions: ["QA Head to close or reject"] },
  closed: { value: "closed", label: "Closed", color: "#0F6E56", bg: "#E8F5F1", description: "QA Head satisfied. CAPA raised if required.", nextActions: [] },
  rejected: { value: "rejected", label: "Rejected", color: "#A32D2D", bg: "#FEF2F2", description: "QA Head rejected. Additional investigation needed.", nextActions: ["Rework investigation"] },
};

/* ── INSPECTION READINESS — Action statuses ── */

export const READINESS_STATUSES: Record<string, StatusDef> = {
  "Not Started": { value: "Not Started", label: "Not Started", color: "#6B7280", bg: "#F3F4F6", description: "Action not yet initiated", nextActions: ["Begin work"] },
  "In Progress": { value: "In Progress", label: "In Progress", color: "#F59E0B", bg: "#FEF9EC", description: "Work ongoing, not yet complete", nextActions: ["Mark complete when done"] },
  Complete: { value: "Complete", label: "Complete", color: "#0F6E56", bg: "#E8F5F1", description: "Action completed and verified", nextActions: [] },
  Overdue: { value: "Overdue", label: "Overdue", color: "#A32D2D", bg: "#FEF2F2", description: "Past due date. Immediate action required.", nextActions: ["Escalate to QA Head"] },
  Blocked: { value: "Blocked", label: "Blocked", color: "#EF4444", bg: "#FEF2F2", description: "Cannot proceed due to dependency or blocker", nextActions: ["Resolve blocker"] },
};

/* ── Helper: look up any status ── */

export function getStatusDef(taxonomy: Record<string, StatusDef>, status: string): StatusDef {
  return taxonomy[status] ?? { value: status, label: status, color: "#6B7280", bg: "#F3F4F6", description: "", nextActions: [] };
}

/* ── All module taxonomies for StatusGuide ── */

export const ALL_TAXONOMIES: { module: string; statuses: Record<string, StatusDef> }[] = [
  { module: "Gap Assessment", statuses: FINDING_STATUSES },
  { module: "CAPA Tracker", statuses: CAPA_STATUSES },
  { module: "FDA 483 Events", statuses: FDA483_EVENT_STATUSES },
  { module: "FDA 483 Observations", statuses: FDA483_OBS_STATUSES },
  { module: "CSV/CSA Validation", statuses: VALIDATION_STATUSES },
  { module: "Deviation Management", statuses: DEVIATION_STATUSES },
  { module: "Inspection Readiness", statuses: READINESS_STATUSES },
];
