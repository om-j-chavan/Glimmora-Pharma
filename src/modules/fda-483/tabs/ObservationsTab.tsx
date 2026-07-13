import { useRouter } from "next/navigation";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import {
  ClipboardList,
  ClipboardCheck,
  CheckSquare,
  Plus,
  Pencil,
} from "lucide-react";
import type {
  FDA483Event,
  EventStatus,
  Observation,
  ObservationSeverity,
} from "@/types/fda483";
import type { CAPA } from "@/store/capa.slice";
import { STATUS_LABEL as CAPA_STATUS_LABEL } from "@/types/capa";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/shared";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/severity";
import {
  eventStatusBadge,
  eventTypeBadge,
  getEffectiveEventStatus,
  observationSeverityBadge,
  observationStatusBadge,
} from "../_shared";

/* ── Helpers ──
 * Inline badge / status helpers extracted to ../_shared.ts. Thin
 * wrappers below preserve the pre-refactor call shape for the JSX. */

function obsSevBadge(s: ObservationSeverity) {
  const b = observationSeverityBadge(s);
  return <Badge variant={b.variant}>{b.label}</Badge>;
}

function obsStatBadge(s: Observation["status"]) {
  const b = observationStatusBadge(s);
  return <Badge variant={b.variant}>{b.label}</Badge>;
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  return getEffectiveEventStatus(e.status, e.responseDeadline);
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
  role,
  ownerName,
  onGoToEvents,
  onAddObservation,
  onEditObservation,
  onAddCommitment,
}: ObservationsTabProps) {
  const isDark = useAppSelector((s) => s.theme.mode === "dark");
  // Lock levels:
  //  fullyLocked = Response Submitted or Closed → everything read-only
  //  hasLinkedCapa = any observation has a CAPA → show soft warning
  const fullyLocked = liveEvent?.status === "Response Submitted" || liveEvent?.status === "Closed";
  const hasLinkedCapa = (liveEvent?.observations ?? []).some((o) => !!o.capaId);

  const router = useRouter();

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
                {(() => {
                  const t = eventTypeBadge(liveEvent.type);
                  return <Badge variant={t.variant}>{t.label}</Badge>;
                })()}
                {(() => {
                  const s = eventStatusBadge(getEffectiveStatus(liveEvent));
                  return <Badge variant={s.variant}>{s.label}</Badge>;
                })()}
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
        <DataTable
          ariaLabel="Regulatory event observations"
          caption={`Observations from ${liveEvent.referenceNumber}`}
          data={liveEvent.observations}
          rowKey={(obs) => obs.id}
          emptyState={
            <p
              className="text-[12px] italic"
              style={{ color: "var(--text-muted)" }}
            >
              No observations logged. Click &ldquo;Add
              observation&rdquo; above.
            </p>
          }
          columns={[
            {
              key: "number",
              header: "No.",
              render: (obs) => (
                <span
                  className="font-mono text-[12px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  #{obs.number}
                </span>
              ),
            },
            {
              key: "observation",
              header: "Observation",
              render: (obs) => (
                <p
                  className="text-[12px] line-clamp-2"
                  style={{
                    maxWidth: 240,
                    color: "var(--text-primary)",
                  }}
                >
                  {obs.text}
                </p>
              ),
            },
            {
              key: "area",
              header: "Area",
              cellClassName: "text-[12px] text-(--text-secondary)",
              render: (obs) => obs.area || "\u2014",
            },
            {
              key: "regulation",
              header: "Regulation",
              cellClassName: "text-[11px] text-(--text-secondary)",
              render: (obs) => obs.regulation || "\u2014",
            },
            {
              key: "severity",
              header: "Severity",
              render: (obs) => obsSevBadge(obs.severity),
            },
            {
              key: "rca",
              header: "RCA",
              render: (obs) =>
                obs.rcaMethod ? (
                  <Badge variant="purple">{obs.rcaMethod}</Badge>
                ) : (
                  <span
                    className="text-[11px] italic"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Pending
                  </span>
                ),
            },
            {
              key: "capa",
              header: "CAPA",
              render: (obs) =>
                obs.capaId ? (() => {
                  // Live lookup from the capa.items Redux slice (via capas prop)
                  const linkedCapa = capas.find((c) => c.id === obs.capaId);
                  const isClosed = linkedCapa?.status === "closed";
                  return (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() =>
                          router.push("/capa")
                        }
                        className="font-mono text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer shrink-0"
                        aria-label={`Open ${obs.capaId}`}
                      >
                        {obs.capaId}
                      </button>
                      {linkedCapa && (
                        <Badge variant={isClosed ? "green" : linkedCapa.status === "pending_qa_review" ? "purple" : linkedCapa.status === "in_progress" ? "amber" : "blue"}>
                          {isClosed ? "Closed \u2713" : CAPA_STATUS_LABEL[linkedCapa.status]}
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
                ),
            },
            {
              key: "status",
              header: "Status",
              render: (obs) => obsStatBadge(obs.status),
            },
            {
              key: "actions",
              header: "Actions",
              srOnly: true,
              hidden: role === "viewer",
              render: (obs) =>
                fullyLocked ? (
                  <Badge variant="gray">Locked</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={Pencil}
                    aria-label={`Edit observation ${obs.number}`}
                    onClick={() => onEditObservation(obs)}
                  />
                ),
            },
          ] satisfies Column<Observation>[]}
        />
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
            {eventCAPAs.length > 0 && ` \u00b7 ${eventCAPAs.filter((c) => c.status === "closed").length} closed`}
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
                  router.push("/capa")
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
                  <Badge variant={getSeverityVariant(c.risk, "generic")}>
                    {normalizeSeverityForDisplay(c.risk, "generic") ?? c.risk}
                  </Badge>
                  <Badge
                    variant={
                      c.status === "closed"
                        ? "green"
                        : c.status === "pending_qa_review"
                          ? "purple"
                          : c.status === "in_progress"
                            ? "amber"
                            : "blue"
                    }
                  >
                    {CAPA_STATUS_LABEL[c.status]}
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
