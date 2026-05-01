"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Plus,
  AlertCircle,
} from "lucide-react";
import type {
  FDA483Event as PrismaFDA483Event,
  FDA483Observation as PrismaObservation,
  FDA483Commitment as PrismaCommitment,
  FDA483Document as PrismaFDA483Document,
} from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { StatusGuide } from "@/components/shared";
import { FDA483_EVENT_STATUSES } from "@/constants/statusTaxonomy";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import type { FDA483Event, EventStatus, Observation } from "@/types/fda483";
import {
  createFDA483Event,
  addObservation as addObservationServer,
  updateObservation as updateObservationServer,
  addCommitment as addCommitmentServer,
  saveResponseDraft as saveResponseDraftServer,
  saveAGIDraft as saveAGIDraftServer,
  signSubmitFDA483Response,
  raiseCAPAFromObservation,
} from "@/actions/fda483";
import { Button } from "@/components/ui/Button";
import { Popup } from "@/components/ui/Popup";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { NoSitesPopup } from "@/components/shared";

import { EventsTab } from "./tabs/EventsTab";
import { ObservationsTab } from "./tabs/ObservationsTab";
import { ResponseTab } from "./tabs/ResponseTab";
import { RCATab } from "./tabs/RCATab";
import { AddEventModal, type EventFormData } from "./modals/AddEventModal";
import { AddObservationModal, type ObsFormData } from "./modals/AddObservationModal";
import { AddCommitmentModal, type CommitFormData } from "./modals/AddCommitmentModal";
import { SignSubmitModal } from "./modals/SignSubmitModal";

/* ── Helpers ── */

function daysLeft(d: string) {
  return dayjs.utc(d).diff(dayjs(), "day");
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  if (e.status === "Closed") return "Closed";
  if (e.status === "Response Submitted") return "Response Submitted";
  if (daysLeft(e.responseDeadline) <= 15) return "Response Due";
  return e.status;
}

export function computeReadiness(e: FDA483Event): number {
  // New step order: Event (20) → Observations (40) → RCA (60) → Response draft (80) → Submitted (100)
  if (e.status === "Response Submitted" || e.status === "Closed") return 100;
  const hasObs = e.observations.length > 0;
  const allRca = hasObs && e.observations.every((o) => !!o.rootCause?.trim());
  const allCapa = hasObs && e.observations.every((o) => !!o.capaId);
  const hasDraft = !!e.responseDraft?.trim();
  let score = 20;                                // Step 1 — event exists
  if (hasObs) score = 40;                        // Step 2 — observations added
  if (hasObs && allRca && allCapa) score = 60;   // Step 3 — RCA + CAPA done
  if (hasObs && allRca && allCapa && hasDraft) score = 80; // Step 4 — response drafted
  return score;
}

type Step = 1 | 2 | 3 | 4;

/* ── Server Component props ── */

type PrismaEventWithRelations = PrismaFDA483Event & {
  observations: PrismaObservation[];
  commitments: PrismaCommitment[];
  documents: PrismaFDA483Document[];
};

export interface FDA483PageStats {
  total: number;
  open: number;
  responseDue: number;
  overdue: number;
  closed: number;
  warningLetter: number;
  totalObservations: number;
}

export interface FDA483PageProps {
  events: PrismaEventWithRelations[];
  stats: FDA483PageStats;
}

/**
 * Adapt a Prisma FDA483Event into the richer slice `FDA483Event` shape
 * the existing UI is built around. Prisma is missing the LinkedDocument
 * arrays (`documents`, `responseDocuments`) and `linkedCapas` — fill
 * with empty defaults; the UI degrades gracefully via optional chaining.
 *
 * Slice Observation has `capaIds`/`severity` (Critical|High|Low) and
 * a stricter status union; we cast through and let runtime values flow.
 */
