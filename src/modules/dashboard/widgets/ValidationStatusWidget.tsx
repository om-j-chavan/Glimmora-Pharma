"use client";

/**
 * Validation lifecycle panel — CSV Validation Lead and IT/CDO.
 *
 * Two halves, both from real `GxPSystem` columns:
 *   • the lifecycle distribution (`validationStatus`) as a bar chart, and
 *   • the qualification-stage roll-up (`ValidationStage.status === "approved"`)
 *     plus the compliance posture counters.
 *
 * There is no synthetic "progress %" here: `qualificationProgress` is literally
 * approved stages ÷ total stages, and renders "—" when a tenant has no stages yet.
 */

import { memo } from "react";
import { Database, Layers } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { chartDefaults } from "@/lib/chartColors";
import { READINESS_COLORS } from "@/lib/kpi";
import { CardSection } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { MetricRow, ProportionBar, WidgetEmpty } from "./primitives";
import type { DashboardWidgetProps } from "./types";

/** Lifecycle status → bar colour. Overdue is the only red state. */
const STATUS_FILL: Record<string, string> = {
  "Not Started": READINESS_COLORS.none,
  "In Progress": "#0ea5e9",
  Validated: READINESS_COLORS.ready,
  Overdue: READINESS_COLORS.risk,
};

export const ValidationStatusWidget = memo(function ValidationStatusWidget({
  data, canOpen,
}: DashboardWidgetProps) {
  const v = data.validation;

  return (
    <CardSection
      icon={Database}
      iconColor="#0ea5e9"
      title="Validation lifecycle"
      badge={
        v.total > 0
          ? <Badge variant={v.validatedRate !== null && v.validatedRate >= 90 ? "green" : "amber"}>
              {v.validated}/{v.total} validated
            </Badge>
          : undefined
      }
    >
      {v.total === 0 ? (
        <WidgetEmpty
          icon={Database}
          message="No GxP systems registered"
          hint="Register a system to start its validation lifecycle."
          action={canOpen("csv") ? { label: "Open CSV/CSA", href: "/csv-csa" } : undefined}
        />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={v.byStatus} barSize={28}>
              <CartesianGrid {...chartDefaults.cartesianGrid} />
              <XAxis dataKey="status" {...chartDefaults.xAxis} interval={0} />
              <YAxis {...chartDefaults.yAxis} allowDecimals={false} />
              <Tooltip {...chartDefaults.tooltip} />
              <Bar dataKey="count" name="Systems" radius={[3, 3, 0, 0]}>
                {v.byStatus.map((b) => (
                  <Cell key={b.status} fill={STATUS_FILL[b.status] ?? "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Qualification progress
              </p>
            </div>
            {v.stagesTotal === 0 ? (
              <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
                No validation stages recorded yet — qualification cannot be measured.
              </p>
            ) : (
              <ProportionBar
                label={`${v.stagesApproved} of ${v.stagesTotal} stages approved`}
                value={v.stagesApproved}
                max={v.stagesTotal}
                color={READINESS_COLORS.ready}
              />
            )}

            <div className="mt-3">
              <MetricRow
                label="HIGH risk, not validated"
                value={v.highRisk}
                valueColor={v.highRisk > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
                dot={v.highRisk > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
              />
              <MetricRow
                label="Part 11 non-compliant"
                value={v.part11NonCompliant}
                valueColor={v.part11NonCompliant > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
                dot={v.part11NonCompliant > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
              />
              <MetricRow
                label="Annex 11 non-compliant"
                value={v.annex11NonCompliant}
                valueColor={v.annex11NonCompliant > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
                dot={v.annex11NonCompliant > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
              />
              <MetricRow
                label="Periodic review overdue"
                value={v.periodicReviewOverdue}
                valueColor={v.periodicReviewOverdue > 0 ? READINESS_COLORS.watch : READINESS_COLORS.ready}
                dot={v.periodicReviewOverdue > 0 ? READINESS_COLORS.watch : READINESS_COLORS.ready}
                detail={v.periodicReviewDueSoon > 0 ? `${v.periodicReviewDueSoon} due within 30 days` : undefined}
              />
            </div>
          </div>
        </>
      )}
    </CardSection>
  );
});
