/**
 * Management Decisions (Governance Phase 3) — value sets for the meeting record
 * and its nested decision / action items.
 *
 * The Prisma schema stores `DecisionItem.status` as a plain String (project-wide
 * convention — no Prisma enums), so THIS FILE is the enum. The server actions
 * validate against these lists with Zod and the UI builds its controls from the
 * same arrays, so client and server cannot drift.
 *
 * Pure data + pure functions. No React, no Prisma.
 */

/* ── Decision-item status ────────────────────────────────────────────────── */

export const DECISION_ITEM_STATUSES = ["open", "done"] as const;
export type DecisionItemStatus = (typeof DECISION_ITEM_STATUSES)[number];

export const DECISION_ITEM_STATUS_LABEL: Record<DecisionItemStatus, string> = {
  open: "Open",
  done: "Done",
};

export const DECISION_ITEM_STATUS_BADGE: Record<DecisionItemStatus, string> = {
  open: "badge badge-blue",
  done: "badge badge-green",
};

/**
 * A minuted item is an ACTION ITEM when someone was tasked with it (an owner
 * and/or a due date). Otherwise it is a pure DECISION — a statement of what the
 * meeting resolved, with nobody to chase. Same row shape; the distinction is
 * derived, never stored, so an item can gain an owner later without a migration.
 */
export function isActionItem(item: { ownerId?: string | null; dueDate?: string | null }): boolean {
  return !!item.ownerId || !!item.dueDate;
}

/* ── Document categories for a meeting's attachments ─────────────────────── */

/**
 * Deliberately a SEPARATE vocabulary from both EVIDENCE_CATEGORIES (GxP evidence)
 * and RISK_DOC_CATEGORIES (assessments/plans). A management review's attachments
 * are governance artefacts: the agenda, the minutes, the slide deck.
 */
export const DECISION_DOC_CATEGORIES = [
  "AGENDA",
  "MINUTES",
  "PRESENTATION",
  "METRICS_PACK",
  "SUPPORTING_ANALYSIS",
  "OTHER",
] as const;
export type DecisionDocCategory = (typeof DECISION_DOC_CATEGORIES)[number];

export const DECISION_DOC_CATEGORY_LABEL: Record<DecisionDocCategory, string> = {
  AGENDA: "Agenda",
  MINUTES: "Minutes",
  PRESENTATION: "Presentation",
  METRICS_PACK: "Metrics Pack",
  SUPPORTING_ANALYSIS: "Supporting Analysis",
  OTHER: "Other",
};

/* ── Module pointers on the shared polymorphic Document model ────────────── */

/** `Document.sourceModule` for a meeting's supporting documents. */
export const DECISION_SOURCE_MODULE = "management-decisions";
/** `Document.linkedModule` (legacy pointer, dual-written). */
export const DECISION_LINKED_MODULE = "Management Decisions";

/* ── Reference ───────────────────────────────────────────────────────────── */

/**
 * "MGT-2026-001". TENANT-level, so no <SITE> segment — a management review is a
 * governance-body record, not a site record. (Contrast RISK-<SITE>-<year>-<n>.)
 */
export const DECISION_REFERENCE_PREFIX = "MGT";

/* ── Meeting-date range filter ───────────────────────────────────────────── */

/**
 * The list tab's date-range filter, expressed as presets so it drops straight
 * into the shared <DataTable>'s `filters` prop (which models a filter as
 * `{ options, match }`). No bespoke date-picker filter component is introduced.
 */
export const DECISION_DATE_RANGES = [
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "12m", label: "Last 12 months", days: 365 },
  { value: "older", label: "Older than 12 months", days: -1 },
] as const;
export type DecisionDateRange = (typeof DECISION_DATE_RANGES)[number]["value"];

/**
 * True when `meetingDate` falls inside the named preset. `now` is injected so
 * this stays pure and testable.
 */
export function matchesDateRange(meetingDateIso: string, range: string, now: Date): boolean {
  const preset = DECISION_DATE_RANGES.find((r) => r.value === range);
  if (!preset) return true;
  const ageDays = (now.getTime() - new Date(meetingDateIso).getTime()) / 86_400_000;
  if (preset.days === -1) return ageDays > 365;
  return ageDays >= 0 && ageDays <= preset.days;
}
