"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Plus,
  AlertCircle,
  LayoutDashboard,
  ClipboardList,
  GitBranch,
  FileText,
  History,
  ArrowLeft,
  Clock,
  ArrowRightCircle,
  Gavel,
  CheckCircle2,
  Building2,
} from "lucide-react";
import type {
  FDA483Event as PrismaFDA483Event,
  FDA483Observation as PrismaObservation,
  FDA483Commitment as PrismaCommitment,
  FDA483Document as PrismaFDA483Document,
  CAPA as PrismaCAPA,
} from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { getResponseDraft } from "@/lib/ai";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { setCAPAs } from "@/store/capa.slice";
import { mapCAPAFromPrisma } from "@/lib/mappers/capaMapper";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { StatusGuide, TabBar, type Tab } from "@/components/shared";
import { PageLayout } from "@/components/layout/PageLayout";
import { MotionList, MotionListItem } from "@/components/motion/Motion";
import { FDA483_EVENT_STATUSES } from "@/constants/statusTaxonomy";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import { displayUserName } from "@/lib/identity-display";
import type { FDA483Event, EventStatus, Observation, Commitment } from "@/types/fda483";
import { daysUntil, eventStatusBadge, getEffectiveEventStatus, isEventLocked, FDA483_AUDIT_MODULE, STAGE_CONFIG } from "./_shared";
import { FDA483_SIGN_ROLES } from "@/lib/permissions/roleSets";
import {
  createFDA483Event,
  addObservation as addObservationServer,
  updateObservation as updateObservationServer,
  markObservationResponseDrafted as markObservationResponseDraftedServer,
  addCommitment as addCommitmentServer,
  saveResponseDraft as saveResponseDraftServer,
  saveAGIDraft as saveAGIDraftServer,
  signSubmitFDA483Response,
  raiseCAPAFromObservation,
  bulkAddObservationsFromExtraction,
  handoffFDA483Stage,
  recordFDA483Outcome,
} from "@/actions/fda483";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { NoSitesPopup } from "@/components/shared";

import { EventsTab } from "./tabs/EventsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { ObservationsListTab } from "./tabs/ObservationsListTab";
import { InvestigationTab } from "./tabs/InvestigationTab";
import { ResponseDetailTab } from "./tabs/ResponseDetailTab";
import { AuditTab } from "./tabs/AuditTab";
import { useEventDetailUrlState, type DetailTab } from "./useEventDetailUrlState";
import { AddEventModal, type EventFormData } from "./modals/AddEventModal";
import { AddObservationModal, type ObsFormData } from "./modals/AddObservationModal";
import { AddCommitmentModal, type CommitFormData } from "./modals/AddCommitmentModal";
import { CommitmentDetailModal } from "./modals/CommitmentDetailModal";
import { SignSubmitModal } from "./modals/SignSubmitModal";
import { ImportObservationsModal, type ImportObservationsPayload } from "./modals/ImportObservationsModal";
import { OutcomeModal, type OutcomePayload } from "./modals/OutcomeModal";
import { DocumentSummaryPanel } from "@/components/search/DocumentSummaryPanel";
import { useAgiPolicy } from "@/hooks/useAgiPolicy";

/* ── Helpers ── */

// daysLeft + getEffectiveStatus extracted to ./_shared.ts (daysUntil +
// getEffectiveEventStatus). Local wrappers preserve the pre-refactor
// call shape so existing render logic doesn't need rewriting.
function daysLeft(d: string): number {
  return daysUntil(d) ?? 0;
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  return getEffectiveEventStatus(e.status, e.responseDeadline);
}

