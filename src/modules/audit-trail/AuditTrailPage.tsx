"use client";

import { useMemo, useState } from "react";
import { FileText, Download, Filter, Search, X } from "lucide-react";
import type { AuditLog } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/shared";

const MODULES = [
  "all",
  "Gap Assessment",
  "CAPA",
  "Deviation Management",
  "FDA 483",
  "CSV/CSA",
  "Evidence & Documents",
  "Governance",
  "Inspection Readiness",
  "Settings",
  "Admin",
  "AGI Console",
];

const ACTION_GROUPS = [
  "all",
  "Created",
  "Updated",
  "Status Changed",
  "Signed",
  "Submitted",
  "Deleted",
];

const CRITICAL_ACTIONS = new Set([
  "CAPA_CLOSED",
  "FDA483_RESPONSE_SUBMITTED",
  "DEVIATION_CLOSED",
  "USER_DELETED",
  "TENANT_DELETED",
]);
const STATUS_ACTIONS = new Set([
  "FDA483_STATUS_CHANGED",
  "STAGE_APPROVED",
  "STAGE_REJECTED",
  "CAPA_DI_GATE_CLEARED",
  "CAPA_SUBMITTED_FOR_REVIEW",
]);
const CREATE_ACTIONS = new Set([
  "FINDING_CREATED",
  "CAPA_CREATED",
  "DEVIATION_CREATED",
  "FDA483_EVENT_CREATED",
  "SYSTEM_CREATED",
  "DOCUMENT_UPLOADED",
  "RAID_ITEM_CREATED",
  "INSPECTION_CREATED",
  "USER_CREATED",
  "SITE_CREATED",
  "OBSERVATION_ADDED",
  "TENANT_CREATED",
  "RTM_ENTRY_CREATED",
]);

function actionColor(action: string): string {
  if (CRITICAL_ACTIONS.has(action)) return "#ef4444";
  if (STATUS_ACTIONS.has(action)) return "#f59e0b";
  if (CREATE_ACTIONS.has(action)) return "#10b981";
  return "#64748b";
}

function actionGroupMatch(action: string, group: string): boolean {
  if (group === "all") return true;
  const a = action.toLowerCase();
  if (group === "Created") return a.includes("created") || a.includes("uploaded") || a.includes("added");
  if (group === "Updated") return a.includes("updated") || a.includes("toggled") || a.includes("cleared") || a.includes("approved");
  if (group === "Status Changed") return a.includes("status") || a.includes("gate") || a.includes("rejected");
  if (group === "Signed") return a.includes("closed") || a.includes("signed");
  if (group === "Submitted") return a.includes("submitted");
  if (group === "Deleted") return a.includes("deleted") || a.includes("reopened");
  return true;
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Capa", "CAPA")
    .replace("Di ", "DI ")
    .replace("Fda", "FDA")
    .replace("Rca", "RCA")
    .replace("Agi", "AGI")
    .replace("Raid", "RAID")
    .replace("Rtm", "RTM")
    .replace("Csv", "CSV");
}

interface AuditTrailPageProps {
  logs: AuditLog[];
  /** Total audit-log rows in the tenant — may exceed `logs.length` when
   *  the loaded slice is capped. Used for the truncation notice and the
   *  summary row so the user always sees the true population size. */
  totalCount: number;
  /** True when totalCount > limit and the visible slice is the most-recent
   *  `limit` rows. Drives the standalone notice rendered above the
   *  filters. Filters and CSV export still operate on the loaded slice
   *  only — server-side date-range filtering is a separate change. */
  truncated: boolean;
  /** The cap applied by `getAuditLogs`. Surfaced for the notice so the
   *  message stays correct if the cap is ever changed in one place. */
  limit: number;
}

interface LocalFilters {
  module: string;
  action: string;
  userId: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: LocalFilters = {
  module: "all",
  action: "all",
  userId: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
};

export function AuditTrailPage({ logs, totalCount, truncated, limit }: AuditTrailPageProps) {
  const { users, org } = useTenantConfig();
  const timezone = org.timezone;
  const [filters, setFilters] = useState<LocalFilters>(EMPTY_FILTERS);

  const setFilter = (key: keyof LocalFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const anyFilter =
    filters.module !== "all" ||
    filters.action !== "all" ||
    filters.userId !== "all" ||
    filters.search.trim() !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  const filtered = useMemo(() => {
    let result = logs;
    if (filters.module !== "all") result = result.filter((e) => e.module === filters.module);
    if (filters.action !== "all") result = result.filter((e) => actionGroupMatch(e.action, filters.action));
    if (filters.userId !== "all") result = result.filter((e) => e.userId === filters.userId);
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.userName.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.module.toLowerCase().includes(q) ||
          (e.recordTitle ?? "").toLowerCase().includes(q) ||
          (e.recordId ?? "").toLowerCase().includes(q),
      );
    }
    if (filters.dateFrom) {
      const from = dayjs(filters.dateFrom).startOf("day");
      result = result.filter((e) => dayjs(e.createdAt).isAfter(from) || dayjs(e.createdAt).isSame(from));
    }
    if (filters.dateTo) {
      const to = dayjs(filters.dateTo).endOf("day");
      result = result.filter((e) => dayjs(e.createdAt).isBefore(to) || dayjs(e.createdAt).isSame(to));
    }
    return result;
  }, [logs, filters]);

