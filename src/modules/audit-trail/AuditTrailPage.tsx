import { useMemo } from "react";
import {
  FileText, Download, Filter, X,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { setAuditFilter, clearAuditFilters } from "@/store/auditTrail.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/shared";

const MODULES = ["all", "Gap Assessment", "CAPA Tracker", "FDA 483", "CSV/CSA", "Evidence & Documents", "Governance", "Inspection Readiness", "Settings", "Auth"];
const ACTION_GROUPS = ["all", "Created", "Updated", "Status Changed", "Signed", "Submitted", "Deleted"];

const CRITICAL_ACTIONS = new Set(["CAPA_SIGNED_AND_CLOSED", "RESPONSE_SUBMITTED", "RESPONSE_SIGNED", "USER_DELETED"]);
const STATUS_ACTIONS = new Set(["CAPA_STATUS_CHANGED", "FINDING_STATUS_CHANGED", "VALIDATION_STAGE_UPDATED", "DI_STATUS_UPDATED", "DI_GATE_CLEARED"]);
const CREATE_ACTIONS = new Set(["FINDING_CREATED", "CAPA_CREATED", "EVENT_CREATED", "SYSTEM_ADDED", "DOCUMENT_ADDED", "RAID_ITEM_ADDED", "USER_CREATED", "SITE_ADDED", "OBSERVATION_ADDED", "SIMULATION_SCHEDULED"]);

function actionColor(action: string): string {
  if (CRITICAL_ACTIONS.has(action)) return "#ef4444";
  if (STATUS_ACTIONS.has(action)) return "#f59e0b";
  if (CREATE_ACTIONS.has(action)) return "#10b981";
  return "#64748b";
}

function actionGroupMatch(action: string, group: string): boolean {
  if (group === "all") return true;
  const a = action.toLowerCase();
  if (group === "Created") return a.includes("created") || a.includes("added") || a.includes("scheduled");
  if (group === "Updated") return a.includes("updated") || a.includes("enabled") || a.includes("disabled") || a.includes("changed") || a.includes("cleared");
  if (group === "Status Changed") return a.includes("status") || a.includes("gate");
  if (group === "Signed") return a.includes("signed") || a.includes("closed");
  if (group === "Submitted") return a.includes("submitted") || a.includes("drafted");
  if (group === "Deleted") return a.includes("deleted") || a.includes("removed") || a.includes("reopened");
  return true;
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Capa", "CAPA")
    .replace("Di ", "DI ")
    .replace("Fda", "FDA")
    .replace("Rca", "RCA")
    .replace("Agi", "AGI")
    .replace("Raid", "RAID");
}

export function AuditTrailPage() {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.auditTrail.entries);
  const filters = useAppSelector((s) => s.auditTrail.filters);
  const { users, org } = useTenantConfig();
  const timezone = org.timezone;

  const anyFilter = filters.module !== "all" || filters.action !== "all" || filters.userId !== "all" || filters.dateFrom !== "" || filters.dateTo !== "";

  const filtered = useMemo(() => {
    let result = entries;
    if (filters.module !== "all") result = result.filter((e) => e.module === filters.module);
    if (filters.action !== "all") result = result.filter((e) => actionGroupMatch(e.action, filters.action));
    if (filters.userId !== "all") result = result.filter((e) => e.userId === filters.userId);
    if (filters.dateFrom) {
      const from = dayjs(filters.dateFrom).startOf("day");
      result = result.filter((e) => dayjs(e.timestamp).isAfter(from) || dayjs(e.timestamp).isSame(from));
    }
    if (filters.dateTo) {
      const to = dayjs(filters.dateTo).endOf("day");
      result = result.filter((e) => dayjs(e.timestamp).isBefore(to) || dayjs(e.timestamp).isSame(to));
    }
    return result;
  }, [entries, filters]);

  function exportCSV() {
    const header = "Timestamp,User,Role,Module,Action,Record ID,Record Title,Old Value,New Value";
    const rows = filtered.map((e) =>
      [
        dayjs.utc(e.timestamp).tz(timezone).format("DD/MM/YYYY HH:mm"),
        `"${e.userName}"`,
        `"${e.userRole}"`,
        `"${e.module}"`,
        formatAction(e.action),
        e.recordId,
        `"${e.recordTitle}"`,
        `"${e.oldValue ?? ""}"`,
        `"${e.newValue ?? ""}"`,
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${dayjs().format("YYYY-MM-DD")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main id="main-content" aria-label="Audit trail" className="w-full space-y-5">
      <PageHeader
        title="Audit Trail"
        subtitle={`Complete compliance log \u2014 ${entries.length} entries recorded`}
        actions={
          <Button variant="secondary" size="sm" icon={Download} onClick={exportCSV}>Export CSV</Button>
        }
      />

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Module</p>
          <Dropdown
            value={filters.module}
            onChange={(v) => dispatch(setAuditFilter({ module: v }))}
            options={MODULES.map((m) => ({ value: m, label: m === "all" ? "All modules" : m }))}
            width="w-44"
          />
        </div>
        <div>
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Action</p>
          <Dropdown
            value={filters.action}
            onChange={(v) => dispatch(setAuditFilter({ action: v }))}
            options={ACTION_GROUPS.map((a) => ({ value: a, label: a === "all" ? "All actions" : a }))}
            width="w-40"
          />
        </div>
        <div>
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>User</p>
          <Dropdown
            value={filters.userId}
            onChange={(v) => dispatch(setAuditFilter({ userId: v }))}
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
            onChange={(e) => dispatch(setAuditFilter({ dateFrom: e.target.value }))}
            style={{ width: 140 }}
          />
        </div>
        <div>
          <p className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>To</p>
          <input
            type="date"
            className="input text-[12px]"
            value={filters.dateTo}
            onChange={(e) => dispatch(setAuditFilter({ dateTo: e.target.value }))}
            style={{ width: 140 }}
          />
        </div>
        {anyFilter && <Button variant="ghost" size="sm" icon={X} onClick={() => dispatch(clearAuditFilters())}>Clear</Button>}
      </div>

      {/* Summary row */}
      <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <Filter className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{filtered.length} of {entries.length} entries</span>
        <span className="mx-1">&middot;</span>
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
                <th scope="col" style={{ width: 20 }}><span className="sr-only">Severity</span></th>
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
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>No entries match your filters</p>
                  </td>
                </tr>
              ) : filtered.map((e) => {
                const col = actionColor(e.action);
                return (
                  <tr key={e.id}>
                    <td><div className="w-2.5 h-2.5 rounded-full mx-auto" style={{ background: col }} title={CRITICAL_ACTIONS.has(e.action) ? "Critical" : STATUS_ACTIONS.has(e.action) ? "Status change" : CREATE_ACTIONS.has(e.action) ? "Create" : "Other"} /></td>
                    <td className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(e.timestamp).tz(timezone).format("DD/MM/YYYY HH:mm")}</td>
                    <td className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{e.userName}</td>
                    <td><Badge variant="gray">{e.userRole}</Badge></td>
                    <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{e.module}</td>
                    <td className="text-[11px] font-mono" style={{ color: col }}>{formatAction(e.action)}</td>
                    <td>
                      <p className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>{e.recordId}</p>
                      <p className="text-[11px] line-clamp-1" style={{ color: "var(--text-secondary)", maxWidth: 200 }}>{e.recordTitle}</p>
                    </td>
                    <td className="text-[11px]" style={{ color: "var(--text-muted)" }}>{e.oldValue ?? "\u2014"}</td>
                    <td className="text-[11px] font-medium" style={{ color: e.newValue ? "var(--text-primary)" : "var(--text-muted)" }}>{e.newValue ?? "\u2014"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
