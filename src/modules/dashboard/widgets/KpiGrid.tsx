"use client";

/**
 * KPI row — renders the role's RESOLVED KPI cards (Phase 4 + Phase 8).
 *
 * The list arriving here has already passed the resolver, so:
 *   • a card whose module is revoked is absent, and
 *   • a card whose deep-link target the viewer cannot open has had its `href`
 *     stripped, rendering as a plain stat instead of a link into a redirect.
 *
 * The grid column count ADAPTS to how many cards a role actually has (4, 5 or 6)
 * so no role ever gets a ragged trailing gap — the previous fixed
 * `lg:grid-cols-5` assumed every role had exactly five.
 */

import { memo } from "react";
import { StatCard } from "@/components/shared";
import type { DashboardWidgetProps } from "./types";

/** Explicit class strings (not interpolated) so Tailwind's scanner keeps them. */
const COLS: Record<number, string> = {
  1: "sm:grid-cols-1 lg:grid-cols-1",
  2: "sm:grid-cols-2 lg:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  // 6 wraps to two clean rows of three rather than six cramped columns.
  6: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3",
  7: "sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4",
};

export const KpiGrid = memo(function KpiGrid({ data, dashboard }: DashboardWidgetProps) {
  if (dashboard.kpis.length === 0) return null;
  const cols = COLS[dashboard.kpis.length] ?? COLS[5];

  return (
    <section
      aria-label="Key performance indicators"
      // Same gap tokens as the widget grid below it, so the page has ONE rhythm.
      className={`grid grid-cols-1 ${cols} gap-4 lg:gap-6`}
    >
      {dashboard.kpis.map((kpi) => {
        const { value, sub, color } = kpi.select(data);
        return (
          <StatCard
            key={kpi.key}
            icon={kpi.icon}
            color={color}
            label={kpi.label}
            value={value}
            sub={sub}
            href={kpi.href}
          />
        );
      })}
    </section>
  );
});
