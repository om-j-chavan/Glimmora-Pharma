/**
 * Trend series (Phase 2 + Phase 4/5).
 *
 * Pure month-bucketing helpers shared by the Dashboard observation-volume chart,
 * the Governance CAPA-timeliness chart, and the (now real, dynamic) per-site
 * readiness trend that replaces MOCK_SITE_TREND. `now` is injected so the caller
 * controls "today" (and tests are deterministic); it defaults to Date.now().
 */

import dayjs from "@/lib/dayjs";
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

/* ══════════════════════════════════════════════════════════════════════════
 * PERIOD-AWARE BUCKETING — the trend charts' x-axis
 * ══════════════════════════════════════════════════════════════════════════
 * The trend charts used to ALWAYS draw six calendar months while being handed
 * arrays that the header's period filter had already narrowed to (by default)
 * thirty days. Five of the six bars were therefore structurally zero and the
 * deviation chart rendered its "nothing reported in this period" empty state over
 * a tenant with real deviations.
 *
 * The window is now derived from the period itself, so the axis and the data
 * always describe the same span, and the charts no longer need pre-filtered input
 * — the buckets ARE the filter. Granularity follows the span so a short window
 * still gets a readable number of bars:
 *
 *   ≤ 7 days   → one bar per DAY
 *   ≤ 31 days  → one bar per WEEK
 *   > 31 days  → one bar per calendar MONTH, spanning the window
 *   "all"      → six calendar months (the previous default)
 *
 * Boundaries are computed in the TENANT'S timezone, not the browser's. Every
 * other date on the dashboard renders as `dayjs.utc(x).tz(org.timezone)`, so
 * bucketing on browser-local midnight was an off-by-one waiting to happen: a
 * record stamped 20:00 UTC on the 31st belongs to the 1st in Asia/Kolkata and was
 * being charted a day — and at a month boundary, a bar — early.
 */

export interface TrendBucket {
  /** Axis label — "5 Aug" for day/week buckets, "Aug" for month buckets. */
  label: string;
  /** Inclusive start, epoch ms. */
  start: number;
  /** EXCLUSIVE end, epoch ms. */
  end: number;
}

const DAY_MS = 86_400_000;

/**
 * The buckets a given period maps to. `period` is the header filter's value:
 * a day count as a string ("7" | "30" | "60" | "90") or "all".
 */
export function trendBuckets(
  period: string,
  now: number = Date.now(),
  timezone = "UTC",
): TrendBucket[] {
  const days = period === "all" ? null : Number.parseInt(period, 10);

  // "all" (or an unparseable period) keeps the original six-month view.
  if (days === null || !Number.isFinite(days) || days <= 0) return monthBuckets(6, now, timezone);

  // Tomorrow's midnight IN THE TENANT'S ZONE, so today is a complete bucket.
  const endOfToday = dayjs(now).tz(timezone).endOf("day").valueOf() + 1;

  if (days <= 7) {
    const out: TrendBucket[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const end = endOfToday - i * DAY_MS;
      const start = end - DAY_MS;
      out.push({ label: dayjs(start).tz(timezone).format("D MMM"), start, end });
    }
    return out;
  }

  if (days <= 31) {
    const weeks = Math.ceil(days / 7);
    const out: TrendBucket[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const end = endOfToday - i * 7 * DAY_MS;
      const start = end - 7 * DAY_MS;
      out.push({ label: dayjs(start).tz(timezone).format("D MMM"), start, end });
    }
    return out;
  }

  // Longer spans read better as calendar months. Count how many the window covers.
  const first = dayjs(now - days * DAY_MS).tz(timezone);
  const last = dayjs(now).tz(timezone);
  const span = (last.year() - first.year()) * 12 + (last.month() - first.month()) + 1;
  return monthBuckets(Math.max(2, Math.min(12, span)), now, timezone);
}

/** `count` calendar months ending with the one containing `now`, oldest first. */
function monthBuckets(count: number, now: number, timezone: string): TrendBucket[] {
  const out: TrendBucket[] = [];
  const ref = dayjs(now).tz(timezone).startOf("month");
  for (let i = count - 1; i >= 0; i--) {
    const start = ref.subtract(i, "month");
    out.push({
      label: start.format("MMM"),
      start: start.valueOf(),
      end: start.add(1, "month").valueOf(),
    });
  }
  return out;
}

/** True when `iso` falls inside `[bucket.start, bucket.end)`. */
export function inBucket(iso: string | Date | null | undefined, bucket: TrendBucket): boolean {
  if (!iso) return false;
  const t = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  return !Number.isNaN(t) && t >= bucket.start && t < bucket.end;
}

export interface SeverityTrendPoint {
  /** Axis label. Named `bucket` (not `month`) since a bucket may be a day or week. */
  bucket: string;
  Critical: number;
  High: number;
  Medium: number;
  Low: number;
}

/**
 * Findings by severity per bucket — the Dashboard observation-volume chart.
 *
 * Pass the SITE-SCOPED but otherwise UNFILTERED findings: the buckets apply the
 * period window themselves, so pre-filtering would double-apply it and truncate
 * the oldest bar.
 */
export function severityTrend(
  findings: KPIFinding[],
  now: number = Date.now(),
  period = "all",
  timezone = "UTC",
): SeverityTrendPoint[] {
  return trendBuckets(period, now, timezone).map((b) => {
    const mf = findings.filter((f) => inBucket(f.createdAt, b));
    return {
      bucket: b.label,
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
