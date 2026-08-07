/**
 * QC LAB DIRECTOR dashboard (role: `qc_lab_director`).
 *
 * Remit: the QC Lab AREA. Every quality record carries an `area` column, so this
 * dashboard is a real narrowing of real records — lab deviations, lab
 * investigations, lab findings and the CAPAs attributed to the area.
 *
 * DATA-INTEGRITY NOTE (deliberate omission): the schema has no OOS/OOT register
 * and no instrument master, so this config does NOT show an "OOS count" or
 * "instrument health" tile. Inventing either would put an unevidenced number on a
 * GxP dashboard. The metrics below are the closest signals the tenant's own
 * records actually support, each labelled for what it really measures. When an
 * OOS/OOT or instrument model is added, add the tile to `catalog.ts` and list it
 * here — no page change required.
 */

import {
  areaCapaKpi, areaDeviationsKpi, areaFindingsKpi, areaInvestigationsKpi,
  areaReadinessKpi, LAB_LOG_INVESTIGATION, NAV_DEVIATION, NAV_EVIDENCE, NAV_GAP,
  NAV_WORKLIST, QA_RAISE_FINDING, SHARED_MY_WORKLIST, SHARED_UPLOAD_EVIDENCE,
} from "./catalog";
import type { DashboardConfig } from "./types";

export const qcLabDirectorDashboard: DashboardConfig = {
  role: "qc_lab_director",
  focusArea: "QC Lab",
  description:
    "QC Lab deviations, investigations, findings and laboratory quality signals.",

  kpis: [
    areaDeviationsKpi("Lab deviations"),
    areaInvestigationsKpi("Lab investigations"),
    areaFindingsKpi("Lab findings"),
    areaCapaKpi("Lab CAPAs overdue"),
    areaReadinessKpi("Lab readiness"),
  ],

  mainWidgets: [
    { key: "deviation-trend" },
    { key: "area-heatmap" },
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
    LAB_LOG_INVESTIGATION,
    QA_RAISE_FINDING,
    SHARED_UPLOAD_EVIDENCE,
    SHARED_MY_WORKLIST,
  ],

  ai: {
    title: "Laboratory Signals",
    streams: ["laboratory", "quality"],
    limit: 5,
  },

  navShortcuts: [NAV_DEVIATION, NAV_GAP, NAV_EVIDENCE, NAV_WORKLIST],
};
