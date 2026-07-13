import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Substage 4.8 — Change Control read paths.
 *
 * Cached queries for the list page server component and the CAPA-detail
 * cross-link reads. Mutations + client-callable read wrappers live in
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

export const getChangeControlById = cache(
  async (id: string, tenantId: string) => {
    return prisma.changeControl.findFirst({
      where: { id, tenantId },
      include: {
        capaLinks: {
          include: {
            capa: {
              select: {
                id: true,
                reference: true,
                description: true,
                risk: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  },
);

export const getCAPAChangeControlLinks = cache(
  async (capaId: string, tenantId: string) => {
    // Tenant guard: verify the parent CAPA belongs to the supplied tenant
    // before returning links.
    const capa = await prisma.cAPA.findFirst({
      where: { id: capaId, tenantId },
      select: { id: true },
    });
    if (!capa) return [];
    return prisma.cAPAChangeControlLink.findMany({
      where: { capaId },
      include: {
        changeControl: {
          select: {
            id: true,
            reference: true,
            title: true,
            changeType: true,
            risk: true,
            status: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  },
);

/** super_admin-only — includes soft-deleted rows for audit review. */
export const getChangeControlsWithDeleted = cache(
  async (tenantId: string) => {
    return prisma.changeControl.findMany({
      where: { tenantId },
      include: { _count: { select: { capaLinks: true } } },
      orderBy: { createdAt: "desc" },
    });
  },
);
