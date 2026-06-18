"use client";

// NOTE: Content-hash chain + append-only enforcement is a planned future
// feature (AUDIT-GLOBAL-PATTERNS.md Finding #7). This view provides actor
// identity, timestamp, and tenant-scoped persistence — do NOT add
// tamper-evidence / immutable UI claims until the schema supports them.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollText, RefreshCw, Search, Filter, FileSearch, X } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { roleLabel } from "@/lib/labels/roles";
import type { AuditTrailView } from "@/lib/queries";
import { AuditDetailModal } from "./_components/AuditDetailModal";
import {
  MODULES,
  ACTION_GROUPS,
  SEVERITY_VARIANT,
  severityOf,
  actionGroupMatch,
  formatAction,
  formatTimestamp,
} from "./audit-helpers";

interface Filters {
  module: string;
  action: string;
  userId: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = {
  module: "all",
  action: "all",
  userId: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
};

export function AuditTrailPage({ rows, totalCount, truncated, limit }: AuditTrailView) {
  const router = useRouter();
  const { users, org } = useTenantConfig();
  const timezone = org.timezone;

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const anyFilter =
    filters.module !== "all" ||
    filters.action !== "all" ||
    filters.userId !== "all" ||
    filters.search.trim() !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  const filtered = useMemo(() => {
    let result = rows;
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
          e.displayId.toLowerCase().includes(q) ||
          (e.recordTitle ?? "").toLowerCase().includes(q),
      );
    }
    if (filters.dateFrom) {
      const from = dayjs(filters.dateFrom).startOf("day");
      result = result.filter((e) => !dayjs(e.createdAt).isBefore(from));
    }
    if (filters.dateTo) {
      const to = dayjs(filters.dateTo).endOf("day");
      result = result.filter((e) => !dayjs(e.createdAt).isAfter(to));
    }
    return result;
  }, [rows, filters]);

  const detailRow = detailId ? filtered.find((r) => r.id === detailId) ?? rows.find((r) => r.id === detailId) : null;

  const entryWord = (n: number) => (n === 1 ? "entry" : "entries");

  // CSV/PDF export of the current (filtered) slice.
  const AUDIT_HEADERS = ["Timestamp", "User", "Role", "Module", "Action", "Record", "Record Title", "Before", "After"];
  const buildAuditRows = () =>
    filtered.map((e) => [
      dayjs(e.createdAt).tz(timezone).format("DD/MM/YYYY HH:mm"),
      e.userName,
      e.userRole ? roleLabel(e.userRole) : "",
      e.module,
      formatAction(e.action),
      e.displayId,
      e.recordTitle ?? "",
      e.oldValue ?? "",
      e.newValue ?? "",
    ]);

  return (
    <main id="main-content" aria-label="Audit Trail" className="w-full space-y-5">
      {/* Header — matches the other list modules (icon + title + subtitle + actions) */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <div>
            <h1 className="page-title">Audit Trail</h1>
            <p className="page-subtitle mt-1">
              Every action across the platform, with actor identity and timestamp (21 CFR Part 11).
              {" "}
              <span className="text-(--text-muted)">
                {totalCount.toLocaleString()} {entryWord(totalCount)}
                {truncated && ` · showing the ${limit.toLocaleString()} most recent`}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ExportMenu
            filename={`audit-trail-${dayjs().format("YYYY-MM-DD")}`}
            title="Audit Trail"
            subtitle={`${filtered.length} ${entryWord(filtered.length)} · ${dayjs().format("DD MMM YYYY HH:mm")}`}
            headers={AUDIT_HEADERS}
            rows={buildAuditRows}
            variant="ghost"
            label="Export"
            disabled={filtered.length === 0}
          />
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => router.refresh()} aria-label="Refresh audit log from server">
            Refresh
          </Button>
        </div>
      </header>

      {/* Filters — standard filter section */}
      <section
        aria-label="Audit trail filters"
        className="flex items-center gap-3 flex-wrap p-3 rounded-xl"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
      >
        <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>

        <Dropdown value={filters.module} onChange={(v) => setFilter("module", v)} options={MODULES} width="w-44" />
        <Dropdown
          value={filters.action}
          onChange={(v) => setFilter("action", v)}
          width="w-40"
          options={ACTION_GROUPS.map((a) => ({ value: a, label: a === "all" ? "All actions" : a }))}
        />
        <Dropdown
          value={filters.userId}
          onChange={(v) => setFilter("userId", v)}
          width="w-44"
          options={[{ value: "all", label: "All users" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
        />
        <DatePicker
          id="audit-date-from"
          value={filters.dateFrom}
          onChange={(v) => setFilter("dateFrom", v)}
          max={filters.dateTo || undefined}
          placeholder="From date"
          className="w-40"
        />
        <DatePicker
          id="audit-date-to"
          value={filters.dateTo}
          onChange={(v) => setFilter("dateTo", v)}
          min={filters.dateFrom || undefined}
          placeholder="To date"
          className="w-40"
        />

        <div className="relative ml-auto flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input
            type="search"
            className="input w-full pl-10 text-[12px]"
            placeholder="Search user, action, record…"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            aria-label="Search audit events"
          />
        </div>

        {anyFilter && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-(--text-muted) hover:text-(--text-primary) border-none bg-transparent cursor-pointer"
            aria-label="Clear all filters"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear
          </button>
        )}
      </section>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <FileSearch className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
            {rows.length === 0 ? "No audit events yet" : "No audit events match the current filters"}
          </p>
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
            {rows.length === 0
              ? "Once users start acting in the platform, every state change is captured here automatically."
              : "Adjust the filters or clear them to see more rows."}
          </p>
          {anyFilter && (
            <Button variant="secondary" size="sm" icon={X} onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="data-table" style={{ minWidth: 760 }} aria-label="Audit trail">
            <caption className="sr-only">
              Audit events with timestamp, actor, module, action, and affected record. Showing {filtered.length} of {rows.length} loaded {entryWord(rows.length)}.
            </caption>
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">User</th>
                <th scope="col">Module</th>
                <th scope="col">Action</th>
                <th scope="col">Record</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} onClick={() => setDetailId(e.id)} className="cursor-pointer">
                  <td>
                    <time
                      dateTime={dayjs(e.createdAt).toISOString()}
                      title={dayjs(e.createdAt).tz(timezone).format("DD MMM YYYY HH:mm:ss")}
                      className="font-mono text-[12px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {formatTimestamp(e.createdAt, timezone)}
                    </time>
                  </td>
                  <td>
                    <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{e.userName}</span>
                    {e.userRole && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-(--bg-elevated) text-(--text-secondary)">
                        {roleLabel(e.userRole)}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="font-mono text-[12px]" style={{ color: "var(--brand)" }}>{e.module}</span>
                  </td>
                  <td>
                    <Badge variant={SEVERITY_VARIANT[severityOf(e.action)]}>{formatAction(e.action)}</Badge>
                  </td>
                  <td className="max-w-[280px]">
                    <span
                      className="font-mono text-[12px] block truncate"
                      style={{ color: "var(--text-secondary)" }}
                      title={e.recordTitle && e.recordTitle !== e.displayId ? `${e.displayId} · ${e.recordTitle}` : e.displayId}
                    >
                      {e.displayId}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailRow && (
        <AuditDetailModal row={detailRow} timezone={timezone} onClose={() => setDetailId(null)} />
      )}
    </main>
  );
}
