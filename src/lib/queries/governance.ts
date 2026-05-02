import { cache } from "react";
import type { AuditLog } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Hard cap on how many audit-log rows the in-app /audit-trail view loads
// per request. The view is in-memory: filters and the CSV "Export" button
// operate on the loaded slice, not on the database. Without surfacing the
// total population the UI silently dropped older rows past the limit —
// for a Part-11 audit log that's an honest-display violation, hence the
// truncation flag exposed by getAuditLogs below.
const AUDIT_LOG_DISPLAY_LIMIT = 500;

export interface AuditLogQueryResult {
  logs: AuditLog[];
  totalCount: number;
  truncated: boolean;
  limit: number;
}

export const getRAIDItems = cache(async (tenantId: string) => {
  return prisma.rAIDItem.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
});

export const getDocuments = cache(async (tenantId: string) => {
  return prisma.document.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
});

export const getDocumentStats = cache(async (tenantId: string) => {
  const docs = await getDocuments(tenantId);
  return {
    total: docs.length,
    approved: docs.filter((d) => d.status === "approved").length,
    underReview: docs.filter((d) => d.status === "under_review").length,
    draft: docs.filter((d) => d.status === "draft").length,
    rejected: docs.filter((d) => d.status === "rejected").length,
  };
});

export const getAuditLogs = cache(async (tenantId: string): Promise<AuditLogQueryResult> => {
  const where = { tenantId };
  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: AUDIT_LOG_DISPLAY_LIMIT,
    }),
    // The where clause MUST stay identical to the findMany above. The
    // truncated flag (totalCount > limit) is meaningful only when both
    // queries count the same population — if these drift, the
    // "showing X of Y" notice becomes a lie and the Part-11
    // honest-display promise breaks.
    prisma.auditLog.count({ where }),
  ]);
  return {
    logs,
    totalCount,
    truncated: totalCount > AUDIT_LOG_DISPLAY_LIMIT,
    limit: AUDIT_LOG_DISPLAY_LIMIT,
  };
});

/**
 * AGI-related activity from the audit log — agent toggles + AI suggestion
 * shown/accepted/dismissed events. Used by /agi-console activity feed.
 */
export const getAGIActivityLogs = cache(async (tenantId: string) => {
  return prisma.auditLog.findMany({
    where: {
      tenantId,
      action: {
        in: [
          "AI_SUGGESTION_SHOWN",
          "AI_SUGGESTION_ACCEPTED",
          "AI_SUGGESTION_DISMISSED",
          "AGI_AGENT_TOGGLED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
});
