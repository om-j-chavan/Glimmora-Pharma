import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getDeviations = cache(async (tenantId: string) => {
  return prisma.deviation.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
});

export const getDeviation = cache(async (id: string, tenantId: string) => {
  return prisma.deviation.findFirst({
    where: { id, tenantId },
  });
});
