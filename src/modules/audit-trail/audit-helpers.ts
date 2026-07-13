/* Severity classification for audit events — the ONLY audit helper the
   /audit-trail view still needs. Action → human LABEL now comes from the shared
   src/lib/labels/auditEvents.ts (auditEventLabel); module → readable from
   src/lib/labels/modules.ts (moduleLabel). The old forked formatAction /
   MODULES / ACTION_GROUPS / actionGroupMatch lived here and have been removed in
   favour of those shared maps + server-side filtering.

   NOTE: tamper-evidence / hash-chain is a planned future feature
   (AUDIT-GLOBAL-PATTERNS.md Finding #7) — do not add immutability claims here
   until the schema supports them. */

export type Severity = "critical" | "status_change" | "create" | "other";

export type BadgeVariant = "red" | "amber" | "green" | "gray";

export const SEVERITY_VARIANT: Record<Severity, BadgeVariant> = {
  critical: "red",
  status_change: "amber",
  create: "green",
  other: "gray",
};

const CRITICAL_ACTIONS = new Set([
  "CAPA_CLOSED",
  "FDA483_RESPONSE_SUBMITTED",
  "DEVIATION_CLOSED",
  "USER_DELETED",
  "TENANT_DELETED",
]);
const STATUS_ACTIONS = new Set([
  "FDA483_STATUS_CHANGED",
  "STAGE_APPROVED",
  "STAGE_REJECTED",
  "CAPA_DI_GATE_CLEARED",
  "CAPA_SUBMITTED_FOR_REVIEW",
]);
const CREATE_ACTIONS = new Set([
  "FINDING_CREATED",
  "CAPA_CREATED",
  "DEVIATION_CREATED",
  "FDA483_EVENT_CREATED",
  "SYSTEM_CREATED",
  "DOCUMENT_UPLOADED",
  "RISK_CREATED",
  "INSPECTION_CREATED",
  "USER_CREATED",
  "SITE_CREATED",
  "OBSERVATION_ADDED",
  "TENANT_CREATED",
  "RTM_ENTRY_CREATED",
]);

export function severityOf(action: string): Severity {
  if (CRITICAL_ACTIONS.has(action)) return "critical";
  if (STATUS_ACTIONS.has(action)) return "status_change";
  if (CREATE_ACTIONS.has(action)) return "create";
  return "other";
}
