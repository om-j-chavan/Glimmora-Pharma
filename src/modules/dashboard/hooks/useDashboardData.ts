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
import dayjs from "@/lib/dayjs";
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
  /** Lookback in days as a string, "all", or "custom" (then `from`/`to` apply). */
  period: string;
  /**
   * Custom-range start, "YYYY-MM-DD". Read ONLY when `period === "custom"`.
   * An incomplete or reversed range (missing end, from > to) is treated as NO
   * period filter rather than as an empty result — a half-picked range must not
   * blank the dashboard while the user is still choosing the second date.
   */
  from?: string;
  /** Custom-range end, "YYYY-MM-DD" — INCLUSIVE (expanded to end-of-day). */
  to?: string;
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

  /**
   * The period expressed as a WINDOW rather than a single lower bound, so the
   * presets and the custom range share one representation:
   *
   *   "7"/"30"/"60"/"90"  → { from: N days ago, to: null }  ← open-ended, as before
   *   "all"               → { from: null, to: null }        ← unbounded, as before
   *   "custom"            → { from: start-of-day, to: end-of-day }
   *
   * A `null` bound means "unbounded on that side". The preset arm keeps the
   * original local-time `dayjs().subtract(...)` expression verbatim, so preset
   * behaviour is byte-for-byte what it was.
   */
  const periodWindow = useMemo<{ from: dayjs.Dayjs | null; to: dayjs.Dayjs | null }>(() => {
    if (filters.period === "all") return { from: null, to: null };

    if (filters.period === "custom") {
      const from = filters.from ? dayjs.utc(`${filters.from}T00:00:00.000Z`) : null;
      const to = filters.to ? dayjs.utc(`${filters.to}T23:59:59.999Z`) : null;
      // Incomplete or reversed → no filter. Never throws, never blanks the page.
      if (!from || !to || !from.isValid() || !to.isValid() || from.isAfter(to)) {
        return { from: null, to: null };
      }
      return { from, to };
    }

    const days = parseInt(filters.period, 10);
    if (!Number.isFinite(days)) return { from: null, to: null };
    return { from: dayjs().subtract(days, "day"), to: null };
  }, [filters.period, filters.from, filters.to]);

  /* ── Filter predicates — ONE definition each, applied to both scopes ─────── */

  const withinPeriod = useCallback(
    (createdAt: string | Date | null | undefined) => {
      const { from, to } = periodWindow;
      if ((!from && !to) || !createdAt) return true;
      const at = dayjs.utc(createdAt instanceof Date ? createdAt.toISOString() : createdAt);
      if (from && at.isBefore(from)) return false;
      // `to` is already end-of-day, so the closing date is INCLUSIVE.
      if (to && at.isAfter(to)) return false;
      return true;
    },
    [periodWindow],
  );

  const matchesFindingFilters = useCallback(
    (f: { siteId?: string | null; severity: string; createdAt?: string | null }) => {
      if (filters.siteId && f.siteId !== filters.siteId) return false;
      if (filters.severity && f.severity !== filters.severity) return false;
      return withinPeriod(f.createdAt);
    },
    [filters.siteId, filters.severity, withinPeriod],
  );

  const matchesCAPAFilters = useCallback(
    (c: { siteId?: string | null; createdAt?: string | null }) => {
      if (filters.siteId && c.siteId !== filters.siteId) return false;
      return withinPeriod(c.createdAt);
    },
    [filters.siteId, withinPeriod],
  );

  const matchesSystemFilters = useCallback(
    (s: { siteId?: string | null }) => !filters.siteId || s.siteId === filters.siteId,
    [filters.siteId],
  );

  const matchesDeviationFilters = useCallback(
    (d: KPIDeviation) => {
      if (filters.siteId && d.siteId !== filters.siteId) return false;
      if (filters.severity) {
        const wanted = GENERIC_TO_FDA[filters.severity];
        if (wanted && normalizeSeverityForDisplay(d.severity, "fda") !== wanted) return false;
      }
      return withinPeriod(d.createdAt);
    },
    [filters.siteId, filters.severity, withinPeriod],
  );

  /* ── Tenant-wide arrays: site-narrow, then filter ────────────────────────── */

  const findings = useMemo(
    () => allFindings.filter(sitePredicate).filter(matchesFindingFilters),
    [allFindings, sitePredicate, matchesFindingFilters],
  );
  const capas = useMemo(
    () => allCAPAs.filter(sitePredicate).filter(matchesCAPAFilters),
    [allCAPAs, sitePredicate, matchesCAPAFilters],
  );
  const systems = useMemo(
    () => allSystems.filter(sitePredicate).filter(matchesSystemFilters),
    [allSystems, sitePredicate, matchesSystemFilters],
  );
  const deviations = useMemo(
    () => allDeviations.filter(sitePredicate).filter(matchesDeviationFilters),
    [allDeviations, sitePredicate, matchesDeviationFilters],
  );
  const fda483 = useMemo(
    () => allFDA483.filter(sitePredicate),
    [allFDA483, sitePredicate],
  );

  /* ── Visibility-scoped arrays: same filters, so rows and counts agree ───── */

  const scopedFindings = useMemo(
    () => visibleFindings.filter(matchesFindingFilters),
    [visibleFindings, matchesFindingFilters],
  );
  const scopedCAPAs = useMemo(
    () => visibleCAPAs.filter(matchesCAPAFilters),
    [visibleCAPAs, matchesCAPAFilters],
  );
  const scopedDeviations = useMemo(
    () => visibleDeviations.filter((d) => matchesDeviationFilters(d as unknown as KPIDeviation)),
    [visibleDeviations, matchesDeviationFilters],
  );
  const scopedSystems = useMemo(
    () => visibleSystems.filter(matchesSystemFilters),
    [visibleSystems, matchesSystemFilters],
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
    () => computeQualityKPIs({ findings, capas, systems, deviations, trainingRecords }),
    [findings, capas, systems, deviations, trainingRecords],
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

  const capaAreaOf = useCallback(
    (c: KPICapa) => capaArea(c, kpiFindings),
    [kpiFindings],
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

  /**
   * Trend anchoring for the CUSTOM range.
   *
   * Both trend builders take `(records, now, months)` and chart the `months`
   * calendar months ENDING at `now`. With a preset they chart the six months up
   * to today, which is right — a preset is a rolling lookback from today. With a
   * custom range that would be wrong: pick April–May and the chart still draws
   * six months, four of them guaranteed empty because the arrays feeding it were
   * already filtered to the range.
   *
   * So for a custom range we re-anchor: `now` moves to the END month and `months`
   * becomes the number of calendar months the range spans. The bars are then
   * exactly the range's months. The day-level precision is already handled — the
   * arrays arrive filtered by `withinPeriod`, so an edge month contains only the
   * in-range days of that month.
   *
   * Span is derived from the raw "YYYY-MM-DD" strings and anchored via a LOCAL
   * `Date`, because both builders bucket with local `getFullYear()`/`getMonth()`.
   * Capped at 24 buckets so a multi-year range cannot render an unreadable chart.
   * `null` → preset/all behaviour, i.e. neither argument is passed at all.
   */
  const trendAnchor = useMemo<{ now: number; months: number } | null>(() => {
    if (filters.period !== "custom" || !periodWindow.from || !periodWindow.to) return null;
    const [fy, fm] = (filters.from ?? "").split("-").map(Number);
    const [ty, tm] = (filters.to ?? "").split("-").map(Number);
    if (!fy || !fm || !ty || !tm) return null;
    const span = (ty - fy) * 12 + (tm - fm) + 1;
    return {
      now: new Date(ty, tm - 1, 1).getTime(),
      months: Math.min(Math.max(span, 1), 24),
    };
  }, [filters.period, filters.from, filters.to, periodWindow]);

  const findingTrend = useMemo(
    () => (trendAnchor
      ? severityTrend(kpiFindings, trendAnchor.now, trendAnchor.months)
      : severityTrend(kpiFindings, now)),
    [kpiFindings, now, trendAnchor],
  );
  const deviationTrend = useMemo(
    () => (trendAnchor
      ? deviationSeverityTrend(deviations, trendAnchor.now, trendAnchor.months)
      : deviationSeverityTrend(deviations, now)),
    [deviations, now, trendAnchor],
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
      capaAreaOf, kpiFindings, kpiCapas,
    }),
    [
      findings, capas, systems, deviations, fda483, changeControls, inspections,
      scopedFindings, scopedCAPAs, scopedDeviations, scopedSystems,
      core, quality, regulatory, validation, operations, tenant, area,
      readinessScore, readinessLabel, findingTrend, deviationTrend,
      alerts, pendingTasks, compliance,
      sites, now, tenantName, org.timezone, org.dateFormat,
      capaAreaOf, kpiFindings, kpiCapas,
    ],
  );
}
