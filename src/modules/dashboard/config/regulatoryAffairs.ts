/**
 * REGULATORY AFFAIRS dashboard (role: `regulatory_affairs`).
 *
 * Remit: everything facing the agency — 483 events, observations, commitments,
 * response deadlines and inspection readiness. This role holds FDA483_SIGN_ROLES
 * and INSPECTION_CREATE_ROLES, and is the second Critical-tier CAPA approver, so
 * its dashboard leads with the regulatory calendar rather than internal quality
 * volume.
 */

import {
  KPI_INSPECTION_READINESS, KPI_REGULATORY_COMMITMENTS, KPI_REGULATORY_DEADLINES,
  KPI_REGULATORY_EVENTS, KPI_REGULATORY_OBSERVATIONS,
  NAV_EVIDENCE, NAV_FDA483, NAV_READINESS, NAV_WORKLIST,
  REG_CREATE_SUBMISSION, REG_INSPECTION_CHECKLIST, REG_REVIEW_REGULATIONS,
  REG_REVIEW_SUBMISSIONS,
} from "./catalog";
import type { DashboardConfig } from "./types";

export const regulatoryAffairsDashboard: DashboardConfig = {
  role: "regulatory_affairs",
  description:
    "Inspection events, agency commitments, response deadlines and regulatory readiness.",

  kpis: [
    KPI_REGULATORY_EVENTS,
    KPI_REGULATORY_DEADLINES,
    KPI_INSPECTION_READINESS,
    KPI_REGULATORY_COMMITMENTS,
    KPI_REGULATORY_OBSERVATIONS,
  ],

  mainWidgets: [
    { key: "regulatory-calendar" },
    { key: "area-heatmap" },
    { key: "finding-trend" },
  ],

  railWidgets: [
    { key: "ai-insights" },
    { key: "pending-tasks" },
    { key: "quick-actions" },
    { key: "compliance-status" },
  ],

  quickActions: [
    REG_CREATE_SUBMISSION,
    REG_REVIEW_SUBMISSIONS,
    REG_INSPECTION_CHECKLIST,
    REG_REVIEW_REGULATIONS,
  ],

  ai: {
    title: "Regulatory Signals",
    streams: ["regulatory", "quality"],
    limit: 6,
  },

  navShortcuts: [NAV_FDA483, NAV_READINESS, NAV_EVIDENCE, NAV_WORKLIST],
};
