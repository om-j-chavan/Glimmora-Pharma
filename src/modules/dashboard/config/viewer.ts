/**
 * VIEWER dashboard (role: `viewer`).
 *
 * Strictly READ-ONLY. The resolver marks `viewer` as `readOnly`, which already
 * strips every write-guarded element; this config reinforces that by declaring no
 * quick actions at all and no widget that implies an operation:
 *
 *   • NO quick actions            — nothing to click that would mutate.
 *   • NO pending-tasks widget     — a viewer is never an assignee (isAssignedToTask
 *                                   hard-stops the role), so the panel would
 *                                   always be empty.
 *   • NO alerts-with-actions      — alerts render as read-only status lines.
 *
 * Everything listed still passes through the same resolver, so a tenant that
 * revokes a module in Settings → Permissions removes it here too.
 */

import {
  KPI_CRITICAL_FINDINGS, KPI_CSV_HIGH_RISK, KPI_OPEN_CAPAS, KPI_OPEN_DEVIATIONS,
  KPI_OVERALL_READINESS, NAV_EVIDENCE, NAV_NOTIFICATIONS, NAV_READINESS,
} from "./catalog";
import type { DashboardConfig } from "./types";

export const viewerDashboard: DashboardConfig = {
  role: "viewer",
  description: "Read-only compliance overview — no edit or administrative actions.",

  kpis: [
    KPI_OVERALL_READINESS,
    KPI_CRITICAL_FINDINGS,
    KPI_OPEN_DEVIATIONS,
    KPI_OPEN_CAPAS,
    KPI_CSV_HIGH_RISK,
  ],

  mainWidgets: [
    { key: "area-heatmap" },
    { key: "finding-trend" },
  ],

  railWidgets: [
    { key: "compliance-status" },
    { key: "risk-signals" },
    { key: "nav-shortcuts" },
  ],

  quickActions: [],

  ai: {
    title: "Compliance Signals",
    streams: ["quality"],
    limit: 4,
  },

  navShortcuts: [NAV_READINESS, NAV_EVIDENCE, NAV_NOTIFICATIONS],
};
