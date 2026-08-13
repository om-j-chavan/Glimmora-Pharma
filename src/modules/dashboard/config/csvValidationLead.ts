/**
 * CSV VALIDATION LEAD dashboard (role: `csv_val_lead`).
 *
 * Remit: the computer-system validation lifecycle — registered systems, stage
 * qualification, GAMP 5 / Part 11 / Annex 11 posture, drift and periodic review.
 * The role holds CSV_CREATE_ROLES + CSV_SYSTEM_WRITE_ROLES (QA still owns stage
 * review and sign-off), so it gets authoring shortcuts but no approval queue.
 */

import {
  KPI_CSV_HIGH_RISK, KPI_QUALIFICATION_PROGRESS, KPI_SYSTEMS_VALIDATED,
  KPI_VALIDATION_DRIFT, KPI_VALIDATION_PENDING,
  CSV_CREATE_VALIDATION, CSV_RISK_ASSESSMENT, CSV_VALIDATION_REPORTS,
  NAV_CSV, NAV_EVIDENCE, NAV_GAP, NAV_WORKLIST, SHARED_UPLOAD_EVIDENCE,
} from "./catalog";
import type { DashboardConfig } from "./types";

export const csvValidationLeadDashboard: DashboardConfig = {
  role: "csv_val_lead",
  // The role owns the CSV/IT area, so its area widgets narrow to it.
  focusArea: "CSV/IT",
  description:
    "Validation lifecycle, qualification progress, GxP system risk and validation drift.",

  kpis: [
    KPI_SYSTEMS_VALIDATED,
    KPI_VALIDATION_PENDING,
    KPI_CSV_HIGH_RISK,
    KPI_QUALIFICATION_PROGRESS,
    KPI_VALIDATION_DRIFT,
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
  ],

  quickActions: [
    CSV_CREATE_VALIDATION,
    CSV_RISK_ASSESSMENT,
    CSV_VALIDATION_REPORTS,
    SHARED_UPLOAD_EVIDENCE,
  ],

  ai: {
    title: "Validation Signals",
    streams: ["validation", "quality"],
    limit: 6,
  },

  navShortcuts: [NAV_CSV, NAV_GAP, NAV_EVIDENCE, NAV_WORKLIST],
};
