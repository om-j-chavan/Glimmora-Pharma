"use client";

/**
 * Observation volume & severity — 6-month finding trend.
 *
 * Behaviour preserved from the original inline chart. Two fixes:
 *   • Medium no longer shares Critical's/High's colour by accident — each severity
 *     gets its own band so a stacked bar is actually readable (the old chart drew
 *     High and Medium in the identical amber, making the middle segment invisible).
 *   • Loaded lazily by the registry, so a role whose dashboard has no chart never
 *     downloads Recharts.
 */

import { memo } from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { chartDefaults } from "@/lib/chartColors";
import { CardSection } from "@/components/shared";
import { WidgetEmpty } from "./primitives";
import type { DashboardWidgetProps } from "./types";

/** Severity → fill. Distinct hues so every stacked segment is distinguishable. */
const SEVERITY_FILL = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#f59e0b",
  Low: "#10b981",
} as const;

export const FindingTrendWidget = memo(function FindingTrendWidget({ data }: DashboardWidgetProps) {
  return (
    <CardSection icon={TrendingUp} iconColor="#6366f1" title="Observation volume & severity">
      {data.findingTrendEmpty ? (
        <WidgetEmpty icon={BarChart3} message="No findings logged in this period" hint="Adjust the period filter or log a gap finding." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.findingTrend} barSize={14} barGap={2}>
            <CartesianGrid {...chartDefaults.cartesianGrid} />
            <XAxis dataKey="month" {...chartDefaults.xAxis} />
            <YAxis {...chartDefaults.yAxis} allowDecimals={false} />
            <Tooltip {...chartDefaults.tooltip} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v: string) => <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{v}</span>}
            />
            <Bar dataKey="Critical" name="Critical" fill={SEVERITY_FILL.Critical} stackId="a" />
            <Bar dataKey="High" name="High" fill={SEVERITY_FILL.High} stackId="a" />
            <Bar dataKey="Medium" name="Medium" fill={SEVERITY_FILL.Medium} stackId="a" />
            <Bar dataKey="Low" name="Low" fill={SEVERITY_FILL.Low} stackId="a" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </CardSection>
  );
});
