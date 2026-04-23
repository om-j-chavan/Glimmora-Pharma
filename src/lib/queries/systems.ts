import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getSystems = cache(async (tenantId: string) => {
  return prisma.gxPSystem.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { validationStages: true, rtmEntries: true, roadmapActivities: true },
  });
});

export const getSystem = cache(async (id: string, tenantId: string) => {
  return prisma.gxPSystem.findFirst({
    where: { id, tenantId },
    include: { validationStages: true, rtmEntries: true, roadmapActivities: true },
  });
});
