import { useState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import {
  ClipboardList, Plus, Search, ChevronRight, Link2, Bot, Pencil, Save, Paperclip, Wrench, CheckCircle2, Clock, X, AlertTriangle, CalendarClock,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { frameworkLabel } from "@/constants/frameworks";
import { useAppSelector } from "@/hooks/useAppSelector";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreateCAPA, canEditFindingRecord, canWriteFindingRCA } from "@/lib/permissions/roleSets";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import type { FindingAssignee } from "@/lib/queries";
import { formatReference } from "@/lib/reference";
import { ExportMenu } from "@/components/ui/ExportMenu";
import type { Finding, FindingSeverity, FindingStatus } from "@/store/findings.slice";
import {
  updateFinding as updateFindingAction,
  saveFindingRCA as saveFindingRCAAction,
  assignFinding as assignFindingAction,
  reviewFinding as reviewFindingAction,
  reworkFinding as reworkFindingAction,
  loadFindingReview as loadFindingReviewAction,
  loadFindingDocuments as loadFindingDocumentsAction,
  loadFindingHistory as loadFindingHistoryAction,
} from "@/actions/findings";
import type { FindingAuditEntry, FindingCloseSodReveal } from "@/lib/queries/findings";
import { DocumentCard } from "@/components/shared/DocumentCard";
import { RaisedFromRiskBanner } from "@/components/shared/RaisedFromRiskBanner";
import { worklistDocToCardView } from "@/components/shared/documentCardAdapters";
import type { WorklistDoc } from "@/lib/queries/worklist";
import type { CAPA } from "@/store/capa.slice";
import { STATUS_LABEL as CAPA_STATUS_LABEL } from "@/types/capa";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/shared/StatCard";
import { MotionList, MotionListItem } from "@/components/motion/Motion";
import { DataTable, type Column } from "@/components/shared";
import { tableCard } from "@/components/table/tableTokens";
import { Modal } from "@/components/ui/Modal";
import { FindingCloseModal } from "@/modules/gap-assessment/modals/FindingCloseModal";

import { Popup } from "@/components/ui/Popup";
import { Dropdown } from "@/components/ui/Dropdown";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { displayName, displayUserName, displaySiteName } from "@/lib/identity-display";
import { roleLabel } from "@/lib/labels/roles";
import { DatePicker } from "@/components/ui/DatePicker";
import { RcaMethodFields, parseRcaDetail, rcaDetailToText, type RcaDetail } from "@/modules/capa/modals/components/RcaMethodFields";
import { CAPA_RCA_METHODS, rcaMethodOptions, type CapaRCAMethod } from "@/constants/rcaMethods";
// Item 16 — the ONE floor the server enforces too (updateFinding). Imported, not
// re-declared: a second copy is how client/server validation drifts.
import { FINDING_EDIT_REASON_MIN, FINDING_CLOSURE_NOTES_MIN } from "@/constants/capaValidation";
// Item 17 — the ONE close gate the three server paths enforce. Same reason.
import { findingCloseBlockers } from "@/lib/finding-close";
import { DocumentSummaryPanel } from "@/components/search/DocumentSummaryPanel";

/* ── Helpers ── */

function severityBadge(s: FindingSeverity) {
  return <Badge variant={getSeverityVariant(s, "generic")}>{normalizeSeverityForDisplay(s, "generic") ?? s}</Badge>;
}
// Defensive: normalize casing/underscores so the badge never prints a raw
// value (e.g. legacy "in_progress") — mirrors capaStatusBadge's LABEL ?? s.
const FINDING_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  "in progress": "In Progress",
  submitted: "Submitted",
  rework: "Rework",
  closed: "Closed",
};
const FINDING_STATUS_CLASS: Record<string, string> = {
  open: "badge badge-blue",
  "in progress": "badge badge-amber",
  // Match the FINDING_STATUSES taxonomy (Submitted = purple, Rework = red) so
  // the submit→QA-review loop no longer falls through to a gray fallback badge.
  submitted: "badge badge-purple",
  rework: "badge badge-red",
  closed: "badge badge-green",
};
function statusBadge(s: FindingStatus) {
  const key = String(s).toLowerCase().replace(/_/g, " ");
  const label = FINDING_STATUS_LABEL[key] ?? s;
  const cls = FINDING_STATUS_CLASS[key] ?? "badge badge-gray";
  return <span className={cls}>{label}</span>;
}
/* Phase 7 — gap-detail History. Labels for the AuditLog actions the finding
   lifecycle writes (getFindingAuditTrail). Only SOME rows carry a reason in
   newValue (see FindingAuditEntry): FINDING_REWORK → reason, ESCALATED →
   capaReference, CLOSED_BY_CAPA → capaReference + closingNotes. SUBMITTED /
   REVIEW_CLOSED carry none, so those render event-only — that is correct, not a
   missing reason to backfill from the (latest-value-only) source columns. */
const FINDING_HISTORY_LABEL: Record<string, string> = {
  FINDING_CREATED: "Created",
  FINDING_ASSIGNED: "Assigned",
  FINDING_UPDATED: "Edited",
  FINDING_NOTES_SAVED: "Work notes saved",
  // Two codes, not one — "the assessment was performed" and "the assessment was
  // revised" are different events, and the trail should read as two different
  // sentences without anyone parsing a payload to tell them apart.
  FINDING_RCA_RECORDED: "Root cause analysis recorded",
  FINDING_RCA_UPDATED: "Root cause analysis revised",
  FINDING_EVIDENCE_UPLOADED: "Evidence uploaded",
  FINDING_EVIDENCE_REMOVED: "Evidence removed",
  FINDING_SUBMITTED: "Submitted for review",
  FINDING_REVIEW_CLOSED: "Review closed",
  FINDING_REWORK: "Sent back for rework",
  FINDING_ESCALATED_TO_CAPA: "Escalated to CAPA",
  FINDING_CLOSED_BY_CAPA: "Closed by CAPA",
  FINDING_CLOSED: "Closed",
  FINDING_DELETED: "Deleted",
  FINDING_RESTORED: "Restored",
  FINDING_LINKED_TO_PRIOR_CAPA_AS_RECURRENCE: "Linked to prior CAPA (recurrence)",
};
const FINDING_HISTORY_DOT: Record<string, string> = {
  FINDING_REWORK: "#ef4444",
  FINDING_ESCALATED_TO_CAPA: "#f59e0b",
  FINDING_CLOSED_BY_CAPA: "#10b981",
  FINDING_CLOSED: "#10b981",
  FINDING_SUBMITTED: "#8b5cf6",
  FINDING_CREATED: "var(--brand)",
};
/** Pull the inline detail (a CAPA ref appended to the label, and/or a quoted
 *  reason line) from a finding audit row's newValue. Returns nothing when the
 *  row carries no reason — the caller must NOT invent one. */
function findingHistoryDetail(action: string, newValue: string | null): { suffix?: string; reason?: string } {
  if (!newValue) return {};
  try {
    const v = JSON.parse(newValue) as Record<string, unknown>;
    const capaRef = typeof v.capaReference === "string" ? v.capaReference : undefined;
    if (action === "FINDING_REWORK") return { reason: typeof v.reason === "string" ? v.reason : undefined };
    if (action === "FINDING_ESCALATED_TO_CAPA") return { suffix: capaRef };
    if (action === "FINDING_CLOSED_BY_CAPA") return { suffix: capaRef, reason: typeof v.closingNotes === "string" ? v.closingNotes : undefined };
    // Edits + RCA revisions carry a mandatory reason; RCA_RECORDED deliberately
    // carries none (first entry is authorship), so it falls through to no reason —
    // which is correct, not a row to backfill.
    if (action === "FINDING_UPDATED" || action === "FINDING_RCA_UPDATED") {
      return { reason: typeof v.reason === "string" ? v.reason : undefined };
    }
    // The method is the useful suffix on an RCA row: "Root cause analysis recorded — 5 Why".
    if (action === "FINDING_RCA_RECORDED") {
      return { suffix: typeof v.rcaMethod === "string" ? v.rcaMethod : undefined };
    }
    return {};
  } catch { return {}; }
}

