import dayjs from "@/lib/dayjs";

/* Pure audit-trail helpers shared by AuditTrailPage and AuditDetailModal.
   Kept out of the components so the action-label/severity rules live in one
   place. NOTE: tamper-evidence / hash-chain is a planned future feature
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

// Module filter options. Strict-equality (e.module === value), so each `value`
// MUST match a `module` string written by an auditLog.create / auditAuthEvent
// call. Covers every module string the code writes today.
export const MODULES: { value: string; label: string }[] = [
  { value: "all", label: "All modules" },
  { value: "Gap Assessment", label: "Gap Assessment" },
  { value: "CAPA", label: "CAPA" },
  { value: "CAPA / Action Items", label: "CAPA / Action Items" },
  { value: "CAPA / Alignment", label: "CAPA / Alignment" },
  { value: "CAPA / Approvals", label: "CAPA / Approvals" },
  { value: "CAPA / Change Control", label: "CAPA / Change Control" },
  { value: "CAPA / Discussion", label: "CAPA / Discussion" },
  { value: "CAPA / Effectiveness", label: "CAPA / Effectiveness" },
  { value: "CAPA / Evidence", label: "CAPA / Evidence" },
  { value: "CAPA / RCA Review", label: "CAPA / RCA Review" },
  { value: "CAPA / Verification", label: "CAPA / Verification" },
  { value: "Change Control", label: "Change Control" },
  { value: "Deviation Management", label: "Deviation Management" },
  { value: "FDA 483", label: "FDA 483" },
  { value: "CSV/CSA", label: "CSV/CSA" },
  { value: "Evidence & Documents", label: "Evidence & Documents" },
  { value: "Governance", label: "Governance" },
  { value: "Inspection Readiness", label: "Inspection Readiness" },
  { value: "Settings", label: "Settings" },
  { value: "Admin", label: "Admin" },
  { value: "auth", label: "Authentication" },
  { value: "AGI Console", label: "AGI Console" },
];

export const ACTION_GROUPS = [
  "all",
  "Created",
  "Updated",
  "Status Changed",
  "Signed",
  "Submitted",
  "Deleted",
];

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
  "RAID_ITEM_CREATED",
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

export function actionGroupMatch(action: string, group: string): boolean {
  if (group === "all") return true;
  const a = action.toLowerCase();
  if (group === "Created") return a.includes("created") || a.includes("uploaded") || a.includes("added");
  if (group === "Updated") return a.includes("updated") || a.includes("toggled") || a.includes("cleared") || a.includes("approved");
  if (group === "Status Changed") return a.includes("status") || a.includes("gate") || a.includes("rejected");
  if (group === "Signed") return a.includes("closed") || a.includes("signed");
  if (group === "Submitted") return a.includes("submitted");
  if (group === "Deleted") return a.includes("deleted") || a.includes("reopened");
  return true;
}

/** "CAPA_CLOSED" → "CAPA Closed", with the product's acronym fixups. */
export function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Capa", "CAPA")
    .replace("Di ", "DI ")
    .replace("Fda", "FDA")
    .replace("Rca", "RCA")
    .replace("Agi", "AGI")
    .replace("Raid", "RAID")
    .replace("Rtm", "RTM")
    .replace("Csv", "CSV");
}

/** Relative for recent ("3m ago"), absolute for older — an inspector
 *  reconstructing a timeline needs the full date past a day. */
export function formatTimestamp(iso: string | Date, timezone: string): string {
  const d = dayjs(iso);
  const diffMin = dayjs().diff(d, "minute");
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.tz(timezone).format("DD MMM YYYY HH:mm");
}
