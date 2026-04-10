import { useState, useEffect } from "react";
import clsx from "clsx";
import {
  FileWarning,
  ClipboardList,
  FileText,
  GitBranch,
  Plus,
  AlertCircle,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import {
  addEvent,
  updateEvent,
  addObservation,
  updateObservation,
  addCommitment,
  setResponseDraft,
  setAGIDraft,
  type FDA483Event,
  type EventStatus,
  type Observation,
} from "@/store/fda483.slice";
import { addCAPA } from "@/store/capa.slice";
import { auditLog } from "@/lib/audit";
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

type TabId = "events" | "observations" | "response" | "rca";

const TABS: { id: TabId; label: string; Icon: typeof FileWarning }[] = [
  { id: "events", label: "Events", Icon: FileWarning },
  { id: "observations", label: "Observations", Icon: ClipboardList },
  { id: "response", label: "Response", Icon: FileText },
  { id: "rca", label: "RCA Workspace", Icon: GitBranch },
];

/* ══════════════════════════════════════ */

export function FDA483Page() {
  const dispatch = useAppDispatch();
  const { fda483Events: events, capas, tenantId } = useTenantData();
  const { org, sites, users } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.fda483);
  const user = useAppSelector((s) => s.auth.user);
  const { role, canSign } = useRole();
  const { hasSites } = useSetupStatus();

  function ownerName(id: string) {
    return users.find((u) => u.id === id)?.name ?? id;
  }

  /* ── State ── */
  const [selectedEvent, setSelectedEvent] = useState<FDA483Event | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("events");
  const [typeFilter, setTypeFilter] = useState("");
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
  const anyFilter = !!(typeFilter || statusFilter || siteFilter);
  const filteredEvents = events.filter((e) => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (statusFilter && getEffectiveStatus(e) !== statusFilter) return false;
    if (siteFilter && e.siteId !== siteFilter) return false;
    return true;
  });

  /* ── Handlers ── */

  function onEventSave(data: EventFormData) {
    const id = crypto.randomUUID();
    dispatch(
      addEvent({
        ...data,
        id,
        tenantId: tenantId ?? "",
        observations: [],
        commitments: [],
        responseDraft: "",
        agiDraft: "",
        inspectionDate: data.inspectionDate
          ? dayjs(data.inspectionDate).utc().toISOString()
          : "",
        responseDeadline: data.responseDeadline
          ? dayjs(data.responseDeadline).utc().toISOString()
          : "",
        createdAt: dayjs().toISOString(),
      }),
    );
    auditLog({
      action: "FDA483_EVENT_LOGGED",
      module: "fda-483",
      recordId: id,
      newValue: data,
    });
    setAddEventOpen(false);
    setEventAddedPopup(true);
  }

  function onObsSave(data: ObsFormData) {
    if (!liveEvent) return;
    if (editingObs) {
      dispatch(
        updateObservation({
          eventId: liveEvent.id,
          obsId: editingObs.id,
          patch: data,
        }),
      );
    } else {
      dispatch(
        addObservation({
          eventId: liveEvent.id,
          obs: {
            ...data,
            id: crypto.randomUUID(),
            area: data.area ?? "",
            regulation: data.regulation ?? "",
          },
        }),
      );
    }
    auditLog({
      action: editingObs ? "FDA483_OBS_UPDATED" : "FDA483_OBS_ADDED",
      module: "fda-483",
      recordId: liveEvent.id,
    });
    setAddObsOpen(false);
    setEditingObs(null);
    setObsAddedPopup(true);
  }

  function onCommitSave(data: CommitFormData) {
    if (!liveEvent) return;
    dispatch(
      addCommitment({
        eventId: liveEvent.id,
        commitment: {
          ...data,
          id: crypto.randomUUID(),
          eventId: liveEvent.id,
          dueDate: dayjs(data.dueDate).utc().toISOString(),
        },
      }),
    );
    auditLog({
      action: "FDA483_COMMITMENT_ADDED",
      module: "fda-483",
      recordId: liveEvent.id,
    });
    setAddCommitOpen(false);
  }

  function selectEvent(e: FDA483Event) {
    setSelectedEvent(e);
  }
  function clearFilters() {
    setTypeFilter("");
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
        </div>
        {role !== "viewer" && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => { if (!hasSites) { setNoSitesOpen(true); return; } setAddEventOpen(true); }}
          >
            Log event
          </Button>
        )}
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
            onClick={() => { setStatusFilter("Response Due"); setActiveTab("events"); }}
          >
            View
          </Button>
        </div>
      )}

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="FDA 483 sections"
        className="flex gap-1 border-b border-(--bg-border)"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            className={clsx(
              "inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors bg-transparent border-x-0 border-t-0 cursor-pointer outline-none",
              activeTab === t.id
                ? "border-b-(--brand) text-(--brand)"
                : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)",
            )}
          >
            <t.Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ EVENTS TAB ═══════════ */}
      <div
        role="tabpanel"
        id="panel-events"
        aria-labelledby="tab-events"
        tabIndex={0}
        hidden={activeTab !== "events"}
      >
        <EventsTab
          events={events}
          filteredEvents={filteredEvents}
          selectedEvent={selectedEvent}
          openCount={openCount}
          dueCount={dueCount}
          closedCount={closedCount}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          siteFilter={siteFilter}
          anyFilter={anyFilter}
          sites={sites}
          timezone={timezone}
          dateFormat={dateFormat}
          isDark={isDark}
          role={role}
          onTypeFilterChange={setTypeFilter}
          onStatusFilterChange={setStatusFilter}
          onSiteFilterChange={setSiteFilter}
          onClearFilters={clearFilters}
          onSelectEvent={selectEvent}
          onAddEvent={() => setAddEventOpen(true)}
          onGoToObservations={(ev) => { selectEvent(ev); setActiveTab("observations"); }}
          onGoToResponse={(ev) => { selectEvent(ev); setActiveTab("response"); }}
          onGoToRCA={(ev) => { selectEvent(ev); setActiveTab("rca"); }}
        />
      </div>

      {/* ═══════════ OBSERVATIONS TAB ═══════════ */}
      <div
        role="tabpanel"
        id="panel-observations"
        aria-labelledby="tab-observations"
        tabIndex={0}
        hidden={activeTab !== "observations"}
      >
        <ObservationsTab
          liveEvent={liveEvent}
          capas={capas}
          sites={sites}
          timezone={timezone}
          dateFormat={dateFormat}
          isDark={isDark}
          role={role}
          ownerName={ownerName}
          onGoToEvents={() => setActiveTab("events")}
          onAddObservation={() => {
            setEditingObs(null);
            setAddObsOpen(true);
          }}
          onEditObservation={(obs) => {
            setEditingObs(obs);
            setAddObsOpen(true);
          }}
          onAddCommitment={() => setAddCommitOpen(true)}
        />
      </div>

      {/* ═══════════ RESPONSE TAB ═══════════ */}
      <div
        role="tabpanel"
        id="panel-response"
        aria-labelledby="tab-response"
        tabIndex={0}
        hidden={activeTab !== "response"}
      >
        <ResponseTab
          liveEvent={liveEvent}
          isDark={isDark}
          role={role}
          canSign={canSign}
          agiMode={agiMode}
          agiAgent={agiAgent}
          timezone={timezone}
          dateFormat={dateFormat}
          responseText={responseText}
          editingResponse={editingResponse}
          onGoToEvents={() => setActiveTab("events")}
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
          onSaveDraft={() => {
            if (!liveEvent) return;
            dispatch(
              setResponseDraft({
                eventId: liveEvent.id,
                text: responseText.trim(),
              }),
            );
            auditLog({
              action: "FDA483_RESPONSE_DRAFT_SAVED",
              module: "fda-483",
              recordId: liveEvent.id,
            });
            setEditingResponse(false);
            setResponseSavedPopup(true);
          }}
          onUseAGIDraft={() => {
            if (!liveEvent) return;
            dispatch(
              setResponseDraft({
                eventId: liveEvent.id,
                text: liveEvent.agiDraft,
              }),
            );
            setResponseText(liveEvent.agiDraft);
            setEditingResponse(true);
          }}
          onGenerateAGIDraft={() => {
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
            dispatch(
              setAGIDraft({
                eventId: liveEvent.id,
                text: `REGULATORY RESPONSE \u2014 ${liveEvent.referenceNumber}\n\nDear ${liveEvent.agency},\n\nWe have received and reviewed the ${liveEvent.type} dated ${dayjs.utc(liveEvent.inspectionDate).format(dateFormat)}. We take these observations seriously and have initiated corrective actions as described below.\n\nOBSERVATIONS AND CORRECTIVE ACTIONS:\n\n${obsText}\n\nLINKED CAPAs:\n\n${capaText || "CAPAs being raised."}\n\nRespectfully submitted,\n[QA Head]\n[Company Name]`,
              }),
            );
          }}
          onSignSubmit={() => setSignOpen(true)}
        />
      </div>

      {/* ═══════════ RCA TAB ═══════════ */}
      <div
        role="tabpanel"
        id="panel-rca"
        aria-labelledby="tab-rca"
        tabIndex={0}
        hidden={activeTab !== "rca"}
      >
        <RCATab
          liveEvent={liveEvent}
          selectedObs={selectedObs}
          selectedObsId={selectedObsId}
          isDark={isDark}
          role={role}
          whyAnswers={whyAnswers}
          fishboneAnswers={fishboneAnswers}
          fishboneRoot={fishboneRoot}
          freeformRCA={freeformRCA}
          onGoToEvents={() => setActiveTab("events")}
          onGoToObservations={() => setActiveTab("observations")}
          onSelectedObsIdChange={setSelectedObsId}
          onWhyAnswersChange={setWhyAnswers}
          onFishboneAnswersChange={setFishboneAnswers}
          onFishboneRootChange={setFishboneRoot}
          onFreeformRCAChange={setFreeformRCA}
          onSelectRCAMethod={(method) => {
            if (!liveEvent || !selectedObs) return;
            dispatch(
              updateObservation({
                eventId: liveEvent.id,
                obsId: selectedObs.id,
                patch: { rcaMethod: method },
              }),
            );
          }}
          onSave5Why={() => {
            if (!liveEvent || !selectedObs) return;
            const text = whyAnswers
              .filter((w) => w.trim())
              .map((w, i) => `Why ${i + 1}: ${w}`)
              .join("\n");
            dispatch(
              updateObservation({
                eventId: liveEvent.id,
                obsId: selectedObs.id,
                patch: {
                  rootCause: text,
                  status: "RCA In Progress",
                },
              }),
            );
            auditLog({
              action: "FDA483_RCA_SAVED",
              module: "fda-483",
              recordId: selectedObs.id,
              newValue: { rootCause: text },
            });
          }}
          onSaveFishbone={() => {
            if (!liveEvent || !selectedObs) return;
            const text =
              Object.entries(fishboneAnswers)
                .filter(([, v]) => v.trim())
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n") + `\n\nRoot cause: ${fishboneRoot}`;
            dispatch(
              updateObservation({
                eventId: liveEvent.id,
                obsId: selectedObs.id,
                patch: {
                  rootCause: text,
                  status: "RCA In Progress",
                },
              }),
            );
            auditLog({
              action: "FDA483_RCA_SAVED",
              module: "fda-483",
              recordId: selectedObs.id,
            });
          }}
          onSaveFreeform={() => {
            if (!liveEvent || !selectedObs) return;
            dispatch(
              updateObservation({
                eventId: liveEvent.id,
                obsId: selectedObs.id,
                patch: {
                  rootCause: freeformRCA.trim(),
                  status: "RCA In Progress",
                },
              }),
            );
            auditLog({
              action: "FDA483_RCA_SAVED",
              module: "fda-483",
              recordId: selectedObs.id,
            });
          }}
          onRaiseCAPA={() => {
            if (!liveEvent || !selectedObs) return;
            const capaId = `CAPA-${String(Date.now()).slice(-4)}`;
            dispatch(
              addCAPA({
                id: capaId,
                tenantId: tenantId ?? "",
                siteId: liveEvent.siteId,
                source: "483",
                risk: selectedObs.severity,
                owner: user?.id ?? "",
                dueDate: liveEvent.responseDeadline,
                status: "Open",
                description: `${liveEvent.referenceNumber} Obs #${selectedObs.number}: ${selectedObs.text}`,
                rca: selectedObs.rootCause ?? "",
                rcaMethod: selectedObs.rcaMethod as
                  | "5 Why"
                  | "Fishbone"
                  | "Fault Tree"
                  | "Other"
                  | undefined,
                correctiveActions: "",
                effectivenessCheck:
                  selectedObs.severity === "Critical",
                evidenceLinks: [],
                diGate: false,
                createdAt: "",
              }),
            );
            dispatch(
              updateObservation({
                eventId: liveEvent.id,
                obsId: selectedObs.id,
                patch: { capaId },
              }),
            );
            auditLog({
              action: "CAPA_RAISED_FROM_483",
              module: "fda-483",
              recordId: selectedObs.id,
              newValue: { capaId },
            });
          }}
        />
      </div>

      {/* ── Modals ── */}
      <AddEventModal
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        onSave={onEventSave}
        sites={sites}
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
        users={users}
      />
      <SignSubmitModal
        open={signOpen}
        liveEvent={liveEvent}
        isDark={isDark}
        signMeaning={signMeaning}
        signPassword={signPassword}
        onClose={() => setSignOpen(false)}
        onSignMeaningChange={setSignMeaning}
        onSignPasswordChange={setSignPassword}
        onSubmit={() => {
          if (!liveEvent) return;
          dispatch(
            updateEvent({
              id: liveEvent.id,
              patch: { status: "Response Submitted", submittedAt: "" },
            }),
          );
          auditLog({
            action: "FDA483_RESPONSE_SUBMITTED",
            module: "fda-483",
            recordId: liveEvent.id,
            newValue: { submittedBy: user?.id, meaning: signMeaning },
          });
          setSignOpen(false);
          setSignedPopup(true);
          setSignMeaning("");
          setSignPassword("");
          setSelectedEvent(null);
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
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="FDA 483 events" />
    </main>
  );
}
