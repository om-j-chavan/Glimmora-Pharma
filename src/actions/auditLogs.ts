"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function logAuditAction(input: {
  module: string;
  action: string;
  recordId?: string;
  recordTitle?: string;
  oldValue?: string;
  newValue?: string;
}): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const log = await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        module: input.module,
        action: input.action,
        recordId: input.recordId ?? null,
        recordTitle: input.recordTitle ?? null,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
      },
    });
    return { success: true, data: log };
  } catch (err) {
    console.error("[action] logAuditAction failed:", err);
    return { success: false, error: "Failed to log action" };
  }
}

export async function exportAuditLogs(filters?: {
  module?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ActionResult> {
  const session = await requireAuth();
  if (
    session.user.role !== "qa_head" &&
    session.user.role !== "customer_admin" &&
    session.user.role !== "super_admin"
  ) {
    return { success: false, error: "Access denied" };
  }
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...(filters?.module ? { module: filters.module } : {}),
        ...(filters?.userId ? { userId: filters.userId } : {}),
        ...(filters?.dateFrom || filters?.dateTo
          ? {
              createdAt: {
                ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
                ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return { success: true, data: logs };
  } catch (err) {
    console.error("[action] exportAuditLogs failed:", err);
    return { success: false, error: "Failed to export logs" };
  }
}
