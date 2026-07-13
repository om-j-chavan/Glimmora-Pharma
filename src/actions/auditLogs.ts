"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { getAuditTrailPage, type AuditTrailRow, type AuditSortKey } from "@/lib/queries";
import type { ServerQuery, SortDir } from "@/components/table/DataTable";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/* ── loadAuditTrail — server-mode fetcher for the /audit-trail <DataTable> ──
   Wraps getAuditTrailPage so the client table can page (Show More), search,
   filter, and SORT on the SERVER (the AuditLog table can be large; a column
   sort must order the whole set, never just the loaded rows). Scoping is pinned
   to the caller's tenant inside getAuditTrailPage and NEVER widened; the role
   gate mirrors the /audit-trail route so this action can't be driven by an
   unauthorised role. */

const AUDIT_TRAIL_ROLES = new Set(["qa_head", "customer_admin", "super_admin"]);

/** DataTable column key → AuditLog sort column (whitelist). */
const AUDIT_SORT_COLUMN: Record<string, AuditSortKey> = {
  timestamp: "createdAt",
  action: "action",
  module: "module",
  actor: "userName",
};

function mapAuditSort(s: ServerQuery["sort"]): { key: AuditSortKey; dir: SortDir } | undefined {
  if (!s) return undefined;
  const key = AUDIT_SORT_COLUMN[s.key];
  return key ? { key, dir: s.dir } : undefined;
}

/** Rolling-window presets → an inclusive dateFrom (YYYY-MM-DD). */
function periodToDateFrom(period: string | undefined): string | undefined {
  const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 0;
  if (!days) return undefined;
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export async function loadAuditTrail(q: ServerQuery): Promise<{ rows: AuditTrailRow[]; total: number }> {
  const session = await requireAuth();
  // Belt-and-suspenders: the route already gates, but the action is callable
  // directly — a wrong role gets an empty page, never another tenant's data.
  if (!AUDIT_TRAIL_ROLES.has(session.user.role)) return { rows: [], total: 0 };
  const f = q.filters ?? {};
  const res = await getAuditTrailPage(session.user.tenantId, {
    page: q.page,
    pageSize: q.pageSize,
    sort: mapAuditSort(q.sort),
    filters: {
      module: f.module || undefined,
      action: f.action || undefined,
      userName: f.actor || undefined,
      dateFrom: periodToDateFrom(f.period),
      search: q.search || undefined,
    },
  });
  return { rows: res.rows, total: res.total };
}

export async function logAuditAction(input: {
  module: string;
  action: string;
  recordId?: string;
  recordTitle?: string;
  oldValue?: string;
  newValue?: string;
}): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const log = await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
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

