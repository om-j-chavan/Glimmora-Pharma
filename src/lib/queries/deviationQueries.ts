/**
 * Deviation queries for AI assistant data fetching.
 * Tenant-scoped, cached where appropriate.
 */

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export interface DeviationListFilters {
  status?: string | string[];
  severity?: string | string[];
  category?: string | string[];
  area?: string | string[];
  limit?: number;
}

/**
 * Fetch Deviations for AI assistant with filters.
 * CRITICAL: Always tenant-scoped by tenantId.
 */
export const getAssistantDeviations = cache(
  async (tenantId: string, filters: DeviationListFilters = {}) => {
    const {
      status,
      severity,
      category,
      area,
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

    // Severity filter
    if (severity) {
      where.severity = Array.isArray(severity)
        ? { in: severity }
        : severity;
    }

    // Category filter
    if (category) {
      where.category = Array.isArray(category)
        ? { in: category }
        : category;
    }

    // Area filter
    if (area) {
      where.area = Array.isArray(area)
        ? { in: area }
        : area;
    }

    const deviations = await prisma.deviation.findMany({
      where,
      select: {
        id: true,
        reference: true,
        title: true,
        description: true,
        status: true,
        severity: true,
        category: true,
        area: true,
        type: true,
        detectedDate: true,
        owner: true,
        immediateAction: true,
      },
      orderBy: [
        { severity: "desc" },
        { detectedDate: "desc" },
      ],
      take: limit,
    });

    return deviations;
  }
);
