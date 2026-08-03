"use client";

/**
 * WIDGET REGISTRY — key → component (Phase 3 + Phase 9).
 *
 * The page renders a role's layout by mapping over a list of keys; this map is the
 * only thing that turns a key into UI. Adding a role-specific panel is therefore
 * "write the component, add one line here, list the key in a role config" — never a
 * branch inside the page.
 *
 * PERFORMANCE (Phase 9): the four Recharts panels are `next/dynamic` with
 * `ssr: false`, so a role whose dashboard has no chart NEVER downloads Recharts, and
 * the roles that do get it in a separate chunk after first paint. `ssr: false` costs
 * nothing visually — `ResponsiveContainer` measures its parent and renders nothing on
 * the server anyway, which is why the old inline charts produced no SSR markup either.
 * Each lazy panel gets a sized skeleton so the layout does not shift on arrival.
 *
 * CHANGE CONTROL: `change-control-status` resolves to `null` while
 * `CHANGE_CONTROL_ENABLED` is false, matching the config guards that already drop its
 * KPI and quick action — one flag, one behaviour, no half-enabled state.
 */

import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { CHANGE_CONTROL_ENABLED } from "@/lib/change-control-constants";
import type { DashboardWidgetKey } from "../config";
import { ActionPlanWidget } from "./ActionPlanWidget";
import { AIInsightsWidget } from "./AIInsightsWidget";
import { AlertsWidget } from "./AlertsWidget";
import { AreaHeatmapWidget } from "./AreaHeatmapWidget";
import { ComplianceStatusWidget } from "./ComplianceStatusWidget";
import { NavShortcutsWidget } from "./NavShortcutsWidget";
import { PendingTasksWidget } from "./PendingTasksWidget";
import { QuickActionsWidget } from "./QuickActionsWidget";
import { RiskSignalsWidget } from "./RiskSignalsWidget";
import { TenantHealthWidget } from "./TenantHealthWidget";
import { ChartSkeleton } from "./primitives";
import type { DashboardWidgetProps } from "./types";

/* ── Lazily-loaded chart panels ──────────────────────────────────────────── */

const FindingTrendWidget = dynamic(
  () => import("./FindingTrendWidget").then((m) => m.FindingTrendWidget),
  { ssr: false, loading: () => <ChartSkeleton height={264} /> },
);

const DeviationTrendWidget = dynamic(
  () => import("./DeviationTrendWidget").then((m) => m.DeviationTrendWidget),
  { ssr: false, loading: () => <ChartSkeleton height={244} /> },
);

const ValidationStatusWidget = dynamic(
  () => import("./ValidationStatusWidget").then((m) => m.ValidationStatusWidget),
  { ssr: false, loading: () => <ChartSkeleton height={400} /> },
);

const ChangeControlWidget = dynamic(
  () => import("./ChangeControlWidget").then((m) => m.ChangeControlWidget),
  { ssr: false, loading: () => <ChartSkeleton height={340} /> },
);

/* ── The map ─────────────────────────────────────────────────────────────── */

const WIDGETS: Record<DashboardWidgetKey, ComponentType<DashboardWidgetProps> | null> = {
  // main column
  "area-heatmap": AreaHeatmapWidget,
  "finding-trend": FindingTrendWidget,
  "deviation-trend": DeviationTrendWidget,
  "validation-status": ValidationStatusWidget,
  "regulatory-calendar": dynamic(
    () => import("./RegulatoryCalendarWidget").then((m) => m.RegulatoryCalendarWidget),
    { loading: () => <ChartSkeleton height={360} /> },
  ),
  "tenant-health": TenantHealthWidget,
  "change-control-status": CHANGE_CONTROL_ENABLED ? ChangeControlWidget : null,
  "action-plan": ActionPlanWidget,
  // side rail
  "ai-insights": AIInsightsWidget,
  "risk-signals": RiskSignalsWidget,
  "compliance-status": ComplianceStatusWidget,
  "pending-tasks": PendingTasksWidget,
  "quick-actions": QuickActionsWidget,
  alerts: AlertsWidget,
  "nav-shortcuts": NavShortcutsWidget,
};

/**
 * Render one widget by key. Returns `null` for a key with no mounted component
 * (currently only the flag-disabled change-control panel), so an unavailable widget
 * leaves no empty card behind in the layout.
 */
export function DashboardWidget({
  widget, ...props
}: DashboardWidgetProps & { widget: DashboardWidgetKey }) {
  const Component = WIDGETS[widget];
  if (!Component) return null;
  return <Component {...props} />;
}
