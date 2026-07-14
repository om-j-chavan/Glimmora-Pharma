/**
 * Per-site KPI computation (Phase 4 — replaces MOCK_SITE_KPIS).
 *
 * Produces one `SiteKPI` per real tenant site from tenant-wide records, so the
 * Governance multi-site comparison / ranking / site heatmap render for ANY
 * number of sites (1, 5, 20+) with no hardcoded site names. Site readiness uses
 * the SAME `calculateReadiness` model as the Dashboard heatmap.
 */

import {
  isOpenFinding, isOpenCapa, isCapaOverdue, isDIException, isCapaOnTime,
  isAuditTrailCompliant, isValidationDrift,
} from "./records";
import { calculateReadiness, readinessRiskLevel } from "./readiness";
import type { KPICapa, KPIFinding, KPISystem, KPIFDA483Event, KPISite, SiteKPI } from "./types";

export interface SiteKPIInput {
  sites: KPISite[];
  findings: KPIFinding[];
  capas: KPICapa[];
  systems: KPISystem[];
  fda483Events?: KPIFDA483Event[];
  /** open deviations per site, keyed by siteId (optional). */
  deviationsBySite?: Record<string, number>;
}

/**
 * Which site a CAPA belongs to: its own `siteId`, else its linked finding's.
 * Keeps CAPAs without a direct siteId attributed to the right site.
 */
function capaSiteId(c: KPICapa, findings: KPIFinding[]): string | null {
  if (c.siteId) return c.siteId;
  const lf = c.findingId ? findings.find((f) => f.id === c.findingId) : undefined;
  return lf?.siteId ?? null;
}

/** One SiteKPI per site — the contract KPIScorecardTab renders. */
export function computeSiteKPIs({
  sites, findings, capas, systems, fda483Events = [], deviationsBySite = {},
}: SiteKPIInput): SiteKPI[] {
  return sites.map((site) => {
    const siteFindings = findings.filter((f) => f.siteId === site.id);
    const openFindings = siteFindings.filter(isOpenFinding);
    const criticalFindings = openFindings.filter((f) => f.severity === "Critical").length;

    const siteCapas = capas.filter((c) => capaSiteId(c, findings) === site.id);
    const openCAPAs = siteCapas.filter(isOpenCapa);
    const overdueCAPAs = siteCapas.filter(isCapaOverdue).length;
    const diExceptions = siteCapas.filter(isDIException).length;
    const closedCAPAs = siteCapas.filter((c) => c.status === "closed");
    const onTime = closedCAPAs.filter(isCapaOnTime).length;
    const capaTimeliness = closedCAPAs.length === 0 ? 0 : Math.round((onTime / closedCAPAs.length) * 100);

    const siteSystems = systems.filter((s) => s.siteId === site.id);
    const systemsValidated = siteSystems.filter((s) => s.validationStatus === "Validated").length;
    const highRiskSystems = siteSystems.filter((s) => s.riskLevel === "HIGH" && s.validationStatus !== "Validated").length;
    const validationRisk = siteSystems.filter(isValidationDrift).length;
    const auditTrailCoverage = siteSystems.length === 0
      ? 0
      : Math.round((siteSystems.filter(isAuditTrailCompliant).length / siteSystems.length) * 100);

    const activeFDA483 = fda483Events.filter((e) => e.siteId === site.id && e.status !== "Closed").length;

    const readiness = calculateReadiness({
      findings: openFindings.length,
      criticalFindings,
      highRiskSystems,
      capaOverdue: overdueCAPAs,
      validationRisk,
      diExceptions,
    });
    const score = readiness.score ?? 0;

    return {
      siteId: site.id,
      siteName: site.name,
      riskLevel: readinessRiskLevel(score),
      readinessScore: score,
      openFindings: openFindings.length,
      criticalFindings,
      openCAPAs: openCAPAs.length,
      overdueCAPAs,
      activeFDA483,
      systemsValidated,
      systemsTotal: siteSystems.length,
      diExceptions,
      openDeviations: deviationsBySite[site.id] ?? 0,
      inspectionReadiness: score,
      capaTimeliness,
      auditTrailCoverage,
    } satisfies SiteKPI;
  });
}

/**
 * Lightweight per-site readiness rows for the Governance "Site readiness
 * heatmap" (a subset of SiteKPI). Kept separate so the heatmap doesn't force
 * the full multi-site KPI computation when only the score is needed.
 */
export interface SiteReadinessRow {
  site: KPISite;
  findingsCount: number;
  capasCount: number;
  criticalCount: number;
  score: number;
}

export function computeSiteReadiness(input: SiteKPIInput): SiteReadinessRow[] {
  return computeSiteKPIs(input).map((k) => ({
    site: { id: k.siteId, name: k.siteName },
    findingsCount: k.openFindings,
    capasCount: k.openCAPAs,
    criticalCount: k.criticalFindings,
    score: k.readinessScore,
  }));
}
