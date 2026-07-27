/**
 * Governance → KPI Scorecard computations (Phase 2).
 *
 * Extracts the formulas that were inline in GovernancePage.tsx (lines 115-128,
 * 298-304). Reads the SAME `records.ts` predicates the Dashboard uses, so
 * shared metrics (DI exceptions, CAPA overdue, validation drift) match exactly.
 */

import {
  isDIException, isValidationDrift, isAuditTrailCompliant, isCapaOnTime,
  capaArea, pct,
} from "./records";
import type { KPICapa, KPIFinding, KPISystem, KPIFDA483Event } from "./types";

export interface GovernanceKPIInput {
  findings: KPIFinding[];
  capas: KPICapa[];
  systems: KPISystem[];
  /** RAW getFDA483Events rows; empty/omitted → 483 metrics are 0. */
  fda483Events?: KPIFDA483Event[];
}

export interface GovernanceKPIs {
  closedCAPAs: KPICapa[];
  /** % of closed CAPAs closed on time (0 when none closed). */
  capaTimeliness: number;
  diExceptions: number;
  /** Validation / CSV drift count. */
  csvDrift: number;
  /** 483/WL commitments past due. */
  overdueCommitments: number;
  /** Open 483 observations. */
  repeatObservationRisk: number;
  /** % Part-11-covered systems (0 when no systems). */
  auditTrailCoverage: number;
}

const isCommitmentOverdue = (c: { status: string; dueDate?: string | Date | null }) =>
  c.status !== "Complete" && c.dueDate != null && new Date(c.dueDate).getTime() < Date.now();

/** The six Governance KPI-card values from tenant-wide record arrays. */
export function computeGovernanceKPIs({
  capas, systems, fda483Events = [],
}: GovernanceKPIInput): GovernanceKPIs {
  const closedCAPAs = capas.filter((c) => c.status === "closed");
  const onTime = closedCAPAs.filter(isCapaOnTime).length;

  return {
    closedCAPAs,
    capaTimeliness: closedCAPAs.length === 0 ? 0 : Math.round((onTime / closedCAPAs.length) * 100),
    diExceptions: capas.filter(isDIException).length,
    csvDrift: systems.filter(isValidationDrift).length,
    overdueCommitments: fda483Events.reduce(
      (sum, e) => sum + e.commitments.filter(isCommitmentOverdue).length, 0),
    repeatObservationRisk: fda483Events.reduce(
      (sum, e) => sum + e.observations.filter((o) => o.status !== "Closed").length, 0),
    auditTrailCoverage: pct(systems.filter(isAuditTrailCompliant).length, systems.length) ?? 0,
  };
}

/** Systems grouped by validation status — the "Validation & CSV drift" donut. */
export function computeValidationBreakdown(systems: KPISystem[]) {
  return [
    { name: "Validated", value: systems.filter((s) => s.validationStatus === "Validated").length, color: "#10b981" },
    { name: "In Progress", value: systems.filter((s) => s.validationStatus === "In Progress").length, color: "#f59e0b" },
    { name: "Overdue", value: systems.filter((s) => s.validationStatus === "Overdue").length, color: "#ef4444" },
    { name: "Not Started", value: systems.filter((s) => s.validationStatus === "Not Started").length, color: "#64748b" },
  ].filter((d) => d.value > 0);
}

/** DI-by-area render order (matches the original Governance chart). */
const DI_AREA_ORDER = ["Manufacturing", "QC Lab", "QMS", "CSV/IT", "Warehouse", "Utilities"] as const;

/** Open DI exceptions per GxP area — the "DI exceptions by area" bar chart. */
export function computeDIByArea(capas: KPICapa[], findings: KPIFinding[], systems: KPISystem[]) {
  return DI_AREA_ORDER.map((a) => {
    const diCapas = capas.filter((c) => isDIException(c) && capaArea(c, findings) === a).length;
    const diSystems = a === "CSV/IT"
      ? systems.filter((s) => s.part11Status === "Non-Compliant" || s.annex11Status === "Non-Compliant").length
      : 0;
    return { area: a === "Manufacturing" ? "Mfg" : a, value: diCapas + diSystems };
  }).filter((d) => d.value > 0);
}
