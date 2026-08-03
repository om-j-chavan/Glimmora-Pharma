/**
 * QA HEAD dashboard (role: `qa_head`).
 *
 * Remit: the tenant's quality authority — deviations, CAPA, investigations, audit
 * findings, training compliance and risk. This is the only role holding
 * QA_AUTHORITY_ROLES, CAPA_CLOSE_ROLES and the CAPA module surface, so it is the
 * one dashboard that surfaces approval queues as actionable work.
 */

import {
  KPI_AUDIT_FINDINGS, KPI_CAPA_OVERDUE_RATE, KPI_OPEN_CAPAS,
  KPI_OPEN_DEVIATIONS, KPI_RISK_SCORE, KPI_TRAINING_COMPLIANCE,
  NAV_CAPA, NAV_DEVIATION, NAV_GAP, NAV_GOVERNANCE, NAV_WORKLIST,
  QA_APPROVE_INVESTIGATIONS, QA_CREATE_DEVIATION, QA_RAISE_FINDING, QA_REVIEW_CAPA,
} from "./catalog";
import type { DashboardConfig } from "./types";

export const qaHeadDashboard: DashboardConfig = {
  role: "qa_head",
  description:
    "Deviations, CAPA, investigations, audit findings and training compliance across every site.",

  // Six cards → two clean rows of three. `KPI_CAPA_OVERDUE_RATE` is kept because
  // qa_head is the role that OWNS CAPA timeliness and the only one (with
  // customer_admin) that can open its Governance scorecard section — it carries the
  // `#kpi-capa-timeliness` deep link the Dashboard→Governance flow depends on.
  kpis: [
    KPI_OPEN_DEVIATIONS,
    KPI_OPEN_CAPAS,
    KPI_CAPA_OVERDUE_RATE,
    KPI_AUDIT_FINDINGS,
    KPI_TRAINING_COMPLIANCE,
    KPI_RISK_SCORE,
  ],

  mainWidgets: [
    { key: "deviation-trend" },
    { key: "area-heatmap" },
    { key: "finding-trend" },
    { key: "action-plan" },
  ],

  railWidgets: [
    { key: "ai-insights" },
    { key: "pending-tasks" },
    { key: "quick-actions" },
    { key: "risk-signals" },
    { key: "alerts" },
    { key: "nav-shortcuts" },
  ],

  quickActions: [
    QA_CREATE_DEVIATION,
    QA_REVIEW_CAPA,
    QA_APPROVE_INVESTIGATIONS,
    QA_RAISE_FINDING,
  ],

  ai: {
    title: "AI Quality Insights",
    streams: ["quality", "regulatory", "validation"],
    limit: 6,
  },

  navShortcuts: [NAV_DEVIATION, NAV_CAPA, NAV_GAP, NAV_GOVERNANCE, NAV_WORKLIST],
};