  function exportCSV() {
    const header = "Timestamp,User,Role,Module,Action,Record ID,Record Title,Old Value,New Value";
    const rows = filtered.map((e) =>
      [
        dayjs(e.createdAt).tz(timezone).format("DD/MM/YYYY HH:mm"),
        `"${e.userName.replace(/"/g, '""')}"`,
        `"${(e.userRole ?? "").replace(/"/g, '""')}"`,
        `"${e.module.replace(/"/g, '""')}"`,
        formatAction(e.action),
        e.recordId ?? "",
        `"${(e.recordTitle ?? "").replace(/"/g, '""')}"`,
        `"${(e.oldValue ?? "").replace(/"/g, '""')}"`,
        `"${(e.newValue ?? "").replace(/"/g, '""')}"`,
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${dayjs().format("YYYY-MM-DD")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <main id="main-content" aria-label="Audit trail" className="w-full space-y-5">
      <PageHeader
        title="Audit Trail"
        subtitle={
          filtered.length === logs.length
            ? truncated
              ? `${totalCount} entries in audit log`
              : `${totalCount} entries · Complete compliance log`
            : `${filtered.length} entries (filtered from ${logs.length} loaded)`
        }
        actions={
          <Button variant="secondary" size="sm" icon={Download} onClick={exportCSV} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        }
      />

      {/* Truncation notice — only rendered when the total population in the
       *  DB exceeds the display limit. Wording is the literal product spec;
       *  `limit` and the older-entry count interpolate so the math stays
       *  correct if AUDIT_LOG_DISPLAY_LIMIT in src/lib/queries/governance.ts
       *  changes in one place. */}
      {truncated && (
        <div role="status" className="alert alert-warning text-[12px]">
          Showing the {limit} most recent entries. {totalCount - limit} older entries are not displayed.
        </div>
      )}

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="relative">
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
            Search
          </p>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
              aria-hidden="true"
            />
            <input
              type="search"
              className="input text-[12px] pl-8"
              placeholder="User, action, module..."
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              style={{ width: 220 }}
            />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Module</p>
          <Dropdown
            value={filters.module}
            onChange={(v) => setFilter("module", v)}
            options={MODULES.map((m) => ({ value: m, label: m === "all" ? "All modules" : m }))}
            width="w-44"
          />
        </div>
        <div>
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Action</p>
          <Dropdown
            value={filters.action}
            onChange={(v) => setFilter("action", v)}
            options={ACTION_GROUPS.map((a) => ({ value: a, label: a === "all" ? "All actions" : a }))}
            width="w-40"
          />
        </div>
        <div>
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>User</p>
          <Dropdown
            value={filters.userId}
            onChange={(v) => setFilter("userId", v)}
            options={[{ value: "all", label: "All users" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
            width="w-44"
          />
        </div>
        <div>
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>From</p>
          <input
            type="date"
            className="input text-[12px]"
            value={filters.dateFrom}
            onChange={(e) => setFilter("dateFrom", e.target.value)}
            style={{ width: 140 }}
          />
        </div>
        <div>
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>To</p>
          <input
            type="date"
            className="input text-[12px]"
            value={filters.dateTo}
            onChange={(e) => setFilter("dateTo", e.target.value)}
            style={{ width: 140 }}
          />
        </div>
        {anyFilter && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear
          </Button>
        )}
      </div>

      {/* Summary row */}
      <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <Filter className="w-3.5 h-3.5" aria-hidden="true" />
        <span>
          {filtered.length} of {logs.length}
          {truncated && ` loaded · ${totalCount} total`} entries
        </span>
        <span className="mx-1">·</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Critical</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> Status changes</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]" /> Creates</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#64748b]" /> Other</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table" style={{ minWidth: 900 }} aria-label="Audit trail entries">
            <caption className="sr-only">Complete audit trail log sorted by newest first</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: 20 }}>
                  <span className="sr-only">Severity</span>
                </th>
                <th scope="col">Timestamp</th>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Module</th>
                <th scope="col">Action</th>
                <th scope="col">Record</th>
                <th scope="col">Old Value</th>
                <th scope="col">New Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8">
                    <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {logs.length === 0 ? "No audit entries yet — perform an action to populate the log" : "No entries match your filters"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const col = actionColor(e.action);
                  return (
                    <tr key={e.id}>
                      <td>
                        <div
                          className="w-2.5 h-2.5 rounded-full mx-auto"
                          style={{ background: col }}
                          title={
                            CRITICAL_ACTIONS.has(e.action)
                              ? "Critical"
                              : STATUS_ACTIONS.has(e.action)
                                ? "Status change"
                                : CREATE_ACTIONS.has(e.action)
                                  ? "Create"
                                  : "Other"
                          }
                        />
                      </td>
                      <td className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        {dayjs(e.createdAt).tz(timezone).format("DD/MM/YYYY HH:mm")}
                      </td>
                      <td className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                        {e.userName}
                      </td>
                      <td><Badge variant="gray">{e.userRole ?? "—"}</Badge></td>
                      <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{e.module}</td>
                      <td className="text-[11px] font-mono" style={{ color: col }}>{formatAction(e.action)}</td>
                      <td>
                        <p className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>{e.recordId ?? "—"}</p>
                        <p className="text-[11px] line-clamp-1" style={{ color: "var(--text-secondary)", maxWidth: 200 }}>
                          {e.recordTitle ?? ""}
                        </p>
                      </td>
                      <td className="text-[11px]" style={{ color: "var(--text-muted)" }}>{e.oldValue ?? "—"}</td>
                      <td
                        className="text-[11px] font-medium"
                        style={{ color: e.newValue ? "var(--text-primary)" : "var(--text-muted)" }}
                      >
                        {e.newValue ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
