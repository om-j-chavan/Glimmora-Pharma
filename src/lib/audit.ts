import { logAuditAction } from "@/actions/auditLogs";

/**
 * Client-side audit helper.
 *
 * Forwards to the `logAuditAction` Server Action, which uses NextAuth
 * `requireAuth()` to identify the user and writes to the Prisma `AuditLog`
 * table. The legacy in-app Redux audit log has been removed — Prisma is
 * the single source of truth. The Audit Trail page reads back from the
 * same table.
 *
 * Fire-and-forget: failures are logged to the console but never thrown,
 * so a missed audit row never blocks user-facing operations.
 */

export interface AuditEntry {
  action: string;
  module: string;
  recordId?: string;
  recordTitle?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    const result = await logAuditAction({
      module: entry.module,
      action: entry.action,
      recordId: entry.recordId,
      recordTitle: entry.recordTitle ?? entry.recordId,
      oldValue: entry.oldValue != null ? String(entry.oldValue) : undefined,
      newValue: entry.newValue != null ? String(entry.newValue) : undefined,
    });
    if (!result.success) {
      console.warn("[audit] server action failed:", result.error);
    }
  } catch (err) {
    console.warn("[audit] dispatch failed:", err);
  }
}
