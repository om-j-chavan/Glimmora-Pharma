"use client";

/**
 * Change-control status — Operations Head.
 *
 * FLAG-GATED. `CHANGE_CONTROL_ENABLED` is currently `false` and the
 * `/change-control` route redirects to `/`, so the registry only mounts this widget
 * when the flag is on — and the config's `changeControlGuard` drops the matching KPI
 * and quick action at the same time. That is what keeps "no broken navigation" true
 * today AND makes the panel light up with no config edit the moment the module ships.
 *
 * Reads real `ChangeControl` columns only: `status`, `risk`, `changeType`,
 * `targetImplementationDate`.
 */

import { memo } from "react";
import { GitCompareArrows } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { chartDefaults } from "@/lib/chartColors";
import { READINESS_COLORS } from "@/lib/kpi";
import { CardSection } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { MetricRow, WidgetEmpty } from "./primitives";
import type { DashboardWidgetProps } from "./types";

/** Lifecycle stage → bar colour: in-flight amber, terminal green, rejected grey. */
const STATUS_FILL: Record<string, string> = {
  Draft: READINESS_COLORS.none,
  "In Review": "#0ea5e9",
  Approved: "#6366f1",
  "In Implementation": READINESS_COLORS.watch,
  Implemented: READINESS_COLORS.ready,
  Closed: READINESS_COLORS.ready,
  Rejected: READINESS_COLORS.none,
};

export const ChangeControlWidget = memo(function ChangeControlWidget({ data }: DashboardWidgetProps) {
  const o = data.operations;
  const total = data.changeControls.length;

  return (
    <CardSection
      icon={GitCompareArrows}
      iconColor="#6366f1"
      title="Change control status"
      badge={
        o.changeControlsOverdue > 0
          ? <Badge variant="red">{o.changeControlsOverdue} overdue</Badge>
          : o.changeControlsOpen > 0
            ? <Badge variant="amber">{o.changeControlsOpen} in flight</Badge>
            : undefined
      }
    >
      {total === 0 ? (
        <WidgetEmpty
          icon={GitCompareArrows}
          message="No change controls raised"
          hint="Controlled changes appear here once raised with an impact assessment."
        />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={o.byStatus} barSize={22}>
              <CartesianGrid {...chartDefaults.cartesianGrid} />
              <XAxis dataKey="status" {...chartDefaults.xAxis} interval={0} angle={-20} textAnchor="end" height={48} />
              <YAxis {...chartDefaults.yAxis} allowDecimals={false} />
              <Tooltip {...chartDefaults.tooltip} />
              <Bar dataKey="count" name="Changes" radius={[3, 3, 0, 0]}>
                {o.byStatus.map((b) => (
                  <Cell key={b.status} fill={STATUS_FILL[b.status] ?? "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
            <MetricRow
              label="Awaiting review"
              value={o.changeControlsInReview}
              valueColor={o.changeControlsInReview > 0 ? READINESS_COLORS.watch : READINESS_COLORS.ready}
            />
            <MetricRow
              label="In implementation"
              value={o.changeControlsInImplementation}
              valueColor={READINESS_COLORS.watch}
            />
            <MetricRow
              label="Past target date"
              value={o.changeControlsOverdue}
              valueColor={o.changeControlsOverdue > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
            />
            <MetricRow
              label="High / Critical risk in flight"
              value={o.changeControlsHighRisk}
              valueColor={o.changeControlsHighRisk > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
            />
            <MetricRow
              label="Equipment / computer system"
              value={o.changeControlsEquipment}
              valueColor="var(--text-primary)"
            />
          </div>
        </>
      )}
    </CardSection>
  );
});
