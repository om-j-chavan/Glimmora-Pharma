import { createSelector } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import type { RootState } from "@/store";

/* ── Findings selectors ── */

export const selectAllFindings = (state: RootState) => state.findings.items;

export const selectOpenFindings = createSelector(selectAllFindings, (items) =>
  items.filter((f) => f.status !== "Closed"),
);

export const selectCriticalFindings = createSelector(selectAllFindings, (items) =>
  items.filter((f) => f.severity === "Critical" && f.status !== "Closed"),
);

/* ── CAPA selectors ── */

export const selectAllCAPAs = (state: RootState) => state.capa.items;

export const selectOpenCAPAs = createSelector(selectAllCAPAs, (items) =>
  items.filter((c) => c.status !== "Closed"),
);

export const selectOverdueCAPAs = createSelector(selectOpenCAPAs, (items) =>
  items.filter((c) => dayjs.utc(c.dueDate).isBefore(dayjs())),
);

export const selectClosedCAPAs = createSelector(selectAllCAPAs, (items) =>
  items.filter((c) => c.status === "Closed"),
);

/* ── Systems selectors ── */

export const selectAllSystems = (state: RootState) => state.systems.items;

export const selectHighRiskSystems = createSelector(selectAllSystems, (items) =>
  items.filter((s) => s.riskLevel === "HIGH" && s.validationStatus !== "Validated"),
);

/* ── FDA 483 selectors ── */

export const selectAllFDA483Events = (state: RootState) => state.fda483.items;

export const selectOpenFDA483Events = createSelector(selectAllFDA483Events, (items) =>
  items.filter((e) => e.status !== "Closed" && e.status !== "Response Submitted"),
);

/* ── Deviation selectors ── */

export const selectAllDeviations = (state: RootState) => state.deviation.items;

export const selectOpenDeviations = createSelector(selectAllDeviations, (items) =>
  items.filter((d) => d.status !== "closed" && d.status !== "rejected"),
);

/* ── Readiness selectors ── */

export const selectReadinessScore = (state: RootState) => state.readiness.score;
export const selectReadinessCards = (state: RootState) => state.readiness.cards;
export const selectInspections = (state: RootState) => state.readiness.inspections;

/* ── Dashboard composite selector ── */

export const selectDashboardKPIs = createSelector(
  selectCriticalFindings,
  selectOverdueCAPAs,
  selectHighRiskSystems,
  selectReadinessScore,
  (critical, overdue, highRisk, readiness) => ({
    criticalFindings: critical.length,
    overdueCAPAs: overdue.length,
    csvHighRisk: highRisk.length,
    readinessScore: readiness,
  }),
);
