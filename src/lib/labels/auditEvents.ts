/**
 * Audit event label layer (super-admin-facing events).
 *
 * The audit log stores ~175 raw action codes as free strings (there is no
 * central enum). This maps the account / tenant / plan / MFA events a
 * super_admin sees in the admin console to human text. Events from other
 * modules still render readably via the humanised fallback — they just aren't
 * custom-labelled here.
 *
 * TODO: per-module teams should extend this map (or add their own label module
 * and merge it in) with their domain events — CAPA_*, DEVIATION_*, FDA483_*,
 * SYSTEM_*, etc. Keep this file scoped to the super-admin surface.
 *
 * Matches the plain-TS convention of src/lib/plans.ts (no deps).
 */

export const AUDIT_EVENT_LABELS: Record<string, string> = {
  TENANT_CREATED: "Account created",
  TENANT_UPDATED: "Account updated",
  TENANT_SUSPENDED: "Account suspended",
  TENANT_REACTIVATED: "Account reactivated",
  TENANT_DELETED: "Account deleted",
  TENANT_RESTORED: "Company restored",
  TENANT_PURGED: "Account permanently deleted",
  PLAN_ASSIGNED: "Plan assigned",
  PLAN_RENEWED: "Plan renewed",
  PLAN_SWITCHED: "Plan changed",
  PLAN_CHANGED: "Plan changed",
  PLAN_UPDATED: "Plan updated",
  MFA_ENABLED: "MFA enabled",
  MFA_DISABLED: "MFA disabled",
  TENANT_PURGE_DENIED: "Permanent delete denied — wrong password",
  VIEW_DENIED: "Access denied",

  // Authentication (login / OTP)
  LOGIN_SUCCESS: "Login successful",
  LOGIN_FAILED: "Login failed",
  LOGIN_ACCOUNT_SUSPENDED: "Login blocked — account suspended",
  LOGIN_ACCOUNT_INACTIVE: "Login blocked — user inactive",
  LOGIN_AMBIGUOUS_EMAIL: "Login blocked — ambiguous email",
  LOGIN_NO_SUCH_ACCOUNT: "Login failed — no such account",
  LOGIN_INTERNAL_ERROR: "Login error",
  SUBSCRIPTION_BLOCKED: "Login blocked — subscription inactive",
  OTP_SENT: "Verification code sent",
  OTP_VERIFIED: "Verification code confirmed",
  OTP_FAILED: "Verification code failed",

  // Gap Assessment (findings) — the highest-volume module events
  FINDING_CREATED: "Finding created",
  FINDING_UPDATED: "Finding updated",
  FINDING_DELETED: "Finding deleted",
  FINDING_RESTORED: "Finding restored",
  FINDING_CLOSED: "Finding closed",
  FINDING_ASSIGNED: "Finding assigned",
  FINDING_SUBMITTED: "Finding submitted for review",
  FINDING_REVIEW_CLOSED: "Finding reviewed & closed",
  FINDING_REWORK: "Finding returned for rework",
  FINDING_EVIDENCE_UPLOADED: "Finding evidence uploaded",
  FINDING_EVIDENCE_REMOVED: "Finding evidence removed",
  FINDING_NOTES_SAVED: "Finding notes saved",

  // Regulatory frameworks — platform catalog (Super Admin) + per-tenant enablement.
  FRAMEWORK_CREATED: "Framework added",
  FRAMEWORK_UPDATED: "Framework updated",
  FRAMEWORK_REORDERED: "Framework reordered",
  FRAMEWORK_ARCHIVED: "Framework archived",
  FRAMEWORK_UNARCHIVED: "Framework un-archived",
  FRAMEWORK_KEY_SUPERSEDED: "Framework key superseded",
  FRAMEWORK_PLATFORM_ENABLED: "Framework enabled (platform)",
  FRAMEWORK_PLATFORM_DISABLED: "Framework disabled (platform)",
  TENANT_FRAMEWORK_ENABLED: "Framework enabled for tenant",
  TENANT_FRAMEWORK_DISABLED: "Framework disabled for tenant",

  // Regulatory regions (Item #3) — platform reference-data management.
  REGION_CREATED: "Region added",
  REGION_UPDATED: "Region label updated",
  REGION_ARCHIVED: "Region archived",
  REGION_UNARCHIVED: "Region un-archived",
  REGION_VALUE_SUPERSEDED: "Region value superseded",
  REGION_TENANTS_REASSIGNED: "Region tenants reassigned to Global",
  REGION_PERMANENTLY_DELETED: "Region permanently deleted",

  // ── Tenant-facing domain events (surfaced on the /audit-trail view) ──
  // The high-volume lifecycle codes get a polished label here; everything else
  // still resolves readably via the humanised fallback below.

  // CAPA
  CAPA_CREATED: "CAPA created",
  CAPA_UPDATED: "CAPA updated",
  CAPA_ASSIGNED: "CAPA assigned",
  CAPA_SUBMITTED_FOR_REVIEW: "CAPA submitted for review",
  CAPA_APPROVED: "CAPA approved",
  CAPA_REJECTED: "CAPA rejected",
  CAPA_VERIFIED: "CAPA verified",
  CAPA_CLOSED: "CAPA closed",
  CAPA_REOPENED: "CAPA reopened",
  CAPA_DELETED: "CAPA deleted",
  CAPA_RESTORED: "CAPA restored",
  CAPA_EFFECTIVENESS_REVIEWED: "CAPA effectiveness reviewed",
  CAPA_FOUND_INEFFECTIVE: "CAPA found ineffective",
  CAPA_DI_GATE_CLEARED: "CAPA data-integrity gate cleared",

  // Deviations
  DEVIATION_CREATED: "Deviation created",
  DEVIATION_UPDATED: "Deviation updated",
  DEVIATION_SUBMITTED_FOR_REVIEW: "Deviation submitted for review",
  DEVIATION_CLOSED: "Deviation closed",
  DEVIATION_REJECTED: "Deviation rejected",
  DEVIATION_DELETED: "Deviation deleted",
  DEVIATION_RESTORED: "Deviation restored",

  // FDA 483
  FDA483_EVENT_CREATED: "FDA 483 event created",
  FDA483_EVENT_UPDATED: "FDA 483 event updated",
  FDA483_EVENT_DELETED: "FDA 483 event deleted",
  FDA483_RESPONSE_SUBMITTED: "FDA 483 response submitted",
  FDA483_OUTCOME_RECORDED: "FDA 483 outcome recorded",
  OBSERVATION_ADDED: "Observation added",
  OBSERVATION_CLOSED: "Observation closed",

  // Change control
  CHANGE_CONTROL_CREATED: "Change control created",
  CHANGE_CONTROL_UPDATED: "Change control updated",
  CHANGE_CONTROL_STATUS_CHANGED: "Change control status changed",
  CHANGE_CONTROL_SOFT_DELETED: "Change control deleted",

  // Validation systems (CSV/CSA)
  SYSTEM_CREATED: "System created",
  SYSTEM_UPDATED: "System updated",
  STAGE_APPROVED: "Validation stage approved",
  STAGE_REJECTED: "Validation stage rejected",

  // Documents & evidence
  DOCUMENT_UPLOADED: "Document uploaded",
  DOCUMENT_APPROVED: "Document approved",
  DOCUMENT_REJECTED: "Document rejected",
  DOCUMENT_DELETED: "Document deleted",
  EVIDENCE_FILE_UPLOADED: "Evidence uploaded",
  EVIDENCE_REJECTED: "Evidence rejected",

  // Sites & users (Settings)
  SITE_CREATED: "Site created",
  SITE_UPDATED: "Site updated",
  SITE_DELETED: "Site deleted",
  USER_CREATED: "User created",
  USER_UPDATED: "User updated",
  USER_ACTIVATED: "User activated",
  USER_DEACTIVATED: "User deactivated",
  USER_DELETED: "User deleted",
  USER_SIGNATORY_GRANTED: "Signatory rights granted",
  USER_SIGNATORY_REVOKED: "Signatory rights revoked",

  // Support tickets
  TICKET_CREATED: "Ticket raised",
  TICKET_REPLY: "Ticket reply posted",
  TICKET_INTERNAL_NOTE: "Ticket internal note added",
  TICKET_ASSIGNED: "Ticket assigned",
  TICKET_ESCALATED: "Ticket escalated to platform support",
  TICKET_STATUS_CHANGED: "Ticket status changed",
  TICKET_RESOLVED: "Ticket resolved",
  TICKET_CLOSED: "Ticket closed",
  TICKET_REOPENED: "Ticket reopened",
  TICKET_CANCELLED: "Ticket cancelled",
  TICKET_AUTO_CLOSED: "Ticket auto-closed",

  // Other governance records
  RAID_ITEM_CREATED: "RAID item created",
  INSPECTION_CREATED: "Inspection created",
  INSPECTION_COMPLETED: "Inspection completed",
  RTM_ENTRY_CREATED: "RTM entry created",
};

/** Product acronyms that must not be title-cased — keyed by their title-cased
 *  single-token form so the humanised fallback can restore correct casing. */
const AUDIT_ACRONYMS: Record<string, string> = {
  Capa: "CAPA", Fda: "FDA", Fda483: "FDA 483", Rca: "RCA", Agi: "AGI",
  Raid: "RAID", Rtm: "RTM", Csv: "CSV", Csa: "CSA", Di: "DI", Cc: "CC",
  Otp: "OTP", Mfa: "MFA", Ip: "IP", Sla: "SLA", Id: "ID", Ai: "AI",
};

/** Title-case an UPPER_SNAKE action code, restoring product acronyms — the
 *  fallback for un-mapped events so no raw code (and no "Capa"/"Fda") reaches
 *  the UI. */
function humanise(code: string): string {
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => {
      const t = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return AUDIT_ACRONYMS[t] ?? t;
    })
    .join(" ");
}

/**
 * Human label for an audit action code. Mapped events use AUDIT_EVENT_LABELS;
 * everything else gets a humanised fallback so no raw code reaches the UI.
 */
export function auditEventLabel(action: string): string {
  if (!action) return "";
  return AUDIT_EVENT_LABELS[action] ?? humanise(action);
}
