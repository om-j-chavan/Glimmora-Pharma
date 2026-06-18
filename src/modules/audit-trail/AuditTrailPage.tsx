"use client";

// NOTE: Content-hash chain + append-only enforcement is a planned future
// feature (tracked in AUDIT-GLOBAL-PATTERNS.md Finding #7). The current audit
// trail provides actor identity, timestamp, and tenant-scoped persistence.
// Do NOT add tamper-evidence / SHA-256 / append-only / immutable UI claims
// until the AuditLog schema and DB constraints actually support them.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  RefreshCw,
  Search,
  Funnel,
  FileSearch,
  Lock,
  X,
} from "lucide-react";
import type { AuditLog } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Button } from "@/components/ui/Button";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { Dropdown } from "@/components/ui/Dropdown";
import { AuditEventRow, type Severity } from "./_components/AuditEventRow";

/* ── Static option lists & action classifiers ────────────────────────────
   Kept module-scoped because they're pure data; rebuilding them per render
   would just be churn. The CRITICAL/STATUS/CREATE sets back the severity
   dot in the row AND the "Critical only" quick-filter chip. */

// Module filter options. The filter is strict-equality (e.module === value),
// so each `value` MUST exactly match a `module` string written by an
// auditLog.create / auditAuthEvent call — `label` is display-only. Rung 3G
// expanded this to cover every module string the code writes today (incl. the
// CAPA sub-area strings and the login-path "auth" rows, previously
// unfilterable) and unified "FDA 483 Response" into "FDA 483".
const MODULES: { value: string; label: string }[] = [
  { value: "all", label: "All modules" },
  { value: "Gap Assessment", label: "Gap Assessment" },
  { value: "CAPA", label: "CAPA" },
  { value: "CAPA / Action Items", label: "CAPA / Action Items" },
  { value: "CAPA / Alignment", label: "CAPA / Alignment" },
  { value: "CAPA / Approvals", label: "CAPA / Approvals" },
  { value: "CAPA / Change Control", label: "CAPA / Change Control" },
  { value: "CAPA / Discussion", label: "CAPA / Discussion" },
  { value: "CAPA / Effectiveness", label: "CAPA / Effectiveness" },
  { value: "CAPA / Evidence", label: "CAPA / Evidence" },
  { value: "CAPA / RCA Review", label: "CAPA / RCA Review" },
  { value: "CAPA / Verification", label: "CAPA / Verification" },
  { value: "Change Control", label: "Change Control" },
  { value: "Deviation Management", label: "Deviation Management" },
  { value: "FDA 483", label: "FDA 483" },
  { value: "CSV/CSA", label: "CSV/CSA" },
  { value: "Evidence & Documents", label: "Evidence & Documents" },
  { value: "Governance", label: "Governance" },
  { value: "Inspection Readiness", label: "Inspection Readiness" },
  { value: "Settings", label: "Settings" },
  { value: "Admin", label: "Admin" },
  { value: "auth", label: "Authentication" },
  { value: "AGI Console", label: "AGI Console" },
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

function severityOf(action: string): Severity {
  if (CRITICAL_ACTIONS.has(action)) return "critical";
  if (STATUS_ACTIONS.has(action)) return "status_change";
  if (CREATE_ACTIONS.has(action)) return "create";
  return "other";
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

/** Relative for recent events ("3m ago"), absolute for older ones. Older
 *  events get the full date because relative-time ("4 days ago") becomes
 *  useless once an inspector is reconstructing a timeline. */
function formatTimestamp(iso: string | Date, timezone: string): string {
  const d = dayjs(iso);
  const diffMin = dayjs().diff(d, "minute");
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.tz(timezone).format("DD MMM YYYY HH:mm");
}

/** Calendar-day heading for the grouped list ("Today" / "Yesterday" /
 *  "Monday, 14 Jun 2026"). Purely presentational — it slices the already
 *  filtered+ordered list into day sections so the timeline reads at a glance.
 *  Computed in the tenant timezone so the day boundaries match what the user
 *  sees in each row's timestamp. */
function dayGroupLabel(iso: string | Date, timezone: string): string {
  const d = dayjs(iso).tz(timezone);
  const today = dayjs().tz(timezone).startOf("day");
  const diffDays = today.diff(d.startOf("day"), "day");
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.format("dddd, DD MMM YYYY");
}

/* ── Filter state ────────────────────────────────────────────────────── */

interface LocalFilters {
  module: string;
  action: string;
  userId: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  /** Quick-chip flag — when on, only rows whose action is in CRITICAL_ACTIONS
   *  are shown. Independent of the action-group dropdown so an inspector can
   *  combine "Critical only" with a module filter. */
  criticalOnly: boolean;
}

const EMPTY_FILTERS: LocalFilters = {
  module: "all",
  action: "all",
  userId: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
  criticalOnly: false,
};

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

export function AuditTrailPage({ logs, totalCount, truncated, limit }: AuditTrailPageProps) {
  const router = useRouter();
  const { users, org } = useTenantConfig();
  const timezone = org.timezone;
  const [filters, setFilters] = useState<LocalFilters>(EMPTY_FILTERS);

  const setFilter = <K extends keyof LocalFilters>(key: K, value: LocalFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const anyFilter =
    filters.module !== "all" ||
    filters.action !== "all" ||
    filters.userId !== "all" ||
    filters.search.trim() !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.criticalOnly;

  /** Apply a [from, to] date range to the dateFrom/dateTo inputs. Used by
   *  the Today / Last 7 / Last 30 quick chips. */
  const applyDateRange = (daysBack: number) => {
    const to = dayjs().format("YYYY-MM-DD");
    const from = dayjs().subtract(daysBack, "day").format("YYYY-MM-DD");
    setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }));
  };

  const filtered = useMemo(() => {
    let result = logs;
    if (filters.criticalOnly) result = result.filter((e) => CRITICAL_ACTIONS.has(e.action));
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

  /** Slice the filtered (and already newest-first) events into contiguous
   *  day sections for the grouped list. Same data, same order — only the
   *  presentation gains date headers. */
  const groups = useMemo(() => {
    const out: { key: string; label: string; events: AuditLog[] }[] = [];
    let current: { key: string; label: string; events: AuditLog[] } | null = null;
    for (const e of filtered) {
      const key = dayjs(e.createdAt).tz(timezone).format("YYYY-MM-DD");
      if (!current || current.key !== key) {
        current = { key, label: dayGroupLabel(e.createdAt, timezone), events: [] };
        out.push(current);
      }
      current.events.push(e);
    }
    return out;
  }, [filtered, timezone]);

  const AUDIT_HEADERS = ["Timestamp", "User", "Role", "Module", "Action", "Record ID", "Record Title", "Old Value", "New Value"];
  function buildAuditRows() {
    return filtered.map((e) => [
      dayjs(e.createdAt).tz(timezone).format("DD/MM/YYYY HH:mm"),
      e.userName,
      e.userRole ?? "",
      e.module,
      formatAction(e.action),
      e.recordId ?? "",
      e.recordTitle ?? "",
      e.oldValue ?? "",
      e.newValue ?? "",
    ]);
  }

  // Header timestamp is computed in render-time UTC. Trimmed to minute
  // precision so it doesn't churn every second.
  const headerUtc = dayjs().utc().format("YYYY-MM-DD HH:mm");

  // Singular / plural — "1 entry" reads cleaner than "1 entries" on the
  // compliance band. Used by the page-subtitle line.
  const entryWord = (n: number) => (n === 1 ? "entry" : "entries");

  // The chips visually highlight an "active" preset only when the input
  // values match the preset exactly. Keeps the active state honest if the
  // user manually edits the date pickers afterward.
  const isDatePresetActive = (daysBack: number) => {
    const to = dayjs().format("YYYY-MM-DD");
    const from = dayjs().subtract(daysBack, "day").format("YYYY-MM-DD");
    return filters.dateFrom === from && filters.dateTo === to;
  };

  return (
    <main
      id="main-content"
      aria-label="Audit trail"
      className="w-full bg-(--card) text-(--text-primary) min-h-full flex flex-col"
    >
      {/* ── Compliance band — Part 11 trust signal ─────────────────── */}
      <div
        className="border-b border-(--card-border) bg-(--bg-elevated) px-6 py-3 text-(--text-secondary)"
        role="region"
        aria-label="Compliance certification"
      >
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide flex-wrap">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>21 CFR PART 11 AUDIT TRAIL</span>
          <span className="opacity-60" aria-hidden="true">·</span>
          <span className="opacity-80">Actor identity and timestamp on every change</span>
          <span className="ml-auto opacity-60 font-mono">UTC {headerUtc}</span>
        </div>
      </div>

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-(--card-border)">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-(--text-primary) leading-tight">Audit Trail</h1>
            <p className="mt-1 text-[13px] text-(--text-secondary)">
              Record of every action across{" "}
              <span className="font-semibold text-(--text-primary)">{totalCount.toLocaleString()}</span>{" "}
              {entryWord(totalCount)}
              {truncated && (
                <span className="text-(--text-muted)">
                  {" "}· showing the {limit.toLocaleString()} most recent
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <ExportMenu
              filename={`audit-trail-${dayjs().format("YYYY-MM-DD")}`}
              title="Audit Trail"
              subtitle={`${filtered.length} entries · ${dayjs().format("DD MMM YYYY HH:mm")}`}
              headers={AUDIT_HEADERS}
              rows={buildAuditRows}
              variant="ghost"
              label="Export"
              disabled={filtered.length === 0}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              onClick={() => router.refresh()}
              aria-label="Refresh audit log from server"
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-(--card-border) bg-(--bg-elevated)">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--text-muted) pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search user, action, record ID…"
              aria-label="Search audit events"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-(--card) border border-(--card-border) rounded-md focus:outline-none focus:ring-1 focus:ring-(--brand) text-(--text-primary) placeholder:text-(--text-muted)"
            />
          </div>

          {/* Quick chips */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => applyDateRange(0)}
              aria-pressed={isDatePresetActive(0)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                isDatePresetActive(0)
                  ? "bg-(--card) border-(--brand) text-(--brand) font-medium"
                  : "border-(--card-border) bg-transparent text-(--text-secondary) hover:bg-(--card)"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyDateRange(7)}
              aria-pressed={isDatePresetActive(7)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                isDatePresetActive(7)
                  ? "bg-(--card) border-(--brand) text-(--brand) font-medium"
                  : "border-(--card-border) bg-transparent text-(--text-secondary) hover:bg-(--card)"
              }`}
            >
              Last 7 days
            </button>
            <button
              type="button"
              onClick={() => applyDateRange(30)}
              aria-pressed={isDatePresetActive(30)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                isDatePresetActive(30)
                  ? "bg-(--card) border-(--brand) text-(--brand) font-medium"
                  : "border-(--card-border) bg-transparent text-(--text-secondary) hover:bg-(--card)"
              }`}
            >
              Last 30 days
            </button>
            <button
              type="button"
              onClick={() => setFilter("criticalOnly", !filters.criticalOnly)}
              aria-pressed={filters.criticalOnly}
              className={`px-2.5 py-1 rounded-full border transition-colors font-medium ${
                filters.criticalOnly
                  ? "border-(--danger) bg-(--danger) text-white"
                  : "border-(--danger)/40 bg-(--danger-bg) text-(--danger) hover:opacity-80"
              }`}
            >
              Critical only
            </button>
          </div>

          {/* Dropdowns + date range — right-aligned */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Dropdown
              value={filters.module}
              onChange={(v) => setFilter("module", v)}
              options={MODULES}
              width="w-40"
            />
            <Dropdown
              value={filters.action}
              onChange={(v) => setFilter("action", v)}
              options={ACTION_GROUPS.map((a) => ({ value: a, label: a === "all" ? "All actions" : a }))}
              width="w-36"
            />
            <Dropdown
              value={filters.userId}
              onChange={(v) => setFilter("userId", v)}
              options={[{ value: "all", label: "All users" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
              width="w-40"
            />
            <input
              type="date"
              aria-label="From date"
              value={filters.dateFrom}
              onChange={(e) => setFilter("dateFrom", e.target.value)}
              className="px-2 py-1 text-[12px] bg-(--card) border border-(--card-border) rounded-md focus:outline-none focus:ring-1 focus:ring-(--brand) text-(--text-primary)"
              style={{ width: 130 }}
            />
            <input
              type="date"
              aria-label="To date"
              value={filters.dateTo}
              onChange={(e) => setFilter("dateTo", e.target.value)}
              className="px-2 py-1 text-[12px] bg-(--card) border border-(--card-border) rounded-md focus:outline-none focus:ring-1 focus:ring-(--brand) text-(--text-primary)"
              style={{ width: 130 }}
            />
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
          </div>
        </div>

        {/* Counts + severity legend */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-(--text-muted)">
          <Funnel className="h-3 w-3" aria-hidden="true" />
          <span>
            <span className="font-medium text-(--text-primary)">{filtered.length.toLocaleString()}</span> of{" "}
            {logs.length.toLocaleString()} {entryWord(logs.length)}
            {truncated && (
              <span className="opacity-70"> loaded · {totalCount.toLocaleString()} total in DB</span>
            )}
          </span>
          <span className="opacity-40" aria-hidden="true">·</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-(--status-blocked)" aria-hidden="true" />
            Critical
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-(--status-waiting)" aria-hidden="true" />
            Status changes
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-(--status-done)" aria-hidden="true" />
            Creates
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-(--status-pending)" aria-hidden="true" />
            Other
          </span>
        </div>
      </div>

      {/* ── Event list ─────────────────────────────────────────────────
          Wrapped in a flex-1 region so it absorbs any vertical slack when
          the list is shorter than the viewport. This keeps the footer
          compliance band pinned to the bottom of the white surface instead
          of orphaning a large empty area below the last entry. */}
      <div className="flex-1">
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
          <FileSearch className="h-10 w-10 text-(--text-muted) mb-3" aria-hidden="true" />
          <h3 className="text-[13px] font-medium text-(--text-primary)">
            {logs.length === 0
              ? "No audit events yet"
              : "No audit events match your filters"}
          </h3>
          <p className="mt-1 text-[11px] text-(--text-muted) max-w-sm">
            {logs.length === 0
              ? "Once users start acting in the platform, every state change is captured here automatically."
              : "Try widening the date range or clearing module / user filters. The audit trail captures every state change across the platform."}
          </p>
          {anyFilter && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-(--brand) border border-(--brand-border) rounded-md hover:bg-(--brand-muted) bg-(--card) cursor-pointer"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div aria-label="Audit trail entries">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              {/* Sticky day header — gives the stream temporal structure so a
                  reviewer can see "today vs. last week" at a glance. */}
              <h2 className="sticky top-0 z-10 flex items-center justify-between px-6 py-2 bg-(--bg-elevated) border-y border-(--card-border) text-[11px] font-semibold uppercase tracking-wide text-(--text-secondary)">
                <span>{group.label}</span>
                <span className="font-normal normal-case text-(--text-muted)">
                  {group.events.length.toLocaleString()} {entryWord(group.events.length)}
                </span>
              </h2>
              <ul className="divide-y divide-(--bg-border)">
                {group.events.map((event) => (
                  <AuditEventRow
                    key={event.id}
                    event={event}
                    severity={severityOf(event.action)}
                    actionLabel={formatAction(event.action)}
                    timestampLabel={formatTimestamp(event.createdAt, timezone)}
                    timestampIso={dayjs(event.createdAt).toISOString()}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      </div>

      {/* ── Footer compliance band ─────────────────────────────────── */}
      <div className="px-6 py-3 border-t border-(--card-border) bg-(--bg-elevated) text-[11px] text-(--text-muted) flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            Every change is recorded with actor identity and timestamp.
            Retention: 7 years (21 CFR Part 11.10(c)).
          </span>
        </div>
      </div>
    </main>
  );
}
