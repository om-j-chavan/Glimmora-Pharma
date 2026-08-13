"use client";

import { useState, useEffect } from "react";
import {
  FileWarning,
  Filter,
  Plus,
  ArrowRight,
  Search,
  Building2,
  MapPin,
  CalendarDays,
  ClipboardList,
  Workflow,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { FDA483Event, EventStatus } from "@/types/fda483";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Pagination } from "@/components/ui/Pagination";
import { DataTable, type Column } from "@/components/shared";
import {
  daysUntil,
  getEffectiveEventStatus,
  eventStatusBadge,
  eventTypeBadge,
  isEventLocked,
  STAGE_CONFIG,
} from "../_shared";

/* ── Helpers ── */

function daysLeft(d: string): number {
  return daysUntil(d) ?? 0;
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  return getEffectiveEventStatus(e.status, e.responseDeadline);
}

interface Site {
  id: string;
  name: string;
}

export interface EventsTabProps {
  events: FDA483Event[];
  filteredEvents: FDA483Event[];
  openCount: number;
  dueCount: number;
  closedCount: number;
  typeFilter: string;
  agencyFilter: string;
  statusFilter: string;
  siteFilter: string;
  anyFilter: boolean;
  sites: Site[];
  timezone: string;
  dateFormat: string;
  role: string;
  onTypeFilterChange: (v: string) => void;
  onAgencyFilterChange: (v: string) => void;
  onStatusFilterChange: (v: string) => void;
  onSiteFilterChange: (v: string) => void;
  onClearFilters: () => void;
  onOpenEvent: (e: FDA483Event) => void;
  onAddEvent: () => void;
  computeReadiness: (e: FDA483Event) => number;
}

