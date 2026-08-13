"use client";

/**
 * Deviation volume & severity — 6-month trend on the FDA taxonomy the Deviation
 * table actually stores (Critical / Major / Minor).
 *
 * NEW for the role dashboards: QA Head, QC Lab Director, Operations Head and QA all
 * lead with deviation volume, which the previous single dashboard never charted at
 * all. When the role owns an area, the panel also shows that area's live
 * deviation-category mix — the "which cluster is driving this" question, answered
 * from `Deviation.category`.
 */

import { memo } from "react";
import { AlertTriangle, BarChart3 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { chartDefaults } from "@/lib/chartColors";
import { CardSection } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { ProportionBar, WidgetEmpty } from "./primitives";
import type { DashboardWidgetProps } from "./types";

const FDA_FILL = { Critical: "#ef4444", Major: "#f59e0b", Minor: "#10b981" } as const;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const DeviationTrendWidget = memo(function DeviationTrendWidget({
  data, dashboard,
}: DashboardWidgetProps) {
  const categories = data.area?.byCategory ?? [];
  const maxCategory = categories.length > 0 ? categories[0].count : 0;

  return (
    <CardSection
      icon={AlertTriangle}
      iconColor="#f59e0b"
      title={dashboard.focusArea ? `${dashboard.focusArea} deviation trend` : "Deviation volume & severity"}
      // Fill the card: a flex column body lets the chart take the remaining
      // height instead of sitting at a fixed height with dead space beneath.
      bodyClassName="flex flex-col h-full"
      badge={
        data.quality.openDeviations > 0
          ? <Badge variant="amber">{data.quality.openDeviations} open</Badge>
          : undefined
      }
    >
      {data.deviationTrendEmpty ? (
        <WidgetEmpty icon={BarChart3} message="No deviations reported in this period" hint="Adjust the period filter or report a deviation." />
      ) : (
        // `flex-1` takes whatever height is left after the category block below,
        // replacing the former fixed 200px that left dead space when the grid's
        // `items-stretch` made this card taller. `min-h-48` floors it so the bars
        // stay legible in a short card. ResponsiveContainer then has a definite
        // box to measure, so height="100%" resolves. The card-body's own
        // max-h-[26rem] cap still bounds the whole card, so it can never outgrow
        // its neighbours. Data, series, colours, legend and tooltips: untouched.
        <div className="flex-1 min-h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.deviationTrend} barSize={14} barGap={2}>
            <CartesianGrid {...chartDefaults.cartesianGrid} />
            <XAxis dataKey="month" {...chartDefaults.xAxis} />
            <YAxis {...chartDefaults.yAxis} allowDecimals={false} />
            <Tooltip {...chartDefaults.tooltip} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v: string) => <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{v}</span>}
            />
            <Bar dataKey="Critical" name="Critical" fill={FDA_FILL.Critical} stackId="a" />
            <Bar dataKey="Major" name="Major" fill={FDA_FILL.Major} stackId="a" />
            <Bar dataKey="Minor" name="Minor" fill={FDA_FILL.Minor} stackId="a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {categories.length > 0 && (
        <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Open {data.area?.area} deviations by category
          </p>
          {categories.slice(0, 5).map((c) => (
            <ProportionBar key={c.category} label={titleCase(c.category)} value={c.count} max={maxCategory} color="#f59e0b" />
          ))}
        </div>
      )}
    </CardSection>
  );
});
