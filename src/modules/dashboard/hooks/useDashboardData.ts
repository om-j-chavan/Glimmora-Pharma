"use client";

/**
 * useDashboardData — assembles the ONE `DashboardDataset` every role's KPI
 * selectors and widgets read (Phases 4, 6, 7, 9).
 *
 * Responsibilities, in order:
 *   1. Narrow the server-provided arrays by tenant/site (`useTenantSitePredicate`)
 *      and by the header's site / severity / period filters.
 *   2. Run the pure `src/lib/kpi` formulas to produce every metric group.
 *   3. Derive the presentation lists (alerts, tasks, compliance).
 *
 * PERFORMANCE (Phase 9): every stage is a separate `useMemo` keyed on exactly its
 * own inputs, so changing the severity filter re-runs the finding maths WITHOUT
 * recomputing validation, regulatory or tenant metrics. The previous page rebuilt
 * its 90-day plan and its whole insight list on every render (both were un-memoised
 * IIFEs); nothing here is recomputed unless an input actually changed.
 *
 * SCOPE DISCIPLINE: tenant-wide arrays feed COUNTS, visibility-scoped arrays feed
 * ROWS. The two never cross — see `config/dataset.ts`.
 */

import { useCallback, useMemo, useState } from "react";
import { planLabel } from "@/lib/plans";
import {
  capaArea, computeAreaKPIs, computeDashboardKPIs, computeOperationsKPIs,
  computeQualityKPIs, computeRegulatoryKPIs, computeTenantKPIs, computeValidationKPIs,
  deviationSeverityTrend, headlineReadinessLabel, isDeviationTrendEmpty,
  isSeverityTrendEmpty, severityTrend,
  type KPICapa, type KPIChangeControl, type KPIDeviation, type KPIFinding,
  type KPIInspectionReadiness, type RegulatoryFDA483, type ValidationSystem,
} from "@/lib/kpi";
import { normalizeSeverityForDisplay } from "@/lib/severity";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useTenantData, useTenantSitePredicate } from "@/hooks/useTenantData";
import type { CAPA } from "@/store/capa.slice";
import type { Deviation } from "@/store/deviation.slice";
import type { Finding } from "@/store/findings.slice";
import type { GxPSystem } from "@/types/csv-csa";
import {
  buildAlerts, buildComplianceLines, buildPendingTasks,
  type CanOpen, type WorklistLike,
} from "../config/derive";
import type { DashboardDataset } from "../config";

/* ══════════════════════════════════════════════════════════════════════════
 * Inputs
 * ══════════════════════════════════════════════════════════════════════════ */

export interface DashboardFilters {
  /** Site id, or "" for all accessible sites. */
  siteId: string;
  /** Severity label from the generic taxonomy, or "" for all. */
  severity: string;
  /** Lookback in days as a string, or "all". */
  period: string;
}

export interface UseDashboardDataInput {
  /** TENANT-WIDE server rows — counted, never listed. */
  allFindings: Finding[];
  allCAPAs: CAPA[];
  allSystems: ValidationSystem[];
  allDeviations: KPIDeviation[];
  allFDA483: RegulatoryFDA483[];
  changeControls: KPIChangeControl[];
  inspections: KPIInspectionReadiness[];
  /** Server-computed headline readiness (inspection-action completion %). */
  readinessScore: number;
  /** This user's own worklist — [] shaped when absent. */
  worklist: WorklistLike | null;
  filters: DashboardFilters;
  /** The role's GxP focus area, when it owns one. */
  focusArea?: string;
  /** Permission predicate — strips links the viewer cannot follow. */
  canOpen: CanOpen;
}

/**
 * FDA ↔ generic severity bridge for the header's severity filter.
 *
 * Findings store the generic taxonomy (Critical/High/Medium/Low); deviations store
 * the FDA one (Critical/Major/Minor). Mapping High AND Medium onto "Major" mirrors
 * the app's own equivalence — `SEVERITY_BADGE_VARIANT` already renders High, Medium
 * and Major identically (amber) — so filtering stays predictable across both
 * record types instead of silently ignoring the dropdown on deviations.
 */
