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

export const getAuditLogs = cache(async (tenantId: string) => {
  return prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
});
