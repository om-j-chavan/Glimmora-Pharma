/**
 * Substage 4.8 — Change Control vocabulary.
 *
 * Pure value/type module so the constants and unions can be re-exported
 * to client components and used inside server actions without violating
 * Next.js 16's "use server"-files-must-export-only-async-functions rule.
 * Previously these lived in src/actions/change-control.ts and Next 16
 * rejected the file at runtime; moving them here is a no-behaviour
 * change — every consumer now imports from "@/lib/change-control-constants".
 */

export const CHANGE_TYPES = [
  "SOP",
  "Equipment",
  "Process",
  "Product",
  "Computer System",
  "Material",
  "Other",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_CONTROL_RISKS = ["Critical", "High", "Medium", "Low"] as const;
export type ChangeControlRisk = (typeof CHANGE_CONTROL_RISKS)[number];

export const CHANGE_CONTROL_STATUSES = [
  "Draft",
  "In Review",
  "Approved",
  "In Implementation",
  "Implemented",
  "Closed",
  "Rejected",
] as const;
export type ChangeControlStatus = (typeof CHANGE_CONTROL_STATUSES)[number];
