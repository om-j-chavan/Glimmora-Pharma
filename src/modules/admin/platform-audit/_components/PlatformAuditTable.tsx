import type { AuditLog } from "@prisma/client";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/shared";
import { roleLabel } from "@/lib/labels/roles";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import dayjs from "@/lib/dayjs";

/* ── Event category (derived from the raw action prefix) ── */
export type AuditCategory = "Account" | "Plan" | "Security" | "Other";

export function categoryOf(action: string): AuditCategory {
  if (action.startsWith("TENANT_")) return "Account";
  if (action.startsWith("PLAN_") || action.startsWith("SUBSCRIPTION_")) return "Plan";
  if (action.startsWith("MFA_")) return "Security";
  return "Other";
}

const CATEGORY_VARIANT: Record<AuditCategory, "blue" | "green" | "amber" | "gray"> = {
  Account: "blue",
  Plan: "green",
  Security: "amber",
  Other: "gray",
};

interface PlatformAuditTableProps {
  rows: AuditLog[];
  tenantMap: Record<string, { code: string | null; name: string }>;
}

/**
 * Platform audit table. Who → roleLabel (never a raw role code), Event →
 * auditEventLabel (never a raw action code), Tenant → customerCode when known
 * else the tenant name.
 */
export function PlatformAuditTable({ rows, tenantMap }: PlatformAuditTableProps) {
  const tenantOf = (e: AuditLog): string => {
    const t = e.recordId ? tenantMap[e.recordId] : undefined;
    return t?.code ?? t?.name ?? e.recordTitle ?? "—";
  };

  return (
    <DataTable
      ariaLabel="Platform audit events"
      data={rows}
      rowKey={(e) => e.id}
      emptyState={
        <p className="text-center text-[13px] py-8" style={{ color: "var(--text-muted)" }}>No events match the current filter.</p>
      }
      columns={[
        {
          key: "when",
          header: "When",
          render: (e) => (
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {dayjs(e.createdAt).format("DD MMM YYYY, HH:mm")}
            </span>
          ),
        },
        {
          key: "who",
          header: "Who",
          render: (e) => (
            <div className="text-[12px]">
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>{e.userName}</p>
              {e.userRole && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{roleLabel(e.userRole)}</p>}
            </div>
          ),
        },
        {
          key: "event",
          header: "Event",
          render: (e) => {
            const cat = categoryOf(e.action);
            return (
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{auditEventLabel(e.action)}</span>
                <Badge variant={CATEGORY_VARIANT[cat]}>{cat}</Badge>
              </div>
            );
          },
        },
        {
          key: "tenant",
          header: "Tenant",
          render: (e) => (
            <span className="text-[12px] font-mono" style={{ color: "var(--text-secondary)" }}>{tenantOf(e)}</span>
          ),
        },
      ] satisfies Column<AuditLog>[]}
    />
  );
}
