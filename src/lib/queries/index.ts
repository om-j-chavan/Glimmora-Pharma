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
export { getFDA483Events, getFDA483Event } from "./fda483";
export { getSystems, getSystem } from "./systems";
export { getRAIDItems, getDocuments, getAuditLogs } from "./governance";
export { getInspections, getInspection } from "./inspections";