function adaptEvent(p: PrismaEventWithRelations): FDA483Event {
  return {
    id: p.id,
    tenantId: p.tenantId,
    type: p.eventType as FDA483Event["type"],
    referenceNumber: p.referenceNumber,
    agency: p.agency,
    siteId: p.siteId,
    inspectionDate: p.inspectionDate.toISOString(),
    responseDeadline: p.responseDeadline.toISOString(),
    status: p.status as EventStatus,
    observations: p.observations.map((o) => ({
      id: o.id,
      number: o.number,
      text: o.text,
      severity: (o.severity ?? "Low") as Observation["severity"],
      area: o.area ?? "",
      regulation: o.regulation ?? "",
      rcaMethod: (o.rcaMethod ?? undefined) as Observation["rcaMethod"],
      rootCause: o.rootCause ?? undefined,
      capaId: o.capaId ?? undefined,
      capaIds: o.capaId ? [o.capaId] : undefined,
      responseText: o.responseText ?? undefined,
      status: (o.status ?? "Open") as Observation["status"],
    })),
    commitments: p.commitments.map((c) => ({
      id: c.id,
      eventId: c.eventId,
      text: c.text,
      dueDate: c.dueDate ? c.dueDate.toISOString() : "",
      owner: c.owner ?? "",
      status: (c.status ?? "Pending") as "Pending" | "In Progress" | "Complete" | "Overdue",
    })),
    responseDraft: p.responseDraft ?? "",
    agiDraft: p.agiDraft ?? "",
    submittedAt: p.submittedAt ? p.submittedAt.toISOString() : undefined,
    submittedBy: p.submittedBy ?? undefined,
    signatureMeaning: p.signatureMeaning ?? undefined,
    closedAt: p.closedAt ? p.closedAt.toISOString() : undefined,
    createdAt: p.createdAt.toISOString(),
    documents: [],
    // Map Prisma FDA483Document → LinkedDocument shape so the existing
    // <DocumentUpload> consumer can render them. `dataUrl` carries the
    // Prisma `fileUrl` so download/view buttons keep working.
    responseDocuments: p.documents.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      fileType: ((d.fileType ?? "txt").toLowerCase()) as "pdf" | "doc" | "docx" | "xls" | "xlsx" | "jpg" | "png" | "txt",
      fileSize: d.fileSize ?? "",
      uploadedBy: d.uploadedBy,
      uploadedByRole: "",
      uploadedAt: d.createdAt.toISOString(),
      version: "v1.0",
      status: "current" as const,
      linkedTo: { module: "FDA 483 Response", recordId: p.id, recordTitle: p.referenceNumber },
      dataUrl: d.fileUrl,
    })),
    linkedCapas: [],
  };
}

/* ══════════════════════════════════════ */

