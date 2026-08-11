/**
 * CAPA queries for AI assistant data fetching.
 * Tenant-scoped, cached where appropriate.
 */

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export interface CAPAListFilters {
  status?: string | string[];
  risk?: string | string[];
  overdue?: boolean;
  limit?: number;
}

/**
 * Fetch CAPAs for AI assistant with filters.
 * CRITICAL: Always tenant-scoped by tenantId.
 */
export const getAssistantCAPAs = cache(
  async (tenantId: string, filters: CAPAListFilters = {}) => {
    const {
      status,
      risk,
      overdue = false,
      limit = 20,
    } = filters;

    const where: any = {
      tenantId, // CRITICAL: Tenant isolation
      deletedAt: null,
    };

    // Status filter
    if (status) {
      where.status = Array.isArray(status)
        ? { in: status }
        : status;
    }

    // Risk filter
    if (risk) {
      where.risk = Array.isArray(risk)
        ? { in: risk }
        : risk;
    }

    // Overdue filter
    if (overdue) {
      where.dueDate = {
        lt: new Date(),
      };
      where.status = {
        in: ["Open", "In Progress"],
      };
    }

    const capas = await prisma.cAPA.findMany({
      where,
      select: {
        id: true,
        reference: true,
        title: true,
        description: true,
        status: true,
        risk: true,
        dueDate: true,
        createdAt: true,
        owner: true,
        rca: true,
        correctiveActions: true,
      },
      orderBy: [
        { risk: "desc" },
        { dueDate: "asc" },
      ],
      take: limit,
    });

    return capas;
  }
);

/**
 * Get summary of CAPAs for a specific filter set.
 */
export async function getCAPASummary(
  tenantId: string,
  filters: CAPAListFilters = {}
) {
  const capas = await getAssistantCAPAs(tenantId, filters);

  return {
    count: capas.length,
    byStatus: capas.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byRisk: capas.reduce((acc, c) => {
      acc[c.risk] = (acc[c.risk] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };
}
