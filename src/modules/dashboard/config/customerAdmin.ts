/**
 * CUSTOMER ADMIN dashboard (role: `customer_admin`).
 *
 * Remit: the TENANT, not the quality record. Under the SME permission model a
 * customer_admin is view-only on every quality module (`canWriteQuality` excludes
 * it) — so this config gives it organisation-level roll-ups, tenant health, user
 * and licence posture. It deliberately offers NO quality-authoring quick action,
 * because the server would reject one.
 */

import {
  ADMIN_AGI_POLICY, ADMIN_MANAGE_USERS, ADMIN_ORG_REPORTS, ADMIN_SYSTEM_SETTINGS,
  KPI_ACTIVE_SITES, KPI_ACTIVE_USERS, KPI_COMPLIANCE_SCORE, KPI_LICENCE_STATUS,
  KPI_OVERALL_READINESS, NAV_AUDIT_TRAIL, NAV_GOVERNANCE, NAV_NOTIFICATIONS,
  NAV_SETTINGS,
} from "./catalog";
import type { DashboardConfig } from "./types";

export const customerAdminDashboard: DashboardConfig = {
  role: "customer_admin",
  description:
    "Organisation compliance, tenant health, user and licence status across every site.",

  kpis: [
    KPI_OVERALL_READINESS,
    KPI_COMPLIANCE_SCORE,
    KPI_ACTIVE_USERS,
    KPI_ACTIVE_SITES,
    KPI_LICENCE_STATUS,
  ],

  mainWidgets: [
    { key: "tenant-health" },
    { key: "area-heatmap" },
    { key: "finding-trend" },
  ],

  railWidgets: [
    { key: "ai-insights" },
    { key: "compliance-status" },
    { key: "quick-actions" },
    { key: "alerts" },
    { key: "nav-shortcuts" },
  ],

  quickActions: [
    ADMIN_MANAGE_USERS,
    ADMIN_SYSTEM_SETTINGS,
    ADMIN_ORG_REPORTS,
    ADMIN_AGI_POLICY,
  ],

  ai: {
    title: "AI Organisation Summary",
    streams: ["organisation", "quality", "validation"],
    limit: 5,
  },

  navShortcuts: [NAV_GOVERNANCE, NAV_SETTINGS, NAV_AUDIT_TRAIL, NAV_NOTIFICATIONS],
};
