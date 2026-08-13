/**
 * Trend series (Phase 2 + Phase 4/5).
 *
 * Pure month-bucketing helpers shared by the Dashboard observation-volume chart,
 * the Governance CAPA-timeliness chart, and the (now real, dynamic) per-site
 * readiness trend that replaces MOCK_SITE_TREND. `now` is injected so the caller
 * controls "today" (and tests are deterministic); it defaults to Date.now().
 */

import { calculateReadiness } from "./readiness";
import type { KPICapa, KPIFinding, KPISystem, KPISite } from "./types";

/** Rotating palette for per-site trend lines (brand-neutral, theme-safe). */
export const SITE_TREND_COLORS = [
  "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#6366f1",
  "#14b8a6", "#a855f7", "#ec4899", "#84cc16", "#f97316",
];

interface MonthBucket {
  key: string;   // "MMM YYYY" — matches on
  label: string; // "MMM" — axis label
  start: number;
  end: number;
}

/** Last `count` calendar months (oldest → newest) relative to `now`. */
function lastMonths(count: number, now: number): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const ref = new Date(now);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    buckets.push({ key: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, label: MONTHS[d.getMonth()], start, end });
  }
  return buckets;
}

const monthKey = (iso: string | null | undefined, MONTHS: string[]) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface SeverityTrendPoint {
  month: string;
  Critical: number;
  High: number;
  Medium: number;
  Low: number;
}

/**
 * Findings by severity per month — the Dashboard observation-volume chart.
 *
 * `months` is ADDITIVE and defaults to 6, so every existing caller is unchanged.
 * It exists so a caller with its own date window can express that window in this
 * function's vocabulary — `now` anchors the LAST bucket and `months` how many
 * buckets precede it — instead of always charting the six months up to today.
 * The dashboard's custom date range uses it (see `useDashboardData`); the
 * "Last N days" presets and every other caller still pass neither.
 *
 * Mirrors the `(records, now, months)` signature `deviationSeverityTrend`
 * (computeRoleKPIs.ts) already had, so both trend charts window the same way.
 */
export function severityTrend(
  findings: KPIFinding[],
  now: number = Date.now(),
  months = 6,
): SeverityTrendPoint[] {
  return lastMonths(months, now).map((b) => {
    const mf = findings.filter((f) => monthKey(f.createdAt, MONTHS) === b.key);
    return {
      month: b.label,
      Critical: mf.filter((f) => f.severity === "Critical").length,
      High: mf.filter((f) => f.severity === "High").length,
      Medium: mf.filter((f) => f.severity === "Medium").length,
      Low: mf.filter((f) => f.severity === "Low").length,
    };
  });
}

export const isSeverityTrendEmpty = (t: SeverityTrendPoint[]) =>
  t.every((d) => d.Critical + d.High + d.Medium + d.Low === 0);

export interface CapaTrendPoint { month: string; onTime: number; late: number }

/** On-time vs late CLOSED CAPAs per month — the Governance timeliness chart. */
export function capaTimelinessTrend(capas: KPICapa[], now: number = Date.now()): CapaTrendPoint[] {
  return lastMonths(6, now).map((b) => {
    const mc = capas.filter((c) => c.status === "closed" && monthKey(c.closedAt, MONTHS) === b.key);
    const onTime = mc.filter((c) => c.closedAt && c.dueDate && new Date(c.closedAt).getTime() <= new Date(c.dueDate).getTime()).length;
    return { month: b.label, onTime, late: mc.length - onTime };
  });
}

export const isCapaTrendEmpty = (t: CapaTrendPoint[]) =>
  t.every((d) => d.onTime === 0 && d.late === 0);

/** One rendered line per site: { id, name, color }. */
export interface SiteSeries { id: string; name: string; color: string }

export interface SiteTrendResult {
  /** Recharts data rows: { month, [siteId]: score, ... }. */
  data: Array<Record<string, number | string>>;
  /** One entry per site → drives the dynamic <Line> set + legend. */
  series: SiteSeries[];
}

/**
 * Per-site readiness over the last 6 months (Phase 4/5 — replaces the hardcoded
 * 4-site MOCK_SITE_TREND). For each month we score every site from the records
 * that EXISTED by that month's end (finding.createdAt ≤ end), using the shared
 * `calculateReadiness` model — so the trend is real data, not mock, and works
 * for any number of sites. Systems/CAPAs without a reliable creation month are
 * treated as present throughout (they rarely churn month-to-month).
 */
export function siteReadinessTrend(
  sites: KPISite[],
  findings: KPIFinding[],
  capas: KPICapa[],
  systems: KPISystem[],
  now: number = Date.now(),
): SiteTrendResult {
  const series: SiteSeries[] = sites.map((s, i) => ({
    id: s.id,
    name: s.name,
    color: SITE_TREND_COLORS[i % SITE_TREND_COLORS.length],
  }));

  const data = lastMonths(6, now).map((b) => {
    const row: Record<string, number | string> = { month: b.label };
    for (const site of sites) {
      // Findings that existed by this month's end.
      const sf = findings.filter(
        (f) => f.siteId === site.id && (!f.createdAt || new Date(f.createdAt).getTime() < b.end),
      );
      const openF = sf.filter((f) => f.status !== "Closed");
      const critical = openF.filter((f) => f.severity === "Critical").length;
      const siteCapas = capas.filter((c) => c.siteId === site.id);
      const overdue = siteCapas.filter(
        (c) => (c.status === "open" || c.status === "in_progress") && c.dueDate && new Date(c.dueDate).getTime() < b.end,
      ).length;
      const siteSystems = systems.filter((s) => s.siteId === site.id);
      const highRisk = siteSystems.filter((s) => s.riskLevel === "HIGH" && s.validationStatus !== "Validated").length;
      const validationRisk = siteSystems.filter(
        (s) => s.validationStatus === "Overdue" || s.part11Status === "Non-Compliant" || s.annex11Status === "Non-Compliant",
      ).length;
      const r = calculateReadiness({
        findings: openF.length,
        criticalFindings: critical,
        highRiskSystems: highRisk,
        capaOverdue: overdue,
        validationRisk,
      });
      row[site.id] = r.score ?? 0;
    }
    return row;
  });

  return { data, series };
}
