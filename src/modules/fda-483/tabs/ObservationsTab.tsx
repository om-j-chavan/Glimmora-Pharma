import { useNavigate } from "react-router";
import dayjs from "@/lib/dayjs";
import {
  ClipboardList,
  ClipboardCheck,
  CheckSquare,
  Plus,
  Pencil,
} from "lucide-react";
import type {
  FDA483Event,
  EventType,
  EventStatus,
  Observation,
  ObservationSeverity,
} from "@/store/fda483.slice";
import type { CAPA } from "@/store/capa.slice";
import { Button } from "@/components/ui/Button";
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

function obsSevBadge(s: ObservationSeverity) {
  return (
    <Badge
      variant={s === "Critical" ? "red" : s === "High" ? "amber" : "green"}
    >
      {s}
    </Badge>
  );
}

function obsStatBadge(s: Observation["status"]) {
  const m: Record<string, "blue" | "amber" | "purple" | "green"> = {
    Open: "blue",
    "RCA In Progress": "amber",
    "Response Drafted": "purple",
    Closed: "green",
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

export interface ObservationsTabProps {
  liveEvent: FDA483Event | null;
  capas: CAPA[];
  sites: Site[];
  timezone: string;
  dateFormat: string;
  isDark: boolean;
  role: string;
  ownerName: (id: string) => string;
  onGoToEvents: () => void;
  onAddObservation: () => void;
  onEditObservation: (obs: Observation) => void;
  onAddCommitment: () => void;
}

export function ObservationsTab({
  liveEvent,
  capas,
  sites,
  timezone,
  dateFormat,
  isDark,
  role,
  ownerName,
  onGoToEvents,
  onAddObservation,
  onEditObservation,
  onAddCommitment,
}: ObservationsTabProps) {
  // Lock levels:
  //  fullyLocked = Response Submitted or Closed → everything read-only
  //  hasLinkedCapa = any observation has a CAPA → show soft warning
  const fullyLocked = liveEvent?.status === "Response Submitted" || liveEvent?.status === "Closed";
  const hasLinkedCapa = (liveEvent?.observations ?? []).some((o) => !!o.capaId);

  const navigate = useNavigate();

  if (!liveEvent) {
    return (
      <div className="card p-8 text-center">
        <ClipboardList
          className="w-10 h-10 mx-auto mb-2"
          style={{ color: "#334155" }}
          aria-hidden="true"
        />
        <p
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Select an event from the Events tab to view observations
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={onGoToEvents}
        >
          Go to Events
        </Button>
      </div>
    );
  }

  const eventCAPAs = capas.filter((c) =>
    liveEvent.observations.some((o) => o.capaId === c.id),
  );

  return (
    <>
      {/* Event summary header */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {eventTypeBadge(liveEvent.type)}
                {eventStatusBadge(getEffectiveStatus(liveEvent))}
                <span className="font-mono text-[12px] font-semibold text-[#0ea5e9]">
                  {liveEvent.referenceNumber}
                </span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
                {(
                  [
                    ["Agency", liveEvent.agency],
                    [
                      "Site",
                      sites.find((s) => s.id === liveEvent.siteId)
                        ?.name ?? "\u2014",
                    ],
                    [
                      "Inspection",
                      dayjs
                        .utc(liveEvent.inspectionDate)
                        .tz(timezone)
                        .format(dateFormat),
                    ],
                    [
                      "Deadline",
                      dayjs
                        .utc(liveEvent.responseDeadline)
                        .tz(timezone)
                        .format(dateFormat),
                    ],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l}>
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {l}
                    </span>
                    <span
                      className="text-[12px]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {role !== "viewer" && !fullyLocked && (
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={onAddObservation}
              >
                Add observation
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Lock banner — event submitted/closed (21 CFR Part 11) */}
      {fullyLocked && (
        <div
          role="status"
          className="flex items-start gap-2 p-3 rounded-xl mb-4 border"
          style={{
            background: isDark ? "rgba(16,185,129,0.08)" : "#f0fdf4",
            borderColor: isDark ? "rgba(16,185,129,0.25)" : "#a7f3d0",
          }}
        >
          <ClipboardCheck className="w-4 h-4 mt-0.5 shrink-0 text-[#10b981]" aria-hidden="true" />
          <div>
            <p className="text-[12px] font-semibold text-[#10b981]">
              Record locked &mdash; response submitted
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              This response has been signed and submitted. The record is locked under 21 CFR Part 11.
            </p>
          </div>
        </div>
      )}

      {/* Soft warning — CAPAs linked but not yet submitted */}
      {!fullyLocked && hasLinkedCapa && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-xl mb-4 border"
          style={{
            background: isDark ? "rgba(245,158,11,0.08)" : "#fffbeb",
            borderColor: isDark ? "rgba(245,158,11,0.25)" : "#fde68a",
          }}
        >
          <span aria-hidden="true" className="text-[14px]">&#9888;&#65039;</span>
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            This event has linked CAPAs. Edits may affect the CAPA records &mdash; proceed with caution.
          </p>
        </div>
      )}

      {/* Observations table */}
      <div className="card overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table
            className="data-table"
            aria-label="Regulatory event observations"
          >
            <caption className="sr-only">
              Observations from {liveEvent.referenceNumber}
            </caption>
            <thead>
              <tr>
                <th scope="col">No.</th>
                <th scope="col">Observation</th>
                <th scope="col">Area</th>
                <th scope="col">Regulation</th>
                <th scope="col">Severity</th>
                <th scope="col">RCA</th>
                <th scope="col">CAPA</th>
                <th scope="col">Status</th>
                {role !== "viewer" && (
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {liveEvent.observations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-6">
                    <p
                      className="text-[12px] italic"
                      style={{ color: "var(--text-muted)" }}
                    >
                      No observations logged. Click &ldquo;Add
                      observation&rdquo; above.
                    </p>
                  </td>
                </tr>
              ) : (
                liveEvent.observations.map((obs) => (
                  <tr key={obs.id}>
                    <th scope="row">
                      <span
                        className="font-mono text-[12px] font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        #{obs.number}
                      </span>
                    </th>
                    <td>
                      <p
                        className="text-[12px] line-clamp-2"
                        style={{
                          maxWidth: 240,
                          color: "var(--text-primary)",
                        }}
                      >
                        {obs.text}
                      </p>
                    </td>
                    <td
                      className="text-[12px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {obs.area || "\u2014"}
                    </td>
                    <td
                      className="text-[11px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {obs.regulation || "\u2014"}
                    </td>
                    <td>{obsSevBadge(obs.severity)}</td>
                    <td>
                      {obs.rcaMethod ? (
                        <Badge variant="purple">{obs.rcaMethod}</Badge>
                      ) : (
                        <span
                          className="text-[11px] italic"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Pending
                        </span>
                      )}
                    </td>
                    <td>
                      {obs.capaId ? (() => {
                        // Live lookup from the capa.items Redux slice (via capas prop)
                        const linkedCapa = capas.find((c) => c.id === obs.capaId);
                        const isClosed = linkedCapa?.status === "Closed";
                        return (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                navigate("/capa", {
                                  state: { openCapaId: obs.capaId },
                                })
                              }
                              className="font-mono text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer shrink-0"
                              aria-label={`Open ${obs.capaId}`}
                            >
                              {obs.capaId}
                            </button>
                            {linkedCapa && (
                              <Badge variant={isClosed ? "green" : linkedCapa.status === "Pending QA Review" ? "purple" : linkedCapa.status === "In Progress" ? "amber" : "blue"}>
                                {isClosed ? "Closed \u2713" : linkedCapa.status}
                              </Badge>
                            )}
                          </div>
                        );
                      })() : (
                        <span
                          className="text-[11px] italic"
                          style={{ color: "var(--text-muted)" }}
                        >
                          &mdash;
                        </span>
                      )}
                    </td>
                    <td>{obsStatBadge(obs.status)}</td>
                    {role !== "viewer" && (
                      <td>
                        {fullyLocked ? (
                          <Badge variant="gray">Locked</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={Pencil}
                            aria-label={`Edit observation ${obs.number}`}
                            onClick={() => onEditObservation(obs)}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commitments */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <CheckSquare
              className="w-4 h-4 text-[#10b981]"
              aria-hidden="true"
            />
            <span className="card-title">Commitments</span>
          </div>
          <span
            className="ml-auto text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {liveEvent.commitments.length} items
          </span>
          {role !== "viewer" && !fullyLocked && (
            <Button
              variant="ghost"
              size="sm"
              icon={Plus}
              className="ml-2"
              onClick={onAddCommitment}
            >
              Add
            </Button>
          )}
        </div>
        <div className="card-body">
          {liveEvent.commitments.length === 0 ? (
            <p
              className="text-[11px] italic"
              style={{ color: "var(--text-muted)" }}
            >
              No commitments logged. Add commitments to track response
              obligations.
            </p>
          ) : (
            liveEvent.commitments.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between py-3 border-b last:border-0"
                style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <p
                    className="text-[12px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {c.text}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Due:{" "}
                      {dayjs
                        .utc(c.dueDate)
                        .tz(timezone)
                        .format(dateFormat)}
                      {dayjs.utc(c.dueDate).isBefore(dayjs()) &&
                        c.status !== "Complete" && (
                          <span className="text-[#ef4444] ml-1">
                            &mdash; Overdue
                          </span>
                        )}
                    </span>
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {ownerName(c.owner)}
                    </span>
                  </div>
                </div>
                <Badge
                  variant={
                    c.status === "Complete"
                      ? "green"
                      : c.status === "Overdue"
                        ? "red"
                        : c.status === "In Progress"
                          ? "amber"
                          : "blue"
                  }
                >
                  {c.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CAPA set */}
      <div className="card mt-4">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <ClipboardCheck
              className="w-4 h-4 text-[#0ea5e9]"
              aria-hidden="true"
            />
            <span className="card-title">CAPA set</span>
          </div>
          <span
            className="ml-auto text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {eventCAPAs.length} CAPA{eventCAPAs.length !== 1 ? "s" : ""}
            {eventCAPAs.length > 0 && ` \u00b7 ${eventCAPAs.filter((c) => c.status === "Closed").length} closed`}
          </span>
        </div>
        <div className="card-body">
          {eventCAPAs.length === 0 ? (
            <p
              className="text-[11px] italic"
              style={{ color: "var(--text-muted)" }}
            >
              No CAPAs raised yet. Open RCA Workspace to raise CAPAs
              for each observation.
            </p>
          ) : (
            eventCAPAs.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-2.5 border-b last:border-0 cursor-pointer hover:opacity-80"
                style={{
                  borderColor: isDark ? "#0f2039" : "#f1f5f9",
                }}
                onClick={() =>
                  navigate("/capa", { state: { openCapaId: c.id } })
                }
                role="button"
                aria-label={`Open ${c.id}`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-mono text-[11px] font-semibold text-[#0ea5e9] flex-shrink-0">
                    {c.id}
                  </span>
                  <span
                    className="text-[11px] truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {c.description}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <Badge
                    variant={
                      c.risk === "Critical"
                        ? "red"
                        : c.risk === "High"
                          ? "amber"
                          : "green"
                    }
                  >
                    {c.risk}
                  </Badge>
                  <Badge
                    variant={
                      c.status === "Closed"
                        ? "green"
                        : c.status === "Pending QA Review"
                          ? "purple"
                          : c.status === "In Progress"
                            ? "amber"
                            : "blue"
                    }
                  >
                    {c.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
