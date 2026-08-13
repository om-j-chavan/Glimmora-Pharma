/**
 * OPERATIONS HEAD dashboard (role: `operations_head`).
 *
 * Remit: the Manufacturing AREA plus controlled change. Built from the real
 * columns manufacturing work already writes — `Deviation.area`,
 * `Deviation.category` ("equipment"), `Deviation.batchesAffected` and the
 * ChangeControl lifecycle.
 *
 * DATA-INTEGRITY NOTE (deliberate omission): there is no batch-release master, no
 * equipment master and no production-efficiency feed in the schema, so this config
 * does NOT show "production efficiency", "equipment health" or a "batch status"
 * tile. What it shows instead — batch-IMPACTING deviations and equipment-CATEGORY
 * deviations — is evidenced by real records and honestly named. Change-control
 * elements are gated on `CHANGE_CONTROL_ENABLED`, so they appear the moment that
 * module ships and never render a link that redirects.
 */

import {
  areaBatchImpactKpi, areaDeviationsKpi, areaEquipmentKpi, areaInvestigationsKpi,
  areaReadinessKpi, KPI_CHANGE_CONTROLS, NAV_DEVIATION, NAV_GAP, NAV_GOVERNANCE,
  NAV_WORKLIST, OPS_CHANGE_CONTROL, QA_CREATE_DEVIATION, SHARED_MY_WORKLIST,
  SHARED_RAISE_RISK,
} from "./catalog";
import type { DashboardConfig } from "./types";

export const operationsHeadDashboard: DashboardConfig = {
  role: "operations_head",
  focusArea: "Manufacturing",
  description:
    "Manufacturing deviations, batch impact, equipment issues and operational compliance.",

  kpis: [
    areaDeviationsKpi("Manufacturing deviations"),
    areaBatchImpactKpi("Batch-impacting"),
    areaEquipmentKpi("Equipment-related"),
    areaInvestigationsKpi("Investigations pending"),
    areaReadinessKpi("Operational readiness"),
    // Appears only when the Change Control module is enabled.
    KPI_CHANGE_CONTROLS,
  ],

  mainWidgets: [
    { key: "deviation-trend" },
    { key: "change-control-status" },
    { key: "area-heatmap" },
    { key: "action-plan" },
  ],

  railWidgets: [
    { key: "ai-insights" },
    { key: "pending-tasks" },
    { key: "quick-actions" },
    { key: "risk-signals" },
  ],

  quickActions: [
    QA_CREATE_DEVIATION,
    OPS_CHANGE_CONTROL,
    SHARED_RAISE_RISK,
    SHARED_MY_WORKLIST,
  ],

  ai: {
    title: "Operational Signals",
    streams: ["operations", "quality"],
    limit: 5,
  },

  navShortcuts: [NAV_DEVIATION, NAV_GAP, NAV_GOVERNANCE, NAV_WORKLIST],
};
