import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getFDA483Events = cache(async (tenantId: string) => {
  return prisma.fDA483Event.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { observations: true, commitments: true },
  });
});

export const getFDA483Event = cache(async (id: string, tenantId: string) => {
  return prisma.fDA483Event.findFirst({
    where: { id, tenantId },
    include: { observations: true, commitments: true },
  });
});