function capaStatusBadge(s: string) {
  const m: Record<string, string> = { open: "badge badge-blue", in_progress: "badge badge-amber", pending_qa_review: "badge badge-purple", closed: "badge badge-green", rejected: "badge badge-red" };
  const label = CAPA_STATUS_LABEL[s as keyof typeof CAPA_STATUS_LABEL] ?? s;
  return <span className={m[s] ?? "badge badge-gray"}>{label}</span>;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1 block";
const LOCKED_HINT = <span className="text-[10px] text-[#64748b] italic ml-1.5">(cannot change)</span>;

/** A labelled group of evidence documents on the SHARED <DocumentCard> (View +
 *  Download). Used for the origin-split (Gap Evidence vs Worklist Documents);
 *  renders nothing when the group is empty (no empty placeholder). */
function DocGroup({ label, docs }: { label: string; docs: WorklistDoc[] }) {
  if (docs.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {docs.map((d) => <DocumentCard key={d.id} doc={worklistDocToCardView(d)} />)}
      </div>
    </div>
  );
}

/* ── Item 16 — the LIFECYCLE trail (AuditLog): the COMPLETE record, sourced from
   loadFindingHistory. Every FINDING_* event lands here — create, assign, submit,
   rework, review-close, escalate, close — because every action writes an audit row.
   This is what an inspector follows.

   Deliberately NOT the same thing as the field-edit diffs it sits beside in the
   modal (FindingEdit, written by updateFinding + assignFinding ONLY). Two trails,
   two sections, each under its own name. Newest last so the story reads
   top-to-bottom. Extracted from the former inline History section verbatim. ── */
function LifecycleTrail({
  history, capaLinkIdFor, onNavigateCapa, timezone,
}: {
  history: FindingAuditEntry[];
  capaLinkIdFor: (e: FindingAuditEntry) => string | null;
  onNavigateCapa: (capaId: string) => void;
  timezone: string;
}) {
  if (history.length === 0) {
    return <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No lifecycle events recorded.</p>;
  }
  return (
    <div className="space-y-2.5 text-[11px]">
      {history.slice().reverse().map((e) => {
        const label = FINDING_HISTORY_LABEL[e.action] ?? e.action;
        const dot = FINDING_HISTORY_DOT[e.action] ?? "var(--text-muted)";
        const { suffix, reason } = findingHistoryDetail(e.action, e.newValue);
        const capaLinkId = capaLinkIdFor(e);
        return (
          <div key={e.id} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: dot }} />
            <div className="min-w-0">
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                {label}
                {suffix ? (
                  capaLinkId ? (
                    <> &mdash; <button type="button" onClick={() => onNavigateCapa(capaLinkId)}
                      className="bg-transparent border-none p-0 cursor-pointer hover:underline font-medium"
                      style={{ color: "var(--brand)" }}>{suffix}</button></>
                  ) : <> &mdash; {suffix}</>
                ) : null}
              </p>
              <p style={{ color: "var(--text-muted)" }}>
                {displayName({ name: e.userName })}{e.userRole ? ` (${roleLabel(e.userRole)})` : ""} &mdash; {dayjs.utc(e.createdAt).tz(timezone).format("DD/MM/YYYY hh:mm A")}
              </p>
              {reason && <p className="italic mt-0.5" style={{ color: "var(--text-secondary)" }}>&ldquo;{reason}&rdquo;</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Form type ── */
// No `owner`: this form never had an input for it — it prefilled the current
// owner and echoed it straight back, so the field only ever produced a no-op
// write that updateFinding is no longer willing to accept (Item 18). Assignment
// happens in the Disposition block, through assignFinding.
// No `rootCause`/`rcaMethod` either: RCA moved OUT of this form into its own
// gap-detail section (it is an assessment, not a field edit). The Edit modal was
// its only entry point, which is why removing rather than relocating it would have
// left #17 gating closure on a field nothing could populate.
interface EditForm {
  requirement: string;
  purpose: string;
  targetDate: string;
  evidenceLink: string;
}

/** Seed structured RCA detail from the row; fall back to the flat rootCause
 *  text for findings that predate rcaDetail (so old gaps still show it). */
function seedRcaDetail(f: { rcaDetail?: string; rootCause?: string }): RcaDetail {
  const d = parseRcaDetail(f.rcaDetail);
  if (Object.keys(d).length === 0 && f.rootCause) return { text: f.rootCause, faultTree: f.rootCause };
  return d;
}

/* ── Props ── */
interface GapRegisterTabProps {
  filteredFindings: Finding[];
  findingsTotal: number;
  /** SERVER-SCOPED assignee pool (tenant + assigner's site) — replaces the
   *  client Redux user list so selection can't widen scope. */
  assignees: FindingAssignee[];
  selectedFinding: Finding | null;
  onSelectFinding: (f: Finding | null) => void;
  isViewOnly: boolean;
  users: UserConfig[];
  timezone: string;
  dateFormat: string;
  capas: CAPA[];
  agiMode: string;
  agiCapa: boolean;
  isAnyFilterActive: boolean;
  renderFilters: (compact?: boolean) => ReactNode;
  /** Clears the page-level filters (owned by GapPage). */
  onClearFilters: () => void;
  onAddOpen: () => void;
  onRaiseCapa: (finding: Finding) => void;
  onNavigateCapa: (capaId: string) => void;
  /** Opens the shared evidence modal (link + file upload + current doc). */
  onManageEvidence: (findingId: string, currentLink: string) => void;
  /** Phase-3 entrance — play the KPI → toolbar → table reveal only on the FIRST
   *  mount. GapPage passes false on tab-return remounts so it doesn't replay.
   *  Defaults to true (animate) so standalone use still reveals. */
  playEntrance?: boolean;
}

export function GapRegisterTab({
  filteredFindings, findingsTotal, assignees, selectedFinding, onSelectFinding,
  isViewOnly, users, timezone, dateFormat, capas,
  agiMode, agiCapa, isAnyFilterActive, renderFilters, onClearFilters,
  onAddOpen, onRaiseCapa, onNavigateCapa, onManageEvidence,
  playEntrance = true,
}: GapRegisterTabProps) {
  const isDark = useAppSelector((s) => s.theme.mode === "dark");
  const router = useRouter();
  const user = useAppSelector((s) => s.auth.user);
  // Capability mirrors of the server (exclude super_admin from authoring).
  const gapCan = usePermissions("gap");
  // "Raise CAPA" is stricter than general CAPA authoring: only QA may CREATE a
  // CAPA (mirrors the createCAPA server gate). Gate on canCreateCAPA, NOT the
  // broad usePermissions("capa").canCreate, so the button matches the server.
  const { role } = usePermissions();
  const canRaiseCapa = canCreateCAPA(role);
  // Gap Step 1 — QA assigns the finding to the person who will work it.
  const { isQAHead } = usePermissions();
  const [assignTo, setAssignTo] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  async function handleAssignFinding() {
    if (!selectedFinding || !assignTo) return;
    setAssignBusy(true); setAssignError(null);
    const res = await assignFindingAction(selectedFinding.id, { assigneeId: assignTo });
    setAssignBusy(false);
    if (!res.success) { setAssignError(res.error || "Failed to assign finding."); return; }
    setAssignTo("");
    router.refresh();
  }

  // Gap Step 4 — QA review (accept / rework). Loaded separately (the store
  // Finding doesn't carry completion notes). `messages` was dropped with the
  // conversation thread — nothing rendered or gated on it any more.
  type FindingReview = { status: string; completionNotes: string | null; reworkReason: string | null; sodReveal?: FindingCloseSodReveal };
  const [review, setReview] = useState<FindingReview | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reworkReasonInput, setReworkReasonInput] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Round 4 — the finding's uploaded evidence docs (read-only in the modal).
  const [findingDocs, setFindingDocs] = useState<WorklistDoc[]>([]);
  // #13 — Clock icon in the modal header opens a scrollable Audit Trail modal.
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  // Phase 7 — the gap-detail History (finding → CAPA → closure), sourced from
  // the AuditLog (loadFindingHistory), NOT FindingEdit. Loaded on modal open.
  const [history, setHistory] = useState<FindingAuditEntry[]>([]);

  useEffect(() => {
    const id = selectedFinding?.id;
    if (!id) { setReview(null); return; }
    let cancelled = false;
    void (async () => {
      const res = await loadFindingReviewAction(id);
      if (!cancelled) setReview(res.success ? (res.data as FindingReview) : null);
    })();
    return () => { cancelled = true; };
  }, [selectedFinding?.id]);

  // Round 4 (#11) — load the finding's uploaded evidence docs so existing docs
  // are visible in the detail/edit modal (previously only surfaced in the worklist).
  useEffect(() => {
    const id = selectedFinding?.id;
    if (!id) { setFindingDocs([]); return; }
    let cancelled = false;
    void (async () => {
      const res = await loadFindingDocumentsAction(id);
      if (!cancelled) setFindingDocs(res.success ? (res.data as WorklistDoc[]) : []);
    })();
    return () => { cancelled = true; };
  }, [selectedFinding?.id]);

  // Phase 7 — load the finding's AuditLog history when the detail modal opens.
  useEffect(() => {
    const id = selectedFinding?.id;
    if (!id) { setHistory([]); return; }
    let cancelled = false;
    void (async () => {
      const res = await loadFindingHistoryAction(id);
      if (!cancelled) setHistory(res.success ? (res.data as FindingAuditEntry[]) : []);
    })();
    return () => { cancelled = true; };
  }, [selectedFinding?.id]);

  // Item 4 — origin split (shared DocumentCard). Bucket by the STABLE
  // uploadSource stamped at upload, never re-derived from the mutable owner, so
  // a doc's bucket can't flip on reassignment. "work" = the assigned worker's
  // categorized uploads; everything else ("create" + any legacy null
  // pre-backfill) is a gap-creation/supporting document.
  const workDocs = findingDocs.filter((d) => d.uploadSource === "work");
  const createDocs = findingDocs.filter((d) => d.uploadSource !== "work");

  // Has this finding EVER been sent back? Read from the finding's own AuditLog
  // (FINDING_REWORK, written by reworkFinding in the same tx as the status
  // change) — the same rows the History section below renders via
  // findingHistoryDetail (:121), so the signal is already loaded and is the
  // durable record of the event.
  //
  // This used to gate on `review.messages.length > 0`. That worked only because
  // reworkFinding ALSO auto-posted the reason as a FindingMessage — an
  // incidental side effect, not a contract. With the thread retired, that write
  // is display-dead, and deleting it would have silently vanished this card on
  // every reworked finding. The audit row is the actual signal.
  const wasEverReworked = history.some((e) => e.action === "FINDING_REWORK");
  // ONE value, non-null exactly when the QA-review card should render. The card
  // and the standalone documents block below are strictly complementary, and
  // duplicating the condition in both invited exactly the drift this session
  // keeps finding: either the card renders the docs or the block does, never
  // both, never neither. Narrows `review` for the card's JSX as a bonus.
  const qaReview = review && (review.status === "Submitted" || review.status === "Rework" || wasEverReworked) ? review : null;

  async function refreshReview() {
    if (!selectedFinding) return;
    const res = await loadFindingReviewAction(selectedFinding.id);
    if (res.success) setReview(res.data as FindingReview);
  }
  /** Accept & close now routes through the close modal so QA supplies a closing
   *  message + password re-auth, mirroring the deviation close. The modal is the
   *  ONLY caller of reviewFinding — one close path, one confirmation. */
  async function handleConfirmClose(input: {
    password: string;
    closureNotes: string;
    sodOverrideReasonCode?: string;
    sodOverrideJustification?: string;
  }) {
    if (!selectedFinding) return;
    setReviewBusy(true); setReviewError(null);
    const res = await reviewFindingAction(selectedFinding.id, input);
    setReviewBusy(false);
    if (!res.success) { setReviewError(res.error || "Failed to close the gap."); return; }
    setCloseModalOpen(false);
    // Refresh the SEPARATE review state too (not just the store via router.refresh)
    // so the block reflects the new status (Closed) immediately — the Accept/rework
    // buttons are gated on review.status === "Submitted", so they clear at once.
    router.refresh();
    await refreshReview();
  }
  async function handleReworkSubmit() {
    if (!selectedFinding || reworkReasonInput.trim().length < 5) { setReviewError("Add a rework reason (at least 5 characters)."); return; }
    setReviewBusy(true); setReviewError(null);
    const res = await reworkFindingAction(selectedFinding.id, { reason: reworkReasonInput.trim() });
    setReviewBusy(false);
    if (!res.success) { setReviewError(res.error || "Failed to send for rework."); return; }
    setReworkOpen(false); setReworkReasonInput("");
    // Refresh the review state (status → Rework) so the Accept/rework buttons clear
    // and the auto-posted rework message appears in the thread without a reopen.
    router.refresh();
    await refreshReview();
  }
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { sites: accessibleSites } = useTenantConfig();
  const showSiteColumn = !selectedSiteId && accessibleSites.length > 1;
  const siteName = (id: string) => displaySiteName(id, accessibleSites);
  const [searchQuery, setSearchQuery] = useState("");

  // Row selection for export (empty = export all currently displayed rows)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [savedPopup, setSavedPopup] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Mirrors the server gate exactly: updateFinding is QA-authority-only
  // (QA_AUTHORITY_ROLES → qa_head; super_admin blocked by requireGxPAuthor), NOT
  // the broad COMPLIANCE_AUTHOR_ROLES. Gating on canEditFinding keeps the Edit
  // button in lockstep with the server so csv_val_lead / regulatory_affairs /
  // customer_admin never see an Edit that dead-ends with "Only QA Head can edit".
  // Gap→CAPA handoff lock (Stage 2) — mirrors the findings.ts server guard.
  // Once a CAPA has been raised from this gap and that CAPA is still live
  // (any status but "closed"), the gap is READ-ONLY; the work continues in the
  // linked CAPA. Resolved from the CAPA store exactly like the Linked-CAPA
  // panel below (finding.capaId, or the reverse findingId link). An orphan
  // link (CAPA hard-deleted → absent from the store) does NOT lock, matching
  // the server helper's orphan-link behaviour.
  const lockCapa = selectedFinding
    ? (selectedFinding.capaId
        ? capas.find((c) => c.id === selectedFinding.capaId)
        : capas.find((c) => c.findingId === selectedFinding.id))
    : undefined;
  const gapLocked = !!lockCapa && lockCapa.status !== "closed";

  // Item 16 — the RAISER may edit too (a limited set; the server enforces which
  // fields). canEditFindingRecord is the SAME function updateFinding calls, so the
  // button and the server can't drift — role alone cannot answer this, because
  // raiser-ness is a property of the record.
  //
  // Without this the raiser branch shipped in Item 16.1 was inert: the server
  // allowed them and the client never showed them the button.
  //
  // NOTE: there is deliberately no local `isRaiser` any more. It existed to feed an
  // inline RCA check that duplicated the rule; both gates now call their shared
  // function (canEditFindingRecord / canWriteFindingRCA). A local copy of "who is
  // the raiser" is a second place for the rule to live, and the two only ever agree
  // until one of them changes.
  const canEdit =
    !isViewOnly &&
    selectedFinding?.status !== "Closed" &&
    !gapLocked &&
    !!selectedFinding &&
    canEditFindingRecord(role, user?.id ?? null, selectedFinding);

  // Item 17 — what stops THIS user closing THIS finding, from the SAME function the
  // three server close paths enforce. Predicting the refusal here rather than
  // restating it means the button and the server can never tell different stories.
  const closeBlockers = selectedFinding ? findingCloseBlockers(selectedFinding, user?.id ?? null) : [];

  /**
   * Is a single-QA SoD waiver available for THIS finding and THIS user?
   *
   * SERVER-COMPUTED — `review.sodReveal` comes from the query layer
   * (queries/findings.ts:190), which resolves the tenant flag, the Critical
   * ceiling and the two self-checks. The client never re-implements the severity
   * rule. Hoisted here (it was inline on FindingCloseModal's `overrideNeeded`)
   * so the close BUTTON's enabled-state and the modal's override INPUTS are
   * driven by one expression instead of two copies that could drift.
   */
  const sodOverrideAvailable = Boolean(
    review?.sodReveal &&
    review.sodReveal.flagOn &&
    !review.sodReveal.ceiling &&
    (review.sodReveal.assignee || review.sodReveal.rcaAuthor),
  );

  /**
   * THE single source of truth for "can this user close this finding, and if not
   * why". Both close affordances read it — the Disposition button and the QA
   * review card — so the two can never disagree with each other or with the
   * server.
   *
   * It composes the EXACT conditions that already gated the review card
   * (isQAHead + qaReview.status === "Submitted" + !gapLocked as render
   * conditions, closeBlockers as the disabled predicate) — nothing is
   * re-derived and no rule is added or relaxed. The only change is that a
   * blocked close now renders as a DISABLED button carrying the reason, instead
   * of no button at all.
   *
   * Reason precedence mirrors the server's own gate order in reviewFinding
   * (CAPA lock → status → SoD/RCA blockers), so the first thing the user is told
   * is the first thing the server would refuse on.
   */
  const closeGate: { visible: boolean; canClose: boolean; reason: string | null } = (() => {
    // Only a QA Head can ever close, so nobody else is shown a control they
    // could never use. Same check the review card renders on.
    if (!selectedFinding || isViewOnly || !isQAHead) {
      return { visible: false, canClose: false, reason: null };
    }
    if (selectedFinding.status === "Closed") {
      return { visible: false, canClose: false, reason: null };
    }
    if (gapLocked) {
      return { visible: true, canClose: false, reason: "A CAPA raised from this gap is still open — work continues in the CAPA." };
    }
    if (qaReview?.status !== "Submitted") {
      return { visible: true, canClose: false, reason: "Finding must be submitted for review before it can be closed." };
    }
    if (closeBlockers.length > 0) {
      /*
       * WAIVABLE vs HARD blockers.
       *
       * `rca_self_close` is a separation-of-duties IDENTITY rule, and the
       * single-QA override exists precisely to waive it: with the tenant flag on
       * and the finding below the Critical ceiling, `reviewFinding` ACCEPTS the
       * close and records a `FindingSODOverride` waiver. Disabling the button on
       * it therefore refused a close the server would have allowed, and left the
       * override flow unreachable — the user could never supply the waiver the
       * modal asks for.
       *
       * `rca_missing` is a COMPLETENESS rule, not an identity one. Nothing can
       * waive a root cause that does not exist, so it stays a hard block. It is
       * also structurally exclusive: findingCloseBlockers returns early on
       * rca_missing (finding-close.ts:108-116), so the two never co-occur — the
       * filter below is defensive, not load-bearing.
       */
      const WAIVABLE_BLOCKER_KEYS = new Set(["rca_self_close"]);
      const hardBlockers = closeBlockers.filter((b) => !WAIVABLE_BLOCKER_KEYS.has(b.key));
      if (hardBlockers.length > 0) {
        return { visible: true, canClose: false, reason: hardBlockers[0].message };
      }
      // Only waivable blockers remain. Enable ONLY when the server would accept a
      // waiver — the same server-computed reveal the modal gates its override
      // inputs on (`sodOverrideAvailable`), so the button and the modal can never
      // disagree about whether an override is on the table.
      if (sodOverrideAvailable) {
        return {
          visible: true,
          canClose: true,
          reason: "You recorded this RCA — closing requires a recorded single-QA SoD waiver.",
        };
      }
      // Flag off, or Critical (ceiling) — no waiver is possible, so the original
      // refusal stands, verbatim.
      return { visible: true, canClose: false, reason: closeBlockers[0].message };
    }
    return { visible: true, canClose: true, reason: null };
  })();
  // Anchors the pointer at the RCA section that already exists, instead of opening a
  // close-flow modal that would become rootCause's third writer.
  const rcaSectionRef = useRef<HTMLDivElement | null>(null);
  const scrollToRca = () => {
    rcaSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const form = useForm<EditForm>({
    defaultValues: {
      requirement: "",
      purpose: "",
      targetDate: "",
      evidenceLink: "",
    },
  });
  // ── RCA RELOCATION — RCA is its own assessment activity now, not a field of the
  //    Edit form. It owns its state, its own Save, and its own error, because it is
  //    reached from the detail (view mode) rather than from the editor. The Edit
  //    modal was only ever its accidental home: AddFindingModal:442-445 already says
  //    RCA "is an assessment-time activity, done later in the finding detail", and
  //    that home never got built — so Edit became the ONLY entry point. Leaving it
  //    there would have deadlocked #17 (RCA gates closure; nothing could write RCA).
  const [detail, setDetail] = useState<RcaDetail>({});
  const [rcaMethodInput, setRcaMethodInput] = useState("");
  const [rcaReason, setRcaReason] = useState("");
  const [rcaBusy, setRcaBusy] = useState(false);
  const [rcaError, setRcaError] = useState("");
  // RCA editing moved from inline to a modal: the panel now shows a read-only
  // summary and an "Edit RCA" button. Local state only (no storage) — same
  // lifetime as the other modal flags in this component.
  const [rcaModalOpen, setRcaModalOpen] = useState(false);
  // QA close confirmation (closing message + password re-auth). Audited, NOT signed.
  const [closeModalOpen, setCloseModalOpen] = useState(false);

  // Reset form when selected finding changes
  useEffect(() => {
    if (selectedFinding) {
      form.reset({
        requirement: selectedFinding.requirement,
        purpose: selectedFinding.purpose ?? "",
        targetDate: selectedFinding.targetDate ? dayjs.utc(selectedFinding.targetDate).format("YYYY-MM-DD") : "",
        evidenceLink: selectedFinding.evidenceLink ?? "",
      });
      setDetail(seedRcaDetail(selectedFinding));
      setRcaMethodInput(selectedFinding.rcaMethod ?? "");
    }
    // Reset edit form when the selected finding changes.

    setIsEditing(false);
    setEditReason("");
    setSaveError("");
    setRcaReason("");
    setRcaError("");
    setRcaModalOpen(false);
    setCloseModalOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFinding?.id]);

  function ownerName(uid: string) { return displayUserName(uid, users); }
  function findingRef(f: Finding) { return formatReference("FND", f); }

  const displayed = searchQuery
    ? filteredFindings.filter((f) => {
        const q = searchQuery.toLowerCase();
        return (
          findingRef(f).toLowerCase().includes(q) ||
          f.area.toLowerCase().includes(q) ||
          f.requirement.toLowerCase().includes(q) ||
          (f.purpose?.toLowerCase().includes(q) ?? false)
        );
      })
    : filteredFindings;

  /* ── Selection + export ── */
  const allSelected = displayed.length > 0 && displayed.every((f) => selectedIds.has(f.id));
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(displayed.map((f) => f.id)));
  }

  const EXPORT_HEADERS = [
    "Gap ID", "Area", "Requirement", "Purpose", "Framework",
    "Severity", "Status", "Owner", "Target date", "Evidence", "Linked CAPA",
  ];
  function buildExportRows() {
    const source = selectedIds.size > 0 ? displayed.filter((f) => selectedIds.has(f.id)) : displayed;
    return source.map((f) => {
      const linkedCapa = capas.find((c) => c.id === f.capaId) ?? capas.find((c) => c.findingId === f.id);
      return [
        findingRef(f),
        f.area,
        f.requirement,
        f.purpose ?? "",
        frameworkLabel(f.framework),
        f.severity,
        f.status,
        ownerName(f.owner),
        f.targetDate ? dayjs.utc(f.targetDate).tz(timezone).format(dateFormat) : "",
        f.evidenceLink ?? "",
        linkedCapa ? (linkedCapa.reference ?? linkedCapa.id) : "",
      ];
    });
  }

  async function onSave(data: EditForm) {
    if (!selectedFinding || !user) return;
    setSaveError("");

    const targetDateISO = dayjs(data.targetDate).utc().toISOString();

    // RCA is NOT part of this payload any more — it has its own section + Save.
    const noChange =
      data.requirement === selectedFinding.requirement &&
      (data.purpose ?? "") === (selectedFinding.purpose ?? "") &&
      targetDateISO === selectedFinding.targetDate &&
      data.evidenceLink === (selectedFinding.evidenceLink ?? "");

    if (noChange) {
      setIsEditing(false);
      return;
    }

    // Item 16 — checked here so the reason is demanded BEFORE a round-trip, and
    // checked again on the server (which is what actually enforces it).
    if (editReason.trim().length < FINDING_EDIT_REASON_MIN) {
      setSaveError(`Add a reason for this edit (at least ${FINDING_EDIT_REASON_MIN} characters) — it's recorded in the finding's audit trail.`);
      return;
    }

    const result = await updateFindingAction(selectedFinding.id, {
      requirement: data.requirement,
      purpose: data.purpose,
      targetDate: targetDateISO,
      evidenceLink: data.evidenceLink,
      reason: editReason.trim(),
    });

    if (!result.success) {
      // Edit is hidden for non-QA (canEditFinding); this is a stale-UI / race
      // guard. Warn (not a red error) and surface the reason inline.
      console.warn("[gap] updateFinding rejected:", result.error);
      setSaveError(result.error || "Failed to save changes. Please try again.");
      return;
    }

    setIsEditing(false);
    setEditReason("");
    setSavedPopup(true);
    router.refresh();
  }

  /* ── RCA save — its OWN narrow action (saveFindingRCA), not the general field
     editor. The reason is required only on a REVISION: a first analysis is the
     assessment being performed, not a change to a record. The server owns that rule;
     this mirrors it so the demand appears before a round-trip, never instead of one.
     rootCause is the readable mirror (shared rcaDetailToText); rcaDetail is the JSON
     source. Mirrors CAPA's edit modal, which is where this serialisation came from. ── */
  async function onSaveRca() {
    if (!selectedFinding) return;
    setRcaError("");
    const method = (rcaMethodInput || undefined) as CapaRCAMethod | undefined;
    if (!method) { setRcaError("Pick a root-cause method first."); return; }
    const rcaText = rcaDetailToText(method, detail).trim();
    if (!rcaText) { setRcaError("Fill in the analysis before saving."); return; }
    const isRevision = !!selectedFinding.rootCause?.trim();
    if (isRevision && rcaReason.trim().length < FINDING_EDIT_REASON_MIN) {
      setRcaError(`Revising the analysis needs a reason (at least ${FINDING_EDIT_REASON_MIN} characters) — it's recorded in the finding's audit trail.`);
      return;
    }
    setRcaBusy(true);
    const result = await saveFindingRCAAction(selectedFinding.id, {
      rootCause: rcaText,
      rcaMethod: method,
      rcaDetail: JSON.stringify(detail),
      ...(isRevision ? { reason: rcaReason.trim() } : {}),
    });
    setRcaBusy(false);
    if (!result.success) {
      console.warn("[gap] saveFindingRCA rejected:", result.error);
      setRcaError(result.error || "Failed to save the analysis. Please try again.");
      return;
    }
    // A revision reason is CONSUMED by the save it justifies — cleared here so the
    // next revision must state its own. Matches the sibling `editReason` field
    // (onSaveEdit + the Edit modal's Cancel), which clears on the same events under
    // the same FINDING_EDIT_REASON_MIN rule; the two revision-reason fields behave
    // identically. Carrying the text over would let a second save re-submit the
    // first save's justification, putting a reason in the audit trail that doesn't
    // describe the change it's attached to.
    //
    // The modal then closes; router.refresh() below re-reads the saved record so the
    // panel's read-only summary shows the new analysis. `detail` / `rcaMethodInput`
    // are re-seeded from that record whenever the modal is re-opened via Cancel or a
    // finding switch (see closeRcaModal + the selectedFinding.id reset effect).
    setRcaReason("");
    setRcaModalOpen(false);
    setSavedPopup(true);
    router.refresh();
  }

  /** Discard an in-flight RCA edit: re-seed the inputs from the saved record so a
   *  cancelled edit leaves nothing behind, and clear the reason + error. Mirrors the
   *  general Edit modal's Cancel (form.reset() + setEditReason("") + setSaveError("")). */
  function closeRcaModal() {
    setRcaModalOpen(false);
    if (selectedFinding) {
      setDetail(seedRcaDetail(selectedFinding));
      setRcaMethodInput(selectedFinding.rcaMethod ?? "");
    }
    setRcaReason("");
    setRcaError("");
  }

  const isOverdue = selectedFinding ? selectedFinding.status !== "Closed" && dayjs.utc(selectedFinding.targetDate).isBefore(dayjs()) : false;

  // ── KPI strip (Support-pattern) — 4 stat cards summarising the CURRENT view.
  //    Derived from the page-level filtered set (filteredFindings = baseFindings)
  //    so they agree with the Summary charts / Evidence Index and the table
  //    below; the in-table search only narrows visible rows, not these counts. ──
  const kpiTotal = filteredFindings.length;
  const kpiCritical = filteredFindings.filter((f) => f.severity === "Critical").length;
  const kpiOverdue = filteredFindings.filter((f) => f.status !== "Closed" && dayjs.utc(f.targetDate).isBefore(dayjs())).length;
  const kpiClosed = filteredFindings.filter((f) => f.status === "Closed").length;

  // Phase-3 entrance — spread onto each MotionList. When the reveal shouldn't
  // play (tab-return remount), pin the list to its resting state via initial=false
  // so no entrance runs; otherwise the primitive's own initial="hidden" stands.
  // Durations/stagger come entirely from the motion tokens (nothing hardcoded).
  const entranceProps: { initial?: false } = playEntrance ? {} : { initial: false };

  return (
    <div role="tabpanel" id="panel-register" aria-labelledby="tab-register" tabIndex={0}>
      {/* Phase-3 entrance sequence: reveal KPI row → toolbar → table one after
          another via MotionList/MotionListItem (reduced-motion aware; all tempo
          from the motion tokens — nothing hardcoded). The KPI row nests its OWN
          MotionList so the 4 cards cascade individually inside the outer
          sequence. Modals live OUTSIDE this list (they're not part of the
          reveal). Only the Findings Register tab is animated — Summary/Evidence
          are untouched. */}
      <MotionList {...entranceProps}>
        {/* 1 — KPI cards (Support-pattern), with their own inner card cascade. */}
        <MotionListItem>
          <MotionList {...entranceProps} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <MotionListItem className="h-full [&>*]:h-full"><StatCard icon={ClipboardList} color="var(--brand)" label="Total findings" value={String(kpiTotal)} sub={isAnyFilterActive ? "Matching current filters" : "In the register"} /></MotionListItem>
            <MotionListItem className="h-full [&>*]:h-full"><StatCard icon={AlertTriangle} color="var(--danger)" label="Critical" value={String(kpiCritical)} sub="Highest-risk gaps" /></MotionListItem>
            <MotionListItem className="h-full [&>*]:h-full"><StatCard icon={CalendarClock} color="var(--warning)" label="Overdue" value={String(kpiOverdue)} sub="Past target date, still open" /></MotionListItem>
            <MotionListItem className="h-full [&>*]:h-full"><StatCard icon={CheckCircle2} color="var(--success)" label="Closed" value={String(kpiClosed)} sub="Verified and closed" /></MotionListItem>
          </MotionList>
        </MotionListItem>

        {/* 2 — Toolbar */}
        <MotionListItem>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
          <input type="search" className="input pl-8 text-[12px]" placeholder="Search findings…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search findings" />
        </div>
        {renderFilters(true)}
        {displayed.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            {selectedIds.size > 0 && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{selectedIds.size} selected</span>
            )}
            <ExportMenu
              filename={`findings-register-${dayjs().format("YYYY-MM-DD")}`}
              title="Findings register"
              subtitle={`Generated ${dayjs().format("DD MMM YYYY HH:mm")}`}
              headers={EXPORT_HEADERS}
              rows={buildExportRows}
              label={selectedIds.size > 0 ? `Export (${selectedIds.size})` : "Export all"}
            />
          </div>
        )}
      </div>
        </MotionListItem>

        {/* 3 — Table card (its Phase-2 row-stagger runs inside once it reveals). */}
        <MotionListItem>
      {/* Table — wrapped in the shared table card (tableTokens.tableCard: the
          same border + --card-bg + rounded-2xl the Support Center queue gets from
          the DataTable widget). The toolbar above stays OUTSIDE the card. The
          card's overflow-hidden rounds the corners; the inner overflow-x-auto
          keeps horizontal scrolling, and the empty state renders inside too. */}
      <div className={tableCard}>
        <div className="overflow-x-auto">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <ClipboardList className="w-12 h-12 text-[#334155]" aria-hidden="true" />
            {findingsTotal === 0 ? (
              <>
                <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No findings logged yet</p>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Log your first finding to start tracking GxP compliance gaps.</p>
                {!isViewOnly && gapCan.canCreate && <Button variant="primary" icon={Plus} onClick={onAddOpen}>Log your first finding</Button>}
              </>
            ) : (
              <>
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No findings match the current filters</p>
                {(isAnyFilterActive || searchQuery) && <Button variant="ghost" size="sm" onClick={() => { onClearFilters(); setSearchQuery(""); }}>Clear filters</Button>}
              </>
            )}
          </div>
        ) : (
          <DataTable
            ariaLabel="GxP/GMP findings register"
            caption="List of all GxP/GMP findings with severity, status and target dates"
            data={displayed}
            rowKey={(f) => f.id}
            onRowClick={(f) => onSelectFinding(f)}
            rowStyle={(f) => selectedFinding?.id === f.id ? { background: isDark ? "#0c2f5a" : "#eff6ff" } : {}}
            columns={[
              {
                key: "select",
                // Select-all checkbox lives in the column header (DataTable
                // headers accept ReactNode), wired to toggleSelectAll / allSelected.
                header: (
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 cursor-pointer accent-(--brand)" aria-label="Select all findings" />
                ),
                width: "w-8",
                render: (f) => (
                  <span onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelect(f.id)}
                      className="w-3.5 h-3.5 cursor-pointer accent-(--brand)" aria-label={`Select ${findingRef(f)}`} />
                  </span>
                ),
              },
              {
                key: "id",
                header: "ID",
                headerClassName: "whitespace-nowrap",
                cellClassName: "whitespace-nowrap",
                render: (f) => (
                  <div className="font-mono text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{findingRef(f)}</div>
                ),
              },
              {
                key: "site",
                header: "Site",
                hidden: !showSiteColumn,
                cellClassName: "text-[12px] whitespace-nowrap text-(--text-secondary)",
                render: (f) => siteName(f.siteId),
              },
              {
                key: "area",
                header: "Area",
                cellClassName: "text-[12px] whitespace-nowrap text-(--text-secondary)",
                render: (f) => f.area,
              },
              {
                key: "requirement",
                header: "Requirement",
                // Truncate long text with an ellipsis; full text on hover (title).
                render: (f) => <span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 200, color: "var(--text-primary)" }} title={f.requirement}>{f.requirement}</span>,
              },
              {
                key: "purpose",
                header: "Purpose",
                render: (f) => <span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 180, color: "var(--text-secondary)" }} title={f.purpose ?? undefined}>{f.purpose ? f.purpose : <span style={{ color: "var(--text-muted)" }}>&mdash;</span>}</span>,
              },
              {
                key: "framework",
                header: "Framework",
                render: (f) => <span className="badge badge-blue text-[10px]">{frameworkLabel(f.framework)}</span>,
              },
              {
                key: "severity",
                header: "Severity",
                render: (f) => severityBadge(f.severity),
              },
              {
                key: "status",
                header: "Status",
                render: (f) => statusBadge(f.status),
              },
              {
                key: "capa",
                header: "CAPA",
                cellClassName: "whitespace-nowrap",
                render: (f) => {
                  // Reverse lookup in case finding.capaId hasn't been updated but a CAPA references it
                  const linkedCapa = capas.find((c) => c.id === f.capaId) ?? capas.find((c) => c.findingId === f.id);
                  return linkedCapa ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onNavigateCapa(linkedCapa.id); }}
                      className="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer hover:underline"
                      aria-label={`Open ${linkedCapa.reference ?? linkedCapa.id}`}
                    >
                      <Link2 className="w-3 h-3 text-[#0ea5e9]" aria-hidden="true" />
                      <span className="font-mono text-[11px] font-semibold text-[#0ea5e9]">{linkedCapa.reference ?? linkedCapa.id}</span>
                      {capaStatusBadge(linkedCapa.status)}
                    </button>
                  ) : (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>&mdash;</span>
                  );
                },
              },
              {
                key: "owner",
                header: "Owner",
                cellClassName: "text-[12px] whitespace-nowrap text-(--text-secondary)",
                render: (f) => ownerName(f.owner),
              },
              {
                key: "targetDate",
                header: "Target date",
                cellClassName: "whitespace-nowrap",
                render: (f) => (
                  <>
                    <div className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(f.targetDate).tz(timezone).format(dateFormat)}</div>
                    {f.status !== "Closed" && dayjs.utc(f.targetDate).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444]">Overdue</div>}
                  </>
                ),
              },
              {
                key: "evidence",
                header: "Evidence",
                render: (f) => f.evidenceLink ? <span className="text-[11px] text-[#0ea5e9]">{f.evidenceLink}</span> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>&mdash;</span>,
              },
              {
                key: "open",
                header: "Open",
                srOnly: true,
                render: (f) => <Button variant="ghost" size="xs" icon={ChevronRight} aria-label={`View detail for ${f.id}`} />,
              },
            ] satisfies Column<Finding>[]}
          />
        )}
        </div>
      </div>
        </MotionListItem>
      </MotionList>

      {/* ── Finding detail popup ── */}
      <Modal
        open={!!selectedFinding}
        onClose={() => { setIsEditing(false); onSelectFinding(null); }}
        title={selectedFinding ? findingRef(selectedFinding) : "Finding Detail"}
        header={
          <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-(--bg-border)">
            <h2 className="text-[14px] font-semibold text-(--text-primary)">{selectedFinding ? findingRef(selectedFinding) : "Finding Detail"}</h2>
            <div className="flex items-center gap-1">
              {/* #13 — Clock opens the scrollable Audit Trail modal, before ✕. */}
              <button type="button" onClick={() => setAuditModalOpen(true)} aria-label="Audit trail" title="Audit trail"
                className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors">
                <Clock className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => { setIsEditing(false); onSelectFinding(null); }} aria-label="Close"
                className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors">
                <X className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
              </button>
            </div>
          </div>
        }
        footer={selectedFinding && isEditing ? (
          <div className="flex justify-end gap-2">
            {/* Edit-mode actions only; the modal's ✕ handles closing (no
                redundant bottom Close). Edit lives in the header. */}
            <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setEditReason(""); setSaveError(""); form.reset(); }}>Cancel</Button>
            <Button variant="primary" size="sm" icon={Save} onClick={form.handleSubmit(onSave)}>Save</Button>
          </div>
        ) : undefined}
      >
        {selectedFinding && (
          <div className="space-y-4">
            {/* Created-At removed from the detail TOP section (the full timestamp
                remains in the audit/details section below + the header-clock modal). */}
            {/* Header: severity + status badges, with the Edit action on the
                right (header action; ✕ closes; Save/Cancel in footer on edit). */}
            {/* Governance Phase 2 — provenance when this finding was raised by converting a Risk. */}
            <RaisedFromRiskBanner target="Gap" recordId={selectedFinding.id} />

            {/* Gap→CAPA handoff — read-only lock banner. Shown while a CAPA raised
                from this gap is still live; the gap stays fully viewable but every
                edit/assign/message control is hidden (canEdit + control gates on
                !gapLocked), so work continues in the linked CAPA. */}
            {gapLocked && lockCapa && (
              <div role="status" className="flex items-start gap-2 text-[12px] p-2.5 rounded-lg" style={{ background: "var(--info-bg)", color: "var(--info)" }}>
                <span aria-hidden="true">🔒</span>
                <span>
                  <strong>Locked</strong> — CAPA{" "}
                  <button type="button" onClick={() => onNavigateCapa(lockCapa.id)} className="underline bg-transparent border-none p-0 cursor-pointer font-semibold" style={{ color: "inherit" }}>
                    {lockCapa.reference ?? lockCapa.id}
                  </button>{" "}
                  raised from this gap. Work continues in the CAPA; this gap is read-only.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2 flex-wrap">{severityBadge(selectedFinding.severity)}{statusBadge(selectedFinding.status)}</div>
              {!isEditing && (
                // Summarize FIRST, then Edit, on the same row (#8). If Edit is
                // unavailable, Summarize simply takes the slot. Summarize opens a
                // modal (DocumentSummaryPanel, #9).
                <div className="flex items-center gap-2">
                  <DocumentSummaryPanel
                    title={findingRef(selectedFinding)}
                    recordId={selectedFinding.id}
                    module="finding"
                    buttonLabel="Summarize"
                    content={[
                      `Requirement: ${selectedFinding.requirement}`,
                      selectedFinding.purpose ? `Purpose: ${selectedFinding.purpose}` : "",
                      `Framework: ${frameworkLabel(selectedFinding.framework)}; Area: ${selectedFinding.area}; Severity: ${selectedFinding.severity}`,
                      selectedFinding.rootCause ? `Root cause: ${selectedFinding.rootCause}` : "",
                      selectedFinding.agiSummary ? `AI summary: ${selectedFinding.agiSummary}` : "",
                    ].filter(Boolean).join("\n\n")}
                  />
                  {canEdit && (
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setIsEditing(true)}>Edit</Button>
                  )}
                </div>
              )}
            </div>

            {/* ── Requirement ── */}
            {isEditing ? (
              <div>
                <label className={LABEL} htmlFor="edit-requirement">Requirement</label>
                <textarea
                  id="edit-requirement"
                  rows={3}
                  {...form.register("requirement", { required: "Requirement is required", minLength: { value: 10, message: "Add the requirement (at least 10 characters)" } })}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 resize-none bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                />
                {form.formState.errors.requirement && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.requirement.message}</p>}
              </div>
            ) : (
              <div>
                <h3 className={LABEL}>Requirement</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedFinding.requirement}</p>
              </div>
            )}

            {/* ── Purpose ── */}
            {isEditing ? (
              <div>
                <label className={LABEL} htmlFor="edit-purpose">Purpose <span className="text-[10px] font-normal italic">(optional)</span></label>
                <textarea
                  id="edit-purpose"
                  rows={2}
                  {...form.register("purpose")}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 resize-none bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                  placeholder="Why this gap matters / what closing it achieves"
                />
              </div>
            ) : selectedFinding.purpose ? (
              <div>
                <h3 className={LABEL}>Purpose</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedFinding.purpose}</p>
              </div>
            ) : null}

            {/* ── Area + Framework (LOCKED) ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className={LABEL}>Area</h3>
                <div className="flex items-center">
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{selectedFinding.area}</p>
                  {isEditing && LOCKED_HINT}
                </div>
              </div>
              <div>
                <h3 className={LABEL}>Framework</h3>
                <div className="flex items-center">
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{frameworkLabel(selectedFinding.framework)}</p>
                  {isEditing && LOCKED_HINT}
                </div>
              </div>
            </div>

            {/* ── Severity (LOCKED) ── */}
            {isEditing && (
              <div>
                <h3 className={LABEL}>Severity</h3>
                <div className="flex items-center">{severityBadge(selectedFinding.severity)}{LOCKED_HINT}</div>
              </div>
            )}

            {/* ── Owner ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className={LABEL}>Owner</h3>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {ownerName(selectedFinding.owner)}
                  {selectedFinding.owner === user?.id ? " (You)" : ""}
                  {(() => { const u = users.find((x) => x.id === selectedFinding.owner); return u ? ` (${roleLabel(u.role)})` : ""; })()}
                </p>
                {/* Assign moved to the severity-gated Disposition block below (LOW →
                    assign a person; HIGH/MEDIUM/CRITICAL → Raise CAPA), mirroring the
                    deviation priority disposition. */}
              </div>

              {/* ── Target date ── */}
              <div>
                <h3 className={LABEL}>Target date</h3>
                {isEditing ? (
                  <>
                    <Controller
                      name="targetDate"
                      control={form.control}
                      rules={{ required: "Target date required" }}
                      render={({ field }) => (
                        <DatePicker id="edit-target" value={field.value ?? ""} onChange={field.onChange} min={new Date().toISOString().slice(0, 10)}
                          error={form.formState.errors.targetDate?.message} />
                      )}
                    />
                    {isOverdue && <p className="text-[11px] mt-1" style={{ color: "var(--status-waiting)" }}>Current date is overdue — consider a future date</p>}
                  </>
                ) : (
                  <p className="text-[12px]" style={{ color: isOverdue ? "#ef4444" : "var(--text-primary)" }}>
                    {dayjs.utc(selectedFinding.targetDate).tz(timezone).format(dateFormat)}
                    {isOverdue && <span className="badge badge-red text-[10px] ml-2">Overdue</span>}
                  </p>
                )}
              </div>
            </div>

            {reworkOpen && (
              <Modal open onClose={() => { if (!reviewBusy) setReworkOpen(false); }} title="Send finding for rework">
                <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>Return this finding to the assignee with a reason. It reappears in their worklist and is recorded in the conversation.</p>
                <textarea className="input text-[12px] w-full min-h-20" value={reworkReasonInput} onChange={(e) => setReworkReasonInput(e.target.value)} maxLength={2000} placeholder="What needs to change? (≥ 5 characters)" />
                {reviewError && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{reviewError}</p>}
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="secondary" size="sm" disabled={reviewBusy} onClick={() => setReworkOpen(false)}>Cancel</Button>
                  <Button variant="danger" size="sm" disabled={reviewBusy || reworkReasonInput.trim().length < 5} loading={reviewBusy} onClick={() => void handleReworkSubmit()}>Send for rework</Button>
                </div>
              </Modal>
            )}

            {/* ── Evidence link ── */}
            {isEditing ? (
              <div>
                <label className={LABEL} htmlFor="edit-evidence">Evidence link <span className="text-[10px] font-normal italic">(optional)</span></label>
                <input
                  id="edit-evidence"
                  type="text"
                  {...form.register("evidenceLink")}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                  placeholder="Document reference or URL"
                />
                {/* Reuse the shared evidence modal (upload a file + see the
                    current document) — same flow as the register table. */}
                <Button variant="secondary" size="sm" icon={Paperclip} className="mt-2"
                  onClick={() => onManageEvidence(selectedFinding.id, selectedFinding.evidenceLink ?? "")}>
                  Upload / manage evidence document
                </Button>
              </div>
            ) : selectedFinding.evidenceLink?.trim() ? (
              // "Evidence link" — the author's free-text reference, NOT the
              // uploaded documents (those are their own sections lower down).
              // Hidden entirely when unset: no empty shell.
              <div>
                <h3 className={LABEL}>Evidence link</h3>
                <span className="text-[12px] text-[#0ea5e9]">{selectedFinding.evidenceLink}</span>
              </div>
            ) : null}

            {/* ── ROOT CAUSE ANALYSIS — its own section, its own Save (RCA relocation).
                 It sits between Evidence link (what supports the assessment) and
                 Linked CAPA / Disposition (what we do about it) — the hinge where the
                 reasoning belongs, and directly above the decision it justifies.

                 It is NOT in the Edit modal any more. Edit was its ONLY entry point,
                 which made RCA reachable only by "editing" a finding — and would have
                 deadlocked #17 (RCA gates closure) the moment #16.3 removed it.

                 Reachability is the whole point of this move, so the AUTHORIZED +
                 EMPTY state MUST render: an authorized user with no RCA yet sees the
                 method picker and an invitation. Rendering null there would relocate
                 the deadlock instead of fixing it. Unauthorized + empty still renders
                 nothing (no empty placeholder — the #6 convention). ── */}
            {(() => {
              // The SAME function saveFindingRCA gates on. This was an inline
              // `(isQAHead || isRaiser)` that happened to agree with the server —
              // and a coincidence is not an invariant: adding the assigned-handoff
              // rule to one side of it would have left the other side wrong, which
              // is precisely how Item 16.1's raiser branch shipped inert.
              // gapLocked stays separate: the CAPA lock is the whole gap's rule
              // (findingLockedByCapa server-side), not the RCA's.
              const canWriteRca =
                !isViewOnly && !gapLocked &&
                canWriteFindingRCA(role, user?.id ?? null, selectedFinding);
              if (!canWriteRca) {
                return selectedFinding.rootCause ? (
                  <div>
                    <h3 className={LABEL}>Root cause analysis {selectedFinding.rcaMethod && <Badge variant="gray">{selectedFinding.rcaMethod}</Badge>}</h3>
                    <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{selectedFinding.rootCause}</p>
                  </div>
                ) : null;
              }
              const hasRca = !!selectedFinding.rootCause?.trim();
              return (
                // Item 17 — the anchor the close blocker points at. The section is
                // the ONLY writer of rootCause; the close flow directs here rather
                // than opening a modal of its own.
                // The section stays the scroll anchor (scrollToRca) even though the
                // form now lives in a modal — the close blocker still points HERE,
                // at the summary + its Edit button, which is the entry point.
                <div ref={rcaSectionRef} className="pt-4 border-t border-(--bg-border)">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={LABEL}>
                      Root cause analysis {selectedFinding.rcaMethod && <Badge variant="gray">{selectedFinding.rcaMethod}</Badge>}
                    </h3>
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setRcaModalOpen(true)}>
                      {hasRca ? "Edit RCA" : "Add RCA"}
                    </Button>
                  </div>
                  {hasRca ? (
                    <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                      {selectedFinding.rootCause}
                    </p>
                  ) : (
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      No root cause analysis recorded yet. Add one to record the assessment.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* ── Edit reason (only in edit mode) — Item 16: MANDATORY. It was
                 "(optional — helps audit trail)", which is a contradiction: an
                 optional reason-for-change is not an audit trail, it's a field most
                 people skip. The server now enforces the same floor (updateFinding),
                 so this is a mirror of the rule, not the rule itself. ── */}
            {isEditing && (
              <div className="pt-4 border-t border-(--bg-border)">
                <label className={LABEL} htmlFor="edit-reason">
                  Reason for edit <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  id="edit-reason"
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  maxLength={2000}
                  aria-describedby="edit-reason-hint"
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                  placeholder="e.g. Corrected the requirement wording after re-reading the clause"
                />
                <p id="edit-reason-hint" className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Recorded in this finding&apos;s audit trail. At least {FINDING_EDIT_REASON_MIN} characters.
                </p>
              </div>
            )}

            {/* ── Save error ── */}
            {isEditing && saveError && (
              <p role="alert" className="text-[11px] text-[#ef4444] p-2 rounded-lg" style={{ background: "var(--danger-bg)" }}>{saveError}</p>
            )}

            {/* ── AGI Risk Analysis ── */}
            {!isEditing && selectedFinding.agiSummary && agiMode !== "manual" && agiCapa && (
              <div className="agi-panel" role="status" aria-live="polite">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4" style={{ color: "var(--ai-accent)" }} aria-hidden="true" />
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>AGI Risk Analysis</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedFinding.agiSummary}</p>
              </div>
            )}

            {/* ── CAPA link or Raise button ── */}
            {!isEditing && (() => {
              // Check both: finding.capaId and reverse lookup via capas[].findingId
              const linkedCapa = selectedFinding.capaId
                ? capas.find((c) => c.id === selectedFinding.capaId)
                : capas.find((c) => c.findingId === selectedFinding.id);
              const linkedCapaId = linkedCapa?.id ?? selectedFinding.capaId;

              return linkedCapaId ? (
                <div>
                  <h3 className={LABEL}>Linked CAPA</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button" onClick={() => onNavigateCapa(linkedCapaId)} className="flex items-center gap-1.5 text-[12px] hover:underline bg-transparent border-none cursor-pointer p-0" style={{ color: "var(--brand)" }}>
                      <Link2 className="w-3.5 h-3.5" aria-hidden="true" />{linkedCapa?.reference ?? linkedCapaId}
                    </button>
                    {linkedCapa && capaStatusBadge(linkedCapa.status)}
                  </div>
                  {linkedCapa?.status === "pending_qa_review" && <p className="text-[11px] mt-2 p-2 rounded-lg" style={{ background: "var(--info-bg)", color: "var(--info)" }}>CAPA pending QA review. Once closed, this finding will be automatically closed.</p>}
                  {linkedCapa?.status === "closed" && <p className="text-[11px] mt-2 p-2 rounded-lg" style={{ background: "var(--success-bg)", color: "var(--success)" }}>CAPA closed. This finding has been automatically closed.</p>}
                </div>
              ) : (
                // Disposition by SEVERITY (mirrors the deviation priority disposition):
                // LOW → assign a person who works it in the worklist (assign → submit
                // → QA review), with Raise CAPA as a secondary option; HIGH / MEDIUM /
                // CRITICAL → Raise CAPA. Shown on a non-closed finding that isn't yet
                // linked to a CAPA (findings have no investigation gate, so this is the
                // initial disposition moment).
                // Disposition is a QA-ONLY control surface: BOTH of its actions
                // require qa_head (assignFinding's gate; canCreateCAPA →
                // CAPA_CREATE_ROLES = ["qa_head"]). For anyone else the block held
                // nothing actionable, so it is hidden outright rather than shown
                // as an empty shell.
                !isViewOnly && isQAHead && selectedFinding.status !== "Closed" && (
                  <div>
                    <h3 className={LABEL}>Disposition</h3>
                    {/* At REVIEW time the decision is three-way — accept, send back, or
                        escalate — but the QA-review card below only offers two of them.
                        Raise CAPA already renders in this block for both severity
                        branches, and this block already sits ABOVE that card, so the
                        third option is present; what was missing is that nothing said
                        it was an ALTERNATIVE to closing.
                        This is a line of text, NOT a fourth Raise CAPA button next to
                        Accept & close: all existing triggers call the same onRaiseCapa,
                        so another one would add no capability — and two buttons for one
                        action invite the reader to assume they do different things. */}
                    {qaReview?.status === "Submitted" && (
                      <p className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>
                        If this needs corrective action, you can raise a CAPA instead of closing it.
                      </p>
                    )}
                    {selectedFinding.severity === "Low" ? (
                      <>
                        <p className="text-[11px] mt-0.5 mb-1.5" style={{ color: "var(--text-secondary)" }}>
                          Low-severity gaps are worked as a lightweight assigned task (assign → submit → QA review), or raise a CAPA if systematic correction is needed.
                        </p>
                        {selectedFinding.status === "Open" ? (
                          // Not yet assigned — QA picks who works it (or raises a CAPA).
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Dropdown placeholder="Assign to…" value={assignTo} onChange={setAssignTo} width="w-56" size="sm" options={assignees.map((u) => ({ value: u.id, label: `${u.name} · ${roleLabel(u.role)}` }))} />
                              <Button variant="primary" size="sm" icon={Plus} disabled={assignBusy || !assignTo} loading={assignBusy} onClick={() => void handleAssignFinding()}>Assign person</Button>
                            </div>
                            {assignError && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{assignError}</p>}
                            {canRaiseCapa && (
                              <div className="mt-2"><Button variant="secondary" icon={Plus} fullWidth onClick={() => onRaiseCapa(selectedFinding)}>Raise CAPA</Button></div>
                            )}
                          </>
                        ) : (
                          // Past Open — show the person read-only and hide the
                          // dropdown. Raise CAPA stays available to escalate.
                          <>
                            {/* Item 18 — the person is rendered as a person, and the
                                LABEL is now derived from the assignment record rather
                                than guessed from status. A finding reaches In Progress
                                via createCAPA (capas/lifecycle.ts:617) or a status edit
                                without ever being assigned, so "Assigned to" here named
                                the RAISER — the wrong person, for the wrong reason.
                                assignedAt is the only field that knows. Null → "Owner",
                                which is also the honest label for a row whose
                                assignment predates the column: we don't know that
                                anyone assigned them. */}
                            {canRaiseCapa && (
                              <div className="mt-2"><Button variant="secondary" icon={Plus} fullWidth onClick={() => onRaiseCapa(selectedFinding)}>Raise CAPA</Button></div>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      canRaiseCapa ? (
                        <Button variant="secondary" icon={Plus} fullWidth onClick={() => onRaiseCapa(selectedFinding)}>Raise CAPA</Button>
                      ) : null
                    )}
                    {/* Accept & close — the third disposition option, sitting with the
                        other two (assign / raise CAPA) rather than only inside the QA
                        review card. ALWAYS rendered for a QA Head on an open finding
                        and DISABLED with the reason when it isn't closeable, so the
                        control never silently disappears.

                        Gating comes from `closeGate` — the single source both this
                        button and the review card read. Nothing is re-derived here. */}
                    {closeGate.visible && (
                      <div className="mt-2">
                        <Button
                          variant="primary"
                          icon={CheckCircle2}
                          fullWidth
                          disabled={reviewBusy || !closeGate.canClose}
                          title={closeGate.reason ?? undefined}
                          onClick={() => { setReviewError(null); setCloseModalOpen(true); }}
                        >
                          Accept &amp; close
                        </Button>
                        {closeGate.reason && (
                          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{closeGate.reason}</p>
                        )}
                      </div>
                    )}
                    {/* ── Assigned to — repositioned BELOW the actions ──────────
                        The person moved from above the action buttons to under
                        them, so the QA Head reads the decision controls first and
                        "who is on this" after.

                        DOCS + WORK NOTES DELIBERATELY NOT HERE. They render once,
                        in the QA review card below, which is where QA judges the
                        verdict against the evidence in view. Adding them here too
                        broke the invariant stated at the top of this file (:387-391):
                        either the card renders the docs or the block does, never
                        both. This section is the PERSON only.

                        Name resolution unchanged: `ownerName` → `displayUserName`
                        (identity-display.ts), which resolves an id to a name and
                        falls back rather than leaking a cuid. No data or query
                        changed. */}
                    {(() => {
                      const name = ownerName(selectedFinding.owner);
                      const u = users.find((x) => x.id === selectedFinding.owner);
                      const initials = name.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
                      const isAssigned = !!selectedFinding.assignedAt;
                      return (
                        <div className="mt-3 flex items-center gap-2.5 rounded-lg border p-2.5" style={{ borderColor: "var(--brand-border)", background: "var(--brand-muted)" }}>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold" style={{ background: "var(--brand)", color: "#fff" }} aria-hidden="true">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{isAssigned ? "Assigned to" : "Owner"}</p>
                            <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                              {name}
                              {u && <span className="font-normal" style={{ color: "var(--text-secondary)" }}> · {roleLabel(u.role)}</span>}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )
              );
            })()}

            {/* Gap Step 4 — QA review (accept / rework) + the SUBMITTED EVIDENCE
                bundle. Positioned BELOW Disposition so QA reviews the whole
                submission (notes + evidence) as the final decision surface
                (#9/#10). Shown once the finding enters the submit/rework loop —
                see `qaReview`, which is the single source for that condition. */}
            {qaReview && (
              <div className="rounded-lg border p-3 mt-3" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
                <h3 className={LABEL} style={{ margin: 0 }}>QA review</h3>
                {qaReview.completionNotes && (
                  <p className="text-[12px] mt-1.5" style={{ color: "var(--text-secondary)" }}><span className="font-medium">Completion notes:</span> {qaReview.completionNotes}</p>
                )}
                {/* Evidence — split by origin (shared <DocumentCard>): Gap Evidence
                    (gap-native) vs Worklist Documents (received from the worker). */}
                {findingDocs.length > 0 && (
                  <div className="mt-2 space-y-3">
                    <DocGroup label="Gap creation documents" docs={createDocs} />
                    <DocGroup label="Worker documents" docs={workDocs} />
                  </div>
                )}

                {/* Gap Step 4 — QA's decision, placed WITH the submission it
                    judges (notes + evidence directly above) rather than at the top
                    of the modal, so the verdict is taken against the evidence in
                    view. Buttons, handlers, and the isQAHead SoD gate are unchanged
                    from the former top placement. */}
                {isQAHead && qaReview.status === "Submitted" && !gapLocked && (
                  <div className="mt-3 pt-2 border-t" style={{ borderColor: "var(--bg-border)" }}>
                    <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
                      Submitted for review by <strong style={{ color: "var(--text-primary)" }}>{ownerName(selectedFinding.owner)}</strong>
                      {(() => { const u = users.find((x) => x.id === selectedFinding.owner); return u ? ` · ${roleLabel(u.role)}` : ""; })()}
                    </p>
                    {/* Item 17 — the SAME findingCloseBlockers the three server paths
                        enforce, rendering the SAME message verbatim, so the refusal
                        reads identically whether it's predicted here or returned by
                        the server. Accept is disabled rather than hidden: a QA Head
                        needs to know the close is blocked and why, not wonder where
                        the button went.

                        The pointer goes to the RCA SECTION that already exists — not
                        a close-flow modal. A modal would be the THIRD writer of
                        rootCause (Edit was the accidental second, and undoing that
                        took two items). One writer, one rule, one place. */}
                    {/* Shown only when the close is ACTUALLY refused. Previously
                        keyed on `closeBlockers.length > 0`, which would now
                        contradict itself: with a waiver available the button is
                        enabled, so a panel saying "you cannot close it" beside it
                        would be false. `closeGate` is the one arbiter. */}
                    {closeBlockers.length > 0 && !closeGate.canClose && (
                      <div className="rounded-lg border p-2.5 mb-2 flex items-start gap-2" style={{ background: "var(--warning-bg, var(--bg-surface))", borderColor: "var(--warning, var(--bg-border))" }}>
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--warning, var(--text-muted))" }} aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>{closeBlockers[0].message}</p>
                          {closeBlockers[0].key === "rca_missing" && (
                            <button
                              type="button"
                              onClick={scrollToRca}
                              className="text-[11px] mt-1 bg-transparent border-none p-0 cursor-pointer underline font-medium"
                              style={{ color: "var(--brand)" }}
                            >
                              Go to root cause analysis
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Accept & close MOVED to the Disposition block above, where it
                        now sits with the other two dispositions (assign / raise CAPA)
                        and renders disabled-with-reason when the close is blocked.
                        Both read the same `closeGate`, so there is one rule and one
                        button. Rework stays here: it is a verdict on THIS submission
                        (the notes + evidence directly above), not a disposition. */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="secondary" size="sm" icon={Wrench} disabled={reviewBusy} onClick={() => { setReviewError(null); setReworkReasonInput(""); setReworkOpen(true); }}>Send for rework</Button>
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        To accept, use <strong style={{ color: "var(--text-secondary)" }}>Accept &amp; close</strong> in Disposition above.
                      </span>
                    </div>
                  </div>
                )}

                {/* The QA↔assignee conversation thread was retired here. The rework
                    reason it used to carry is NOT lost on this surface: reworkFinding
                    writes a FINDING_REWORK audit row carrying the reason, and the
                    History section below renders it per round, attributed and
                    timestamped (findingHistoryDetail, :121). */}
                {reviewError && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{reviewError}</p>}
              </div>
            )}

            {/* ── Documents — the finding's uploaded evidence, via the shared
                <DocumentCard> (View + Download per card). Rendered here ONLY when
                the QA-review card above is NOT shown (pre-submission / no review
                loop); once submitted, the same docs surface inside that card as
                the "Evidence submitted" bundle, so they never duplicate. #6 —
                the whole section is HIDDEN when there are no documents (no empty
                placeholder). ── */}
            {!qaReview && findingDocs.length > 0 && (
              <div className="pt-4 border-t border-(--bg-border) space-y-3">
                <DocGroup label="Gap creation documents" docs={createDocs} />
                <DocGroup label="Worker documents" docs={workDocs} />
              </div>
            )}

            {/* Item 16 — the inline History is gone: ALL trail display now lives in
                the header-Clock modal (<LifecycleTrail> there renders exactly what
                stood here). It is NOT merged with the field-edit diffs — the modal
                keeps two labelled sections, because these are two different trails
                and folding either under the other's name would misdescribe it. */}

          </div>
        )}
      </Modal>

      {/* ── Item 16 — the finding's history, ALL of it, in ONE place (the header
           Clock). TWO labelled sections, not one merged list, because there are two
           trails and they are not the same record:

             Lifecycle   — AuditLog. COMPLETE: every FINDING_* event writes a row.
             Field edits — FindingEdit. PARTIAL: only updateFinding + assignFinding
                           write it, so it can never show submit/review/close.

           Merging them would put the complete trail under a name meant for the
           partial one. Adjacent + labelled says what each actually is.

           The three SYNTHESIZED entries that used to lead this modal are gone —
           "Created", "CAPA raised", and linked-system. The first two duplicated real
           audit rows (FINDING_CREATED, FINDING_ESCALATED_TO_CAPA), and "Created"
           rendered ownerName(owner) under a "Created" heading — naming the current
           OWNER as the creator, which is the same bug Item 18 fixed on the
           "Assigned to" label, in a second place. The audit rows carry the real
           actor; the derived ones were guesses. ── */}
      {/* ── RCA edit modal — the SAME fields that used to render inline in the detail
           panel, moved behind an "Edit RCA" button so the panel reads as a summary.
           Nothing about the save changed: onSaveRca owns the guards, the payload and
           the reason rule exactly as before; this is only the container. ── */}
      {rcaModalOpen && selectedFinding && (() => {
        const hasRca = !!selectedFinding.rootCause?.trim();
        // Past RCA revisions, newest first. READ-ONLY: derived from the audit trail
        // already loaded for this finding (loadFindingHistory → getFindingAuditTrail,
        // which is tenant- AND findingVisibilityWhere-scoped and already ordered
        // createdAt desc). FINDING_RCA_UPDATED is the revision event; the first entry
        // is FINDING_RCA_RECORDED and carries no reason by design, so it is correctly
        // absent here. Reason is parsed by the SAME findingHistoryDetail the History
        // modal uses — no second parser, no new query.
        const rcaRevisions = history
          .filter((e) => e.action === "FINDING_RCA_UPDATED")
          .map((e) => ({ entry: e, reason: findingHistoryDetail(e.action, e.newValue).reason }))
          .filter((r) => !!r.reason);
        return (
          <Modal
            open
            onClose={() => { if (!rcaBusy) closeRcaModal(); }}
            title={hasRca ? "Edit root cause analysis" : "Add root cause analysis"}
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={rcaBusy} onClick={closeRcaModal}>Cancel</Button>
                <Button variant="primary" size="sm" icon={Save} disabled={rcaBusy || !rcaMethodInput} loading={rcaBusy} onClick={() => void onSaveRca()}>
                  {hasRca ? "Update analysis" : "Save analysis"}
                </Button>
              </div>
            }
          >
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Method</label>
                <Dropdown
                  value={rcaMethodInput}
                  onChange={(v) => { setRcaMethodInput(v); if (!v) setDetail({}); }}
                  placeholder="Select method..."
                  width="w-full"
                  options={[{ value: "", label: "— None" }, ...rcaMethodOptions(CAPA_RCA_METHODS)]}
                />
              </div>
              {rcaMethodInput && (
                <>
                  {/* Carries the AI Draft affordance with its field. */}
                  <RcaMethodFields
                    method={(rcaMethodInput || undefined) as CapaRCAMethod | undefined}
                    detail={detail}
                    onChange={setDetail}
                    recordId={selectedFinding.id}
                    draftContext={[selectedFinding.requirement, selectedFinding.purpose].filter(Boolean).join("\n\n")}
                  />
                  {/* Reason ONLY on a revision. A first analysis is the assessment
                      being performed — there is nothing recorded to explain a change
                      to, and demanding one here would just harvest "adding RCA".
                      saveFindingRCA enforces the same rule; this mirrors it. */}
                  {hasRca && (
                    <div>
                      <label className={LABEL} htmlFor="rca-reason">Reason for revision <span className="text-[#ef4444]">*</span></label>
                      <input
                        id="rca-reason"
                        type="text"
                        value={rcaReason}
                        onChange={(e) => setRcaReason(e.target.value)}
                        maxLength={2000}
                        aria-describedby="rca-reason-hint"
                        className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                        placeholder="Why is the analysis being changed?"
                      />
                      <p id="rca-reason-hint" className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                        Recorded in this finding&apos;s audit trail. At least {FINDING_EDIT_REASON_MIN} characters.
                      </p>
                    </div>
                  )}
                </>
              )}
              {rcaError && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{rcaError}</p>}

              {/* ── Revision history — why this analysis changed, newest first.
                   Hidden entirely when there are no prior revisions (a first-time
                   RCA has none by design). Display only: nothing here writes. ── */}
              {rcaRevisions.length > 0 && (() => {
                // Only the MOST RECENT revision — enough context for the edit in
                // hand. rcaRevisions is newest-first (getFindingAuditTrail orders
                // createdAt desc), so [0] is the latest. The complete list stays in
                // the dedicated History view (the header Clock).
                const latest = rcaRevisions[0];
                return (
                  <div className="pt-3 border-t border-(--bg-border)">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                      Last revision
                      {rcaRevisions.length > 1 && (
                        <span className="normal-case font-normal"> · {rcaRevisions.length} in total — see History for the rest</span>
                      )}
                    </p>
                    <div className="flex items-start gap-2 text-[11px]">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "var(--text-muted)" }} />
                      <div className="min-w-0">
                        <p style={{ color: "var(--text-muted)" }}>
                          {displayName({ name: latest.entry.userName })}{latest.entry.userRole ? ` (${roleLabel(latest.entry.userRole)})` : ""} &mdash; {dayjs.utc(latest.entry.createdAt).tz(timezone).format("DD/MM/YYYY hh:mm A")}
                        </p>
                        <p className="italic mt-0.5 whitespace-pre-wrap break-words" style={{ color: "var(--text-secondary)" }}>&ldquo;{latest.reason}&rdquo;</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </Modal>
        );
      })()}

      {auditModalOpen && selectedFinding && (
        <Modal open onClose={() => setAuditModalOpen(false)} title={`History — ${findingRef(selectedFinding)}`}>
          <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Lifecycle <span className="normal-case font-normal">· the complete trail</span>
              </p>
              <LifecycleTrail
                history={history}
                onNavigateCapa={onNavigateCapa}
                timezone={timezone}
                capaLinkIdFor={(e) => {
                  // The audit row carries the REFERENCE only (no capaId), so resolve
                  // the id the way the Linked-CAPA panel does — finding.capaId first,
                  // reverse lookup as backup. The ref TEXT still comes from the audit
                  // row: it is what was true AT ESCALATION and must not drift to the
                  // CAPA's current one. Falls back to plain text when unresolvable —
                  // never a raw cuid, never a dead link.
                  const { suffix } = findingHistoryDetail(e.action, e.newValue);
                  return suffix && (e.action === "FINDING_ESCALATED_TO_CAPA" || e.action === "FINDING_CLOSED_BY_CAPA")
                    ? (selectedFinding.capaId ?? capas.find((c) => c.findingId === selectedFinding.id)?.id ?? null)
                    : null;
                }}
              />
            </div>

            <div className="pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Field edits <span className="normal-case font-normal">· value-level diffs (edits and reassignments only)</span>
              </p>
              <div className="space-y-2.5 text-[11px]">
                {selectedFinding.editHistory && selectedFinding.editHistory.length > 0 ? (
                  selectedFinding.editHistory.slice().reverse().map((edit) => (
                    <div key={edit.editedAt} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#10b981" }} />
                      <div>
                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>Edited by {displayName({ name: edit.editedBy })}</p>
                        <p style={{ color: "var(--text-muted)" }}>{dayjs.utc(edit.editedAt).tz(timezone).format("DD/MM/YYYY hh:mm A")}</p>
                        {edit.reason && <p className="italic" style={{ color: "var(--text-secondary)" }}>&ldquo;{edit.reason}&rdquo;</p>}
                        {edit.changes.map((c, ci) => {
                          // "Owner" stores raw user IDs (assignFinding writes
                          // { field: "Owner", oldValue: <userId>, newValue: <userId> }),
                          // so render them through the shared resolver instead of the
                          // bare cuid. displayUserName falls back to "Unknown user" for
                          // an id that no longer resolves — it never leaks the id. Every
                          // other field holds a literal value and passes through as-is.
                          const fmt = (v: unknown) =>
                            c.field === "Owner" ? ownerName(String(v ?? "")) : String(v);
                          return (
                            <p key={ci} style={{ color: "var(--text-secondary)" }}>{c.field}: <span style={{ color: "#ef4444" }}>{fmt(c.oldValue)}</span>{" → "}<span style={{ color: "#10b981" }}>{fmt(c.newValue)}</span></p>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="italic" style={{ color: "var(--text-muted)" }}>No field edits recorded.</p>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* QA close — closing message + identity re-auth. Audited, NOT e-signed. */}
      {selectedFinding && (
        <FindingCloseModal
          open={closeModalOpen}
          onClose={() => { setCloseModalOpen(false); setReviewError(null); }}
          onConfirm={handleConfirmClose}
          busy={reviewBusy}
          error={reviewError}
          reference={findingRef(selectedFinding)}
          notesMin={FINDING_CLOSURE_NOTES_MIN}
          // Server-computed reveal — the client never evaluates the severity
          // ceiling. Flag on + non-Critical + a self-check tripped ⇒ a waiver is
          // required in addition to the signature. Same value `closeGate` uses to
          // decide whether the button that OPENS this modal is enabled, so the
          // two can never disagree.
          overrideNeeded={sodOverrideAvailable}
        />
      )}

      {/* Save success popup */}
      <Popup isOpen={savedPopup} variant="success" title="Finding updated" description="Changes saved and recorded in audit trail." onDismiss={() => setSavedPopup(false)} />
    </div>
  );
}
