/**
 * Dashboard KPI computations (Phase 2).
 *
 * Extracts every KPI formula that was inline in DashboardPage.tsx so the page
 * only wires data in and renders. Governance imports the SAME `records.ts`
 * predicates, so a count shown on the Dashboard is computed identically to its
 * Governance twin.
 */

import {
  isOpenCapa, isCapaOverdue, isCriticalOpen, isCsvHighRisk, isOpenFinding,
  isValidationDrift, capaArea, pct,
} from "./records";
import { calculateReadiness, type ReadinessResult } from "./readiness";
import type { KPICapa, KPIFinding, KPISystem } from "./types";

export interface DashboardKPIInput {
  findings: KPIFinding[];
  capas: KPICapa[];
  systems: KPISystem[];
  /** total configured users + active count — the training-compliance proxy. */
  totalUsers?: number;
  activeUsers?: number;
}

export interface DashboardKPIs {
  openCAPAs: KPICapa[];
  overdueCAPAs: KPICapa[];
  criticalCount: number;
  /** % of open CAPAs that are overdue, or null when there are none. */
  capaOverdueRate: number | null;
  csvHighRisk: number;
  /** % active users, or null when no users — the training proxy. */
  trainingCompliance: number | null;
}

/** The five Dashboard KPI-card values, all from tenant-wide record arrays. */
export function computeDashboardKPIs({
  findings, capas, systems, totalUsers = 0, activeUsers = 0,
}: DashboardKPIInput): DashboardKPIs {
  const openCAPAs = capas.filter(isOpenCapa);
  const overdueCAPAs = capas.filter(isCapaOverdue);
  return {
    openCAPAs,
    overdueCAPAs,
    criticalCount: findings.filter(isCriticalOpen).length,
    capaOverdueRate: pct(overdueCAPAs.length, openCAPAs.length),
    csvHighRisk: systems.filter(isCsvHighRisk).length,
    trainingCompliance: pct(activeUsers, totalUsers),
  };
}

export interface AreaScore extends ReadinessResult {
  open: number;
  critical: number;
  hasData: boolean;
}

/**
 * Readiness for one AREA at one site (or all sites when `siteId` omitted).
 * Drives the Dashboard "Area readiness heatmap". Uses the shared
 * `calculateReadiness` model with area-scoped counts, so an area's cell and a
 * whole site's Governance score are computed the same way.
 *
 * `findings/capas/systems` must be the tenant-wide (optionally filter-narrowed)
 * arrays. `hasData` is false when nothing has been logged for the area+site, so
 * the cell renders "not assessed" instead of a misleading 100%.
 */
export function computeAreaScore(
  area: string,
  siteId: string | undefined,
  data: { findings: KPIFinding[]; capas: KPICapa[]; systems: KPISystem[] },
): AreaScore {
  const atSite = (id?: string | null) => !siteId || id === siteId;
  const inArea = (c: KPICapa) => capaArea(c, data.findings) === area;

  const areaFindings = data.findings.filter((f) => f.area === area && atSite(f.siteId));
  const openAreaFindings = areaFindings.filter(isOpenFinding);
  const critical = openAreaFindings.filter((f) => f.severity === "Critical").length;

  const areaCapaOverdue = data.capas.filter((c) => atSite(c.siteId) && inArea(c) && isCapaOverdue(c)).length;
  const highRiskSystems = area === "CSV/IT"
    ? data.systems.filter((s) => atSite(s.siteId) && isCsvHighRisk(s)).length
    : 0;
  const validationRisk = area === "CSV/IT"
    ? data.systems.filter((s) => atSite(s.siteId) && isValidationDrift(s)).length
    : 0;

  // "Has data" = anything logged for this area+site; otherwise "not assessed".
  const totalAreaCapas = data.capas.filter((c) => atSite(c.siteId) && inArea(c)).length;
  const totalAreaSystems = area === "CSV/IT" ? data.systems.filter((s) => atSite(s.siteId)).length : 0;
  const hasData = areaFindings.length + totalAreaCapas + totalAreaSystems > 0;

  const readiness = calculateReadiness(
    {
      findings: openAreaFindings.length,
      criticalFindings: critical,
      highRiskSystems,
      capaOverdue: areaCapaOverdue,
      validationRisk,
    },
    { hasData },
  );

  return { ...readiness, open: openAreaFindings.length, critical, hasData };
}
