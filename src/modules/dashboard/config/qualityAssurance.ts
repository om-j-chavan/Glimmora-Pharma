/**
 * QUALITY ASSURANCE (execution level) dashboard (role: `qa`).
 *
 * `qa` is deliberately in NONE of the authority role-sets (see the long comment at
 * the top of `roleSets.ts`): it authors no GxP record, approves nothing, signs
 * nothing. What it DOES do is WORK the tasks addressed to it (isAssignedToTask) and
 * raise governance items. Its dashboard therefore mirrors QA Head's quality
 * metrics — the same formulas, so the two never disagree — but leads with the
 * personal work queue and offers only the two things the server will accept from
 * it: drafting a deviation and raising a risk.
 *
 * Every write-implying element is additionally stripped by the resolver because
 * `qa`'s dashboard matrix level is "readonly".
 */

import {
  KPI_AUDIT_FINDINGS, KPI_OPEN_CAPAS, KPI_OPEN_DEVIATIONS, KPI_OVERALL_READINESS,
  KPI_TRAINING_COMPLIANCE, NAV_DEVIATION, NAV_GAP, NAV_NOTIFICATIONS, NAV_WORKLIST,
  QA_CREATE_DEVIATION, SHARED_MY_WORKLIST, SHARED_RAISE_RISK,
} from "./catalog";
import type { DashboardConfig } from "./types";

export const qualityAssuranceDashboard: DashboardConfig = {
  role: "qa",
  description:
    "Your assigned quality work, plus the deviation, CAPA and finding position across the tenant.",

  kpis: [
    KPI_OPEN_DEVIATIONS,
    KPI_OPEN_CAPAS,
    KPI_AUDIT_FINDINGS,
    KPI_TRAINING_COMPLIANCE,
    KPI_OVERALL_READINESS,
  ],

  mainWidgets: [
    { key: "deviation-trend" },
    { key: "area-heatmap" },
    { key: "action-plan" },
  ],

  railWidgets: [
    { key: "pending-tasks" },
    { key: "ai-insights" },
    { key: "quick-actions" },
    { key: "risk-signals" },
    { key: "nav-shortcuts" },
  ],

  quickActions: [SHARED_MY_WORKLIST, QA_CREATE_DEVIATION, SHARED_RAISE_RISK],

  ai: {
    title: "AI Quality Insights",
    streams: ["quality"],
    limit: 5,
  },

  navShortcuts: [NAV_WORKLIST, NAV_DEVIATION, NAV_GAP, NAV_NOTIFICATIONS],
};
