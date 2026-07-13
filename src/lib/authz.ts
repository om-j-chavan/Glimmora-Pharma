import { redirect } from "next/navigation";
import { logAuditAction } from "@/actions/auditLogs";
import type { AuthSession } from "@/lib/auth";

export interface RoleGateContext {
  /** AuditLog.module value used for the VIEW_DENIED row. */
  module: string;
  /** Optional record id to attribute the denied attempt to. */
  recordId?: string;
  /** Optional human-readable record title for the denied attempt. */
  recordTitle?: string;
  /** Where to redirect on denial. Defaults to "/?error=unauthorized". */
  redirectTo?: string;
  /** Additional context merged into the VIEW_DENIED newValue alongside `role`. */
  extra?: Record<string, unknown>;
}

/**
 * Server-side role gate. Companion to `requireAuth()` in src/lib/auth.ts:
 * `requireAuth` answers "who are you?", this answers "are you allowed?".
 *
 * If `session.user.role` is in `allowedRoles`, returns silently. Otherwise:
 *   1. Writes a Part 11 §11.10(d) VIEW_DENIED audit row via `logAuditAction`,
 *      wrapped in try/catch — a logging failure must never block the redirect.
 *   2. Calls `redirect(ctx.redirectTo ?? "/?error=unauthorized")`, which throws
 *      Next.js's special redirect exception. The function does not return on
 *      the deny path.
 *
 * Usage:
 *   const session = await requireAuth();
 *   await requireRoleOrDeny(session, ALLOWED_ROLES, { module: "admin", ... });
 *   // post-call code runs only for authorized users
 */
export async function requireRoleOrDeny(
  session: AuthSession,
  allowedRoles: Set<string>,
  ctx: RoleGateContext,
): Promise<void> {
  if (allowedRoles.has(session.user.role)) return;

  try {
    await logAuditAction({
      module: ctx.module,
      action: "VIEW_DENIED",
      recordId: ctx.recordId,
      recordTitle: ctx.recordTitle,
      newValue: JSON.stringify({
        role: session.user.role,
        ...(ctx.extra ?? {}),
      }),
    });
  } catch (err) {
    console.error("[authz] VIEW_DENIED log failed", err);
  }

  redirect(ctx.redirectTo ?? "/?error=unauthorized");
}
