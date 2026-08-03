"use client";

/**
 * Role-based alerts — the records that need a decision now.
 *
 * Each alert is ONE real record (an overdue CAPA, a critical finding, a drifting
 * system), drawn from the visibility-scoped arrays and narrowed to the role's focus
 * area when it has one. A row whose module the viewer cannot open keeps its text and
 * loses its link, so an alert never routes anyone into a redirect.
 */

import { memo } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { READINESS_COLORS } from "@/lib/kpi";
import { CardSection } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { ListRow, WidgetEmpty } from "./primitives";
import type { DashboardWidgetProps } from "./types";

const SEVERITY_META = {
  critical: { icon: ShieldAlert, color: READINESS_COLORS.risk, variant: "red" as const, label: "Critical" },
  warning: { icon: AlertTriangle, color: READINESS_COLORS.watch, variant: "amber" as const, label: "Warning" },
  info: { icon: Info, color: "#0ea5e9", variant: "blue" as const, label: "Info" },
};

export const AlertsWidget = memo(function AlertsWidget({ data, dashboard }: DashboardWidgetProps) {
  const criticalCount = data.alerts.filter((a) => a.severity === "critical").length;

  return (
    <CardSection
      icon={BellRing}
      iconColor="#ef4444"
      title="Alerts"
      badge={
        criticalCount > 0
          ? <Badge variant="red">{criticalCount} critical</Badge>
          : data.alerts.length > 0
            ? <Badge variant="amber">{data.alerts.length}</Badge>
            : undefined
      }
    >
      {data.alerts.length === 0 ? (
        <WidgetEmpty
          icon={CheckCircle2}
          message="No active alerts"
          hint={
            dashboard.focusArea
              ? `Nothing critical or overdue in ${dashboard.focusArea}.`
              : "Nothing critical or overdue in the records you can see."
          }
        />
      ) : (
        <ul role="list" className="space-y-0.5 list-none m-0 p-0">
          {data.alerts.map((alert) => {
            const meta = SEVERITY_META[alert.severity];
            return (
              <li key={alert.id}>
                <ListRow
                  icon={meta.icon}
                  iconColor={meta.color}
                  title={alert.title}
                  subtitle={alert.detail}
                  href={alert.href}
                  ariaLabel={`${meta.label}: ${alert.title}. ${alert.detail}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </CardSection>
  );
});
