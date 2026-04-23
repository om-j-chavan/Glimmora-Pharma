import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getInspections = cache(async (tenantId: string) => {
  return prisma.inspection.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { actions: true, simulations: true },
  });
});

export const getInspection = cache(async (id: string, tenantId: string) => {
  return prisma.inspection.findFirst({
    where: { id, tenantId },
    include: { actions: true, simulations: true },
  });
});
