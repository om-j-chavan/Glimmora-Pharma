"use client";

import { useState, useEffect } from "react";
import {
  FileWarning,
  Filter,
  Plus,
  ArrowRight,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { FDA483Event, EventStatus } from "@/types/fda483";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Pagination } from "@/components/ui/Pagination";
import { DataTable, type Column } from "@/components/shared";
import {
  daysUntil,
  getEffectiveEventStatus,
  eventStatusBadge,
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
  // Client-side pagination — same shared Pagination + page size (25) the other
  // list modules use. Reset to page 1 whenever the filters change.
  const [page, setPage] = useState(1);
  const pageSize = 25;
  useEffect(() => {
    setPage(1);
  }, [typeFilter, agencyFilter, statusFilter, siteFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageEvents = filteredEvents.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      {/* ── Filter bar — standard pattern (Filter icon + Filters + Dropdowns) ── */}
      <section
        aria-label="FDA 483 event filters"
        className="flex items-center gap-3 flex-wrap p-3 rounded-xl mb-4"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
      >
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {filteredEvents.length} of {events.length}
          </span>
          {anyFilter && (
            <Button variant="ghost" size="sm" onClick={onClearFilters}>Clear</Button>
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
      ) : filteredEvents.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            No events match the current filters
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <DataTable
            ariaLabel="FDA 483 events"
            caption="Regulatory events with type, site, observations, RCA progress, status, and response deadline"
            minWidth={880}
            data={pageEvents}
            rowKey={(ev) => ev.id}
            onRowClick={onOpenEvent}
            rowStyle={(ev) =>
              (getEffectiveStatus(ev) === "Closed" || getEffectiveStatus(ev) === "Response Submitted")
                ? { opacity: 0.6 }
                : undefined
            }
            footer={
              <Pagination
                page={safePage}
                pageSize={pageSize}
                total={filteredEvents.length}
                onChange={setPage}
                itemLabel="event"
                className="mt-4"
              />
            }
            columns={[
              {
                key: "reference",
                header: "Reference",
                cellClassName: "font-mono text-[12px] font-semibold text-(--brand)",
                render: (ev) => ev.referenceNumber,
              },
              {
                key: "type",
                header: "Type",
                render: (ev) => <Badge variant="gray">{ev.type}</Badge>,
              },
              {
                key: "site",
                header: "Site",
                cellClassName: "text-[12px] text-(--text-secondary)",
                render: (ev) => sites.find((s) => s.id === ev.siteId)?.name ?? "—",
              },
              {
                key: "obs",
                header: "Obs",
                cellClassName: "text-[12px] text-(--text-secondary)",
                render: (ev) => ev.observations.length,
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
                render: (ev) => {
                  const days = daysLeft(ev.responseDeadline);
                  const effectiveStatus = getEffectiveStatus(ev);
                  const isClosed = effectiveStatus === "Closed" || effectiveStatus === "Response Submitted";
                  return isClosed ? (
                    "—"
                  ) : (
                    <>
                      {dayjs.utc(ev.responseDeadline).tz(timezone).format(dateFormat)}
                      {days < 0 && (
                        <span className="block text-[10px]" style={{ color: "var(--danger)" }}>
                          {Math.abs(days)}d overdue
                        </span>
                      )}
                      {days >= 0 && days <= 5 && (
                        <span className="block text-[10px]" style={{ color: "var(--danger)" }}>
                          {days === 0 ? "Due today" : `${days}d left`}
                        </span>
                      )}
                    </>
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
