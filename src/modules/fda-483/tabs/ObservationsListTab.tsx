"use client";


import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppSelector } from "@/hooks/useAppSelector";
import {
  ClipboardList,
  Plus,
  Pencil,
  ArrowRight,
  Check,
  CircleDashed,
  Loader2,
  FileUp,
} from "lucide-react";
import type { FDA483Event, Observation } from "@/types/fda483";
import type { CAPA } from "@/store/capa.slice";
import { STATUS_LABEL as CAPA_STATUS_LABEL } from "@/types/capa";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { DataTable, type Column } from "@/components/shared";
import {
  observationSeverityBadge,
  observationStatusBadge,
  getRcaStepStatus,
  isEventLocked,
} from "../_shared";

interface Site {
  id: string;
  name: string;
}

export interface ObservationsListTabProps {
  /** Active event (already adapted from Prisma). */
  liveEvent: FDA483Event;
  /** Live CAPA slice — used in the CAPA set card + drawer to resolve
   *  obs.capaId into description / status badges. */
  capas: CAPA[];
  /** Tenant sites — for resolving liveEvent.siteId → site name. */
  sites: Site[];
  /** Tenant timezone (IANA) for due-date formatting in the
   *  commitments card. */
  timezone: string;
  /** Tenant date format token (dayjs). */
  dateFormat: string;
  /** Current user's role string — gates "Add observation" / "Add
   *  commitment" buttons (viewer = read-only). */
  role: string;
  /** Resolves a user id (commitment owner) to a display name. */
  ownerName: (id: string) => string;
  /** Currently-focused observation id (drives the drawer open state).
   *  Empty string = drawer closed. */
  selectedObsId: string;
  /** Setter for the drawer focus. Pass empty string to close. */
  onSelectObs: (id: string) => void;
  /** Opens the AddObservationModal in "create" mode (parent owns the
   *  modal state). */
  onAddObservation: () => void;
  /** Opens the ImportObservationsModal (Feature M — extract observations from
   *  an uploaded 483 PDF). Parent owns the modal state. */
  onImportFromPdf: () => void;
  /** Opens the AddObservationModal in "edit" mode with the supplied
   *  observation pre-loaded. */
  onEditObservation: (obs: Observation) => void;
  /** Opens the AddCommitmentModal (parent owns the modal state). */
  onAddCommitment: () => void;
  /** "Start RCA" deep-link from the drawer — switches to the
   *  Investigation tab focused on the supplied observation index. */
  onNavigateToInvestigation: (obsIndex: number) => void;
}

const TITLE_MAX = 60;

/* ── Filter chips (Item 2) — single-select, ephemeral component state ── */
type ObsFilterKey = "all" | "critical" | "high" | "open" | "needsRca" | "needsCapa";

const OBS_FILTER_CHIPS: {
  key: ObsFilterKey;
  label: string;
  predicate: (o: Observation) => boolean;
}[] = [
  { key: "all", label: "All", predicate: () => true },
  { key: "critical", label: "Critical", predicate: (o) => o.severity === "Critical" },
  { key: "high", label: "High", predicate: (o) => o.severity === "High" },
  { key: "open", label: "Open", predicate: (o) => o.status === "Open" },
  { key: "needsRca", label: "Needs RCA", predicate: (o) => !o.rootCause?.trim() },
  { key: "needsCapa", label: "Needs CAPA", predicate: (o) => !o.capaId },
];

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function RcaStatusCell({ obs }: { obs: Observation }) {
  const status = getRcaStepStatus(obs);
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#10b981]">
        <Check className="w-3 h-3" aria-hidden="true" /> Done
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0ea5e9]">
        <Loader2 className="w-3 h-3" aria-hidden="true" /> In progress
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ color: "var(--text-muted)" }}
    >
      <CircleDashed className="w-3 h-3" aria-hidden="true" /> Pending
    </span>
  );
}

