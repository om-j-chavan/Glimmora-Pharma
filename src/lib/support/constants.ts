/**
 * Support module constants — status/priority/category unions (String columns,
 * not Prisma enums, matching every other module), badge variants, SLA targets,
 * and the server-side status-transition map. Pure data + helpers; no I/O.
 */

import type { BadgeVariant } from "@/components/ui/Badge";

/* ── Status ── */
export const TICKET_STATUSES = [
  "New",
  "Open",
  "In Progress",
  "Awaiting User",
  "Resolved",
  "Closed",
  "Cancelled",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TERMINAL_STATUSES: ReadonlySet<TicketStatus> = new Set(["Closed", "Cancelled"]);

export const STATUS_BADGE: Record<TicketStatus, BadgeVariant> = {
  New: "blue",
  Open: "blue",
  "In Progress": "amber",
  "Awaiting User": "amber",
  Resolved: "green",
  Closed: "gray",
  Cancelled: "gray",
};

/** Allowed status transitions, enforced server-side. Empty = terminal. */
export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  New: ["Open", "In Progress", "Cancelled"],
  Open: ["In Progress", "Awaiting User", "Resolved", "Cancelled"],
  "In Progress": ["Awaiting User", "Resolved", "Cancelled"],
  "Awaiting User": ["In Progress", "Resolved", "Cancelled"],
  Resolved: ["Closed", "In Progress"], // → Closed (confirm/auto), → In Progress (reopen)
  Closed: ["In Progress"], // reopen
  Cancelled: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/* ── Priority ── */
export const TICKET_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const PRIORITY_BADGE: Record<TicketPriority, BadgeVariant> = {
  Low: "gray",
  Medium: "blue",
  High: "amber",
  Urgent: "red",
};

/* ── Category ── */
export const TICKET_CATEGORIES = [
  "Technical/Bug",
  "Access & Permissions",
  "Data Correction",
  "Validation/CSV",
  "How-to/Training",
  "Compliance Concern",
  "Other",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/** Categories whose change-requests must route through a GxP flow (CAPA/etc.),
 *  never a direct record mutation. Surfaced as a banner in the UI. */
export const GXP_REQUEST_CATEGORIES: ReadonlySet<TicketCategory> = new Set([
  "Data Correction",
  "Compliance Concern",
]);

/* ── Resolution ── */
export const RESOLUTION_CATEGORIES = [
  "Fixed",
  "Configuration",
  "User Education",
  "Duplicate",
  "Not a Bug",
  "Forwarded to CAPA/Deviation",
  "Won't Fix",
] as const;
export type ResolutionCategory = (typeof RESOLUTION_CATEGORIES)[number];

/* ── SLA ── */
// Urgent 4h, High 1 business day, Medium 3, Low 5. Business days skip Sat/Sun.
export const SLA_CONFIG: Record<TicketPriority, { hours?: number; businessDays?: number }> = {
  Urgent: { hours: 4 },
  High: { businessDays: 1 },
  Medium: { businessDays: 3 },
  Low: { businessDays: 5 },
};

export const AUTO_CLOSE_DAYS = 7;

function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

/** SLA due timestamp for a priority, measured from `from` (default now). */
export function computeSlaDueAt(priority: TicketPriority, from: Date = new Date()): Date {
  const cfg = SLA_CONFIG[priority];
  if (cfg.hours != null) return new Date(from.getTime() + cfg.hours * 60 * 60 * 1000);
  return addBusinessDays(from, cfg.businessDays ?? 5);
}

/* ── Activity types ── */
export type TicketActivityType =
  | "CREATED"
  | "ASSIGNED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "REPLY"
  | "INTERNAL_NOTE"
  | "RESOLVED"
  | "REOPENED"
  | "CLOSED"
  | "CANCELLED"
  // Two-hop escalation (Phase A adds the type; the escalate action that emits it
  // comes in Phase B). Unprefixed to match the members above — the central
  // AuditLog action string for it is the prefixed "TICKET_ESCALATED".
  | "ESCALATED";

/** Central AuditLog module string for Support (matches Audit Trail filters). */
export const SUPPORT_AUDIT_MODULE = "Support";
