/**
 * IT / CDO dashboard (role: `it_cdo`).
 *
 * Remit: the technical estate — GxP systems, Part 11 / Annex 11 posture, data
 * integrity and the AGI configuration surface. The matrix grants it `csv: full`
 * and `agi: full` with everything else read-only, so this config is the validation
 * view minus the QA-authority queues, plus the DI angle the role owns.
 *
 * It shares the validation KPI definitions with the CSV Validation Lead rather
 * than restating them, so a "Validation drift" figure means the same thing to both.
 */

import {
  CSV_CREATE_VALIDATION, CSV_RISK_ASSESSMENT, KPI_PART11_COMPLIANCE,
  KPI_QUALIFICATION_PROGRESS, KPI_SYSTEMS_VALIDATED, KPI_VALIDATION_DRIFT,
  KPI_VALIDATION_PENDING, NAV_CSV, NAV_EVIDENCE, NAV_NOTIFICATIONS, NAV_WORKLIST,
  SHARED_MY_WORKLIST, SHARED_UPLOAD_EVIDENCE,
} from "./catalog";
import type { DashboardConfig } from "./types";

export const itCdoDashboard: DashboardConfig = {
  role: "it_cdo",
  focusArea: "CSV/IT",
  description:
    "GxP system estate, Part 11 / Annex 11 posture, data integrity and validation drift.",

  kpis: [
    KPI_SYSTEMS_VALIDATED,
    KPI_VALIDATION_PENDING,
    KPI_PART11_COMPLIANCE,
    KPI_VALIDATION_DRIFT,
    KPI_QUALIFICATION_PROGRESS,
  ],

  mainWidgets: [
    { key: "validation-status" },
    { key: "area-heatmap" },
    { key: "action-plan" },
  ],

  railWidgets: [
    { key: "ai-insights" },
    { key: "pending-tasks" },
    { key: "quick-actions" },
    { key: "compliance-status" },
    { key: "alerts" },
    { key: "nav-shortcuts" },
  ],

  quickActions: [
    CSV_CREATE_VALIDATION,
    CSV_RISK_ASSESSMENT,
    SHARED_UPLOAD_EVIDENCE,
    SHARED_MY_WORKLIST,
  ],

  ai: {
    title: "AI Validation & DI Insights",
    streams: ["validation", "quality"],
    limit: 5,
  },

  navShortcuts: [NAV_CSV, NAV_EVIDENCE, NAV_WORKLIST, NAV_NOTIFICATIONS],
};
