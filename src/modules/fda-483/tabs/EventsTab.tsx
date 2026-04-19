<<<<<<< HEAD
import clsx from "clsx";
import {
  FileWarning,
  Clock,
  AlertCircle,
  ClipboardList,
  Plus,
  ChevronRight,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type {
  FDA483Event,
  EventType,
  EventStatus,
} from "@/store/fda483.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

function eventTypeBadge(t: EventType) {
  const m: Record<EventType, "red" | "amber" | "blue"> = {
    "FDA 483": "red",
    "Warning Letter": "red",
    "EMA Inspection": "amber",
    "MHRA Inspection": "amber",
    "WHO Inspection": "blue",
  };
  return <Badge variant={m[t]}>{t}</Badge>;
}

function eventStatusBadge(s: EventStatus) {
  const m: Record<EventStatus, "blue" | "red" | "amber" | "green" | "purple" | "gray"> = {
    Open: "blue",
    "Under Investigation": "amber",
    "Response Due": "red",
    "Response Drafted": "purple",
    "Pending QA Sign-off": "amber",
    "Response Submitted": "green",
    "FDA Acknowledged": "green",
    Closed: "gray",
    "Warning Letter": "red",
  };
  return <Badge variant={m[s] ?? "gray"}>{s}</Badge>;
}

function daysLeft(d: string) {
  return dayjs.utc(d).diff(dayjs(), "day");
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  if (e.status === "Closed") return "Closed";
  if (e.status === "Response Submitted") return "Response Submitted";
  if (daysLeft(e.responseDeadline) <= 15) return "Response Due";
  return e.status;
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
  isDark: boolean;
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
  openCount,
  dueCount,
  closedCount,
  typeFilter,
  agencyFilter,
  statusFilter,
  siteFilter,
  anyFilter,
  sites,
  timezone,
  dateFormat,
  isDark,
  role,
  onTypeFilterChange,
  onAgencyFilterChange,
  onStatusFilterChange,
  onSiteFilterChange,
  onClearFilters,
  onOpenEvent,
  onAddEvent,
  computeReadiness,
}: EventsTabProps) {
  return (
    <>
      {/* Tiles */}
      <section
        aria-label="Event statistics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <div className="stat-card" role="region" aria-label="Total events">
          <div className="flex items-center gap-2 mb-2">
            <FileWarning
              className="w-5 h-5 text-[#0ea5e9]"
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Total events</span>
          </div>
          <div className="stat-value">{events.length}</div>
          <div className="stat-sub">
            {events.length === 0
              ? "Log first event"
              : `${closedCount} closed`}
          </div>
        </div>
        <div className="stat-card" role="region" aria-label="Open events">
          <div className="flex items-center gap-2 mb-2">
            <Clock
              className="w-5 h-5"
              style={{ color: openCount > 0 ? "#f59e0b" : "#10b981" }}
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Open</span>
          </div>
          <div
            className="stat-value"
            style={{ color: openCount > 0 ? "#f59e0b" : "#10b981" }}
          >
            {openCount}
          </div>
          <div className="stat-sub">Require action</div>
        </div>
        <div className="stat-card" role="region" aria-label="Response due">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle
              className="w-5 h-5"
              style={{ color: dueCount > 0 ? "#ef4444" : "#10b981" }}
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Response due</span>
          </div>
          <div
            className="stat-value"
            style={{ color: dueCount > 0 ? "#ef4444" : "#10b981" }}
          >
            {dueCount}
          </div>
          <div className="stat-sub">
            {dueCount > 0 ? "15-day FDA deadline" : "No overdue"}
          </div>
        </div>
        <div
          className="stat-card"
          role="region"
          aria-label="Total observations"
        >
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList
              className="w-5 h-5 text-[#6366f1]"
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Total observations</span>
          </div>
          <div className="stat-value text-[#6366f1]">
            {events.reduce((s, e) => s + e.observations.length, 0)}
          </div>
          <div className="stat-sub">Across all events</div>
        </div>
      </section>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Dropdown
          placeholder="All types"
          value={typeFilter}
          onChange={onTypeFilterChange}
          width="w-40"
          options={[
            { value: "", label: "All types" },
            ...[
              "FDA 483",
              "Warning Letter",
              "EMA Inspection",
              "MHRA Inspection",
              "WHO Inspection",
            ].map((t) => ({ value: t, label: t })),
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
            ...["Open", "Response Due", "Response Submitted", "Closed"].map(
              (s) => ({ value: s, label: s }),
            ),
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
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Clear
          </Button>
        )}
      </div>

      {/* Event cards */}
      {events.length === 0 ? (
        <div className="card p-10 text-center">
          <FileWarning
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "#334155" }}
            aria-hidden="true"
          />
          <p
            className="text-[13px] font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            No regulatory events logged yet
          </p>
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Log FDA 483 observations, Warning Letters and EMA/MHRA inspection
            findings to track responses and commitments.
          </p>
          {role !== "viewer" && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={onAddEvent}
            >
              Log first event
            </Button>
          )}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="card p-8 text-center">
          <p
            className="text-[13px]"
            style={{ color: "var(--text-secondary)" }}
          >
            No events match the current filters
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((ev) => {
            const days = daysLeft(ev.responseDeadline);
            const effectiveStatus = getEffectiveStatus(ev);
            const isClosed = effectiveStatus === "Closed" || effectiveStatus === "Response Submitted";
            const isOverdue = !isClosed && days < 0;
            const isUrgent = !isClosed && days >= 0 && days <= 5;
            const obsCount = ev.observations.length;
            const capaCount = ev.observations.filter((o) => !!o.capaId).length;
            const rcaDone = ev.observations.filter((o) => !!o.rootCause?.trim()).length;
            return (
              <div
                key={ev.id}
                className={clsx(
                  "card cursor-pointer transition-all duration-150 hover:border-[#0ea5e9]",
                  isDark ? "hover:bg-[#071e38]" : "hover:bg-[#eff6ff]",
                )}
                onClick={() => onOpenEvent(ev)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenEvent(ev); } }}
                aria-label={`Open ${ev.type} ${ev.referenceNumber}`}
              >
                <div className="card-body">
                  {/* Top */}
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {eventTypeBadge(ev.type)}
                      {eventStatusBadge(getEffectiveStatus(ev))}
                      <span className="font-mono text-[11px] font-semibold text-[#0ea5e9]">
                        {ev.referenceNumber}
                      </span>
                    </div>
                    {isClosed ? (
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                        style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}
                      >
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {effectiveStatus === "Closed" ? "Closed" : "Submitted"}
                      </div>
                    ) : (
                      <div
                        className={clsx(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium",
                          isOverdue
                            ? "bg-[rgba(239,68,68,0.12)] text-[#ef4444]"
                            : isUrgent
                              ? "bg-[rgba(245,158,11,0.12)] text-[#f59e0b]"
                              : "bg-[rgba(16,185,129,0.12)] text-[#10b981]",
                        )}
                      >
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {isOverdue
                          ? `${Math.abs(days)} days overdue`
                          : days === 0
                            ? "Due today"
                            : `${days} days remaining`}
                      </div>
                    )}
                  </div>
                  {/* Info row */}
                  <div
                    className="flex items-center gap-4 mt-2 flex-wrap text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span>
                      {sites.find((s) => s.id === ev.siteId)?.name ??
                        "\u2014"}
                    </span>
                    <span>{ev.agency}</span>
                    <span>
                      {dayjs
                        .utc(ev.inspectionDate)
                        .tz(timezone)
                        .format(dateFormat)}
                    </span>
                  </div>

                  {/* Response readiness progress */}
                  {(() => {
                    const readiness = computeReadiness(ev);
                    const col = readiness >= 100 ? "#10b981" : readiness >= 80 ? "#f59e0b" : readiness >= 41 ? "#f59e0b" : "#ef4444";
                    return (
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--text-muted)" }}>Readiness</span>
                        <div className={clsx("h-1.5 flex-1 rounded-full", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${readiness}%`, background: col }} />
                        </div>
                        <span className="text-[11px] font-bold shrink-0" style={{ color: col }}>{readiness}%</span>
                      </div>
                    );
                  })()}
                  {/* Counts row */}
                  <div className="flex items-center gap-4 mt-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>Observations:</span>{" "}
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{obsCount}</span>
                    </span>
                    <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>|</span>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>CAPAs:</span>{" "}
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{capaCount}</span>
                    </span>
                    <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>|</span>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>RCA:</span>{" "}
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{rcaDone}/{obsCount}</span>
                    </span>
                  </div>
                  {/* Mini step indicator */}
                  {(() => {
                    const rcaState = obsCount === 0 ? "none" : rcaDone === obsCount ? "done" : rcaDone > 0 ? "progress" : "none";
                    const respDone = ev.status === "Response Submitted" || ev.status === "Closed";
                    const miniSteps: { label: string; icon: string; color: string }[] = [
                      { label: "Event", icon: "\u2713", color: "#10b981" },
                      { label: "Observations", icon: obsCount > 0 ? "\u2713" : "\u25CB", color: obsCount > 0 ? "#10b981" : "#64748b" },
                      { label: "RCA", icon: rcaState === "done" ? "\u2713" : rcaState === "progress" ? "\u21BB" : "\u25CB", color: rcaState === "done" ? "#10b981" : rcaState === "progress" ? "#f59e0b" : "#64748b" },
                      { label: "Response", icon: respDone ? "\u2713" : "\u25CB", color: respDone ? "#10b981" : "#64748b" },
                    ];
                    return (
                      <div className="flex items-center gap-3 mt-2 text-[10px]">
                        {miniSteps.map((s, idx) => (
                          <span key={idx} className="flex items-center gap-1" style={{ color: s.color }}>
                            <span aria-hidden="true">{s.icon}</span>
                            <span>{s.label}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  {/* Open event action */}
                  <div className="flex justify-end gap-2 mt-3">
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={ChevronRight}
                      iconPosition="right"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEvent(ev);
                      }}
                    >
                      Open event
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
=======
import clsx from "clsx";
import {
  FileWarning,
  Clock,
  AlertCircle,
  ClipboardList,
  Plus,
  ChevronRight,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type {
  FDA483Event,
  EventType,
  EventStatus,
} from "@/store/fda483.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

function eventTypeBadge(t: EventType) {
  const m: Record<EventType, "red" | "amber" | "blue"> = {
    "FDA 483": "red",
    "Warning Letter": "red",
    "EMA Inspection": "amber",
    "MHRA Inspection": "amber",
    "WHO Inspection": "blue",
  };
  return <Badge variant={m[t]}>{t}</Badge>;
}

function eventStatusBadge(s: EventStatus) {
  const m: Record<EventStatus, "blue" | "red" | "amber" | "green"> = {
    Open: "blue",
    "Response Due": "red",
    "Response Submitted": "amber",
    Closed: "green",
  };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function daysLeft(d: string) {
  return dayjs.utc(d).diff(dayjs(), "day");
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  if (e.status === "Closed") return "Closed";
  if (e.status === "Response Submitted") return "Response Submitted";
  if (daysLeft(e.responseDeadline) <= 15) return "Response Due";
  return e.status;
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
  dateFormat: string;  role: string;
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
  openCount,
  dueCount,
  closedCount,
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
  computeReadiness,
}: EventsTabProps) {
  return (
    <>
      {/* Tiles */}
      <section
        aria-label="Event statistics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <div className="stat-card" role="region" aria-label="Total events">
          <div className="flex items-center gap-2 mb-2">
            <FileWarning
              className="w-5 h-5 text-[#0ea5e9]"
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Total events</span>
          </div>
          <div className="stat-value">{events.length}</div>
          <div className="stat-sub">
            {events.length === 0
              ? "Log first event"
              : `${closedCount} closed`}
          </div>
        </div>
        <div className="stat-card" role="region" aria-label="Open events">
          <div className="flex items-center gap-2 mb-2">
            <Clock
              className="w-5 h-5"
              style={{ color: openCount > 0 ? "#f59e0b" : "#10b981" }}
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Open</span>
          </div>
          <div
            className="stat-value"
            style={{ color: openCount > 0 ? "#f59e0b" : "#10b981" }}
          >
            {openCount}
          </div>
          <div className="stat-sub">Require action</div>
        </div>
        <div className="stat-card" role="region" aria-label="Response due">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle
              className="w-5 h-5"
              style={{ color: dueCount > 0 ? "#ef4444" : "#10b981" }}
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Response due</span>
          </div>
          <div
            className="stat-value"
            style={{ color: dueCount > 0 ? "#ef4444" : "#10b981" }}
          >
            {dueCount}
          </div>
          <div className="stat-sub">
            {dueCount > 0 ? "15-day FDA deadline" : "No overdue"}
          </div>
        </div>
        <div
          className="stat-card"
          role="region"
          aria-label="Total observations"
        >
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList
              className="w-5 h-5 text-[#6366f1]"
              aria-hidden="true"
            />
            <span className="stat-label mb-0">Total observations</span>
          </div>
          <div className="stat-value text-[#6366f1]">
            {events.reduce((s, e) => s + e.observations.length, 0)}
          </div>
          <div className="stat-sub">Across all events</div>
        </div>
      </section>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Dropdown
          placeholder="All types"
          value={typeFilter}
          onChange={onTypeFilterChange}
          width="w-40"
          options={[
            { value: "", label: "All types" },
            ...[
              "FDA 483",
              "Warning Letter",
              "EMA Inspection",
              "MHRA Inspection",
              "WHO Inspection",
            ].map((t) => ({ value: t, label: t })),
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
            ...["Open", "Response Due", "Response Submitted", "Closed"].map(
              (s) => ({ value: s, label: s }),
            ),
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
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Clear
          </Button>
        )}
      </div>

      {/* Event cards */}
      {events.length === 0 ? (
        <div className="card p-10 text-center">
          <FileWarning
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "#334155" }}
            aria-hidden="true"
          />
          <p
            className="text-[13px] font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            No regulatory events logged yet
          </p>
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Log FDA 483 observations, Warning Letters and EMA/MHRA inspection
            findings to track responses and commitments.
          </p>
          {role !== "viewer" && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={onAddEvent}
            >
              Log first event
            </Button>
          )}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="card p-8 text-center">
          <p
            className="text-[13px]"
            style={{ color: "var(--text-secondary)" }}
          >
            No events match the current filters
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((ev) => {
            const days = daysLeft(ev.responseDeadline);
            const effectiveStatus = getEffectiveStatus(ev);
            const isClosed = effectiveStatus === "Closed" || effectiveStatus === "Response Submitted";
            const isOverdue = !isClosed && days < 0;
            const isUrgent = !isClosed && days >= 0 && days <= 5;
            const obsCount = ev.observations.length;
            const capaCount = ev.observations.filter((o) => !!o.capaId).length;
            const rcaDone = ev.observations.filter((o) => !!o.rootCause?.trim()).length;
            return (
              <div
                key={ev.id}
                className={clsx(
                  "card cursor-pointer transition-all duration-150 hover:border-[#0ea5e9] hover:bg-(--brand-muted)",
                )}
                onClick={() => onOpenEvent(ev)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenEvent(ev); } }}
                aria-label={`Open ${ev.type} ${ev.referenceNumber}`}
              >
                <div className="card-body">
                  {/* Top */}
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {eventTypeBadge(ev.type)}
                      {eventStatusBadge(getEffectiveStatus(ev))}
                      <span className="font-mono text-[11px] font-semibold text-[#0ea5e9]">
                        {ev.referenceNumber}
                      </span>
                    </div>
                    {isClosed ? (
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                        style={{ background: "var(--success-bg)", color: "#10b981" }}
                      >
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {effectiveStatus === "Closed" ? "Closed" : "Submitted"}
                      </div>
                    ) : (
                      <div
                        className={clsx(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium",
                          isOverdue
                            ? "bg-(--danger-bg) text-[#ef4444]"
                            : isUrgent
                              ? "bg-(--warning-bg) text-[#f59e0b]"
                              : "bg-(--success-bg) text-[#10b981]",
                        )}
                      >
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {isOverdue
                          ? `${Math.abs(days)} days overdue`
                          : days === 0
                            ? "Due today"
                            : `${days} days remaining`}
                      </div>
                    )}
                  </div>
                  {/* Info row */}
                  <div
                    className="flex items-center gap-4 mt-2 flex-wrap text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span>
                      {sites.find((s) => s.id === ev.siteId)?.name ??
                        "\u2014"}
                    </span>
                    <span>{ev.agency}</span>
                    <span>
                      {dayjs
                        .utc(ev.inspectionDate)
                        .tz(timezone)
                        .format(dateFormat)}
                    </span>
                  </div>

                  {/* Response readiness progress */}
                  {(() => {
                    const readiness = computeReadiness(ev);
                    const col = readiness >= 100 ? "#10b981" : readiness >= 80 ? "#f59e0b" : readiness >= 41 ? "#f59e0b" : "#ef4444";
                    return (
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--text-muted)" }}>Readiness</span>
                        <div className={clsx("h-1.5 flex-1 rounded-full", "bg-(--bg-border)")}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${readiness}%`, background: col }} />
                        </div>
                        <span className="text-[11px] font-bold shrink-0" style={{ color: col }}>{readiness}%</span>
                      </div>
                    );
                  })()}
                  {/* Counts row */}
                  <div className="flex items-center gap-4 mt-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>Observations:</span>{" "}
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{obsCount}</span>
                    </span>
                    <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>|</span>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>CAPAs:</span>{" "}
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{capaCount}</span>
                    </span>
                    <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>|</span>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>RCA:</span>{" "}
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{rcaDone}/{obsCount}</span>
                    </span>
                  </div>
                  {/* Mini step indicator */}
                  {(() => {
                    const rcaState = obsCount === 0 ? "none" : rcaDone === obsCount ? "done" : rcaDone > 0 ? "progress" : "none";
                    const respDone = ev.status === "Response Submitted" || ev.status === "Closed";
                    const miniSteps: { label: string; icon: string; color: string }[] = [
                      { label: "Event", icon: "\u2713", color: "#10b981" },
                      { label: "Observations", icon: obsCount > 0 ? "\u2713" : "\u25CB", color: obsCount > 0 ? "#10b981" : "#64748b" },
                      { label: "RCA", icon: rcaState === "done" ? "\u2713" : rcaState === "progress" ? "\u21BB" : "\u25CB", color: rcaState === "done" ? "#10b981" : rcaState === "progress" ? "#f59e0b" : "#64748b" },
                      { label: "Response", icon: respDone ? "\u2713" : "\u25CB", color: respDone ? "#10b981" : "#64748b" },
                    ];
                    return (
                      <div className="flex items-center gap-3 mt-2 text-[10px]">
                        {miniSteps.map((s, idx) => (
                          <span key={idx} className="flex items-center gap-1" style={{ color: s.color }}>
                            <span aria-hidden="true">{s.icon}</span>
                            <span>{s.label}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  {/* Open event action */}
                  <div className="flex justify-end gap-2 mt-3">
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={ChevronRight}
                      iconPosition="right"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEvent(ev);
                      }}
                    >
                      Open event
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
>>>>>>> 21ab890b6aefc93457f3a82fd19e6298bb7a5a7d
