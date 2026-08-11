/**
 * Finding/Gap Assessment queries for AI assistant.
 * Tenant-scoped, cached where appropriate.
 */

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export interface FindingListFilters {
  status?: string | string[];
  severity?: string | string[];
  framework?: string | string[];
  area?: string | string[];
  limit?: number;
}

/**
 * Fetch Findings for AI assistant with filters.
 * CRITICAL: Always tenant-scoped by tenantId.
 */
export const getAssistantFindings = cache(
  async (tenantId: string, filters: FindingListFilters = {}) => {
    const {
      status,
      severity,
      framework,
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

    // Framework filter
    if (framework) {
      where.framework = Array.isArray(framework)
        ? { in: framework }
        : framework;
    }

    // Area filter
    if (area) {
      where.area = Array.isArray(area)
        ? { in: area }
        : area;
    }

    const findings = await prisma.finding.findMany({
      where,
      select: {
        id: true,
        reference: true,
        requirement: true,
        area: true,
        purpose: true,
        severity: true,
        status: true,
        framework: true,
        createdAt: true,
        owner: true,
      },
      orderBy: [
        { severity: "desc" },
        { createdAt: "desc" },
      ],
      take: limit,
    });

    return findings;
  }
);
