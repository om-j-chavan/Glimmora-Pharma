/**
 * Canonical record predicates + area mapping (Phase 2).
 *
 * Every "is this finding open?", "is this system high-risk?", "which area does
 * this CAPA belong to?" question is answered HERE exactly once, then reused by
 * computeDashboardKPIs / computeGovernanceKPIs / computeSiteKPIs. Before this,
 * the same predicates were re-typed inline in DashboardPage and GovernancePage
 * (and drifted — e.g. the CAPA-overdue denominator differed).
 */

import { isOverdue, type CAPAStatus } from "@/types/capa";
import type { KPICapa, KPIFinding, KPISystem } from "./types";

/** Canonical GxP area list — shared by the heatmap + DI-by-area breakdown. */
export const KPI_AREAS = [
  "Manufacturing",
  "QC Lab",
  "Warehouse",
  "Utilities",
  "QMS",
  "CSV/IT",
] as const;

/* ── Findings ── */

export const isOpenFinding = (f: KPIFinding) => f.status !== "Closed";
export const isCriticalOpen = (f: KPIFinding) => f.severity === "Critical" && f.status !== "Closed";

/* ── CAPAs ── */

/** A CAPA still in flight (not closed). */
export const isOpenCapa = (c: KPICapa) => c.status !== "closed";
/** Overdue — reuses the single source of truth in types/capa. */
export const isCapaOverdue = (c: KPICapa) => isOverdue({ status: c.status as CAPAStatus, dueDate: c.dueDate });
/** Open DI-gate CAPA = a Data Integrity exception. */
export const isDIException = (c: KPICapa) => Boolean(c.diGate) && c.status !== "closed";

/**
 * CAPA closed on or before its due date. `closedAt` missing → fall back to
 * dueDate (treated as on-time). Mirrors the original Governance timeliness calc.
 */
export function isCapaOnTime(c: KPICapa): boolean {
  const closed = c.closedAt || c.dueDate;
  if (!closed || !c.dueDate) return true;
  return new Date(closed).getTime() <= new Date(c.dueDate).getTime();
}

/* ── Systems ── */

/** HIGH-risk system not yet Validated — the Dashboard "CSV high risk" metric. */
export const isCsvHighRisk = (s: KPISystem) =>
  s.riskLevel === "HIGH" && s.validationStatus !== "Validated";

/** Validation drift — Overdue validation OR Part 11 / Annex 11 non-compliant. */
export const isValidationDrift = (s: KPISystem) =>
  s.validationStatus === "Overdue" ||
  s.part11Status === "Non-Compliant" ||
  s.annex11Status === "Non-Compliant";

/** Part-11 audit-trail compliant (Compliant or N/A counts as covered). */
export const isAuditTrailCompliant = (s: KPISystem) =>
  s.part11Status === "Compliant" || s.part11Status === "N/A";

/** A system that drags a site's readiness down (non-compliant OR high-risk unvalidated). */
export const isSiteRiskSystem = (s: KPISystem) =>
  s.part11Status === "Non-Compliant" ||
  s.annex11Status === "Non-Compliant" ||
  (s.riskLevel === "HIGH" && s.validationStatus !== "Validated");

/* ── Area mapping ── */

/**
 * The GxP area a CAPA belongs to: its linked finding's area, else a source-based
 * fallback. Shared so the Dashboard heatmap and Governance DI-by-area attribute
 * an unlinked CAPA to the SAME area. `findings` should be the tenant-wide set so
 * the mapping is stable regardless of viewer.
 */
export function capaArea(c: KPICapa, findings: KPIFinding[]): string {
  const linked = c.findingId ? findings.find((f) => f.id === c.findingId) : undefined;
  if (linked) return linked.area;
  if (c.source === "483") return "Regulatory";
  if (c.source === "Deviation") return "Manufacturing";
  return "QMS";
}

/** Round a ratio to a whole percentage; returns null when the denominator is 0. */
export function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}