export function computeReadiness(e: FDA483Event): number {
  // New step order: Event (20) → Observations (40) → RCA (60) → Response draft (80) → Submitted (100)
  if (isEventLocked(e.status)) return 100;
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

/* ── Server Component props ── */

type PrismaEventWithRelations = PrismaFDA483Event & {
  observations: PrismaObservation[];
  // Commitments come with their source/relation includes (see getFDA483Event).
  commitments: (PrismaCommitment & {
    observation: { id: string; number: number; reference: string | null } | null;
    capa: { id: string; reference: string | null } | null;
    completedByUser: { id: string; name: string } | null;
    documents: { id: string; fileName: string; fileUrl: string; fileType: string | null; fileSize: string | null }[];
  })[];
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

/**
 * Server-fetched audit-log row scoped to the currently-open event.
 * Mirrors the columns AuditTab + OverviewTab.recentAudit consume so the
 * parent can pass the same array to both without re-shaping.
 */
export interface FDA483PageAuditRow {
  id: string;
  createdAt: string; // ISO
  userName: string;
  userRole?: string | null;
  action: string;
  recordTitle?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

export interface FDA483PageProps {
  events: PrismaEventWithRelations[];
  stats: FDA483PageStats;
  /** Audit log rows for the URL-active event, sorted DESC. Empty when
   *  no event is open. The server component fetches these via
   *  getFDA483EventAuditLogs and limits to 50 rows. */
  activeEventAuditRows?: FDA483PageAuditRow[];
  /** Server-fetched CAPAs (Prisma rows) — seeded into the CAPA slice on
   *  mount so the Investigation tab can resolve each observation's linked
   *  CAPA (reference + status/owner/due) without depending on the user
   *  having first visited the CAPA module. */
  capas?: PrismaCAPA[];
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
    inspectionEndDate: p.inspectionEndDate
      ? p.inspectionEndDate.toISOString()
      : undefined,
    responseDeadline: p.responseDeadline.toISOString(),
    status: p.status as EventStatus,
    currentStage: (p.currentStage ?? "intake") as FDA483Event["currentStage"],
    outcomeType: (p.outcomeType ?? undefined) as FDA483Event["outcomeType"],
    outcomeNote: p.outcomeNote ?? undefined,
    leadInvestigator: p.leadInvestigator ?? undefined,
    internalOwnerId: p.internalOwnerId ?? undefined,
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
      status: (c.status ?? "Pending") as Commitment["status"],
      reference: c.reference ?? undefined,
      observationId: c.observationId ?? undefined,
      observationNumber: c.observation?.number,
      observationRef: c.observation?.reference ?? undefined,
      capaId: c.capaId ?? undefined,
      capaRef: c.capa?.reference ?? undefined,
      completedAt: c.completedAt ? c.completedAt.toISOString() : undefined,
      completedById: c.completedById ?? undefined,
      completedByName: c.completedByUser?.name,
      completionNotes: c.completionNotes ?? undefined,
      createdById: c.createdById ?? undefined,
      documents: c.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        fileType: d.fileType ?? undefined,
        fileSize: d.fileSize ?? undefined,
      })),
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
      linkedTo: { module: FDA483_AUDIT_MODULE, recordId: p.id, recordTitle: p.referenceNumber },
      dataUrl: d.fileUrl,
    })),
    linkedCapas: [],
  };
}

/* ── Detail tab strip ── */

const DETAIL_TABS: Tab[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "observations", label: "Observations", Icon: ClipboardList },
  { id: "investigation", label: "Investigation", Icon: GitBranch },
  { id: "response", label: "Response", Icon: FileText },
  { id: "audit", label: "Audit Trail", Icon: History },
];

/* ══════════════════════════════════════ */

/**
 * Compact event-identity card shown above the tab bar on the detail view, so
 * the active event is visible across all tabs. Purely informational — no
 * action affordances. Derived entirely from the already-loaded liveEvent.
 */
