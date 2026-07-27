/**
 * Shared KPI library (Phase 2) — the SINGLE source of truth for every KPI and
 * readiness formula on the Dashboard and Governance → KPI Scorecard screens.
 *
 * Rule: the Dashboard and Governance pages MUST import from here and never
 * implement a KPI formula inline. See ./readiness.ts for the one readiness model.
 */

export * from "./types";
export * from "./records";
export * from "./readiness";
export * from "./computeDashboardKPIs";
export * from "./computeGovernanceKPIs";
export * from "./computeSiteKPIs";
export * from "./trend";
