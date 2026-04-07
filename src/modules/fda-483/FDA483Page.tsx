import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  FileWarning,
  ClipboardList,
  FileText,
  GitBranch,
  Plus,
  Clock,
  AlertCircle,
  ChevronRight,
  Pencil,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Bot,
  Sparkles,
  ShieldCheck,
  Save,
  X,
  ArrowRight,
  TrendingUp,
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
  type EventType,
  type EventStatus,
  type Observation,
  type ObservationSeverity,
} from "@/store/fda483.slice";
import { addCAPA } from "@/store/capa.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { NoSitesPopup } from "@/components/shared";

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

function obsSevBadge(s: ObservationSeverity) {
  return (
    <Badge
      variant={s === "Critical" ? "red" : s === "Major" ? "amber" : "gray"}
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

/* ── Schemas ── */

const eventSchema = z.object({
  type: z.enum([
    "FDA 483",
    "Warning Letter",
    "EMA Inspection",
    "MHRA Inspection",
    "WHO Inspection",
  ]),
  referenceNumber: z.string().min(1, "Reference required"),
  agency: z.string().min(1, "Agency required"),
  siteId: z.string().min(1, "Site required"),
  inspectionDate: z.string().min(1, "Inspection date required"),
  responseDeadline: z.string().min(1, "Deadline required"),
  status: z.enum(["Open", "Response Due", "Response Submitted", "Closed"]),
});
type EventForm = z.infer<typeof eventSchema>;

const obsSchema = z.object({
  number: z.number().min(1, "Number required"),
  text: z.string().min(5, "Observation text required"),
  area: z.string().optional(),
  regulation: z.string().optional(),
  severity: z.enum(["Critical", "Major", "Minor"]),
  status: z.enum(["Open", "RCA In Progress", "Response Drafted", "Closed"]),
});
type ObsForm = z.infer<typeof obsSchema>;

const commitSchema = z.object({
  text: z.string().min(5, "Commitment text required"),
  dueDate: z.string().min(1, "Due date required"),
  owner: z.string().min(1, "Owner required"),
  status: z.enum(["Pending", "In Progress", "Complete", "Overdue"]),
});
type CommitForm = z.infer<typeof commitSchema>;

type TabId = "events" | "observations" | "response" | "rca";

const TABS: { id: TabId; label: string; Icon: typeof FileWarning }[] = [
  { id: "events", label: "Events", Icon: FileWarning },
  { id: "observations", label: "Observations", Icon: ClipboardList },
  { id: "response", label: "Response", Icon: FileText },
  { id: "rca", label: "RCA Workspace", Icon: GitBranch },
];

/* ══════════════════════════════════════ */

export function FDA483Page() {
  const navigate = useNavigate();
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

  /* ── Forms ── */
  const eventForm = useForm<EventForm>({
    resolver: zodResolver(eventSchema),
    defaultValues: { type: "FDA 483", status: "Open" },
  });
  const obsForm = useForm<ObsForm>({
    resolver: zodResolver(obsSchema),
    defaultValues: { severity: "Major", status: "Open" },
  });
  const commitForm = useForm<CommitForm>({
    resolver: zodResolver(commitSchema),
    defaultValues: { status: "Pending" },
  });

  function onEventSave(data: EventForm) {
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
        inspectionDate: dayjs(data.inspectionDate).utc().toISOString(),
        responseDeadline: dayjs(data.responseDeadline).utc().toISOString(),
        createdAt: "",
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
    eventForm.reset();
  }

  function onObsSave(data: ObsForm) {
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
    obsForm.reset();
  }

  function onCommitSave(data: CommitForm) {
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
    commitForm.reset();
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
            className="w-5 h-5 text-[#c0392b] flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#c0392b]">
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
        {/* Tiles */}
        <section
          aria-label="Event statistics"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        >
          <div className="stat-card" role="region" aria-label="Total events">
            <div className="flex items-center gap-2 mb-2">
              <FileWarning
                className="w-5 h-5 text-[#a57865]"
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
                style={{ color: openCount > 0 ? "#c9a84c" : "#4a5e3a" }}
                aria-hidden="true"
              />
              <span className="stat-label mb-0">Open</span>
            </div>
            <div
              className="stat-value"
              style={{ color: openCount > 0 ? "#c9a84c" : "#4a5e3a" }}
            >
              {openCount}
            </div>
            <div className="stat-sub">Require action</div>
          </div>
          <div className="stat-card" role="region" aria-label="Response due">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle
                className="w-5 h-5"
                style={{ color: dueCount > 0 ? "#c0392b" : "#4a5e3a" }}
                aria-hidden="true"
              />
              <span className="stat-label mb-0">Response due</span>
            </div>
            <div
              className="stat-value"
              style={{ color: dueCount > 0 ? "#c0392b" : "#4a5e3a" }}
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
                className="w-5 h-5 text-[#4a8fa8]"
                aria-hidden="true"
              />
              <span className="stat-label mb-0">Total observations</span>
            </div>
            <div className="stat-value text-[#4a8fa8]">
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
            onChange={setTypeFilter}
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
            placeholder="All statuses"
            value={statusFilter}
            onChange={setStatusFilter}
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
            onChange={setSiteFilter}
            width="w-36"
            options={[
              { value: "", label: "All sites" },
              ...sites.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          {anyFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>

        {/* Event cards */}
        {events.length === 0 ? (
          <div className="card p-10 text-center">
            <FileWarning
              className="w-12 h-12 mx-auto mb-3"
              style={{ color: "#6b5349" }}
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
                onClick={() => setAddEventOpen(true)}
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
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((ev) => {
              const days = daysLeft(ev.responseDeadline);
              const isOverdue = days < 0;
              const isUrgent = days >= 0 && days <= 5;
              const critCount = ev.observations.filter(
                (o) => o.severity === "Critical",
              ).length;
              const majCount = ev.observations.filter(
                (o) => o.severity === "Major",
              ).length;
              const minCount = ev.observations.filter(
                (o) => o.severity === "Minor",
              ).length;
              const capaCount = ev.observations.filter((o) => o.capaId).length;
              return (
                <div
                  key={ev.id}
                  className={clsx(
                    "card cursor-pointer transition-all duration-150 hover:border-[#a57865]",
                    selectedEvent?.id === ev.id &&
                      (isDark
                        ? "border-[#a57865] bg-[#071e38]"
                        : "border-[#a57865] bg-[#eff6ff]"),
                  )}
                  onClick={() => selectEvent(ev)}
                  role="button"
                  aria-expanded={selectedEvent?.id === ev.id}
                  aria-label={`${ev.type} ${ev.referenceNumber}`}
                >
                  <div className="card-body">
                    {/* Top */}
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {eventTypeBadge(ev.type)}
                        {eventStatusBadge(getEffectiveStatus(ev))}
                        <span className="font-mono text-[11px] font-semibold text-[#a57865]">
                          {ev.referenceNumber}
                        </span>
                      </div>
                      <div
                        className={clsx(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium",
                          isOverdue
                            ? "bg-[rgba(239,68,68,0.12)] text-[#c0392b]"
                            : isUrgent
                              ? "bg-[rgba(245,158,11,0.12)] text-[#c9a84c]"
                              : "bg-[rgba(16,185,129,0.12)] text-[#4a5e3a]",
                        )}
                      >
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {isOverdue
                          ? `${Math.abs(days)} days overdue`
                          : days === 0
                            ? "Due today"
                            : `${days} days remaining`}
                      </div>
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
                      <span>{ev.observations.length} observations</span>
                      <span>{ev.commitments.length} commitments</span>
                    </div>
                    {/* Severity badges */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {critCount > 0 && (
                        <Badge variant="red">{critCount} Critical</Badge>
                      )}
                      {majCount > 0 && (
                        <Badge variant="amber">{majCount} Major</Badge>
                      )}
                      {minCount > 0 && (
                        <Badge variant="gray">{minCount} Minor</Badge>
                      )}
                      {capaCount > 0 && (
                        <Badge variant="blue">{capaCount} CAPAs linked</Badge>
                      )}
                    </div>
                    {/* Quick actions */}
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={ChevronRight}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectEvent(ev);
                          setActiveTab("observations");
                        }}
                      >
                        {ev.observations.length} observations
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={FileText}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectEvent(ev);
                          setActiveTab("response");
                        }}
                      >
                        Response
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={GitBranch}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectEvent(ev);
                          setActiveTab("rca");
                        }}
                      >
                        RCA
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════ OBSERVATIONS TAB ═══════════ */}
      <div
        role="tabpanel"
        id="panel-observations"
        aria-labelledby="tab-observations"
        tabIndex={0}
        hidden={activeTab !== "observations"}
      >
        {!liveEvent ? (
          <div className="card p-8 text-center">
            <ClipboardList
              className="w-10 h-10 mx-auto mb-2"
              style={{ color: "#6b5349" }}
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
              onClick={() => setActiveTab("events")}
            >
              Go to Events
            </Button>
          </div>
        ) : (
          <>
            {/* Event summary header */}
            <div className="card mb-4">
              <div className="card-body">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {eventTypeBadge(liveEvent.type)}
                      {eventStatusBadge(getEffectiveStatus(liveEvent))}
                      <span className="font-mono text-[12px] font-semibold text-[#a57865]">
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
                  {role !== "viewer" && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Plus}
                      onClick={() => {
                        obsForm.reset({
                          number: liveEvent.observations.length + 1,
                          severity: "Major",
                          status: "Open",
                        });
                        setEditingObs(null);
                        setAddObsOpen(true);
                      }}
                    >
                      Add observation
                    </Button>
                  )}
                </div>
              </div>
            </div>

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
                            {obs.capaId ? (
                              <button
                                onClick={() =>
                                  navigate("/capa", {
                                    state: { openCapaId: obs.capaId },
                                  })
                                }
                                className="font-mono text-[11px] text-[#a57865] hover:underline border-none bg-transparent cursor-pointer"
                                aria-label={`Open ${obs.capaId}`}
                              >
                                {obs.capaId}
                              </button>
                            ) : (
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
                              <Button
                                variant="ghost"
                                size="xs"
                                icon={Pencil}
                                aria-label={`Edit observation ${obs.number}`}
                                onClick={() => {
                                  obsForm.reset({
                                    number: obs.number,
                                    text: obs.text,
                                    area: obs.area,
                                    regulation: obs.regulation,
                                    severity: obs.severity,
                                    status: obs.status,
                                  });
                                  setEditingObs(obs);
                                  setAddObsOpen(true);
                                }}
                              />
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
                    className="w-4 h-4 text-[#4a5e3a]"
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
                {role !== "viewer" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Plus}
                    className="ml-2"
                    onClick={() => {
                      commitForm.reset({ status: "Pending" });
                      setAddCommitOpen(true);
                    }}
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
                                <span className="text-[#c0392b] ml-1">
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
            {(() => {
              const eventCAPAs = capas.filter((c) =>
                liveEvent.observations.some((o) => o.capaId === c.id),
              );
              return (
                <div className="card mt-4">
                  <div className="card-header">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck
                        className="w-4 h-4 text-[#a57865]"
                        aria-hidden="true"
                      />
                      <span className="card-title">CAPA set</span>
                    </div>
                    <span
                      className="ml-auto text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {eventCAPAs.length} CAPAs
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
                            <span className="font-mono text-[11px] font-semibold text-[#a57865] flex-shrink-0">
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
                                  : c.risk === "Major"
                                    ? "amber"
                                    : "gray"
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
              );
            })()}
          </>
        )}
      </div>

      {/* ═══════════ RESPONSE TAB ═══════════ */}
      <div
        role="tabpanel"
        id="panel-response"
        aria-labelledby="tab-response"
        tabIndex={0}
        hidden={activeTab !== "response"}
      >
        {!liveEvent ? (
          <div className="card p-8 text-center">
            <FileText
              className="w-10 h-10 mx-auto mb-2"
              style={{ color: "#6b5349" }}
              aria-hidden="true"
            />
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Select an event from the Events tab
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setActiveTab("events")}
            >
              Go to Events
            </Button>
          </div>
        ) : (
          <>
            {/* Status bar */}
            <div
              className={clsx(
                "flex items-center justify-between p-4 rounded-xl mb-4 border flex-wrap gap-3",
                isDark
                  ? "bg-[#503e37] border-[#6b5349]"
                  : "bg-[#f8fafc] border-[#e2e8f0]",
              )}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {eventTypeBadge(liveEvent.type)}
                <span className="font-mono text-[12px] text-[#a57865]">
                  {liveEvent.referenceNumber}
                </span>
                {eventStatusBadge(getEffectiveStatus(liveEvent))}
              </div>
              <div className="text-right">
                <p
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Response deadline
                </p>
                {(() => {
                  const d = daysLeft(liveEvent.responseDeadline);
                  return (
                    <p
                      className={clsx(
                        "text-[15px] font-bold",
                        d <= 0
                          ? "text-[#c0392b]"
                          : d <= 5
                            ? "text-[#c9a84c]"
                            : "text-[#4a5e3a]",
                      )}
                    >
                      {d < 0
                        ? `${Math.abs(d)} days overdue`
                        : d === 0
                          ? "Due today"
                          : `${d} days remaining`}
                    </p>
                  );
                })()}
                <p
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {dayjs
                    .utc(liveEvent.responseDeadline)
                    .tz(timezone)
                    .format(dateFormat)}
                </p>
              </div>
            </div>

            {/* Response readiness */}
            {(() => {
              const checks = [
                {
                  label: "All observations have RCA",
                  done:
                    liveEvent.observations.length > 0 &&
                    liveEvent.observations.every((o) => o.rootCause?.trim()),
                },
                {
                  label: "All observations have CAPA raised",
                  done: liveEvent.observations.every((o) => o.capaId),
                },
                {
                  label: "Response draft written",
                  done: (liveEvent.responseDraft?.trim().length ?? 0) > 0,
                },
                {
                  label: "All commitments have due dates",
                  done:
                    liveEvent.commitments.length > 0 &&
                    liveEvent.commitments.every((c) => c.dueDate),
                },
                {
                  label: "Response within deadline",
                  done: daysLeft(liveEvent.responseDeadline) >= 0,
                },
              ];
              const score = Math.round(
                (checks.filter((c) => c.done).length / checks.length) * 100,
              );
              return (
                <div className="card mb-4">
                  <div className="card-header">
                    <div className="flex items-center gap-2">
                      <TrendingUp
                        className="w-4 h-4 text-[#a57865]"
                        aria-hidden="true"
                      />
                      <span className="card-title">Response readiness</span>
                    </div>
                    <span
                      className="ml-auto text-[18px] font-bold"
                      style={{
                        color:
                          score === 100
                            ? "#4a5e3a"
                            : score >= 60
                              ? "#c9a84c"
                              : "#c0392b",
                      }}
                    >
                      {score}%
                    </span>
                  </div>
                  <div className="card-body space-y-2">
                    {checks.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[12px]"
                      >
                        {c.done ? (
                          <CheckCircle2
                            className="w-4 h-4 text-[#4a5e3a] flex-shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <div
                            className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                            style={{ borderColor: "#6b5349" }}
                          />
                        )}
                        <span
                          style={{
                            color: c.done
                              ? "var(--text-primary)"
                              : "var(--text-muted)",
                          }}
                        >
                          {c.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* AGI draft panel */}
            {agiMode !== "manual" && agiAgent && (
              <div className="agi-panel mb-4" role="status" aria-live="polite">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bot
                      className="w-4 h-4 text-[#4a8fa8]"
                      aria-hidden="true"
                    />
                    <span
                      className="text-[12px] font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      AGI Response Draft
                    </span>
                  </div>
                  {liveEvent.agiDraft && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={ArrowRight}
                      onClick={() => {
                        dispatch(
                          setResponseDraft({
                            eventId: liveEvent.id,
                            text: liveEvent.agiDraft,
                          }),
                        );
                        setResponseText(liveEvent.agiDraft);
                        setEditingResponse(true);
                      }}
                    >
                      Use this draft
                    </Button>
                  )}
                </div>
                {liveEvent.agiDraft ? (
                  <p
                    className="text-[12px] leading-relaxed whitespace-pre-wrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {liveEvent.agiDraft}
                  </p>
                ) : (
                  <div>
                    <p
                      className="text-[12px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      AGI can generate a response draft based on observations
                      and linked CAPAs.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Sparkles}
                      className="mt-2"
                      onClick={() => {
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
                    >
                      Generate AGI draft
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Response editor */}
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-2">
                  <FileText
                    className="w-4 h-4 text-[#a57865]"
                    aria-hidden="true"
                  />
                  <span className="card-title">Response draft</span>
                </div>
                {role !== "viewer" && getEffectiveStatus(liveEvent) !== "Closed" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingResponse)
                        setResponseText(liveEvent.responseDraft ?? "");
                      setEditingResponse((v) => !v);
                    }}
                    className="ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer"
                    style={{ color: editingResponse ? "#64748b" : "#a57865" }}
                    aria-label={
                      editingResponse ? "Cancel editing" : "Edit response"
                    }
                  >
                    {editingResponse ? (
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {editingResponse ? "Cancel" : "Edit"}
                  </button>
                )}
              </div>
              <div className="card-body">
                {editingResponse ? (
                  <div className="space-y-3">
                    <textarea
                      rows={14}
                      className="input resize-none w-full text-[12px] font-mono"
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      placeholder="Write or paste your regulatory response here..."
                      aria-label="Response draft editor"
                    />
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {responseText.length} characters
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => {
                            setResponseText(liveEvent.responseDraft ?? "");
                            setEditingResponse(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={Save}
                          type="button"
                          onClick={() => {
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
                        >
                          Save draft
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : liveEvent.responseDraft ? (
                  <p
                    className="text-[12px] leading-relaxed whitespace-pre-wrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {liveEvent.responseDraft}
                  </p>
                ) : (
                  <p
                    className="text-[11px] italic"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No response draft yet. Click Edit above or use the AGI
                    draft.
                  </p>
                )}
              </div>
            </div>

            {/* Sign & Submit */}
            {canSign &&
              liveEvent.responseDraft?.trim() &&
              getEffectiveStatus(liveEvent) !== "Closed" &&
              getEffectiveStatus(liveEvent) !== "Response Submitted" && (
                <div className="mt-4">
                  <Button
                    variant="primary"
                    icon={ShieldCheck}
                    fullWidth
                    onClick={() => setSignOpen(true)}
                  >
                    Sign &amp; Submit Response
                  </Button>
                  <p
                    className="text-[10px] text-center mt-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    GxP e-signature &mdash; identity, meaning and hash recorded
                  </p>
                </div>
              )}
          </>
        )}
      </div>

      {/* ═══════════ RCA TAB ═══════════ */}
      <div
        role="tabpanel"
        id="panel-rca"
        aria-labelledby="tab-rca"
        tabIndex={0}
        hidden={activeTab !== "rca"}
      >
        {!liveEvent ? (
          <div className="card p-8 text-center">
            <GitBranch
              className="w-10 h-10 mx-auto mb-2"
              style={{ color: "#6b5349" }}
              aria-hidden="true"
            />
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Select an event from the Events tab
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setActiveTab("events")}
            >
              Go to Events
            </Button>
          </div>
        ) : liveEvent.observations.length === 0 ? (
          <div className="card p-8 text-center">
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Add observations first to start RCA analysis.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setActiveTab("observations")}
            >
              Go to Observations
            </Button>
          </div>
        ) : (
          <>
            {/* Observation selector */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <label
                className="text-[12px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Select observation:
              </label>
              <Dropdown
                value={selectedObsId}
                onChange={setSelectedObsId}
                placeholder="Choose observation..."
                width="w-72"
                options={liveEvent.observations.map((o) => ({
                  value: o.id,
                  label: `#${o.number} \u2014 ${o.text.slice(0, 45)}${o.text.length > 45 ? "..." : ""}`,
                }))}
              />
            </div>

            {selectedObs && (
              <>
                {/* Method card */}
                <div className="card mb-4">
                  <div className="card-header">
                    <div className="flex items-center gap-2">
                      <GitBranch
                        className="w-4 h-4 text-[#4a8fa8]"
                        aria-hidden="true"
                      />
                      <span className="card-title">
                        RCA &mdash; Observation #{selectedObs.number}
                      </span>
                    </div>
                    {selectedObs.rcaMethod && (
                      <Badge variant="purple">{selectedObs.rcaMethod}</Badge>
                    )}
                  </div>
                  <div className="card-body">
                    <div className="flex gap-2 flex-wrap">
                      {(
                        [
                          "5 Why",
                          "Fishbone",
                          "Fault Tree",
                          "Barrier Analysis",
                        ] as const
                      ).map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={selectedObs.rcaMethod === m}
                          onClick={() =>
                            dispatch(
                              updateObservation({
                                eventId: liveEvent.id,
                                obsId: selectedObs.id,
                                patch: { rcaMethod: m },
                              }),
                            )
                          }
                          className={clsx(
                            "px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
                            selectedObs.rcaMethod === m
                              ? "bg-[#4a8fa8] text-white border-[#4a8fa8]"
                              : isDark
                                ? "bg-transparent border-[#6b5349] text-[#d5bfb2] hover:border-[#4a8fa8]"
                                : "bg-transparent border-[#e2e8f0] text-[#64748b] hover:border-[#4a8fa8]",
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 5 Why */}
                {selectedObs.rcaMethod === "5 Why" && (
                  <div className="card mb-4">
                    <div className="card-header">
                      <span className="card-title">5 Why Analysis</span>
                    </div>
                    <div className="card-body space-y-3">
                      <div
                        className={clsx(
                          "p-3 rounded-lg",
                          isDark
                            ? "bg-[#3a2d28] border border-[#6b5349]"
                            : "bg-[#f8fafc] border border-[#e2e8f0]",
                        )}
                      >
                        <p
                          className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Problem statement
                        </p>
                        <p
                          className="text-[13px]"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {selectedObs.text}
                        </p>
                      </div>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div key={n} className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full flex-shrink-0 mt-2 flex items-center justify-center text-[10px] font-bold bg-[rgba(99,102,241,0.12)] text-[#4a8fa8]">
                            {n}
                          </div>
                          <div className="flex-1">
                            <label
                              className="text-[11px] mb-1 block"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Why {n}?
                            </label>
                            <input
                              type="text"
                              className="input w-full text-[12px]"
                              value={whyAnswers[n - 1]}
                              onChange={(e) => {
                                const u = [...whyAnswers];
                                u[n - 1] = e.target.value;
                                setWhyAnswers(u);
                              }}
                              placeholder={
                                n === 1
                                  ? "Why did this happen?"
                                  : `Deeper cause of Why ${n - 1}`
                              }
                            />
                          </div>
                        </div>
                      ))}
                      <div
                        className={clsx(
                          "mt-2 p-3 rounded-lg border",
                          isDark
                            ? "bg-[rgba(99,102,241,0.08)] border-[rgba(99,102,241,0.2)]"
                            : "bg-[#f5f3ff] border-[#a5b4fc]",
                        )}
                      >
                        <p className="text-[11px] font-semibold text-[#4a8fa8] mb-1">
                          Root cause (Why 5)
                        </p>
                        <p
                          className="text-[12px]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {whyAnswers[4] ||
                            "Complete all 5 Whys to identify root cause"}
                        </p>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Save}
                        disabled={!whyAnswers[0]}
                        onClick={() => {
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
                      >
                        Save RCA
                      </Button>
                    </div>
                  </div>
                )}

                {/* Fishbone */}
                {selectedObs.rcaMethod === "Fishbone" && (
                  <div className="card mb-4">
                    <div className="card-header">
                      <span className="card-title">
                        Fishbone (Ishikawa) Analysis
                      </span>
                    </div>
                    <div className="card-body space-y-3">
                      <div
                        className={clsx(
                          "p-3 rounded-lg",
                          isDark
                            ? "bg-[#3a2d28] border border-[#6b5349]"
                            : "bg-[#f8fafc] border border-[#e2e8f0]",
                        )}
                      >
                        <p
                          className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Problem statement
                        </p>
                        <p
                          className="text-[13px]"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {selectedObs.text}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                        {[
                          "People",
                          "Process",
                          "Equipment",
                          "Materials",
                          "Environment",
                          "Management",
                        ].map((cat) => (
                          <div key={cat}>
                            <label
                              className="text-[11px] font-semibold mb-1 block"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {cat}
                            </label>
                            <input
                              type="text"
                              className="input w-full text-[12px]"
                              value={fishboneAnswers[cat] ?? ""}
                              onChange={(e) =>
                                setFishboneAnswers((p) => ({
                                  ...p,
                                  [cat]: e.target.value,
                                }))
                              }
                              placeholder={`Contributing factors from ${cat.toLowerCase()}...`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3">
                        <label
                          className="text-[11px] font-semibold mb-1 block"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Root cause summary
                        </label>
                        <textarea
                          rows={3}
                          className="input resize-none w-full text-[12px]"
                          value={fishboneRoot}
                          onChange={(e) => setFishboneRoot(e.target.value)}
                          placeholder="Summarize the primary root cause identified..."
                        />
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Save}
                        disabled={!fishboneRoot.trim()}
                        onClick={() => {
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
                      >
                        Save RCA
                      </Button>
                    </div>
                  </div>
                )}

                {/* Fault Tree / Barrier Analysis */}
                {(selectedObs.rcaMethod === "Fault Tree" ||
                  selectedObs.rcaMethod === "Barrier Analysis") && (
                  <div className="card mb-4">
                    <div className="card-header">
                      <span className="card-title">
                        {selectedObs.rcaMethod} Analysis
                      </span>
                    </div>
                    <div className="card-body space-y-3">
                      <div
                        className={clsx(
                          "p-3 rounded-lg",
                          isDark
                            ? "bg-[#3a2d28] border border-[#6b5349]"
                            : "bg-[#f8fafc] border border-[#e2e8f0]",
                        )}
                      >
                        <p
                          className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Problem statement
                        </p>
                        <p
                          className="text-[13px]"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {selectedObs.text}
                        </p>
                      </div>
                      <textarea
                        rows={8}
                        className="input resize-none w-full text-[12px]"
                        value={freeformRCA}
                        onChange={(e) => setFreeformRCA(e.target.value)}
                        placeholder={`Document your ${selectedObs.rcaMethod?.toLowerCase()} analysis here...`}
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Save}
                        disabled={!freeformRCA.trim()}
                        onClick={() => {
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
                      >
                        Save RCA
                      </Button>
                    </div>
                  </div>
                )}

                {/* Raise CAPA */}
                {selectedObs.capaId ? (
                  <div className="flex items-center gap-2 mt-4">
                    <span
                      className="text-[12px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      CAPA linked:
                    </span>
                    <button
                      onClick={() =>
                        navigate("/capa", {
                          state: { openCapaId: selectedObs.capaId },
                        })
                      }
                      className="font-mono text-[12px] text-[#a57865] hover:underline border-none bg-transparent cursor-pointer"
                    >
                      {selectedObs.capaId}
                    </button>
                  </div>
                ) : (
                  role !== "viewer" && (
                    <Button
                      variant="secondary"
                      icon={Plus}
                      fullWidth
                      className="mt-4"
                      onClick={() => {
                        const capaId = `CAPA-${String(Date.now()).slice(-4)}`;
                        dispatch(
                          addCAPA({
                            id: capaId,
                            tenantId: tenantId ?? "",
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
                    >
                      Raise CAPA for this observation
                    </Button>
                  )
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Add Event Modal ── */}
      <Modal
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        title="Log regulatory event"
      >
        <form
          onSubmit={eventForm.handleSubmit(onEventSave)}
          noValidate
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Event type *
              </label>
              <Controller
                name="type"
                control={eventForm.control}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={field.onChange}
                    width="w-full"
                    options={[
                      "FDA 483",
                      "Warning Letter",
                      "EMA Inspection",
                      "MHRA Inspection",
                      "WHO Inspection",
                    ].map((t) => ({ value: t, label: t }))}
                  />
                )}
              />
            </div>
            <div>
              <label
                htmlFor="ev-ref"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Reference number *
              </label>
              <input
                id="ev-ref"
                className="input text-[12px]"
                placeholder="e.g. FEI 3004795103"
                {...eventForm.register("referenceNumber")}
              />
              {eventForm.formState.errors.referenceNumber && (
                <p role="alert" className="text-[11px] text-[#c0392b] mt-1">
                  {eventForm.formState.errors.referenceNumber.message}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="ev-agency"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Regulatory agency *
              </label>
              <input
                id="ev-agency"
                className="input text-[12px]"
                placeholder="e.g. FDA, EMA, MHRA"
                {...eventForm.register("agency")}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Site *
              </label>
              <Controller
                name="siteId"
                control={eventForm.control}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select site"
                    width="w-full"
                    options={sites
                      .filter((s) => s.status === "Active")
                      .map((s) => ({ value: s.id, label: s.name }))}
                  />
                )}
              />
              {eventForm.formState.errors.siteId && (
                <p role="alert" className="text-[11px] text-[#c0392b] mt-1">
                  {eventForm.formState.errors.siteId.message}
                </p>
              )}
            </div>
            <div>
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Status *
              </label>
              <Controller
                name="status"
                control={eventForm.control}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={field.onChange}
                    width="w-full"
                    options={[
                      "Open",
                      "Response Due",
                      "Response Submitted",
                      "Closed",
                    ].map((s) => ({ value: s, label: s }))}
                  />
                )}
              />
            </div>
            <div>
              <label
                htmlFor="ev-date"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Inspection date *
              </label>
              <input
                id="ev-date"
                type="date"
                className="input text-[12px]"
                {...eventForm.register("inspectionDate")}
              />
            </div>
            <div>
              <label
                htmlFor="ev-deadline"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Response deadline *
              </label>
              <input
                id="ev-deadline"
                type="date"
                className="input text-[12px]"
                {...eventForm.register("responseDeadline")}
              />
              <p
                className="text-[10px] mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                FDA: 15 working days from receipt
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setAddEventOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={eventForm.formState.isSubmitting}
            >
              Log event
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Add/Edit Observation Modal ── */}
      <Modal
        open={addObsOpen}
        onClose={() => {
          setAddObsOpen(false);
          setEditingObs(null);
        }}
        title={editingObs ? "Edit observation" : "Add observation"}
      >
        <form
          onSubmit={obsForm.handleSubmit(onObsSave)}
          noValidate
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="obs-num"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Observation number *
              </label>
              <input
                id="obs-num"
                type="number"
                min={1}
                className="input text-[12px]"
                {...obsForm.register("number")}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Severity *
              </label>
              <Controller
                name="severity"
                control={obsForm.control}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={field.onChange}
                    width="w-full"
                    options={[
                      { value: "Critical", label: "Critical" },
                      { value: "Major", label: "Major" },
                      { value: "Minor", label: "Minor" },
                    ]}
                  />
                )}
              />
            </div>
            <div>
              <label
                htmlFor="obs-area"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Area
              </label>
              <input
                id="obs-area"
                className="input text-[12px]"
                placeholder="e.g. QC Lab"
                {...obsForm.register("area")}
              />
            </div>
            <div>
              <label
                htmlFor="obs-reg"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Regulation cited
              </label>
              <input
                id="obs-reg"
                className="input text-[12px]"
                placeholder="e.g. 21 CFR 211.68"
                {...obsForm.register("regulation")}
              />
            </div>
            <div className="col-span-2">
              <label
                htmlFor="obs-text"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Observation text *
              </label>
              <textarea
                id="obs-text"
                rows={3}
                className="input text-[12px] resize-none"
                placeholder="Enter the exact observation text from the 483..."
                {...obsForm.register("text")}
              />
              {obsForm.formState.errors.text && (
                <p role="alert" className="text-[11px] text-[#c0392b] mt-1">
                  {obsForm.formState.errors.text.message}
                </p>
              )}
            </div>
            <div className="col-span-2">
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Status
              </label>
              <Controller
                name="status"
                control={obsForm.control}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={field.onChange}
                    width="w-full"
                    options={[
                      "Open",
                      "RCA In Progress",
                      "Response Drafted",
                      "Closed",
                    ].map((s) => ({ value: s, label: s }))}
                  />
                )}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setAddObsOpen(false);
                setEditingObs(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={obsForm.formState.isSubmitting}
            >
              {editingObs ? "Save" : "Add observation"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Add Commitment Modal ── */}
      <Modal
        open={addCommitOpen}
        onClose={() => setAddCommitOpen(false)}
        title="Add commitment"
      >
        <form
          onSubmit={commitForm.handleSubmit(onCommitSave)}
          noValidate
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label
                htmlFor="cm-text"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Commitment *
              </label>
              <textarea
                id="cm-text"
                rows={2}
                className="input text-[12px] resize-none"
                placeholder="e.g. Submit validation protocol by 15 Apr 2026"
                {...commitForm.register("text")}
              />
              {commitForm.formState.errors.text && (
                <p role="alert" className="text-[11px] text-[#c0392b] mt-1">
                  {commitForm.formState.errors.text.message}
                </p>
              )}
            </div>
            <div>
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Owner *
              </label>
              <Controller
                name="owner"
                control={commitForm.control}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select owner"
                    width="w-full"
                    options={users
                      .filter((u) => u.status === "Active")
                      .map((u) => ({ value: u.id, label: u.name }))}
                  />
                )}
              />
            </div>
            <div>
              <label
                htmlFor="cm-due"
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Due date *
              </label>
              <input
                id="cm-due"
                type="date"
                className="input text-[12px]"
                {...commitForm.register("dueDate")}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Status
              </label>
              <Controller
                name="status"
                control={commitForm.control}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={field.onChange}
                    width="w-full"
                    options={[
                      "Pending",
                      "In Progress",
                      "Complete",
                      "Overdue",
                    ].map((s) => ({ value: s, label: s }))}
                  />
                )}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setAddCommitOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={commitForm.formState.isSubmitting}
            >
              Add commitment
            </Button>
          </div>
        </form>
      </Modal>

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

      {/* Sign & Submit Modal */}
      <Modal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        title="Sign & Submit Response"
      >
        <p id="sign-483-notice" className="alert alert-info mb-4 text-[12px]">
          This is a GxP electronic signature under 21 CFR Part 11. Your
          identity, the meaning of this signature, and a content hash will be
          recorded and cannot be altered.
        </p>
        {liveEvent && (
          <div
            className={clsx(
              "rounded-lg p-3 mb-4",
              isDark
                ? "bg-[#3a2d28] border border-[#6b5349]"
                : "bg-[#f8fafc] border border-[#e2e8f0]",
            )}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {eventTypeBadge(liveEvent.type)}
              <span className="font-mono text-[11px] text-[#a57865]">
                {liveEvent.referenceNumber}
              </span>
            </div>
            <p
              className="text-[11px] mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              {liveEvent.observations.length} observations
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Signature meaning *
            </label>
            <Dropdown
              value={signMeaning}
              onChange={setSignMeaning}
              placeholder="Select meaning..."
              width="w-full"
              options={[
                {
                  value: "approve",
                  label: "I approve this response as accurate and complete",
                },
                {
                  value: "certify",
                  label: "I certify the commitments are achievable",
                },
                {
                  value: "authorize",
                  label: "I authorize submission to the regulatory agency",
                },
              ]}
            />
          </div>
          <div>
            <label
              htmlFor="sign-483-pw"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Confirm your password *
            </label>
            <input
              id="sign-483-pw"
              type="password"
              className="input text-[12px]"
              value={signPassword}
              onChange={(e) => setSignPassword(e.target.value)}
              placeholder="Re-enter your password"
            />
            <p
              className="text-[10px] mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              Required for identity verification under 21 CFR Part 11
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="ghost"
            type="button"
            onClick={() => setSignOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={ShieldCheck}
            disabled={!signMeaning || !signPassword}
            onClick={() => {
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
          >
            Sign &amp; Submit
          </Button>
        </div>
      </Modal>
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="FDA 483 events" />
    </main>
  );
}
