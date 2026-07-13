import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Cached query: every effectiveness criterion attached to a CAPA in the
 * given tenant, in createdAt ascending order (definition order — substage
 * 4.6 specifies the criteria list is ordered chronologically by creation).
 *
 * Tenant guard: the where clause requires both `capaId` and `tenantId` so
 * a forged capaId from another tenant returns an empty list rather than
 * leaking rows.
 */
export const getCAPAEffectivenessCriteria = cache(
  async (tenantId: string, capaId: string) => {
    return prisma.cAPAEffectivenessCriterion.findMany({
      where: { capaId, tenantId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  },
);
