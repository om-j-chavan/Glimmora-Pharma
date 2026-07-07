/**
 * Cached Prisma query functions for Server Components.
 *
 * Each function uses React cache() to deduplicate within
 * a single server request. Import these instead of calling
 * prisma directly in Server Components.
 */

export { getFindings, getFinding, getFindingStats, getFindingEvidenceDocIds, getFindingAssignees } from "./findings";
export type { FindingAssignee } from "./findings";
export { getCAPAs, getCAPA, getCAPAStats, getCAPAApprovals, getCAPAComments, getEffectivenessChecksDue, getMyActionItems } from "./capas";
export { getCAPAEffectivenessCriteria } from "./capa-criteria";
export {
  getChangeControls,
  getChangeControlById,
  getCAPAChangeControlLinks,
  getChangeControlsWithDeleted,
} from "./change-control";
export { getDeviations, getDeviation } from "./deviations";
export { getFDA483Events, getFDA483Event, getFDA483Stats, getFDA483EventAuditLogs } from "./fda483";
export { getSystems, getDeletedSystems, getSystem, getSystemsStats, getRTMStats, getSystemByRef, getLinkableFindings, getSystemRecentActivity } from "./systems";
export { getRAIDItems, getDocuments, getDocumentStats, getCAPAEvidenceFiles, getValidationStageDocuments, getFDA483EvidenceDocuments, getAuditLogs, getAuditTrailView, getAuditTrailPage, getAuditTrailFilterOptions, getAGIActivityLogs, getPlatformAuditLogs, getPlatformAuditActions, getFrameworkAuditLogs } from "./governance";
export type { AuditTrailRow, AuditTrailView, AuditTrailFilters, AuditSortKey, AuditTrailPageResult, AuditTrailFilterOptions, PlatformAuditRow, PlatformAuditResult, PlatformAuditFilters, FrameworkAuditRow, FrameworkAuditResult, FrameworkAuditScope } from "./governance";
export { getInspections, getInspection, getReadinessStats, getOverallReadiness, getPlaybooks, computeReadinessScore } from "./inspections";
export { getSites, getUsers } from "./settings";
export { getTickets, getTicketStats, getTicket, getSupportTenantOptions, getSupportAssigneeOptions, getTicketAttachments } from "./support";
export type { TicketListFilters, TicketListResult, TicketStats, TicketDetail, TicketAttachment } from "./support";
export { getDashboardStats } from "./dashboard";
export { effectiveFrameworksForTenant, getTenantFrameworkSettings, getFrameworkCatalog } from "./frameworks";
export type { EffectiveFramework, TenantFrameworkSetting, CatalogFramework } from "./frameworks";
export { getActiveRegions, getRegionLabelMap, getRegionCatalog } from "./regions";
export type { RegionOption, RegionCatalogRow } from "./regions";
