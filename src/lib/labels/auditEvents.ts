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
  PLAN_ASSIGNED: "Plan assigned",
  PLAN_RENEWED: "Plan renewed",
  PLAN_SWITCHED: "Plan changed",
  PLAN_CHANGED: "Plan changed",
  PLAN_UPDATED: "Plan updated",
  MFA_ENABLED: "MFA enabled",
  MFA_DISABLED: "MFA disabled",
};

/** Title-case an UPPER_SNAKE action code — fallback for un-mapped events. */
function humanise(code: string): string {
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
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
