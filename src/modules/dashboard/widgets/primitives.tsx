"use client";

/**
 * Small presentational primitives shared by the dashboard widgets.
 *
 * These exist to kill the duplication the old 525-line page carried: the same
 * "label ⟷ value row", the same severity→colour ternary and the same
 * empty-state block were re-typed inline in five places (and drifted — the risk
 * signals block used a hardcoded 4-area list while the heatmap directly above it
 * used the 6-item `KPI_AREAS`).
 *
 * Everything here is theme-token based (`var(--text-*)`, `var(--bg-*)`) so it reads
 * correctly in both light and dark mode, and every interactive element is a real
 * <button>/<Link> with an accessible name.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { READINESS_COLORS } from "@/lib/kpi";

/* ── Period label ─────────────────────────────────────────────────────────── */

/**
 * Human name for the header's period value, for the two panels the period filter
 * actually reaches. Defined ONCE so the chart title, its empty state and the
 * header chip can never describe the same window differently.
 */
export function periodLabel(period: string): string {
  if (period === "all") return "all time";
  const days = Number.parseInt(period, 10);
  if (!Number.isFinite(days)) return "all time";
  return `last ${days} days`;
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

export function WidgetEmpty({
  icon: Icon, message, hint, action,
}: {
  icon: LucideIcon;
  message: string;
  hint?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center text-center py-5">
      <Icon className="w-8 h-8 mb-2" style={{ color: "var(--text-muted)", opacity: 0.5 }} aria-hidden="true" />
      <p className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>{message}</p>
      {hint && <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      {action && (
        <Link
          href={action.href}
          className="text-[11px] mt-2 no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--brand)"
          style={{ color: "var(--brand)" }}
        >
          {action.label} &rarr;
        </Link>
      )}
    </div>
  );
}

/* ── Metric row (label left, value right) ─────────────────────────────────── */

export function MetricRow({
  label, value, valueColor, dot, detail,
}: {
  label: string;
  value: ReactNode;
  valueColor?: string;
  /** Optional leading status dot colour. */
  dot?: string;
  detail?: string;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-2 border-b last:border-0"
      style={{ borderColor: "var(--bg-border)" }}
    >
      <div className="flex items-start gap-2 min-w-0">
        {dot && <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dot }} aria-hidden="true" />}
        <div className="min-w-0">
          <p className="text-[12px] truncate" style={{ color: "var(--text-secondary)" }}>{label}</p>
          {detail && <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{detail}</p>}
        </div>
      </div>
      <span
        className="text-[13px] font-bold shrink-0 tabular-nums"
        style={{ color: valueColor ?? "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Proportion bar ──────────────────────────────────────────────────────── */

export function ProportionBar({
  label, value, max, color = "#0ea5e9",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  // A zero row is drawn as a short NEUTRAL stub rather than a 0%-width bar: an
  // invisible track reads as a rendering failure, and a coloured sliver would
  // imply a non-zero signal. The muted number says the same thing twice, for a
  // reader who is scanning colour rather than digits.
  const empty = value === 0;
  return (
    <div className="mb-2" title={`${label}: ${value}`}>
      <div className="flex justify-between mb-1 gap-2">
        <span className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span
          className="text-[11px] font-medium tabular-nums"
          style={{ color: empty ? "var(--text-muted)" : "var(--text-primary)" }}
        >
          {value}
        </span>
      </div>
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: "var(--bg-border)" }}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className="h-full rounded-full"
          style={empty ? { width: 6, background: "var(--text-muted)" } : { width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* ── Navigable list row ──────────────────────────────────────────────────── */

/**
 * One clickable row. Renders as a <Link> when `href` is set and as a plain,
 * non-interactive <div> when it is not — which is exactly how a permission-stripped
 * row degrades: the information stays, the navigation goes, and no dead button is
 * left behind for a keyboard user to land on.
 */
export function ListRow({
  icon: Icon, iconColor, title, subtitle, meta, href, badge, ariaLabel,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  href?: string | null;
  badge?: ReactNode;
  ariaLabel?: string;
}) {
  const body = (
    <>
      {Icon && (
        <Icon
          className="w-3.5 h-3.5 shrink-0 mt-0.5"
          style={{ color: iconColor ?? "var(--text-muted)" }}
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{title}</p>
        {subtitle && <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>}
        {meta && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{meta}</div>}
      </div>
      {badge}
    </>
  );

  const base = "w-full flex items-start gap-2 p-2 rounded-lg text-left transition-colors";

  if (!href) {
    return <div className={base}>{body}</div>;
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel ?? title}
      className={`${base} no-underline hover:bg-(--brand-muted) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--brand)`}
    >
      {body}
    </Link>
  );
}

/* ── Count badge ─────────────────────────────────────────────────────────── */

export function CountBadge({ count, color }: { count: number; color?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0 tabular-nums"
      style={{ background: color ?? READINESS_COLORS.risk }}
      aria-label={`${count} outstanding`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* ── Status pip (compliance board) ───────────────────────────────────────── */

const STATE_COLOR = {
  ok: READINESS_COLORS.ready,
  watch: READINESS_COLORS.watch,
  risk: READINESS_COLORS.risk,
  none: READINESS_COLORS.none,
} as const;

export const stateColor = (state: keyof typeof STATE_COLOR) => STATE_COLOR[state];

/* ── Chart loading skeleton (Phase 9 lazy widgets) ───────────────────────── */

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-lg animate-pulse"
      style={{ height, background: "var(--bg-border)", opacity: 0.4 }}
      aria-hidden="true"
    />
  );
}
