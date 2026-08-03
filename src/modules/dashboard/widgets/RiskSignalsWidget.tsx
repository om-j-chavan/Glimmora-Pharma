"use client";

/**
 * Risk signals — open findings by severity and by GxP area.
 *
 * Carried over from the original rail, with the **area-list bug fixed**: the old
 * block hardcoded `["Manufacturing", "QC Lab", "QMS", "CSV/IT"]` while the heatmap
 * directly above it iterated the 6-item `KPI_AREAS`, so Warehouse and Utilities
 * findings were silently invisible in the breakdown. Both now read the ONE canonical
 * list.
 *
 * The old "Quick links" block that lived in this card has moved to its own
 * `nav-shortcuts` widget, where each link declares the permission it needs — it used
 * to hard-link every role to /capa, /csv-csa and /fda-483 with live counts.
 */

import { memo, useMemo } from "react";
import { Activity } from "lucide-react";
import { KPI_AREAS, READINESS_COLORS } from "@/lib/kpi";
import { CardSection } from "@/components/shared";
import { MetricRow, ProportionBar } from "./primitives";
import type { DashboardWidgetProps } from "./types";

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

const SEVERITY_DOT: Record<string, string> = {
  Critical: READINESS_COLORS.risk,
  High: "#f97316",
  Medium: READINESS_COLORS.watch,
  Low: READINESS_COLORS.ready,
};

export const RiskSignalsWidget = memo(function RiskSignalsWidget({ data }: DashboardWidgetProps) {
  // ONE pass over the findings for both breakdowns (was 20+ inline .filter() calls
  // per render — 4 severities plus 4 areas each re-scanning the array, twice, for
  // the max).
  const { bySeverity, byArea, areaMax } = useMemo(() => {
    const sev = new Map<string, number>(SEVERITIES.map((s) => [s, 0]));
    const area = new Map<string, number>(KPI_AREAS.map((a) => [a, 0]));
    for (const f of data.findings) {
      if (f.status === "Closed") continue;
      if (sev.has(f.severity)) sev.set(f.severity, sev.get(f.severity)! + 1);
      if (area.has(f.area)) area.set(f.area, area.get(f.area)! + 1);
    }
    return {
      bySeverity: sev,
      byArea: area,
      areaMax: Math.max(...area.values(), 1),
    };
  }, [data.findings]);

  return (
    <CardSection icon={Activity} iconColor="#ef4444" title="Risk signals">
      {SEVERITIES.map((sev) => {
        const count = bySeverity.get(sev) ?? 0;
        return (
          <MetricRow
            key={sev}
            label={sev}
            value={count}
            dot={SEVERITY_DOT[sev]}
            valueColor={count === 0 ? READINESS_COLORS.none : count <= 2 ? READINESS_COLORS.watch : READINESS_COLORS.risk}
          />
        );
      })}

      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 mt-3" style={{ color: "var(--text-muted)" }}>
        By area
      </p>
      {KPI_AREAS.map((area) => (
        <ProportionBar key={area} label={area} value={byArea.get(area) ?? 0} max={areaMax} />
      ))}
    </CardSection>
  );
});