export function EventsTab({
  events,
  filteredEvents,
  typeFilter,
  agencyFilter,
  statusFilter,
  siteFilter,
  anyFilter,
  sites,
  timezone,
  dateFormat,
  role,
  onTypeFilterChange,
  onAgencyFilterChange,
  onStatusFilterChange,
  onSiteFilterChange,
  onClearFilters,
  onOpenEvent,
  onAddEvent,
}: EventsTabProps) {
  // Client-side text search — narrows the already-filtered list by reference,
  // type, or site name. Presentation only: it never touches the parent's
  // filter/query state, just this component's rendered/paginated slice.
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const searchedEvents = q
    ? filteredEvents.filter(
        (e) =>
          e.referenceNumber.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q) ||
          (sites.find((s) => s.id === e.siteId)?.name ?? "")
            .toLowerCase()
            .includes(q),
      )
    : filteredEvents;

  // Clears both the local search and the parent-owned dropdown filters.
  const handleClear = () => {
    setSearch("");
    onClearFilters();
  };

  // Client-side pagination — same shared Pagination + page size (25) the other
  // list modules use. Reset to page 1 whenever the filters or search change.
  const [page, setPage] = useState(1);
  const pageSize = 25;
  useEffect(() => {
    setPage(1);
  }, [typeFilter, agencyFilter, statusFilter, siteFilter, search]);
  const totalPages = Math.max(1, Math.ceil(searchedEvents.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageEvents = searchedEvents.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      {/* ── Filter bar — standard pattern (Filter icon + Filters + Dropdowns) ── */}
      <section
        aria-label="FDA 483 event filters"
        className="flex items-center gap-3 flex-wrap p-3 rounded-2xl mb-4"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
      >
        <Input
          id="events-search"
          type="search"
          icon={Search}
          placeholder="Search events…"
          aria-label="Search events by reference or type"
          className="w-full sm:w-56"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>
        <Dropdown
          placeholder="All types"
          value={typeFilter}
          onChange={onTypeFilterChange}
          width="w-40"
          options={[
            { value: "", label: "All types" },
            ...["FDA 483", "Warning Letter", "EMA Inspection", "MHRA Inspection", "WHO Inspection"].map((t) => ({ value: t, label: t })),
          ]}
        />
        <Dropdown
          placeholder="All agencies"
          value={agencyFilter}
          onChange={onAgencyFilterChange}
          width="w-36"
          options={[
            { value: "", label: "All agencies" },
            ...["FDA", "EMA", "MHRA", "WHO"].map((a) => ({ value: a, label: a })),
          ]}
        />
        <Dropdown
          placeholder="All statuses"
          value={statusFilter}
          onChange={onStatusFilterChange}
          width="w-40"
          options={[
            { value: "", label: "All statuses" },
            ...["Open", "Response Due", "Response Submitted", "Closed"].map((s) => ({ value: s, label: s })),
          ]}
        />
        {/* Sites filter — customer_admin only. Every other role in
            FDA483_VIEW_ROLES (qa_head, regulatory_affairs) works a single
            site's events in practice, so the picker is noise for them.
            VISIBILITY ONLY: the parent still owns `siteFilter` and its query is
            unchanged; hiding the control simply leaves the filter at its
            default for those roles. */}
        {role === "customer_admin" && (
          <Dropdown
            placeholder="All sites"
            value={siteFilter}
            onChange={onSiteFilterChange}
            width="w-36"
            options={[
              { value: "", label: "All sites" },
              ...sites.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {searchedEvents.length} of {events.length}
          </span>
          {(anyFilter || q) && (
            <Button variant="ghost" size="sm" onClick={handleClear}>Clear</Button>
          )}
        </div>
      </section>

      {/* ── List ── */}
      {events.length === 0 ? (
        <div className="card p-10 text-center">
          <FileWarning className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
            No regulatory events logged yet
          </p>
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
            Log FDA 483 observations, Warning Letters and EMA/MHRA inspection findings to track responses and commitments.
          </p>
          {role !== "viewer" && (
            <Button variant="primary" size="sm" icon={Plus} onClick={onAddEvent}>
              Log first event
            </Button>
          )}
        </div>
      ) : searchedEvents.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            No events match the current filters
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={handleClear}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <DataTable
            ariaLabel="FDA 483 events"
            caption="Regulatory events with type, agency, site, workflow stage, observations, RCA progress, status, and response deadline"
            // 880 → 1040: the Reference cell now stacks agency beneath the code
            // and a Stage column was added, so the row needs more room before the
            // table's own horizontal scroll engages.
            minWidth={1040}
            data={pageEvents}
            rowKey={(ev) => ev.id}
            onRowClick={onOpenEvent}
            rowStyle={(ev) =>
              isEventLocked(getEffectiveStatus(ev))
                ? { opacity: 0.6 }
                : undefined
            }
            footer={
              // px-4 aligns the "Showing …" line with the table's row cells
              // (bodyCell px-4); pt-2/pb-3 give it breathing room from the table
              // and the card edge.
              <div className="px-4 pt-2 pb-3">
                <Pagination
                  page={safePage}
                  pageSize={pageSize}
                  total={searchedEvents.length}
                  onChange={setPage}
                  itemLabel="event"
                />
              </div>
            }
            columns={[
              {
                key: "reference",
                header: "Reference",
                // Identity cell: an icon tile carries the reference, with the
                // AGENCY beneath it. Agency was already on the row data and on
                // the model (FDA483Event.agency) but had no column — surfacing
                // it here is additive display, no query change.
                render: (ev) => (
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--brand-muted)">
                      <FileWarning className="h-3.5 w-3.5 text-(--brand)" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-[12px] font-semibold text-(--brand) truncate">
                        {ev.referenceNumber}
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-(--text-muted)">
                        <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {ev.agency}
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                key: "type",
                header: "Type",
                // Restyle only: the label is still `ev.type` verbatim. Previously
                // hardcoded `variant="gray"`, which discarded the module's own
                // per-type colour map; `eventTypeBadge` is the existing helper
                // over FDA483_EVENT_TYPE_VARIANT (_shared.ts:139). No key, label
                // or map value changed.
                render: (ev) => {
                  const t = eventTypeBadge(ev.type);
                  return <Badge variant={t.variant}>{t.label}</Badge>;
                },
              },
              {
                key: "site",
                header: "Site",
                // Column HIDDEN from display. `hidden` is DataTable's own
                // per-column flag (the Actions column already uses it), so the
                // column definition, `ev.siteId`, the `sites` prop and the site
                // filter all remain — only the rendered column is dropped.
                hidden: true,
                render: (ev) => (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-(--text-secondary)">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" aria-hidden="true" />
                    {sites.find((s) => s.id === ev.siteId)?.name ?? "—"}
                  </span>
                ),
              },
              {
                key: "stage",
                header: "Stage",
                // Ownership pointer (`currentStage`), rendered from the existing
                // STAGE_CONFIG display map (_shared.ts:65). Read-only surfacing of
                // a field already on the row — no transition logic here.
                render: (ev) => {
                  const cfg = STAGE_CONFIG[ev.currentStage];
                  if (!cfg) return <span className="text-[12px] text-(--text-muted)">—</span>;
                  return (
                    <span className="inline-flex items-start gap-1.5 min-w-0">
                      <Workflow className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--text-muted)" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-[12px] text-(--text-primary) truncate">{cfg.label}</span>
                        {cfg.ownerLabel && cfg.ownerLabel !== "—" && (
                          <span className="block text-[10px] text-(--text-muted) truncate">{cfg.ownerLabel}</span>
                        )}
                      </span>
                    </span>
                  );
                },
              },
              {
                key: "obs",
                header: "Obs",
                render: (ev) => (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-(--text-secondary)">
                    <ClipboardList className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" aria-hidden="true" />
                    {ev.observations.length}
                  </span>
                ),
              },
              {
                key: "rca",
                header: "RCA",
                render: (ev) => {
                  const obsCount = ev.observations.length;
                  const rcaDone = ev.observations.filter((o) => !!o.rootCause?.trim()).length;
                  const rcaColor =
                    obsCount === 0 ? "var(--text-muted)"
                    : rcaDone === obsCount ? "var(--success)"
                    : rcaDone > 0 ? "var(--brand)"
                    : "var(--text-muted)";
                  return (
                    <span className="text-[12px]" style={{ color: rcaColor }}>
                      {obsCount === 0 ? "—" : `${rcaDone}/${obsCount}`}
                    </span>
                  );
                },
              },
              {
                key: "status",
                header: "Status",
                render: (ev) => {
                  const stat = eventStatusBadge(getEffectiveStatus(ev));
                  return <Badge variant={stat.variant}>{stat.label}</Badge>;
                },
              },
              {
                key: "deadline",
                header: "Deadline",
                cellClassName: "text-[12px] text-(--text-secondary)",
                // Same dates, same thresholds, same wording — `daysLeft`,
                // `getEffectiveStatus` and `isEventLocked` are called exactly as
                // before. Only the presentation changed: a calendar icon, and the
                // urgency line promoted from loose red text to a tinted pill so
                // it reads at a glance down a column of 25 rows.
                render: (ev) => {
                  const days = daysLeft(ev.responseDeadline);
                  const effectiveStatus = getEffectiveStatus(ev);
                  const isClosed = isEventLocked(effectiveStatus);
                  const urgent = days < 0 || (days >= 0 && days <= 5);
                  return isClosed ? (
                    <span className="text-(--text-muted)">—</span>
                  ) : (
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" aria-hidden="true" />
                        {dayjs.utc(ev.responseDeadline).tz(timezone).format(dateFormat)}
                      </span>
                      {urgent && (
                        <span
                          className="mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
                        >
                          {days < 0
                            ? `${Math.abs(days)}d overdue`
                            : days === 0
                              ? "Due today"
                              : `${days}d left`}
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: "open",
                header: "Open",
                srOnly: true,
                render: () => (
                  <ArrowRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                ),
              },
            ] satisfies Column<FDA483Event>[]}
          />
        </div>
      )}
    </>
  );
}
