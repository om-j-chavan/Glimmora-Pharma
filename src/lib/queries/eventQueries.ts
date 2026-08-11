/**
 * FDA 483 Event queries for AI assistant.
 * Tenant-scoped, cached where appropriate.
 */

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export interface EventListFilters {
  status?: string | string[];
  overdue?: boolean;
  limit?: number;
}

/**
 * Fetch FDA 483 Events for AI assistant with filters.
 * CRITICAL: Always tenant-scoped by tenantId.
 */
export const getAssistantEvents = cache(
  async (tenantId: string, filters: EventListFilters = {}) => {
    const {
      status,
      overdue = false,
      limit = 20,
    } = filters;

    const where: any = {
      tenantId, // CRITICAL: Tenant isolation
    };

    // Status filter
    if (status) {
      where.status = Array.isArray(status)
        ? { in: status }
        : status;
    }

    // Overdue filter
    if (overdue) {
      where.responseDeadline = {
        lt: new Date(),
      };
      where.status = {
        in: ["Open", "In Progress"],
      };
    }

    const events = await prisma.fDA483Event.findMany({
      where,
      select: {
        id: true,
        referenceNumber: true,
        agency: true,
        siteId: true,
        inspectionDate: true,
        responseDeadline: true,
        status: true,
        leadInvestigator: true,
        observations: {
          select: {
            id: true,
            number: true,
            text: true,
            severity: true,
          },
          take: 5, // First 5 observations per event
        },
      },
      orderBy: [
        { inspectionDate: "desc" },
      ],
      take: limit,
    });

    return events;
  }
);
