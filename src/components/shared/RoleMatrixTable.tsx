"use client";

import { Infinity as InfinityIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { roleLabel } from "@/lib/labels/roles";
import { roleCapStatus, type RoleCap, type RoleMatrixRow } from "@/lib/roleLimits";

/**
 * The ONE shared per-role limits table. Renders the resolver's matrix rows
 * (cap / used / remaining / usage bar / status) on the standard DataTable. Used
 * by the SA Role Limits module, the tenant-detail section, and the CA
 * Subscription tab (read-only everywhere — this component never writes). It does
 * NOT recompute caps: it only renders the `RoleMatrixRow`s + a derived status.
 */

const STATUS_META: Record<ReturnType<typeof roleCapStatus>, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  ok: { label: "OK", tone: "green" },
  near: { label: "Near limit", tone: "amber" },
  full: { label: "Full", tone: "red" },
  unlimited: { label: "Unlimited", tone: "gray" },
};

function capText(cap: RoleCap): string {
  return cap === "unlimited" ? "∞" : String(cap);
}

/** Small inline usage bar — mirrors PlanLimitUsageBar's colour rule. */
function UsageBar({ cap, used }: { cap: RoleCap; used: number }) {
  const status = roleCapStatus(cap, used);
  if (cap === "unlimited") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <InfinityIcon className="w-3.5 h-3.5" aria-hidden="true" /> unlimited
      </span>
    );
  }
  const pct = cap <= 0 ? 100 : Math.min(Math.round((used / cap) * 100), 100);
  const color = status === "full" ? "#ef4444" : status === "near" ? "#f59e0b" : "#0ea5e9";
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="h-1.5 rounded-full flex-1 bg-(--bg-border)" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`usage ${pct}%`}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{pct}%</span>
    </div>
  );
}

export interface RoleMatrixTableProps {
  rows: RoleMatrixRow[];
  /** "config" → CAP / USED / USAGE / STATUS (SA plan view).
   *  "usage"  → LIMIT / USED / REMAINING (tenant/CA view). */
  variant?: "config" | "usage";
}

export function RoleMatrixTable({ rows, variant = "usage" }: RoleMatrixTableProps) {
  const roleCol: Column<RoleMatrixRow> = {
    key: "role",
    header: "Role",
    render: (r) => <span className="text-[12px] font-medium text-(--text-primary)">{roleLabel(r.role)}</span>,
  };
  const capCol: Column<RoleMatrixRow> = {
    key: "cap",
    header: variant === "config" ? "Cap" : "Limit",
    render: (r) => <span className="text-[12px] tabular-nums text-(--text-primary)">{capText(r.cap)}</span>,
  };
  const usedCol: Column<RoleMatrixRow> = {
    key: "used",
    header: "Used",
    render: (r) => <span className="text-[12px] tabular-nums text-(--text-secondary)">{r.used}</span>,
  };
  const statusCol: Column<RoleMatrixRow> = {
    key: "status",
    header: "Status",
    render: (r) => {
      const m = STATUS_META[roleCapStatus(r.cap, r.used)];
      return <Badge variant={m.tone}>{m.label}</Badge>;
    },
  };
  const usageCol: Column<RoleMatrixRow> = {
    key: "usage",
    header: "Usage",
    render: (r) => <UsageBar cap={r.cap} used={r.used} />,
  };
  const remainingCol: Column<RoleMatrixRow> = {
    key: "remaining",
    header: "Remaining",
    render: (r) => (
      <span className="text-[12px] tabular-nums" style={{ color: r.remaining === 0 ? "var(--danger)" : "var(--text-secondary)" }}>
        {r.remaining === "unlimited" ? "∞" : r.remaining}
        {r.remaining === 0 && <span className="ml-1.5 text-[10px] font-semibold uppercase" style={{ color: "var(--danger)" }}>full</span>}
      </span>
    ),
  };

  const columns = variant === "config"
    ? [roleCol, capCol, usedCol, usageCol, statusCol]
    : [roleCol, capCol, usedCol, remainingCol];

  return <DataTable ariaLabel="Per-role user limits" data={rows} rowKey={(r) => r.role} columns={columns} />;
}