export function ObservationsListTab({
  liveEvent,
  capas,
  role,
  selectedObsId,
  onSelectObs,
  onAddObservation,
  onImportFromPdf,
  onEditObservation,
  onNavigateToInvestigation,
}: ObservationsListTabProps) {
  const router = useRouter();
  const isDark = useAppSelector((s) => s.theme.mode === "dark");

  const fullyLocked =
    isEventLocked(liveEvent.status);

  // Capability mirror of the server (excludes super_admin from authoring).
  const fdaCan = usePermissions("fda483");
  const canAct = role !== "viewer" && !fullyLocked && fdaCan.canEdit;

  const observations = liveEvent.observations;
  // Ephemeral single-select filter (Item 2). Resets when the tab unmounts.
  const [filter, setFilter] = useState<ObsFilterKey>("all");
  const activePredicate =
    OBS_FILTER_CHIPS.find((c) => c.key === filter)?.predicate ?? (() => true);
  const filtered = observations.filter(activePredicate);

  const drawerObs = selectedObsId
    ? observations.find((o) => o.id === selectedObsId) ?? null
    : null;
  const drawerIndex = drawerObs
    ? observations.findIndex((o) => o.id === drawerObs.id)
    : -1;
  const linkedCapa = drawerObs?.capaId
    ? capas.find((c) => c.id === drawerObs.capaId) ?? null
    : null;

  return (
    <>
      {/* Observations table */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <ClipboardList
              className="w-4 h-4 text-[#0ea5e9]"
              aria-hidden="true"
            />
            <span className="card-title">Observations</span>
            {/* The "N items" count was removed from the header. */}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Filters moved OFF the chip row and into this header dropdown,
                positioned BEFORE Import. Same six options, same predicates,
                same single-select `filter` state — only the control changed.
                Rendered whenever there are observations, independent of
                `canAct`, so a read-only viewer can still filter. */}
            {observations.length > 0 && (
              <Dropdown
                value={filter}
                onChange={(v) => setFilter(v as ObsFilterKey)}
                width="w-40"
                options={OBS_FILTER_CHIPS.map((chip) => ({
                  value: chip.key,
                  label:
                    chip.key === "all"
                      ? chip.label
                      : `${chip.label} (${observations.filter(chip.predicate).length})`,
                }))}
              />
            )}
            {canAct && (
              <>
              <Button
                variant="secondary"
                size="sm"
                icon={FileUp}
                onClick={onImportFromPdf}
              >
                Import from 483 PDF
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={onAddObservation}
              >
                Add observation
              </Button>
              </>
            )}
          </div>
        </div>

     
        {observations.length === 0 ? (
          <div className="card-body">
            <div className="text-center py-10 px-4">
              <ClipboardList
                className="w-10 h-10 mx-auto mb-3"
                style={{ color: "var(--text-muted)" }}
                aria-hidden="true"
              />
              <p
                className="text-[13px] font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                No observations logged yet
              </p>
              <p
                className="text-[12px] mb-4"
                style={{ color: "var(--text-secondary)" }}
              >
                Add the first observation from this FDA 483 to start the
                investigation workflow.
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-body">
            <div className="text-center py-10 px-4">
              <p
                className="text-[13px] font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                No observations match this filter
              </p>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="text-[12px] hover:underline bg-transparent border-none cursor-pointer p-0"
                style={{ color: "var(--brand)" }}
              >
                Clear filter
              </button>
            </div>
          </div>
        ) : (
          <DataTable
            ariaLabel={`Observations for ${liveEvent.referenceNumber}`}
            caption={`Observations from ${liveEvent.referenceNumber}. Insertion order; click a row to preview details.`}
            data={filtered}
            rowKey={(obs) => obs.id}
            onRowClick={(obs) => onSelectObs(obs.id)}
            rowClassName={() => "hover:opacity-90"}
            rowStyle={(obs) =>
              obs.id === selectedObsId
                ? {
                    background: isDark
                      ? "rgba(14,165,233,0.08)"
                      : "#f0f9ff",
                  }
                : undefined
            }
            columns={[
              {
                key: "number",
                header: "#",
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
                key: "title",
                header: "Title",
                render: (obs) => (
                  <p
                    className="text-[12px]"
                    style={{
                      maxWidth: 280,
                      color: "var(--text-primary)",
                    }}
                  >
                    {truncate(obs.text, TITLE_MAX)}
                  </p>
                ),
              },
              {
                key: "severity",
                header: "Severity",
                render: (obs) => {
                  const sev = observationSeverityBadge(obs.severity);
                  return <Badge variant={sev.variant}>{sev.label}</Badge>;
                },
              },
              {
                key: "area",
                header: "Area",
                cellClassName: "text-[12px] text-(--text-secondary)",
                render: (obs) => obs.area || "—",
              },
              {
                key: "regulation",
                header: "Regulation",
                cellClassName: "text-[11px] text-(--text-secondary)",
                render: (obs) => obs.regulation || "—",
              },
              {
                key: "rca",
                header: "RCA",
                render: (obs) => <RcaStatusCell obs={obs} />,
              },
              {
                key: "capa",
                header: "CAPA",
                render: (obs) =>
                  obs.capaId ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push("/capa");
                      }}
                      className="font-mono text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer"
                      aria-label={`Open ${obs.capaId}`}
                    >
                      {capas.find((c) => c.id === obs.capaId)?.reference ?? obs.capaId.slice(0, 8)}
                    </button>
                  ) : (
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
                render: (obs) => {
                  const stat = observationStatusBadge(obs.status);
                  return <Badge variant={stat.variant}>{stat.label}</Badge>;
                },
              },
              {
                key: "actions",
                header: "Actions",
                srOnly: true,
                hidden: !canAct,
                render: (obs) => (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={Pencil}
                    aria-label={`Edit observation ${obs.number}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditObservation(obs);
                    }}
                  />
                ),
              },
            ] satisfies Column<Observation>[]}
          />
        )}
      </div>

      {/* ── Detail modal (fix 8: was a right slide-in drawer) ─────── */}
      {drawerObs && (
        <Modal
          open
          onClose={() => onSelectObs("")}
          title={`Observation #${drawerObs.number}`}
        >
          <div className="space-y-5">
            {/* Status (was alongside the drawer title) */}
            <div>
              {(() => {
                const stat = observationStatusBadge(drawerObs.status);
                return <Badge variant={stat.variant}>{stat.label}</Badge>;
              })()}
            </div>

            {/* Body */}
            <>
              {/* Full observation text */}
              <section>
                <h3
                  className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Observation
                </h3>
                <p
                  className="text-[12px] whitespace-pre-wrap leading-relaxed"
                  style={{ color: "var(--text-primary)" }}
                >
                  {drawerObs.text}
                </p>
              </section>

              {/* Metadata grid */}
              <section>
                <h3
                  className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Severity
                    </span>
                    <div className="mt-1">
                      {(() => {
                        const sev = observationSeverityBadge(
                          drawerObs.severity,
                        );
                        return (
                          <Badge variant={sev.variant}>{sev.label}</Badge>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Status
                    </span>
                    <div className="mt-1">
                      {(() => {
                        const stat = observationStatusBadge(drawerObs.status);
                        return (
                          <Badge variant={stat.variant}>{stat.label}</Badge>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Area
                    </span>
                    <span
                      className="text-[12px] block mt-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {drawerObs.area || "—"}
                    </span>
                  </div>
                  <div>
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Regulation
                    </span>
                    <span
                      className="text-[12px] block mt-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {drawerObs.regulation || "—"}
                    </span>
                  </div>
                  <div>
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Number
                    </span>
                    <span
                      className="font-mono text-[12px] font-semibold block mt-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      #{drawerObs.number}
                    </span>
                  </div>
                </div>
              </section>

              {/* RCA preview */}
              <section>
                <h3
                  className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Root cause analysis
                </h3>
                {drawerObs.rootCause?.trim() ? (
                  <div
                    className="rounded-lg border p-3"
                    style={{
                      background: isDark
                        ? "rgba(124,58,237,0.06)"
                        : "#faf5ff",
                      borderColor: isDark
                        ? "rgba(124,58,237,0.25)"
                        : "#e9d5ff",
                    }}
                  >
                    {drawerObs.rcaMethod && (
                      <div className="mb-2">
                        <Badge variant="purple">{drawerObs.rcaMethod}</Badge>
                      </div>
                    )}
                    <p
                      className="text-[12px] whitespace-pre-wrap leading-relaxed"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {drawerObs.rootCause}
                    </p>
                  </div>
                ) : (
                  <p
                    className="text-[12px] italic"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No RCA yet
                  </p>
                )}
              </section>

              {/* CAPA preview */}
              <section>
                <h3
                  className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  CAPA
                </h3>
                {drawerObs.capaId ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Linked CAPA:
                      </span>
                      <button
                        type="button"
                        onClick={() => router.push("/capa")}
                        className="font-mono text-[12px] font-semibold text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer"
                        aria-label={`Open ${drawerObs.capaId}`}
                      >
                        {linkedCapa?.reference ?? drawerObs.capaId.slice(0, 8)}
                      </button>
                      {linkedCapa && (
                        <Badge
                          variant={
                            linkedCapa.status === "closed"
                              ? "green"
                              : linkedCapa.status === "pending_qa_review"
                                ? "purple"
                                : linkedCapa.status === "in_progress"
                                  ? "amber"
                                  : "blue"
                          }
                        >
                          {CAPA_STATUS_LABEL[linkedCapa.status]}
                        </Badge>
                      )}
                    </div>
                    {linkedCapa?.description && (
                      <p
                        className="text-[11px] w-full"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {linkedCapa.description}
                      </p>
                    )}
                  </div>
                ) : (
                  <p
                    className="text-[12px] italic"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No CAPA raised
                  </p>
                )}
              </section>
            </>

            {/* Footer actions */}
            <div
              className="flex items-center justify-between gap-3 pt-2 border-t"
              style={{ borderColor: "var(--bg-border)" }}
            >
              <Button
                variant="ghost"
                size="sm"
                icon={Pencil}
                onClick={() => onEditObservation(drawerObs)}
                disabled={!canAct}
              >
                Edit observation
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={ArrowRight}
                iconPosition="right"
                onClick={() => {
                  if (drawerIndex < 0) return;
                  onSelectObs("");
                  onNavigateToInvestigation(drawerIndex);
                }}
              >
                {drawerObs.rootCause?.trim() ? "Review RCA" : "Start RCA"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
