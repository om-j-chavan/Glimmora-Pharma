import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/shared";
import { roleLabel } from "@/lib/labels/roles";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import type { PlatformAuditRow } from "@/lib/queries";
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

/** Actor label: joined login username → denormalised userName → "System"
 *  (a genuinely user-less / automated event). */
export function actorOf(e: PlatformAuditRow): string {
  return e.username ?? (e.userName?.trim() || null) ?? "System";
}

/** Affected organisation name (recordId → Tenant.name), else the denormalised
 *  recordTitle, else an em-dash. */
export function accountOf(e: PlatformAuditRow): string {
  return e.accountName ?? e.recordTitle ?? "—";
}

interface PlatformAuditTableProps {
  rows: PlatformAuditRow[];
  /** Row click / View — opens the read-only detail. */
  onView: (row: PlatformAuditRow) => void;
}

/**
 * Platform audit table. Username → the actor (login username, falling back to
 * the captured display name, then "System"); Account Name → the affected
 * organisation; Event → auditEventLabel (never a raw action code). Rows are
 * read-only; clicking one opens the detail view.
 */
export function PlatformAuditTable({ rows, onView }: PlatformAuditTableProps) {
  return (
    <DataTable
      ariaLabel="Platform audit events"
      data={rows}
      rowKey={(e) => e.id}
      minWidth={880}
      onRowClick={(e) => onView(e)}
      rowClassName={() => "cursor-pointer hover:bg-(--bg-hover)"}
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
          key: "username",
          header: "Username",
          render: (e) => (
            <div className="text-[12px]">
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>{actorOf(e)}</p>
              {e.userRole && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{roleLabel(e.userRole)}</p>}
            </div>
          ),
        },
        {
          key: "account",
          header: "Account Name",
          render: (e) => (
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{accountOf(e)}</span>
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
      ] satisfies Column<PlatformAuditRow>[]}
    />
  );
}
