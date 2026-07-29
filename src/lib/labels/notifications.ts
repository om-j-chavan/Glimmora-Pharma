/**
 * Notification label layer — type → readable label, entityType → owning module.
 *
 * `Notification.type` and `Notification.entityType` are free strings written by
 * the emit sites that call `notify()` (src/lib/notify.ts). This maps them to
 * readable names for the bell and the /notifications page; anything unknown
 * gets a prettified fallback so no raw SCREAMING_SNAKE token reaches the UI.
 *
 * Presentation only — never changes what is stored. Matches the plain-TS
 * convention of src/lib/labels/modules.ts (no deps, no React).
 */

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  CAPA_ASSIGNED: "CAPA assigned",
  CAPA_APPROVED: "CAPA approved",
  CAPA_REJECTED: "CAPA rejected",
  CAPA_VERIFIED: "CAPA verified",
  CAPA_CLOSED: "CAPA closed",
  ACTION_ASSIGNED: "Action assigned",
  REWORK_ASSIGNED: "Returned for rework",
  EVIDENCE_REJECTED: "Evidence rejected",
  // Distinct types for closure / review-request events. Previously these were
  // mis-emitted as ACTION_ASSIGNED (audit finding NTF-012) so the recipient saw
  // an "assigned" clipboard for a closure. Now first-class.
  FINDING_CLOSED: "Finding closed",
  REVIEW_REQUESTED: "Review requested",
  // Reserved for the scheduler that does not exist yet (see notify.ts) — mapped
  // now so the surfaces are ready the day one lands.
  DUE_SOON: "Due soon",
  OVERDUE: "Overdue",
  TICKET_ASSIGNED: "Ticket assigned",
  TICKET_REPLY: "Ticket reply",
  TICKET_STATUS_CHANGED: "Ticket status changed",
  TICKET_RESOLVED: "Ticket resolved",
  TICKET_ESCALATED: "Ticket escalated",
};

/* ── Priority / severity / source taxonomy ───────────────────────────────────
 *
 * Priority drives ranking + the badge accent; severity drives tone; source says
 * who produced it. These are PLAIN data so both the server emitter (notify.ts)
 * and the client (summary cards, filter facets) share ONE definition — a card
 * and a filter can never disagree with what was stored.
 */

export type NotificationPriority = "critical" | "high" | "medium" | "low" | "info";
export type NotificationSeverity = "critical" | "warning" | "success" | "info";
export type NotificationSource = "user" | "system" | "ai";

export const NOTIFICATION_PRIORITIES: { value: NotificationPriority; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Information" },
];

export const NOTIFICATION_SEVERITIES: { value: NotificationSeverity; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "success", label: "Success" },
  { value: "info", label: "Information" },
];

export const NOTIFICATION_SOURCES: { value: NotificationSource; label: string }[] = [
  { value: "user", label: "User" },
  { value: "system", label: "System" },
  { value: "ai", label: "AI" },
];

/** Rank used for "Priority" sort and AI ranking (higher = more urgent). */
export const PRIORITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

const PRIORITY_LABEL = new Map(NOTIFICATION_PRIORITIES.map((p) => [p.value, p.label]));
const SEVERITY_LABEL = new Map(NOTIFICATION_SEVERITIES.map((s) => [s.value, s.label]));
const SOURCE_LABEL = new Map(NOTIFICATION_SOURCES.map((s) => [s.value, s.label]));

export function notificationPriorityLabel(p: string | null | undefined): string {
  return (p && PRIORITY_LABEL.get(p as NotificationPriority)) || "Medium";
}
export function notificationSeverityLabel(s: string | null | undefined): string {
  return (s && SEVERITY_LABEL.get(s as NotificationSeverity)) || "Information";
}
export function notificationSourceLabel(s: string | null | undefined): string {
  return (s && SOURCE_LABEL.get(s as NotificationSource)) || "System";
}

/**
 * Default priority + severity per notification type. Emit sites may override,
 * but this keeps every existing call site meaningful without touching it.
 */
export const NOTIFICATION_TYPE_DEFAULTS: Record<
  string,
  { priority: NotificationPriority; severity: NotificationSeverity }
> = {
  CAPA_REJECTED:        { priority: "high",     severity: "warning" },
  EVIDENCE_REJECTED:    { priority: "high",     severity: "warning" },
  REWORK_ASSIGNED:      { priority: "high",     severity: "warning" },
  TICKET_ESCALATED:     { priority: "high",     severity: "warning" },
  OVERDUE:              { priority: "critical", severity: "critical" },
  DUE_SOON:             { priority: "medium",   severity: "warning" },
  CAPA_ASSIGNED:        { priority: "medium",   severity: "info" },
  ACTION_ASSIGNED:      { priority: "medium",   severity: "info" },
  REVIEW_REQUESTED:     { priority: "medium",   severity: "info" },
  TICKET_ASSIGNED:      { priority: "medium",   severity: "info" },
  TICKET_REPLY:         { priority: "low",      severity: "info" },
  TICKET_STATUS_CHANGED:{ priority: "low",      severity: "info" },
  CAPA_APPROVED:        { priority: "low",      severity: "success" },
  CAPA_VERIFIED:        { priority: "low",      severity: "success" },
  CAPA_CLOSED:          { priority: "low",      severity: "success" },
  FINDING_CLOSED:       { priority: "low",      severity: "success" },
  TICKET_RESOLVED:      { priority: "low",      severity: "success" },
};

/** Type → its default priority/severity, falling back to medium/info. */
export function notificationTypeDefaults(type: string): {
  priority: NotificationPriority;
  severity: NotificationSeverity;
} {
  return NOTIFICATION_TYPE_DEFAULTS[type] ?? { priority: "medium", severity: "info" };
}

/** "CAPA_REJECTED" → "CAPA rejected"; unknown "FOO_BAR" → "Foo bar". */
export function notificationTypeLabel(type: string): string {
  const known = NOTIFICATION_TYPE_LABELS[type];
  if (known) return known;
  const words = type.toLowerCase().split(/[_\s]+/).filter(Boolean);
  if (words.length === 0) return type;
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
}

/**
 * The Module facet on /notifications. `entityType` is the only column that
 * identifies the originating module (it is written by every emit site and,
 * before this page existed, was read by nothing), so the facet groups
 * entityTypes rather than inventing a new column.
 */
export interface NotificationModule {
  value: string;
  label: string;
  entityTypes: string[];
}

export const NOTIFICATION_MODULES: NotificationModule[] = [
  { value: "capa", label: "CAPA", entityTypes: ["CAPA", "CAPAActionItem"] },
  { value: "gap-assessment", label: "Gap Assessment", entityTypes: ["Finding"] },
  { value: "deviation", label: "Deviation Management", entityTypes: ["DeviationTask"] },
  { value: "csv-csa", label: "CSV/CSA Validation", entityTypes: ["ValidationStageTask"] },
  { value: "support", label: "Support", entityTypes: ["Ticket"] },
];

/** Module facet value → the entityTypes it covers ([] for an unknown value, so
 *  a bad filter narrows to nothing rather than silently widening the scope). */
export function entityTypesForModule(value: string): string[] {
  return NOTIFICATION_MODULES.find((m) => m.value === value)?.entityTypes ?? [];
}

/** entityType → readable module name for the table cell. */
export function notificationModuleLabel(entityType: string | null | undefined): string {
  if (!entityType) return "—";
  return NOTIFICATION_MODULES.find((m) => m.entityTypes.includes(entityType))?.label ?? entityType;
}