function EventHeader({
  event,
  sites,
  timezone,
  dateFormat,
}: {
  event: FDA483Event;
  sites: { id: string; name: string }[];
  timezone: string;
  dateFormat: string;
}) {
  const stat = eventStatusBadge(event.status);
  const siteName =
    sites.find((s) => s.id === event.siteId)?.name ?? event.siteId;
  const isTerminal = isEventLocked(event.status);
  const days = daysUntil(event.responseDeadline);

  // Days chip — same tone thresholds as the list-view deadline alert /
  // Overview DeadlineIndicator. Hidden entirely once the event is terminal.
  let chip: { label: string; color: string; bg: string } | null = null;
  if (!isTerminal && days !== null) {
    if (days < 0) {
      chip = {
        label: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`,
        color: "var(--danger)",
        bg: "var(--danger-bg)",
      };
    } else if (days <= 5) {
      chip = {
        label: `${days} day${days === 1 ? "" : "s"} remaining`,
        color: "var(--danger)",
        bg: "var(--danger-bg)",
      };
    } else if (days <= 15) {
      chip = {
        label: `${days} days remaining`,
        color: "var(--warning)",
        bg: "var(--warning-bg)",
      };
    } else {
      chip = {
        label: `${days} days remaining`,
        color: "var(--text-secondary)",
        bg: "var(--bg-elevated)",
      };
    }
  }

  return (
    <div className="card">
      <div className="card-body flex flex-col gap-1">
        {/* Line 1 — reference (anchor) + status + days chip */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono text-[15px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {event.referenceNumber}
          </span>
          <Badge variant={stat.variant}>{stat.label}</Badge>
          {chip && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ background: chip.bg, color: chip.color }}
            >
              <Clock className="w-3 h-3" aria-hidden="true" />
              {chip.label}
            </span>
          )}
        </div>
        {/* Line 2 — type · site · inspection date(s) (context, muted) */}
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {event.type} · {siteName} ·{" "}
          {event.inspectionEndDate
            ? `${dayjs.utc(event.inspectionDate).tz(timezone).format(dateFormat)} → ${dayjs.utc(event.inspectionEndDate).tz(timezone).format(dateFormat)}`
            : `Inspection ${dayjs.utc(event.inspectionDate).tz(timezone).format(dateFormat)}`}
        </p>
        {/* Line 3 — inspector (the internal owner is intentionally NOT shown;
            it is an internal routing/visibility attribute, not user-facing) */}
        {event.leadInvestigator?.trim() && (
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Inspector: {event.leadInvestigator.trim()}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * StageBanner — the role-based ownership pointer. Shows the current stage +
 * owning role + next-step hint, and a single contextual action:
 *   - intake / investigation → a soft "Hand off" button (owner role only)
 *   - outcome → "Record FDA Outcome" (sign roles only)
 *   - closed → the recorded outcome, no action.
 * Soft: it never blocks editing — it's an ownership convenience.
 */
function StageBanner({
  event,
  role,
  onHandoff,
  onRecordOutcome,
}: {
  event: FDA483Event;
  role: string;
  onHandoff: (toStage: "investigation" | "response") => void;
  onRecordOutcome: () => void;
}) {
  const stage = event.currentStage ?? "intake";
  const cfg = STAGE_CONFIG[stage];
  if (!cfg) return null;
  const isOwner = role === cfg.ownerRole;
  const canSignOutcome = FDA483_SIGN_ROLES.includes(role);
  const isClosed = stage === "closed";

  return (
    <div
      className="card"
      style={{
        borderLeft: `3px solid ${isClosed ? "var(--success)" : "var(--brand)"}`,
      }}
    >
      <div className="card-body flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Stage
            </span>
            <Badge variant={isClosed ? "green" : "blue"}>{cfg.label}</Badge>
            {!isClosed && (
              <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Owner: <strong>{cfg.ownerLabel}</strong>
              </span>
            )}
            {isClosed && event.outcomeType && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--success)" }}>
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> FDA outcome: {event.outcomeType}
              </span>
            )}
          </div>
          {!isClosed && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Next: {cfg.nextHint}
            </p>
          )}
        </div>

        {/* Contextual action */}
        {!isClosed && cfg.nextActionLabel && cfg.nextStage && isOwner && (
          <Button
            variant="primary"
            size="sm"
            icon={ArrowRightCircle}
            onClick={() => onHandoff(cfg.nextStage as "investigation" | "response")}
          >
            {cfg.nextActionLabel}
          </Button>
        )}
        {stage === "outcome" && canSignOutcome && (
          <Button variant="primary" size="sm" icon={Gavel} onClick={onRecordOutcome}>
            Record FDA Outcome
          </Button>
        )}
      </div>
    </div>
  );
}

export function FDA483Page({
  events: prismaEvents,
  stats: _stats,
  activeEventAuditRows = [],
  capas: serverCAPAs,
}: FDA483PageProps) {
  // _stats prop accepted for forward-compat (future KPI surface);
  // existing layout derives counts from the events list itself.
  const router = useRouter();
  const toast = useToast();
  const dispatch = useAppDispatch();
  // Seed the CAPA slice from server-fetched rows so linked-CAPA lookups in
  // the Investigation tab resolve (reference + status/owner/due). Without
  // this the slice is only hydrated by the CAPA module, leaving a direct
  // FDA 483 visit to fall back to the raw cuid.
  useEffect(() => {
    if (serverCAPAs) {
      dispatch(setCAPAs(serverCAPAs.map(mapCAPAFromPrisma)));
    }
  }, [serverCAPAs, dispatch]);
  const { capas } = useTenantData();
  const events = useMemo(() => prismaEvents.map(adaptEvent), [prismaEvents]);
  const { org, sites, users, tenantName } = useTenantConfig();
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { mode: agiMode, agents: agiAgents } = useAgiPolicy();
  const agiAgent = agiAgents.fda483;
  const user = useAppSelector((s) => s.auth.user);
  const { role, canSign } = useRole();
  const { isCustomerAdmin } = usePermissions();
  // Capability mirror of the server (excludes super_admin from authoring).
  const fda = usePermissions("fda483");
  const { hasSites } = useSetupStatus();

  function ownerName(id: string) {
    return displayUserName(id, users);
  }

  /* ── URL-driven detail navigation (replaces selectedEvent + currentStep) ── */
  const urlState = useEventDetailUrlState();

  /* ── Filter + modal state (detail view UI buffers) ── */
  const [typeFilter, setTypeFilter] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [addObsOpen, setAddObsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [editingObs, setEditingObs] = useState<Observation | null>(null);
  const [addCommitOpen, setAddCommitOpen] = useState(false);
  // Edit / complete a single commitment (CommitmentDetailModal).
  const [commitDetail, setCommitDetail] = useState<{ mode: "edit" | "complete"; commitment: Commitment } | null>(null);
  const [responseText, setResponseText] = useState("");
  const [editingResponse, setEditingResponse] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signMeaning, setSignMeaning] = useState("");
  const [signPassword, setSignPassword] = useState("");
  // Inline state for the Sign & Submit flow — SignSubmitModal stays open
  // on a server reject (wrong password, missing approvals, etc.) and
  // renders signError next to the Sign button. Critical for Part 11:
  // previously a wrong-password attempt left the modal sitting there
  // with no signal, looking identical to the "still loading" state.
  const [signError, setSignError] = useState<string | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  // RCA workspace buffers — currently parent-owned; the InvestigationTab
  // R2 body can migrate these into the child later (per RECON note).
  const [whyAnswers, setWhyAnswers] = useState(["", "", "", "", ""]);
  const [fishboneAnswers, setFishboneAnswers] = useState<
    Record<string, string>
  >({});
  const [fishboneRoot, setFishboneRoot] = useState("");
  const [freeformRCA, setFreeformRCA] = useState("");
  const [noSitesOpen, setNoSitesOpen] = useState(false);

  /* ── Derived from URL state ── */
  const liveEvent = urlState.eventId
    ? (events.find((e) => e.id === urlState.eventId) ?? null)
    : null;
  const selectedObs =
    liveEvent && urlState.obsIndex !== null
      ? (liveEvent.observations[urlState.obsIndex] ?? null)
      : null;
  const selectedObsId = selectedObs?.id ?? "";

  useEffect(() => {
    if (liveEvent) {
      setResponseText(liveEvent.responseDraft ?? "");
      setEditingResponse(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.eventId]);

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
  const hasSubmitted = !!liveEvent && isEventLocked(liveEvent.status);
  const canSubmitResponse = hasRcaAndCapa;

  /* ── Handlers ── */

  async function onEventSave(data: EventFormData) {
    // Server action writes to Prisma + emits audit log; no client-side
    // dispatch needed — router.refresh() pulls the fresh row into props.
    const result = await createFDA483Event({
      referenceNumber: data.referenceNumber,
      eventType: data.type,
      siteId: data.siteId,
      inspectionDate: data.inspectionDate
        ? dayjs(data.inspectionDate).utc().toISOString()
        : "",
      inspectionEndDate: data.inspectionEndDate
        ? dayjs(data.inspectionEndDate).utc().toISOString()
        : undefined,
      responseDeadline: data.responseDeadline
        ? dayjs(data.responseDeadline).utc().toISOString()
        : "",
      // Internal owner is no longer a form field (hidden from the UI). It is
      // still written, because it is what record visibility scopes on
      // (queries/fda483.ts → OR[createdById, internalOwnerId]) and what the
      // audit entry names: fall back to the acting user so the event stays
      // visible to its creator exactly as before.
      internalOwnerId: data.internalOwnerId || user?.id || "",
      leadInvestigator: data.leadInvestigator || undefined,
    });
    if (!result.success) {
      toast.error(`Could not complete action: ${result.error || "Failed to log event. Please try again."}`);
      return;
    }
    setAddEventOpen(false);
    toast.success("Event logged.");
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
      toast.error(`Could not complete action: ${result.error || "Failed to save observation. Please try again."}`);
      return;
    }
    setAddObsOpen(false);
    setEditingObs(null);
    toast.success("Observation saved.");
    router.refresh();
  }

  async function onCommitSave(data: CommitFormData) {
    if (!liveEvent) return;
    const result = await addCommitmentServer({
      eventId: liveEvent.id,
      text: data.text,
      dueDate: data.dueDate ? dayjs(data.dueDate).utc().toISOString() : undefined,
      owner: data.owner,
      observationId: data.observationId,
      capaId: data.capaId,
    });
    if (!result.success) {
      toast.error(`Could not complete action: ${result.error || "Failed to add commitment. Please try again."}`);
      return;
    }
    router.refresh();
    setAddCommitOpen(false);
  }

  // Linkage options for the Add Commitment modal — this event's observations
  // and the CAPAs those observations link to.
  const commitObsOptions = (liveEvent?.observations ?? []).map((o) => ({ id: o.id, number: o.number, text: o.text }));
  const commitCapaIds = new Set(
    (liveEvent?.observations ?? []).map((o) => o.capaId).filter((x): x is string => !!x),
  );
  const commitCapaOptions = capas
    .filter((c) => commitCapaIds.has(c.id))
    .map((c) => ({ id: c.id, reference: c.reference, description: c.description }));

  function selectEvent(e: FDA483Event | null) {
    urlState.setEvent(e?.id ?? null);
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
      {!liveEvent && (
        /* Header — list view only (the detail view renders its own EventHeader).
           Change 1 — the dynamic stats subtitle was replaced with a static
           one-liner (counts live in the Overview KPIs + the events table).
           Change 2 — StatusGuide moved from a content child into `headerRight`,
           so the header reads [Status Guide] [+ Register Event]. The list-level
           deadline alert is now the header's content child (below the divider). */
        <PageLayout
          titleIcon={Building2}
          title="Inspections & Regulatory"
          description="Track FDA 483 inspection events, observations, commitments, and formal responses across the trailing 12 months."
          headerRight={<StatusGuide module="FDA 483 Events" statuses={FDA483_EVENT_STATUSES} />}
          actions={
            fda.canCreate
              ? [{
                  label: "Register Event",
                  variant: "primary",
                  icon: Plus,
                  onClick: () => { if (!hasSites) { setNoSitesOpen(true); return; } setAddEventOpen(true); },
                }]
              : []
          }
        >
          {/* Deadline alert — LIST view only. Urgency for events with a response
              due within 5 days; the detail view uses a per-event days chip instead. */}
          {urgentEvents.length > 0 ? (
            <div
              className={clsx(
                "flex items-start gap-3 p-4 rounded-2xl border",
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
                    .join(" · ")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStatusFilter("Response Due"); urlState.setEvent(null); }}
              >
                View
              </Button>
            </div>
          ) : null}
        </PageLayout>
      )}


      {/* ═══════════ Back button — only in event detail view (fix 6) ═══════════ */}
      {liveEvent && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            onClick={() => urlState.setEvent(null)}
          >
            Back to events
          </Button>
        </div>
      )}


      {/* ═══════════ CONTENT ═══════════ */}
      <div>
        {/* MAIN LIST VIEW — shown when no event is selected. Change 4 — Phase-3
            entrance: the events table (and the submitted banner) reveal via
            MotionList/MotionListItem on first mount (reduced-motion aware; tempo
            from the motion tokens). This is a single-page list view (no list-level
            tabs), so framer's mount-only entrance suffices — filter/pagination
            re-renders never replay it and NO per-tab guard ref is needed. The
            detail view (liveEvent branch) is untouched; modals stay outside. */}
        {!liveEvent && (
          <MotionList className="space-y-4">
            <MotionListItem>
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
                onOpenEvent={(e) => { selectEvent(e); }}
                onAddEvent={() => setAddEventOpen(true)}
                computeReadiness={computeReadiness}
              />
            </MotionListItem>
            {hasSubmitted && (
              <MotionListItem>
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
              </MotionListItem>
            )}
          </MotionList>
        )}

        {/* EVENT DETAIL — tabbed view */}
        {liveEvent && (
          <div className="space-y-4">
            {/* Event-identity card — sibling of TabBar + tabpanel, so it stays
             *  visible across every tab. */}
            <EventHeader
              event={liveEvent}
              sites={sites}
              timezone={timezone}
              dateFormat={dateFormat}
            />
            <StageBanner
              event={liveEvent}
              role={role}
              onHandoff={async (toStage) => {
                const result = await handoffFDA483Stage({ eventId: liveEvent.id, toStage });
                if (!result.success) {
                  toast.error(`Could not complete action: ${result.error || "Failed to hand off. Please try again."}`);
                  return;
                }
                toast.success(toStage === "investigation" ? "Handed to QA for investigation." : "Handed back to RA for response.");
                router.refresh();
              }}
              onRecordOutcome={() => setOutcomeOpen(true)}
            />
            <TabBar
              tabs={DETAIL_TABS}
              activeTab={urlState.tab}
              onChange={(id) => urlState.setTab(id as DetailTab)}
              ariaLabel="FDA 483 event sections"
            />

            <div
              role="tabpanel"
              id={`panel-${urlState.tab}`}
              aria-labelledby={`tab-${urlState.tab}`}
              tabIndex={0}
            >
              {urlState.tab === "overview" && (
                <OverviewTab
                  liveEvent={liveEvent}
                  capas={capas}
                  timezone={timezone}
                  dateFormat={dateFormat}
                  ownerName={ownerName}
                  onNavigate={(t) => urlState.navigate({ tab: t.tab, obsIndex: t.obsIndex ?? null })}
                  onAddCommitment={() => setAddCommitOpen(true)}
                  onEditCommitment={(c) => setCommitDetail({ mode: "edit", commitment: c })}
                  onCompleteCommitment={(c) => setCommitDetail({ mode: "complete", commitment: c })}
                />
              )}

              {urlState.tab === "observations" && (
                <ObservationsListTab
                  liveEvent={liveEvent}
                  capas={capas}
                  sites={sites}
                  timezone={timezone}
                  dateFormat={dateFormat}
                  role={role}
                  ownerName={ownerName}
                  selectedObsId={selectedObsId}
                  onSelectObs={(id) => {
                    const idx = liveEvent.observations.findIndex((o) => o.id === id);
                    urlState.setObsIndex(idx >= 0 ? idx : null);
                  }}
                  onAddObservation={() => { setEditingObs(null); setAddObsOpen(true); }}
                  onImportFromPdf={() => setImportOpen(true)}
                  onEditObservation={(obs) => { setEditingObs(obs); setAddObsOpen(true); }}
                  onAddCommitment={() => setAddCommitOpen(true)}
                  onNavigateToInvestigation={(obsIndex) => urlState.navigate({ tab: "investigation", obsIndex })}
                />
              )}

              {urlState.tab === "investigation" && (
                <InvestigationTab
                  liveEvent={liveEvent}
                  selectedObsIndex={urlState.obsIndex}
                  onObsIndexChange={urlState.setObsIndex}
                  onNavigateToTab={urlState.setTab}
                  capas={capas}
                  role={role}
                  user={{ id: user?.id, name: user?.name }}
                  users={complianceUsers}
                  sites={sites}
                  whyAnswers={whyAnswers}
                  fishboneAnswers={fishboneAnswers}
                  fishboneRoot={fishboneRoot}
                  freeformRCA={freeformRCA}
                  onWhyAnswersChange={setWhyAnswers}
                  onFishboneAnswersChange={setFishboneAnswers}
                  onFishboneRootChange={setFishboneRoot}
                  onFreeformRCAChange={setFreeformRCA}
                  onSelectRCAMethod={async (method) => {
                    if (!selectedObs) return;
                    const result = await updateObservationServer(selectedObs.id, { rcaMethod: method });
                    if (!result.success) {
                      toast.error(`Could not complete action: ${result.error || "Failed to set RCA method. Please try again."}`);
                      return;
                    }
                    router.refresh();
                  }}
                  onSave5Why={async () => {
                    if (!selectedObs) return;
                    if (isEventLocked(liveEvent.status)) return;
                    const text = whyAnswers.filter((w) => w.trim()).map((w, i) => `Why ${i + 1}: ${w}`).join("\n");
                    const result = await updateObservationServer(selectedObs.id, {
                      rootCause: text,
                      rcaMethod: "5 Why",
                    });
                    if (!result.success) {
                      toast.error(`Could not complete action: ${result.error || "Failed to save 5-Why RCA. Please try again."}`);
                      return;
                    }
                    const adv = await markObservationResponseDraftedServer(selectedObs.id);
                    if (!adv.success) {
                      toast.error(`Could not complete action: ${adv.error || "Saved RCA, but could not advance the observation."}`);
                      return;
                    }
                    toast.success("RCA saved.");
                    router.refresh();
                  }}
                  onSaveFishbone={async () => {
                    if (!selectedObs) return;
                    if (isEventLocked(liveEvent.status)) return;
                    const text = Object.entries(fishboneAnswers).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nRoot cause: ${fishboneRoot}`;
                    const result = await updateObservationServer(selectedObs.id, {
                      rootCause: text,
                      rcaMethod: "Fishbone",
                    });
                    if (!result.success) {
                      toast.error(`Could not complete action: ${result.error || "Failed to save Fishbone RCA. Please try again."}`);
                      return;
                    }
                    const adv = await markObservationResponseDraftedServer(selectedObs.id);
                    if (!adv.success) {
                      toast.error(`Could not complete action: ${adv.error || "Saved RCA, but could not advance the observation."}`);
                      return;
                    }
                    toast.success("RCA saved.");
                    router.refresh();
                  }}
                  onSaveFreeform={async () => {
                    if (!selectedObs) return;
                    if (isEventLocked(liveEvent.status)) return;
                    const result = await updateObservationServer(selectedObs.id, {
                      rootCause: freeformRCA.trim(),
                    });
                    if (!result.success) {
                      toast.error(`Could not complete action: ${result.error || "Failed to save RCA. Please try again."}`);
                      return;
                    }
                    const adv = await markObservationResponseDraftedServer(selectedObs.id);
                    if (!adv.success) {
                      toast.error(`Could not complete action: ${adv.error || "Saved RCA, but could not advance the observation."}`);
                      return;
                    }
                    toast.success("RCA saved.");
                    router.refresh();
                  }}
                  onRaiseCAPA={async (obs, formData) => {
                    // Persist the modal's edits, falling back to the
                    // observation prefill only where a field was cleared.
                    // The server action builds CAPA.description from
                    // observationText and CAPA.risk from observationSeverity,
                    // so the edited title/description/risk are routed onto
                    // those inputs (signature unchanged).
                    const result = await raiseCAPAFromObservation({
                      eventId: liveEvent.id,
                      observationId: obs.id,
                      observationNumber: obs.number,
                      observationText: formData.title || obs.text,
                      observationSeverity:
                        (["Critical", "High", "Medium", "Low"] as const).find(
                          (r) => r === formData.risk,
                        ) ?? obs.severity,
                      referenceNumber: liveEvent.referenceNumber,
                      siteId: liveEvent.siteId,
                      // No owner sent — createCAPA assigns the CAPA owner to the
                      // authenticated QA creator (actor.userId) server-side.
                      dueDate: formData.dueDate || liveEvent.responseDeadline,
                      rootCause: formData.description || obs.rootCause,
                      rcaMethod: obs.rcaMethod,
                    });
                    if (!result.success) {
                      // The trigger is QA-only; this guards the stale-UI / race
                      // case with a friendly, consistent policy message.
                      if (result.error === "Only QA Head can create a CAPA.") {
                        console.warn("[fda483] raise CAPA denied:", result.error);
                        toast.error("Only your QA Head can create a CAPA from this observation.");
                      } else {
                        toast.error(`Could not complete action: ${result.error || "Failed to raise CAPA from this observation. Please try again."}`);
                      }
                      return;
                    }
                    toast.success("CAPA raised.");
                    router.refresh();
                  }}
                />
              )}

              {urlState.tab === "response" && (
                <div className="space-y-4">
                  {/* Feature 3 — Document Summarizing (the 483 response can run
                      many pages) now shares the export toolbar row (left) via
                      ResponseDetailTab's leadingActions slot. */}
                  <ResponseDetailTab
                    leadingActions={
                      <DocumentSummaryPanel
                        title={`FDA-483 ${liveEvent.referenceNumber ?? liveEvent.id.slice(0, 8)} response`}
                        recordId={liveEvent.id}
                        module="fda483"
                        content={[
                          liveEvent.responseDraft ? `Response draft:\n${liveEvent.responseDraft}` : "",
                          ...liveEvent.observations.map((o, i) => `Observation ${i + 1}: ${o.text}${o.rootCause ? `\nRoot cause: ${o.rootCause}` : ""}`),
                        ].filter(Boolean).join("\n\n")}
                      />
                    }
                    liveEvent={liveEvent}
                    capas={capas} role={role}
                  canSign={(isCustomerAdmin ? false : canSign) && fda.canSign}
                  canSubmit={canSubmitResponse}
                  agiMode={agiMode}
                  agiAgent={agiAgent}
                  timezone={timezone}
                  dateFormat={dateFormat}
                  responseText={responseText}
                  editingResponse={editingResponse}
                  onNavigate={(t) => urlState.navigate({ tab: t.tab, obsIndex: t.obsIndex ?? null })}
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
                      toast.error(`Could not complete action: ${result.error || "Failed to save response draft. Please try again."}`);
                      return;
                    }
                    setEditingResponse(false);
                    toast.success("Response draft saved.");
                    router.refresh();
                  }}
                  onUseAGIDraft={async () => {
                    if (!liveEvent) return;
                    const result = await saveResponseDraftServer(liveEvent.id, liveEvent.agiDraft);
                    if (!result.success) {
                      toast.error(`Could not complete action: ${result.error || "Failed to use AGI draft. Please try again."}`);
                      return;
                    }
                    setResponseText(liveEvent.agiDraft);
                    setEditingResponse(true);
                    router.refresh();
                  }}
                  onGenerateAGIDraft={async () => {
                    if (!liveEvent) return null;
                    // WIRE C — build the draft from real event data via the AI
                    // gateway (mocked). The 1.5s latency lives inside
                    // getResponseDraft; persistence + the Use/Edit/confirm flow
                    // are unchanged (saveAGIDraftServer still commits).
                    const siteName =
                      sites.find((s) => s.id === liveEvent.siteId)?.name ??
                      liveEvent.siteId;
                    const { draft, source } = await getResponseDraft({
                      reference: liveEvent.referenceNumber,
                      agency: liveEvent.agency,
                      site: siteName,
                      // The letter is signed by THIS tenant — same source the
                      // Topbar renders. Blank falls back to a visible
                      // "[Company Name]" placeholder, never a guessed company.
                      companyName: org.companyName || tenantName || undefined,
                      inspectionDate: dayjs
                        .utc(liveEvent.inspectionDate)
                        .format(dateFormat),
                      observations: liveEvent.observations.map((o) => {
                        const linked = o.capaId
                          ? capas.find((c) => c.id === o.capaId)
                          : undefined;
                        return {
                          number: o.number,
                          text: o.text,
                          severity: o.severity,
                          rootCause: o.rootCause ?? null,
                          capaRef:
                            linked?.reference ??
                            (o.capaId ? o.capaId.slice(0, 8) : null),
                        };
                      }),
                    });
                    // Provenance. The draft text itself is left untouched — a
                    // letter to a regulator must not carry a banner — so the
                    // author is told out-of-band that this came from the
                    // backend's deterministic template rather than the model,
                    // and therefore needs a closer read before signing.
                    if (source !== "backend") {
                      toast.error(
                        "AI was unavailable, so this is a template draft, not a model-written one. Review every section before signing.",
                      );
                    }
                    const result = await saveAGIDraftServer(liveEvent.id, draft);
                    if (!result.success) {
                      toast.error(`Could not complete action: ${result.error || "Failed to generate AGI draft. Please try again."}`);
                      return null;
                    }
                    router.refresh();
                    // Return the freshly generated draft so the modal can clear
                    // its spinner deterministically — the mock yields byte-
                    // identical output on regeneration, so the tab can NOT rely
                    // on liveEvent.agiDraft changing value to detect completion.
                    return draft;
                  }}
                  onSignSubmit={() => setSignOpen(true)}
                  />
                </div>
              )}

              {urlState.tab === "audit" && (
                <AuditTab
                  liveEvent={{ id: liveEvent.id, referenceNumber: liveEvent.referenceNumber }}
                  auditRows={activeEventAuditRows}
                  timezone={timezone}
                  dateFormat={dateFormat}
                />
              )}
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
        defaultOwnerId={
          complianceUsers.some((u) => u.id === user?.id) ? user?.id : undefined
        }
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
        observations={commitObsOptions}
        capas={commitCapaOptions}
      />
      <CommitmentDetailModal
        open={!!commitDetail}
        mode={commitDetail?.mode ?? "edit"}
        commitment={commitDetail?.commitment ?? null}
        users={complianceUsers}
        onClose={() => setCommitDetail(null)}
        onChanged={(msg) => { toast.success(msg); router.refresh(); }}
        onError={(msg) => toast.error(msg)}
      />
      <SignSubmitModal
        open={signOpen}
        liveEvent={liveEvent}
        signMeaning={signMeaning}
        signPassword={signPassword}
        error={signError}
        busy={signBusy}
        onClose={() => {
          // Always wipe credential state on close (Cancel, success, or
          // backdrop) so reopening the modal never inherits a stale
          // password. Mirror of the SignCloseModal cleanup.
          setSignOpen(false);
          setSignMeaning("");
          setSignPassword("");
          setSignError(null);
          setSignBusy(false);
        }}
        onSignMeaningChange={setSignMeaning}
        onSignPasswordChange={setSignPassword}
        onSubmit={async () => {
          if (!liveEvent) return;
          setSignBusy(true);
          setSignError(null);
          // §11 — server-first. Modal stays open until the server confirms
          // the signature. On reject (wrong password, role gate, etc.) the
          // signError prop renders inline; user corrects without losing
          // the meaning dropdown selection.
          const result = await signSubmitFDA483Response(
            liveEvent.id,
            liveEvent.responseDraft ?? "",
            {
              password: signPassword,
              signatureMeaning: signMeaning,
            },
          );
          setSignBusy(false);
          if (!result.success) {
            setSignError(result.error || "Submission failed. Please verify your password and try again.");
            return; // modal stays open
          }
          // Server confirmed the Part 11 signature. Wipe credentials and
          // surface the success toast.
          setSignOpen(false);
          setSignMeaning("");
          setSignPassword("");
          setSignError(null);
          toast.success("Response submitted.");
          router.refresh();
          // Stay on the current event so the user sees the submitted success view
        }}
      />

      {liveEvent && (
        <ImportObservationsModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          inspectionReference={liveEvent.referenceNumber}
          facility={sites.find((s) => s.id === liveEvent.siteId)?.name ?? liveEvent.siteId}
          onImport={async (payload: ImportObservationsPayload) => {
            const result = await bulkAddObservationsFromExtraction({
              eventId: liveEvent.id,
              observations: payload.observations,
              sourceFile: payload.sourceFile,
            });
            if (!result.success) {
              toast.error(`Could not complete action: ${result.error || "Failed to import observations. Please try again."}`);
              throw new Error(result.error || "import failed");
            }
            setImportOpen(false);
            toast.success(`${result.data.created} observation${result.data.created === 1 ? "" : "s"} imported.`);
            router.refresh();
          }}
        />
      )}

      {liveEvent && (
        <OutcomeModal
          open={outcomeOpen}
          onClose={() => setOutcomeOpen(false)}
          referenceNumber={liveEvent.referenceNumber}
          onSubmit={async (payload: OutcomePayload) => {
            const result = await recordFDA483Outcome({
              eventId: liveEvent.id,
              outcomeType: payload.outcomeType,
              note: payload.note,
              password: payload.password,
              signatureMeaning: payload.signatureMeaning,
              document: payload.document,
            });
            if (!result.success) {
              // Keep the modal open so the user can correct (e.g. wrong password).
              throw new Error(result.error || "Failed to record outcome");
            }
            setOutcomeOpen(false);
            toast.success(`FDA outcome "${payload.outcomeType}" recorded.`);
            router.refresh();
          }}
        />
      )}

      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="FDA 483 events" />
    </main>
  );
}
