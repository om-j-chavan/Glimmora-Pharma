import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Substage 4.8 — Change Control read paths.
 *
 * Cached query for the list page server component. Mutations + client-callable
 * read wrappers (including the single-record and CAPA cross-link reads) live in
 * src/actions/change-control.ts (loadChangeControls / loadChangeControlById /
 * loadCAPAChangeControlLinks / loadChangeControlStatusHistory).
 */

export const getChangeControls = cache(
  async (
    tenantId: string,
    filters?: {
      status?: string;
      risk?: string;
      changeType?: string;
    },
  ) => {
    return prisma.changeControl.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.risk ? { risk: filters.risk } : {}),
        ...(filters?.changeType ? { changeType: filters.changeType } : {}),
      },
      include: {
        _count: { select: { capaLinks: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },
);
