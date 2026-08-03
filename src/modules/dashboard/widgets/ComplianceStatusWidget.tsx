"use client";

/**
 * Compliance status board.
 *
 * Seven named posture checks, each either a REAL measured value or an explicit "—"
 * with the reason ("No GxP systems registered", "No training records logged").
 * Never a default-to-green: an unassessed tenant must not read as compliant on a GxP
 * dashboard, which is why `buildComplianceLines` carries a distinct `none` state
 * rather than folding "no data" into "ok".
 */

import { memo } from "react";
import { ShieldCheck } from "lucide-react";
import { CardSection } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { MetricRow, stateColor } from "./primitives";
import type { DashboardWidgetProps } from "./types";

const STATE_LABEL = {
  ok: "On track",
  watch: "Watch",
  risk: "At risk",
  none: "Not measured",
} as const;

export const ComplianceStatusWidget = memo(function ComplianceStatusWidget({ data }: DashboardWidgetProps) {
  const atRisk = data.compliance.filter((l) => l.state === "risk").length;

  return (
    <CardSection
      icon={ShieldCheck}
      iconColor="#10b981"
      title="Compliance status"
      badge={
        atRisk > 0
          ? <Badge variant="red">{atRisk} at risk</Badge>
          : <Badge variant="green">On track</Badge>
      }
    >
      {data.compliance.map((line) => (
        <MetricRow
          key={line.key}
          label={line.label}
          value={line.value}
          valueColor={stateColor(line.state)}
          dot={stateColor(line.state)}
          detail={line.detail}
        />
      ))}
      <p className="sr-only">
        {data.compliance.map((l) => `${l.label}: ${l.value}, ${STATE_LABEL[l.state]}.`).join(" ")}
      </p>
    </CardSection>
  );
});
