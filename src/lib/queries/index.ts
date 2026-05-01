/**
 * Cached Prisma query functions for Server Components.
 *
 * Each function uses React cache() to deduplicate within
 * a single server request. Import these instead of calling
 * prisma directly in Server Components.
 */

export { getFindings, getFinding, getFindingStats } from "./findings";
export { getCAPAs, getCAPA, getCAPAStats } from "./capas";
export { getDeviations, getDeviation } from "./deviations";
export { getFDA483Events, getFDA483Event, getFDA483Stats } from "./fda483";
export { getSystems, getSystem, getSystemsStats, getRTMStats } from "./systems";
export { getRAIDItems, getDocuments, getDocumentStats, getAuditLogs, getAGIActivityLogs } from "./governance";
export { getInspections, getInspection, getReadinessStats, getOverallReadiness, getPlaybooks, computeReadinessScore } from "./inspections";
export { getSites, getUsers } from "./settings";
export { getDashboardStats } from "./dashboard";
