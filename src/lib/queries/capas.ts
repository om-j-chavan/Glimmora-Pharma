import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getCAPAs = cache(async (tenantId: string) => {
  return prisma.cAPA.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { documents: true },
  });
});

export const getCAPA = cache(async (id: string, tenantId: string) => {
  return prisma.cAPA.findFirst({
    where: { id, tenantId },
    include: { documents: true, finding: true },
  });
});

export const getCAPAStats = cache(async (tenantId: string) => {
  const capas = await getCAPAs(tenantId);
  const now = new Date();
  return {
    total: capas.length,
    open: capas.filter((c) => c.status !== "Closed").length,
    overdue: capas.filter((c) => c.status !== "Closed" && c.dueDate && c.dueDate < now).length,
    closed: capas.filter((c) => c.status === "Closed").length,
  };
});