const GENERIC_TO_FDA: Record<string, string> = {
  Critical: "Critical",
  High: "Major",
  Medium: "Major",
  Low: "Minor",
};

/* ══════════════════════════════════════════════════════════════════════════
 * The hook
 * ══════════════════════════════════════════════════════════════════════════ */

export function useDashboardData(input: UseDashboardDataInput): DashboardDataset {
  const {
    allFindings, allCAPAs, allSystems, allDeviations, allFDA483, changeControls,
    inspections, readinessScore, worklist, filters, focusArea, canOpen,
  } = input;

  const sitePredicate = useTenantSitePredicate();
  const { org, sites: accessibleSites, users, plan, usedAccounts, maxUsers, maxSites, daysRemaining, isExpired, tenantName } =
    useTenantConfig();
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);

  /**
   * Sites the heatmap and per-site widgets RENDER, narrowed exactly as the previous
   * dashboard narrowed them: the login-selected site wins (a site-bound user sees
   * only theirs), then the header's site filter. Admins have `selectedSiteId === null`
   * and see every accessible site.
   */
  const sites = useMemo(() => {
    const scoped = selectedSiteId ? accessibleSites.filter((s) => s.id === selectedSiteId) : accessibleSites;
    return filters.siteId ? scoped.filter((s) => s.id === filters.siteId) : scoped;
  }, [accessibleSites, selectedSiteId, filters.siteId]);

  // Visibility-scoped records live in Redux (seeded by the page) — the ONLY source
  // of rendered record rows.
  const {
    findings: visibleFindings, capas: visibleCAPAs, deviations: visibleDeviations,
    systems: visibleSystems,
  } = useTenantData();

  // ONE "now", captured once per mount, so a KPI card, an alert row and a chart
  // can never disagree about what is overdue — and so none of the memos below is
  // invalidated by the clock. `useState` (not `useMemo`) because a stable value for
  // the component's lifetime is exactly what a lazy initialiser guarantees; a fresh
  // server payload remounts the page and re-anchors it.
  const [now] = useState(() => Date.now());

  /* ── Filter predicates — ONE definition each, applied to both scopes ───────
     There is deliberately NO `withinPeriod` predicate any more. The period never
     narrows a record array; it only chooses the trend charts' bucket window (see
     Scope B below and `trendBuckets` in src/lib/kpi/trend.ts). */

  const matchesSite = useCallback(
    (r: { siteId?: string | null }) => !filters.siteId || r.siteId === filters.siteId,
    [filters.siteId],
  );

  const matchesFindingSeverity = useCallback(
    (f: { severity: string }) => !filters.severity || f.severity === filters.severity,
    [filters.severity],
  );

  const matchesDeviationSeverity = useCallback(
    (d: KPIDeviation) => {
      if (!filters.severity) return true;
      const wanted = GENERIC_TO_FDA[filters.severity];
      return !wanted || normalizeSeverityForDisplay(d.severity, "fda") === wanted;
    },
    [filters.severity],
  );

  /* ══════════════════════════════════════════════════════════════════════════
   * SCOPE A — CURRENT STATE. Site (+ severity). **NEVER the period.**
   * ══════════════════════════════════════════════════════════════════════════
   * "Open", "overdue" and "critical" describe a record's state RIGHT NOW; they are
   * not events that happened inside a window. Narrowing by `createdAt` before
   * asking those questions does not shorten the window, it DELETES older records
   * from the arithmetic — so a CAPA raised in June and still overdue today simply
   * stopped existing for every count, the readiness penalty, the heatmap and the
   * compliance signals.
   *
   * With the default 30-day period that understated the seeded tenant as: 0
   * critical findings (1), 1 open finding (10), 1 open CAPA (14), 1 past due (13),
   * 0 open deviations (4), risk 32% (94%) — and it emitted the compliance signal
   * "No critical findings, critical deviations or overdue CAPAs. Maintain current
   * trajectory." while thirteen CAPAs sat past due.
   *
   * These arrays feed every KPI card, the readiness/risk model, the area heatmap,
   * the alert list and the compliance board. The period filter cannot reach them.
   */

  const findings = useMemo(
    () => allFindings.filter(sitePredicate).filter(matchesSite).filter(matchesFindingSeverity),
    [allFindings, sitePredicate, matchesSite, matchesFindingSeverity],
  );
  const capas = useMemo(
    () => allCAPAs.filter(sitePredicate).filter(matchesSite),
    [allCAPAs, sitePredicate, matchesSite],
  );
  const systems = useMemo(
    () => allSystems.filter(sitePredicate).filter(matchesSite),
    [allSystems, sitePredicate, matchesSite],
  );
  const deviations = useMemo(
    () => allDeviations.filter(sitePredicate).filter(matchesSite).filter(matchesDeviationSeverity),
    [allDeviations, sitePredicate, matchesSite, matchesDeviationSeverity],
  );
  const fda483 = useMemo(
    () => allFDA483.filter(sitePredicate).filter(matchesSite),
    [allFDA483, sitePredicate, matchesSite],
  );

  /* ══════════════════════════════════════════════════════════════════════════
   * SCOPE A′ — SEVERITY-INDEPENDENT basis for the SCORES
   * ══════════════════════════════════════════════════════════════════════════
   * Readiness, risk score and every heatmap cell are scored from these instead of
   * the severity-narrowed arrays above. Otherwise selecting "Low" in the severity
   * dropdown drops every Critical finding out of the penalty stack and an area that
   * genuinely scores 39% renders as a green "inspection ready" cell. A count may
   * answer the filter; a posture may not.
   */
  const scoredFindings = useMemo(
    () => allFindings.filter(sitePredicate).filter(matchesSite),
    [allFindings, sitePredicate, matchesSite],
  );

  /* ══════════════════════════════════════════════════════════════════════════
   * SCOPE B — PERIOD / INTAKE. Site only; the period window is applied by the
   * trend bucketing itself (`trendBuckets`), so nothing is filtered twice.
   * ══════════════════════════════════════════════════════════════════════════
   * This is the ONLY scope the period control reaches, and volume-over-time is the
   * only question a `createdAt` window can answer correctly.
   */
  const trendDeviations = useMemo(
    () => allDeviations.filter(sitePredicate).filter(matchesSite),
    [allDeviations, sitePredicate, matchesSite],
  );

  /* ── Visibility-scoped arrays: SAME predicates as Scope A, so the rows a user
       can open always agree with the counts above them (and are likewise never
       period-narrowed — an alert for a CAPA that went overdue last quarter is
       exactly the alert that must not disappear). ─────────────────────────────── */

  const scopedFindings = useMemo(
    () => visibleFindings.filter(matchesSite).filter(matchesFindingSeverity),
    [visibleFindings, matchesSite, matchesFindingSeverity],
  );
  const scopedCAPAs = useMemo(
    () => visibleCAPAs.filter(matchesSite),
    [visibleCAPAs, matchesSite],
  );
  const scopedDeviations = useMemo(
    () => visibleDeviations.filter(matchesSite).filter((d) => matchesDeviationSeverity(d as unknown as KPIDeviation)),
    [visibleDeviations, matchesSite, matchesDeviationSeverity],
  );
  const scopedSystems = useMemo(
    () => visibleSystems.filter(matchesSite),
    [visibleSystems, matchesSite],
  );

  /* ── Training records — the real evidence behind training compliance ─────
     Sourced from the ReadinessAction/TrainingRecord rows `getReadinessStats`
     already returns per active inspection. Flattened here rather than in the KPI
     library so the library stays shape-agnostic. */
  const trainingRecords = useMemo(
    () => inspections.flatMap((i) => i.trainingRecords ?? []),
    [inspections],
  );

  /* ── Metric groups — each memoised on ONLY its own inputs ────────────────── */

  const core = useMemo(
    () => computeDashboardKPIs({ findings, capas, systems }),
    [findings, capas, systems],
  );

  const quality = useMemo(
    // `readinessFindings` is the severity-INDEPENDENT set (Scope A′): the counts
    // answer the severity dropdown, the readiness/risk score must not.
    () => computeQualityKPIs({
      findings, capas, systems, deviations, trainingRecords,
      readinessFindings: scoredFindings,
    }),
    [findings, capas, systems, deviations, trainingRecords, scoredFindings],
  );

  const regulatory = useMemo(
    () => computeRegulatoryKPIs({ fda483, deviations, inspections, now }),
    [fda483, deviations, inspections, now],
  );

  const validation = useMemo(() => computeValidationKPIs(systems, now), [systems, now]);

  // Change controls carry NO site column and are a lifecycle register, so they are
  // deliberately exempt from the site and period filters — a 30-day window would
  // hide an in-flight change raised last quarter, which is exactly what an
  // Operations Head must not miss. (Empty when CHANGE_CONTROL_ENABLED is false.)
  const operations = useMemo(() => computeOperationsKPIs(changeControls, now), [changeControls, now]);

  /* ── Area metrics for the role's focus area ──────────────────────────────── */

  const kpiFindings = findings as unknown as KPIFinding[];
  const kpiCapas = capas as unknown as KPICapa[];
  /** Severity-independent findings in KPI shape — what the heatmap scores. */
  const kpiScoredFindings = scoredFindings as unknown as KPIFinding[];

  /**
   * A CAPA's GxP area, resolved through its linked finding.
   *
   * Bound to the SEVERITY-INDEPENDENT findings on purpose. `capaArea`'s own
   * contract says the index "should be the tenant-wide set so the mapping is
   * stable regardless of viewer" — binding it to a narrowed array meant a CAPA
   * whose linked finding was filtered out fell through to its source-based
   * fallback ("QMS" / "Manufacturing" / "Regulatory") and silently re-attributed
   * itself to a different heatmap row as the user changed filters.
   */
  const capaAreaOf = useCallback(
    (c: KPICapa) => capaArea(c, kpiScoredFindings),
    [kpiScoredFindings],
  );

  const area = useMemo(
    () => (focusArea
      ? computeAreaKPIs({ area: focusArea, findings: kpiFindings, capas: kpiCapas, deviations, systems, capaAreaOf })
      : null),
    [focusArea, kpiFindings, kpiCapas, deviations, systems, capaAreaOf],
  );

  /* ── Tenant health ───────────────────────────────────────────────────────── */

  const moduleCounts = useMemo(
    () => [
      { module: "gap", label: "Gap Assessment", records: findings.length, href: "/gap-assessment" },
      { module: "deviation", label: "Deviations", records: deviations.length, href: "/deviation" },
      { module: "capa", label: "CAPA", records: capas.length, href: "/capa" },
      { module: "csv", label: "CSV/CSA", records: systems.length, href: "/csv-csa" },
      { module: "fda483", label: "Inspections", records: fda483.length, href: "/fda-483" },
      { module: "readiness", label: "Readiness", records: inspections.length, href: "/readiness" },
    ],
    [findings.length, deviations.length, capas.length, systems.length, fda483.length, inspections.length],
  );

  const tenant = useMemo(
    () => computeTenantKPIs({
      users,
      // Tenant health counts EVERY accessible site, not the filtered view — the
      // licence/seat picture must not change when a manager filters the heatmap.
      activeSites: accessibleSites.length,
      seatsUsed: usedAccounts,
      seatsTotal: maxUsers,
      siteCapacity: maxSites,
      planName: plan ? planLabel(plan.tier, plan.displayName) : null,
      licenceDaysRemaining: daysRemaining,
      licenceExpired: isExpired,
      moduleCounts,
    }),
    [users, accessibleSites.length, usedAccounts, maxUsers, maxSites, plan, daysRemaining, isExpired, moduleCounts],
  );

  /* ── Chart series ────────────────────────────────────────────────────────── */

  /* The ONLY consumers of the period filter. They take the site-scoped but
     otherwise unfiltered arrays: `trendBuckets` applies the window itself, so
     pre-filtering would apply it twice and truncate the oldest bar. Bucket
     boundaries are computed in the tenant's timezone, not the browser's. */
  const findingTrend = useMemo(
    () => severityTrend(kpiScoredFindings, now, filters.period, org.timezone),
    [kpiScoredFindings, now, filters.period, org.timezone],
  );
  const deviationTrend = useMemo(
    () => deviationSeverityTrend(trendDeviations, now, filters.period, org.timezone),
    [trendDeviations, now, filters.period, org.timezone],
  );

  /* ── Derived presentation lists ──────────────────────────────────────────── */

  const alerts = useMemo(
    () => buildAlerts({
      findings: scopedFindings,
      capas: scopedCAPAs,
      deviations: scopedDeviations,
      systems: scopedSystems,
      focusArea,
      canOpen,
      now,
    }),
    [scopedFindings, scopedCAPAs, scopedDeviations, scopedSystems, focusArea, canOpen, now],
  );

  const pendingTasks = useMemo(() => buildPendingTasks(worklist, now), [worklist, now]);

  const compliance = useMemo(
    () => buildComplianceLines({
      readinessScore,
      capaOverdueRate: quality.capaOverdueRate,
      trainingCompliance: quality.training.compliance,
      criticalFindings: quality.criticalFindings,
      validationDrift: validation.drift,
      part11Gaps: validation.part11NonCompliant,
      overdueCommitments: regulatory.overdueCommitments,
      systemCount: validation.total,
      eventCount: regulatory.totalEvents,
    }),
    [readinessScore, quality, validation, regulatory],
  );

  const readinessLabel = useMemo(
    () => headlineReadinessLabel(readinessScore, quality.overdueCAPAs),
    [readinessScore, quality.overdueCAPAs],
  );

  /* ── Assemble ────────────────────────────────────────────────────────────── */

  return useMemo<DashboardDataset>(
    () => ({
      findings, capas, systems: systems as GxPSystem[], deviations, fda483,
      changeControls, inspections,
      visibleFindings: scopedFindings,
      visibleCAPAs: scopedCAPAs,
      visibleDeviations: scopedDeviations as Deviation[],
      visibleSystems: scopedSystems,
      core, quality, regulatory, validation, operations, tenant, area,
      readinessScore, readinessLabel,
      findingTrend,
      findingTrendEmpty: isSeverityTrendEmpty(findingTrend),
      deviationTrend,
      deviationTrendEmpty: isDeviationTrendEmpty(deviationTrend),
      alerts, pendingTasks, compliance,
      sites, now, tenantName,
      timezone: org.timezone,
      dateFormat: org.dateFormat,
      validationSystems: systems,
      capaAreaOf, kpiFindings, kpiCapas, kpiScoredFindings,
      period: filters.period,
    }),
    [
      findings, capas, systems, deviations, fda483, changeControls, inspections,
      scopedFindings, scopedCAPAs, scopedDeviations, scopedSystems,
      core, quality, regulatory, validation, operations, tenant, area,
      readinessScore, readinessLabel, findingTrend, deviationTrend,
      alerts, pendingTasks, compliance, kpiScoredFindings, filters.period,
      sites, now, tenantName, org.timezone, org.dateFormat,
      capaAreaOf, kpiFindings, kpiCapas,
    ],
  );
}