export function FDA483Page({ events: prismaEvents, stats: _stats }: FDA483PageProps) {
  // _stats prop accepted for forward-compat (future KPI surface);
  // existing layout derives counts from the events list itself.
  const router = useRouter();
  const { capas } = useTenantData();
  const events = useMemo(() => prismaEvents.map(adaptEvent), [prismaEvents]);
  const { org, sites, users } = useTenantConfig();
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.fda483);
  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { role, canSign } = useRole();
  const { isCustomerAdmin, canCreateEvents } = usePermissions();
  const { hasSites } = useSetupStatus();

  function ownerName(id: string) {
    return users.find((u) => u.id === id)?.name ?? id;
  }

  /* ── State ── */
  const [selectedEvent, setSelectedEvent] = useState<FDA483Event | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [addObsOpen, setAddObsOpen] = useState(false);
  const [editingObs, setEditingObs] = useState<Observation | null>(null);
  const [addCommitOpen, setAddCommitOpen] = useState(false);
  const [eventAddedPopup, setEventAddedPopup] = useState(false);
  const [obsAddedPopup, setObsAddedPopup] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [editingResponse, setEditingResponse] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signMeaning, setSignMeaning] = useState("");
  const [signPassword, setSignPassword] = useState("");
  const [signedPopup, setSignedPopup] = useState(false);
  const [responseSavedPopup, setResponseSavedPopup] = useState(false);
  const [rcaSavedPopup, setRcaSavedPopup] = useState(false);
  const [capaRaisedPopup, setCapaRaisedPopup] = useState(false);
  const [selectedObsId, setSelectedObsId] = useState("");
  const [whyAnswers, setWhyAnswers] = useState(["", "", "", "", ""]);
  const [fishboneAnswers, setFishboneAnswers] = useState<
    Record<string, string>
  >({});
  const [fishboneRoot, setFishboneRoot] = useState("");
  const [freeformRCA, setFreeformRCA] = useState("");
  const [noSitesOpen, setNoSitesOpen] = useState(false);

  /* ── Derived from Redux so selectedEvent stays fresh ── */
  const liveEvent = selectedEvent
    ? (events.find((e) => e.id === selectedEvent.id) ?? null)
    : null;
  const selectedObs =
    liveEvent?.observations.find((o) => o.id === selectedObsId) ?? null;

  useEffect(() => {
    if (liveEvent) {
      setResponseText(liveEvent.responseDraft ?? "");
      setEditingResponse(false);
      setSelectedObsId(liveEvent.observations[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent?.id]);

  // Auto-select the first observation whenever the selected one disappears
  // (e.g. user just added the first observation, or deleted the selected one).
  useEffect(() => {
    if (!liveEvent) return;
    const exists = liveEvent.observations.some((o) => o.id === selectedObsId);
    if (!exists && liveEvent.observations.length > 0) {
      setSelectedObsId(liveEvent.observations[0].id);
    }
  }, [liveEvent, selectedObsId]);

  useEffect(() => {
    if (selectedObs?.rcaMethod === "5 Why" && selectedObs.rootCause) {
      const lines = selectedObs.rootCause.split("\n");
      setWhyAnswers(
        lines
          .map((l) => l.replace(/^Why \d: /, ""))
          .concat(Array(5).fill(""))
          .slice(0, 5),
      );
    } else {
      setWhyAnswers(["", "", "", "", ""]);
    }
    setFishboneAnswers({});
    setFishboneRoot("");
    setFreeformRCA("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObsId]);

  /* ── Computed ── */
  const openCount = events.filter((e) => getEffectiveStatus(e) === "Open").length;
  const dueCount = events.filter((e) => getEffectiveStatus(e) === "Response Due").length;
  const closedCount = events.filter((e) => getEffectiveStatus(e) === "Closed").length;
  const urgentEvents = events.filter((e) => getEffectiveStatus(e) === "Response Due" && daysLeft(e.responseDeadline) >= 0 && daysLeft(e.responseDeadline) <= 5);
  const anyFilter = !!(typeFilter || agencyFilter || statusFilter || siteFilter);
  const filteredEvents = events.filter((e) => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (agencyFilter && e.agency !== agencyFilter) return false;
    if (statusFilter && getEffectiveStatus(e) !== statusFilter) return false;
    if (siteFilter && e.siteId !== siteFilter) return false;
    return true;
  });

  /* ── Workflow status flags used by child components ── */
  const hasObservations = !!liveEvent && liveEvent.observations.length > 0;
  const hasRcaAndCapa = hasObservations
    && liveEvent.observations.every((o) => o.rootCause?.trim() && !!o.capaId);
  const hasSubmitted = !!liveEvent
    && (liveEvent.status === "Response Submitted" || liveEvent.status === "Closed");
  const canSubmitResponse = hasRcaAndCapa;

  /* ── Handlers ── */

  async function onEventSave(data: EventFormData) {
    // Server action writes to Prisma + emits audit log; no client-side
    // dispatch needed — router.refresh() pulls the fresh row into props.
    const result = await createFDA483Event({
      referenceNumber: data.referenceNumber,
      eventType: data.type,
      agency: data.agency,
      siteId: data.siteId,
      inspectionDate: data.inspectionDate
        ? dayjs(data.inspectionDate).utc().toISOString()
        : "",
      responseDeadline: data.responseDeadline
        ? dayjs(data.responseDeadline).utc().toISOString()
        : "",
    });
    if (!result.success) {
      console.error("[fda-483] createFDA483Event failed:", result.error);
      return;
    }
    setAddEventOpen(false);
    setEventAddedPopup(true);
    router.refresh();
  }

  async function onObsSave(data: ObsFormData) {
    if (!liveEvent) return;
    const result = editingObs
      ? await updateObservationServer(editingObs.id, {
          text: data.text,
          area: data.area ?? "",
          regulation: data.regulation ?? "",
          severity: data.severity,
        })
      : await addObservationServer({
          eventId: liveEvent.id,
          number: data.number,
          text: data.text,
          area: data.area ?? "",
          regulation: data.regulation ?? "",
          severity: data.severity,
        });
    if (!result.success) {
      console.error("[fda-483] save observation failed:", result.error);
      return;
    }
    setAddObsOpen(false);
    setEditingObs(null);
    setObsAddedPopup(true);
    router.refresh();
  }

  async function onCommitSave(data: CommitFormData) {
    if (!liveEvent) return;
    const result = await addCommitmentServer({
      eventId: liveEvent.id,
      text: data.text,
      dueDate: data.dueDate ? dayjs(data.dueDate).utc().toISOString() : undefined,
      owner: data.owner,
    });
    if (!result.success) {
      console.error("[fda-483] addCommitment failed:", result.error);
      return;
    }
    router.refresh();
    setAddCommitOpen(false);
  }

  function selectEvent(e: FDA483Event | null) {
    setSelectedEvent(e);
    if (!e) setCurrentStep(1);
  }
  function resetWorkflow() {
    setSelectedEvent(null);
    setCurrentStep(1);
  }
  function clearFilters() {
    setTypeFilter("");
    setAgencyFilter("");
    setStatusFilter("");
    setSiteFilter("");
  }

  /* ══════════════════════════════════════ */

  return (
    <main
      id="main-content"
      aria-label="FDA 483 and warning letter support"
      className="w-full space-y-5"
    >
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">FDA 483 &amp; Regulatory Events</h1>
          <p className="page-subtitle mt-1">
            {events.length === 0
              ? "No regulatory events logged yet"
              : `${events.length} events \u00b7 ${openCount} open \u00b7 ${dueCount} response due`}
          </p>
          <StatusGuide module="FDA 483 Events" statuses={FDA483_EVENT_STATUSES} />
        </div>
        {canCreateEvents ? (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => { if (!hasSites) { setNoSitesOpen(true); return; } setAddEventOpen(true); }}
          >
            Register Event
          </Button>
        ) : isCustomerAdmin ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>FDA events require QA Head to log and submit</p>
        ) : null}
      </header>

      {/* Deadline alert */}
      {urgentEvents.length > 0 && (
        <div
          className={clsx(
            "flex items-start gap-3 p-4 rounded-xl border",
            isDark
              ? "bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.25)]"
              : "bg-[#fef2f2] border-[#fca5a5]",
          )}
          role="alert"
        >
          <AlertCircle
            className="w-5 h-5 text-[#ef4444] flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#ef4444]">
              {urgentEvents.length} response deadline
              {urgentEvents.length > 1 ? "s" : ""} within 5 days
            </p>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              {urgentEvents
                .map(
                  (e) =>
                    `${e.referenceNumber}: ${daysLeft(e.responseDeadline)} day(s) remaining`,
                )
                .join(" \u00b7 ")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStatusFilter("Response Due"); setCurrentStep(1); }}
          >
            View
          </Button>
        </div>
      )}


      {/* ═══════════ Breadcrumb — only in event detail view ═══════════ */}
      {currentStep > 1 && liveEvent && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[12px]">
          <button
            type="button"
            onClick={resetWorkflow}
            className="bg-transparent border-none cursor-pointer p-0 hover:underline"
            style={{ color: "var(--brand)" }}
          >
            FDA 483 &amp; Regulatory Events
          </button>
          <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>&rsaquo;</span>
          <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{liveEvent.referenceNumber}</span>
        </nav>
      )}


      {/* ═══════════ CONTENT ═══════════ */}
      <div>
        {/* MAIN LIST VIEW — shown when no event is selected */}
        {!liveEvent && (
          <>
            <EventsTab
              events={events}
              filteredEvents={filteredEvents}
              openCount={openCount}
              dueCount={dueCount}
              closedCount={closedCount}
              typeFilter={typeFilter}
              agencyFilter={agencyFilter}
              statusFilter={statusFilter}
              siteFilter={siteFilter}
              anyFilter={anyFilter}
              sites={sites}
              timezone={timezone}
              dateFormat={dateFormat} role={role}
              onTypeFilterChange={setTypeFilter}
              onAgencyFilterChange={setAgencyFilter}
              onStatusFilterChange={setStatusFilter}
              onSiteFilterChange={setSiteFilter}
              onClearFilters={clearFilters}
              onOpenEvent={(e) => { selectEvent(e); setCurrentStep(2); }}
              onAddEvent={() => setAddEventOpen(true)}
              computeReadiness={computeReadiness}
            />
            {hasSubmitted && (
              <div className="flex justify-end pt-4">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium"
                  style={{ background: "var(--success-bg)", color: "var(--success)" }}
                  role="status"
                >
                  <span aria-hidden="true">&#10003;</span>
                  Response submitted &mdash; no further action required
                </div>
              </div>
            )}
          </>
        )}

        {/* EVENT DETAIL — single combined view */}
        {liveEvent && (
          <div className="space-y-6">
            {/* Section 1 & 3 & 4 — Observations / Commitments / CAPA set (inside ObservationsTab) */}
            <ObservationsTab
              liveEvent={liveEvent}
              capas={capas}
              sites={sites}
              timezone={timezone}
              dateFormat={dateFormat} role={role}
              ownerName={ownerName}
              onGoToEvents={resetWorkflow}
              onAddObservation={() => { setEditingObs(null); setAddObsOpen(true); }}
              onEditObservation={(obs) => { setEditingObs(obs); setAddObsOpen(true); }}
              onAddCommitment={() => setAddCommitOpen(true)}
            />

            {/* Section 2 — Root Cause Analysis */}
            <RCATab
                      liveEvent={liveEvent}
                      selectedObs={selectedObs}
                      selectedObsId={selectedObsId}
                      role={role}
                      whyAnswers={whyAnswers}
                      fishboneAnswers={fishboneAnswers}
                      fishboneRoot={fishboneRoot}
                      freeformRCA={freeformRCA}
                      onGoToEvents={resetWorkflow}
                      onGoToObservations={() => setCurrentStep(2)}
                      onSelectedObsIdChange={setSelectedObsId}
                      onWhyAnswersChange={setWhyAnswers}
                      onFishboneAnswersChange={setFishboneAnswers}
                      onFishboneRootChange={setFishboneRoot}
                      onFreeformRCAChange={setFreeformRCA}
                      onSelectRCAMethod={async (method) => {
                        if (!selectedObs) return;
                        const result = await updateObservationServer(selectedObs.id, { rcaMethod: method });
                        if (!result.success) {
                          console.error("[fda-483] selectRCAMethod failed:", result.error);
                          return;
                        }
                        router.refresh();
                      }}
                      onSave5Why={async () => {
                        if (!selectedObs) return;
                        if (liveEvent.status === "Response Submitted" || liveEvent.status === "Closed") return;
                        const text = whyAnswers.filter((w) => w.trim()).map((w, i) => `Why ${i + 1}: ${w}`).join("\n");
                        const result = await updateObservationServer(selectedObs.id, {
                          rootCause: text,
                          rcaMethod: "5 Why",
                          status: "Response Drafted",
                        });
                        if (!result.success) {
                          console.error("[fda-483] save5Why failed:", result.error);
                          return;
                        }
                        setRcaSavedPopup(true);
                        router.refresh();
                      }}
                      onSaveFishbone={async () => {
                        if (!selectedObs) return;
                        if (liveEvent.status === "Response Submitted" || liveEvent.status === "Closed") return;
                        const text = Object.entries(fishboneAnswers).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nRoot cause: ${fishboneRoot}`;
                        const result = await updateObservationServer(selectedObs.id, {
                          rootCause: text,
                          rcaMethod: "Fishbone",
                          status: "Response Drafted",
                        });
                        if (!result.success) {
                          console.error("[fda-483] saveFishbone failed:", result.error);
                          return;
                        }
                        setRcaSavedPopup(true);
                        router.refresh();
                      }}
                      onSaveFreeform={async () => {
                        if (!selectedObs) return;
                        if (liveEvent.status === "Response Submitted" || liveEvent.status === "Closed") return;
                        const result = await updateObservationServer(selectedObs.id, {
                          rootCause: freeformRCA.trim(),
                          status: "Response Drafted",
                        });
                        if (!result.success) {
                          console.error("[fda-483] saveFreeform failed:", result.error);
                          return;
                        }
                        setRcaSavedPopup(true);
                        router.refresh();
                      }}
                      onRaiseCAPA={async () => {
                        if (!selectedObs) return;
                        const result = await raiseCAPAFromObservation({
                          eventId: liveEvent.id,
                          observationId: selectedObs.id,
                          observationNumber: selectedObs.number,
                          observationText: selectedObs.text,
                          observationSeverity: selectedObs.severity,
                          referenceNumber: liveEvent.referenceNumber,
                          siteId: liveEvent.siteId,
                          owner: user?.id ?? user?.name ?? "system",
                          dueDate: liveEvent.responseDeadline,
                          rootCause: selectedObs.rootCause,
                          rcaMethod: selectedObs.rcaMethod,
                        });
                        if (!result.success) {
                          console.error("[fda-483] raiseCAPA failed:", result.error);
                          return;
                        }
                        setCapaRaisedPopup(true);
                        router.refresh();
                      }}
                    />

            {/* Section 5 — Response */}
            <ResponseTab
          liveEvent={liveEvent}
          capas={capas} role={role}
          canSign={isCustomerAdmin ? false : canSign}
          canSubmit={canSubmitResponse}
          agiMode={agiMode}
          agiAgent={agiAgent}
          timezone={timezone}
          dateFormat={dateFormat}
          responseText={responseText}
          editingResponse={editingResponse}
          ownerName={ownerName}
          onGoToEvents={resetWorkflow}
          onResponseTextChange={setResponseText}
          onEditResponseToggle={() => {
            if (editingResponse)
              setResponseText(liveEvent?.responseDraft ?? "");
            setEditingResponse((v) => !v);
          }}
          onCancelEdit={() => {
            setResponseText(liveEvent?.responseDraft ?? "");
            setEditingResponse(false);
          }}
          onSaveDraft={async () => {
            if (!liveEvent) return;
            const result = await saveResponseDraftServer(liveEvent.id, responseText.trim());
            if (!result.success) {
              console.error("[fda-483] saveResponseDraft failed:", result.error);
              return;
            }
            setEditingResponse(false);
            setResponseSavedPopup(true);
            router.refresh();
          }}
          onUseAGIDraft={async () => {
            if (!liveEvent) return;
            const result = await saveResponseDraftServer(liveEvent.id, liveEvent.agiDraft);
            if (!result.success) {
              console.error("[fda-483] saveResponseDraft (from AGI) failed:", result.error);
              return;
            }
            setResponseText(liveEvent.agiDraft);
            setEditingResponse(true);
            router.refresh();
          }}
          onGenerateAGIDraft={async () => {
            if (!liveEvent) return;
            const obsText = liveEvent.observations
              .map((o) => `Obs ${o.number}: ${o.text}`)
              .join("\n");
            const capaText = liveEvent.observations
              .filter((o) => o.capaId)
              .map((o) => {
                const c = capas.find((cp) => cp.id === o.capaId);
                return c
                  ? `${o.capaId}: ${c.description} \u2014 ${c.correctiveActions || "In progress"}`
                  : o.capaId;
              })
              .join("\n");
            const drafted = `REGULATORY RESPONSE \u2014 ${liveEvent.referenceNumber}\n\nDear ${liveEvent.agency},\n\nWe have received and reviewed the ${liveEvent.type} dated ${dayjs.utc(liveEvent.inspectionDate).format(dateFormat)}. We take these observations seriously and have initiated corrective actions as described below.\n\nOBSERVATIONS AND CORRECTIVE ACTIONS:\n\n${obsText}\n\nLINKED CAPAs:\n\n${capaText || "CAPAs being raised."}\n\nRespectfully submitted,\n[QA Head]\n[Company Name]`;
            const result = await saveAGIDraftServer(liveEvent.id, drafted);
            if (!result.success) {
              console.error("[fda-483] saveAGIDraft failed:", result.error);
              return;
            }
            router.refresh();
          }}
          onSignSubmit={() => setSignOpen(true)}
            />

            {/* Back to events list */}
            <div className="flex justify-start pt-4">
              <Button variant="secondary" size="sm" onClick={resetWorkflow}>&larr; Back to FDA 483 Events</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AddEventModal
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        onSave={onEventSave}
        sites={sites}
        lockedSiteId={selectedSiteId}
      />
      <AddObservationModal
        open={addObsOpen}
        editingObs={editingObs}
        defaultNumber={(liveEvent?.observations.length ?? 0) + 1}
        onClose={() => { setAddObsOpen(false); setEditingObs(null); }}
        onSave={onObsSave}
      />
      <AddCommitmentModal
        open={addCommitOpen}
        onClose={() => setAddCommitOpen(false)}
        onSave={onCommitSave}
        users={complianceUsers}
      />
      <SignSubmitModal
        open={signOpen}
        liveEvent={liveEvent} signMeaning={signMeaning}
        signPassword={signPassword}
        onClose={() => setSignOpen(false)}
        onSignMeaningChange={setSignMeaning}
        onSignPasswordChange={setSignPassword}
        onSubmit={async () => {
          if (!liveEvent) return;
          // Server action sets status, draft, submittedAt, submittedBy
          // (from session), signatureMeaning, and writes the audit log.
          const result = await signSubmitFDA483Response(
            liveEvent.id,
            liveEvent.responseDraft ?? "",
            signMeaning,
          );
          if (!result.success) {
            console.error("[fda-483] signSubmit failed:", result.error);
            return;
          }
          setSignOpen(false);
          setSignedPopup(true);
          setSignMeaning("");
          setSignPassword("");
          router.refresh();
          // Stay on the current event so the user sees the submitted success view
        }}
      />

      {/* ── Popups ── */}
      <Popup
        isOpen={eventAddedPopup}
        variant="success"
        title="Event logged"
        description="Add observations and start drafting your response."
        onDismiss={() => setEventAddedPopup(false)}
      />
      <Popup
        isOpen={obsAddedPopup}
        variant="success"
        title="Observation saved"
        description="Open RCA Workspace to document root cause."
        onDismiss={() => setObsAddedPopup(false)}
      />
      <Popup
        isOpen={responseSavedPopup}
        variant="success"
        title="Response draft saved"
        description="Sign & Submit when QA Head is ready."
        onDismiss={() => setResponseSavedPopup(false)}
      />
      <Popup
        isOpen={signedPopup}
        variant="success"
        title="Response submitted"
        description="Signed and submitted. Audit trail recorded."
        onDismiss={() => setSignedPopup(false)}
      />
      <Popup
        isOpen={rcaSavedPopup}
        variant="success"
        title="RCA saved successfully"
        description="Root cause analysis saved. Observation status updated."
        onDismiss={() => setRcaSavedPopup(false)}
      />
      <Popup
        isOpen={capaRaisedPopup}
        variant="success"
        title="CAPA raised successfully"
        description="Proceed to Observations tab to add a commitment."
        onDismiss={() => setCapaRaisedPopup(false)}
      />
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="FDA 483 events" />
    </main>
  );
}
