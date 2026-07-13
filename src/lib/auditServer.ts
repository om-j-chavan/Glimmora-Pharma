import { prisma } from "@/lib/prisma";

/**
 * Server-only audit writer for events that fire outside an authenticated
 * request context — primarily NextAuth's `authorize()` callback, which must
 * record login outcomes before any session exists.
 *
 * Sibling to `auditLog()` in src/lib/audit.ts. The client-facing helper
 * forwards to a Server Action that calls `requireAuth()`; that path cannot
 * work during sign-in (no session yet) or for failed-login branches.
 *
 * Constraints inherited from the AuditLog Prisma model:
 *  - tenantId is NOT NULL and FK-bound. Events with no resolvable tenant
 *    (no-such-email, cross-tenant ambiguous email) are surfaced to stderr
 *    instead of persisted — see the TODO below.
 *  - userName is NOT NULL — falls back to "unknown".
 */
/** Never throws. Safe to call without await-handling.
 *  Outer try/catch is intentional defense-in-depth so
 *  future edits cannot break the auth route. */
export async function auditAuthEvent(params: {
  action: string;
  tenantId: string | null;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  recordId?: string | null;
  recordTitle?: string | null;
  ipAddress?: string | null;
  newValue?: Record<string, unknown>;
}): Promise<void> {
  try {
    if (!params.tenantId) {
      // TODO: persisting these requires either a sentinel "SYSTEM" tenant or
      // making AuditLog.tenantId nullable. Schema change deferred — surface
      // to stderr so ops can grep.
      console.error(
        "[audit][auth] event skipped — no tenantId",
        JSON.stringify({ action: params.action, ...(params.newValue ?? {}) }),
      );
      return;
    }

    try {
      await prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId ?? null,
          userName: params.userName ?? "unknown",
          userRole: params.userRole ?? null,
          module: "auth",
          action: params.action,
          recordId: params.recordId ?? null,
          recordTitle: params.recordTitle ?? null,
          oldValue: null,
          newValue: params.newValue ? JSON.stringify(params.newValue) : null,
          ipAddress: params.ipAddress ?? null,
        },
      });
    } catch (err) {
      console.error("[audit][auth] write failed", {
        action: params.action,
        err,
      });
    }
  } catch (err) {
    console.error("[audit][auth] outer guard caught", {
      action: params.action,
      err,
    });
  }
}
