import { cache } from "react";
import { prisma } from "@/lib/prisma";

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

export const getAuditLogs = cache(async (tenantId: string) => {
  return prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
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
