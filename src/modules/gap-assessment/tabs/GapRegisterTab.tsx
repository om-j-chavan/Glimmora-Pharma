import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import {
  ClipboardList, Plus, Search, ChevronRight, Link2, Bot, Pencil, Save, Paperclip, Send, Wrench, CheckCircle2, Clock, X,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { frameworkLabel } from "@/constants/frameworks";
import { useAppSelector } from "@/hooks/useAppSelector";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreateCAPA, canEditFinding } from "@/lib/permissions/roleSets";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import type { FindingAssignee } from "@/lib/queries";
import { formatReference } from "@/lib/reference";
import { ExportMenu } from "@/components/ui/ExportMenu";
import type { Finding, FindingSeverity, FindingStatus } from "@/store/findings.slice";
import {
  updateFinding as updateFindingAction,
  assignFinding as assignFindingAction,
  reviewFinding as reviewFindingAction,
  reworkFinding as reworkFindingAction,
  postFindingMessage as postFindingMessageAction,
  loadFindingReview as loadFindingReviewAction,
  loadFindingDocuments as loadFindingDocumentsAction,
} from "@/actions/findings";
import { TaskThread } from "@/modules/worklist/DeviationTaskPanel";
import { DocumentCard } from "@/components/shared/DocumentCard";
import { worklistDocToCardView } from "@/components/shared/documentCardAdapters";
import type { WorklistTaskMessage, WorklistDoc } from "@/lib/queries/worklist";
import type { CAPA } from "@/store/capa.slice";
import { STATUS_LABEL as CAPA_STATUS_LABEL } from "@/types/capa";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/shared";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import { Dropdown } from "@/components/ui/Dropdown";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { displayName, displayUserName, displaySiteName } from "@/lib/identity-display";
import { roleLabel } from "@/lib/labels/roles";
import { DatePicker } from "@/components/ui/DatePicker";
import { RcaMethodFields, parseRcaDetail, rcaDetailToText, type RcaDetail } from "@/modules/capa/modals/components/RcaMethodFields";
import { CAPA_RCA_METHODS, rcaMethodOptions, type CapaRCAMethod } from "@/constants/rcaMethods";
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

/* ── Form type ── */
interface EditForm {
  requirement: string;
  purpose: string;
  owner: string;
  targetDate: string;
  evidenceLink: string;
  rootCause: string;
  rcaMethod?: string;
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
}

export function GapRegisterTab({
  filteredFindings, findingsTotal, assignees, selectedFinding, onSelectFinding,
  isViewOnly, users, timezone, dateFormat, capas,
  agiMode, agiCapa, isAnyFilterActive, renderFilters, onClearFilters,
  onAddOpen, onRaiseCapa, onNavigateCapa, onManageEvidence,
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

  // Gap Step 4 — QA review (accept / rework) + the conversation thread. Loaded
  // separately (the store Finding doesn't carry notes/messages).
  type FindingReview = { status: string; completionNotes: string | null; reworkReason: string | null; messages: WorklistTaskMessage[] };
  const [review, setReview] = useState<FindingReview | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reworkReasonInput, setReworkReasonInput] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Round 4 — the finding's uploaded evidence docs (read-only in the modal).
  const [findingDocs, setFindingDocs] = useState<WorklistDoc[]>([]);
  // #13 — Clock icon in the modal header opens a scrollable Audit Trail modal.
  const [auditModalOpen, setAuditModalOpen] = useState(false);

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

  // Item 4 — origin split (reuses the Worklist Detail pattern + shared DocumentCard):
  // docs uploaded by the finding's OWNER (the worklist assignee/worker) are the
  // "Worklist Documents"; docs uploaded by anyone else (QA/author, on the gap
  // detail) are "Gap Evidence". Origin is Document.uploadedById === finding.owner.
  const worklistDocs = findingDocs.filter((d) => !!d.uploadedById && d.uploadedById === selectedFinding?.owner);
  const gapDocs = findingDocs.filter((d) => !(d.uploadedById && d.uploadedById === selectedFinding?.owner));

  async function refreshReview() {
    if (!selectedFinding) return;
    const res = await loadFindingReviewAction(selectedFinding.id);
    if (res.success) setReview(res.data as FindingReview);
  }
  async function handleReviewAccept() {
    if (!selectedFinding) return;
    setReviewBusy(true); setReviewError(null);
    const res = await reviewFindingAction(selectedFinding.id);
    setReviewBusy(false);
    if (!res.success) { setReviewError(res.error || "Failed to accept."); return; }
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
  async function handlePostReviewMsg() {
    if (!selectedFinding || reviewMsg.trim().length === 0) return;
    const res = await postFindingMessageAction(selectedFinding.id, { body: reviewMsg.trim() });
    if (!res.success) { setReviewError(res.error || "Failed to post message."); return; }
    setReviewMsg(""); await refreshReview();
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
  const canEdit =
    !isViewOnly &&
    selectedFinding?.status !== "Closed" &&
    canEditFinding(role);

  const form = useForm<EditForm>({
    defaultValues: {
      requirement: "",
      purpose: "",
      owner: "",
      targetDate: "",
      evidenceLink: "",
      rootCause: "",
      rcaMethod: "",
    },
  });
  // Gap RCA (Batch B) — structured detail, prefilled from rcaDetail (or the
  // rootCause text for findings that predate it).
  const [detail, setDetail] = useState<RcaDetail>({});

  // Reset form when selected finding changes
  useEffect(() => {
    if (selectedFinding) {
      form.reset({
        requirement: selectedFinding.requirement,
        purpose: selectedFinding.purpose ?? "",
        owner: selectedFinding.owner,
        targetDate: selectedFinding.targetDate ? dayjs.utc(selectedFinding.targetDate).format("YYYY-MM-DD") : "",
        evidenceLink: selectedFinding.evidenceLink ?? "",
        rootCause: selectedFinding.rootCause ?? "",
        rcaMethod: selectedFinding.rcaMethod ?? "",
      });
      setDetail(seedRcaDetail(selectedFinding));
    }
    // Reset edit form when the selected finding changes.

    setIsEditing(false);
    setEditReason("");
    setSaveError("");
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

    // Gap RCA (Batch B) — serialize structured RCA: rootCause = readable mirror
    // (shared rcaDetailToText; preserve prior text if the structured fields are
    // empty), rcaDetail = JSON source. Mirrors CAPA's edit modal.
    const method = (data.rcaMethod || undefined) as CapaRCAMethod | undefined;
    const rcaText = (method ? rcaDetailToText(method, detail) : "") || (selectedFinding.rootCause ?? "");
    const rcaDetailJson = method ? JSON.stringify(detail) : undefined;

    const noChange =
      data.requirement === selectedFinding.requirement &&
      (data.purpose ?? "") === (selectedFinding.purpose ?? "") &&
      data.owner === selectedFinding.owner &&
      targetDateISO === selectedFinding.targetDate &&
      data.evidenceLink === (selectedFinding.evidenceLink ?? "") &&
      (rcaText ?? "") === (selectedFinding.rootCause ?? "") &&
      (data.rcaMethod ?? "") === (selectedFinding.rcaMethod ?? "") &&
      (rcaDetailJson ?? "") === (selectedFinding.rcaDetail ?? "");

    if (noChange) {
      setIsEditing(false);
      return;
    }

    const result = await updateFindingAction(selectedFinding.id, {
      requirement: data.requirement,
      purpose: data.purpose,
      owner: data.owner,
      targetDate: targetDateISO,
      evidenceLink: data.evidenceLink,
      rootCause: rcaText,
      rcaMethod: method,
      rcaDetail: rcaDetailJson,
      reason: editReason,
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

  const isOverdue = selectedFinding ? selectedFinding.status !== "Closed" && dayjs.utc(selectedFinding.targetDate).isBefore(dayjs()) : false;

  return (
    <div role="tabpanel" id="panel-register" aria-labelledby="tab-register" tabIndex={0}>
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

      {/* Table */}
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
            ) : selectedFinding.evidenceLink ? (
              <div>
                <h3 className={LABEL}>Evidence</h3>
                <span className="text-[12px] text-[#0ea5e9]">{selectedFinding.evidenceLink}</span>
              </div>
            ) : null}

            {/* ── Root cause analysis — method-driven (reuses CAPA's
                RcaMethodFields + canonical CAPA_RCA_METHODS). Prefills from
                rcaDetail; rootCause stays the readable mirror. ── */}
            {isEditing ? (
              <div>
                <label className={LABEL} htmlFor="edit-rcamethod">Root cause analysis <span className="text-[10px] font-normal italic">(optional)</span></label>
                <Controller
                  name="rcaMethod"
                  control={form.control}
                  render={({ field }) => (
                    <Dropdown value={field.value ?? ""} onChange={(v) => { field.onChange(v); if (!v) setDetail({}); }} placeholder="Select method..." width="w-full" options={[{ value: "", label: "— None" }, ...rcaMethodOptions(CAPA_RCA_METHODS)]} />
                  )}
                />
                <div className="mt-2">
                  <RcaMethodFields
                    method={(form.watch("rcaMethod") || undefined) as CapaRCAMethod | undefined}
                    detail={detail}
                    onChange={setDetail}
                    recordId={selectedFinding.id}
                    draftContext={[selectedFinding.requirement, selectedFinding.purpose].filter(Boolean).join("\n\n")}
                  />
                </div>
              </div>
            ) : selectedFinding.rootCause ? (
              <div>
                <h3 className={LABEL}>Root cause analysis {selectedFinding.rcaMethod && <Badge variant="gray">{selectedFinding.rcaMethod}</Badge>}</h3>
                <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{selectedFinding.rootCause}</p>
              </div>
            ) : null}

            {/* ── Edit reason (only in edit mode) ── */}
            {isEditing && (
              <div className="pt-4 border-t border-(--bg-border)">
                <label className={LABEL} htmlFor="edit-reason">
                  Reason for edit <span className="text-[10px] font-normal italic">(optional — helps audit trail)</span>
                </label>
                <input
                  id="edit-reason"
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                  placeholder="e.g. Wrong owner assigned, correcting typo..."
                />
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
                  <Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
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
                !isViewOnly && selectedFinding.status !== "Closed" && (
                  <div>
                    <h3 className={LABEL}>Disposition</h3>
                    {selectedFinding.severity === "Low" ? (
                      <>
                        <p className="text-[11px] mt-0.5 mb-1.5" style={{ color: "var(--text-secondary)" }}>
                          Low-severity gaps are worked as a lightweight assigned task (assign → submit → QA review), or raise a CAPA if systematic correction is needed.
                        </p>
                        {selectedFinding.status === "Open" ? (
                          // Not yet assigned — QA picks who works it (or raises a CAPA).
                          isQAHead ? (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Dropdown placeholder="Assign to…" value={assignTo} onChange={setAssignTo} width="w-56" size="sm" options={assignees.map((u) => ({ value: u.id, label: `${u.name} · ${roleLabel(u.role)}` }))} />
                                <Button variant="primary" size="sm" icon={Plus} disabled={assignBusy || !assignTo} loading={assignBusy} onClick={() => void handleAssignFinding()}>Assign person</Button>
                                {canRaiseCapa && <Button variant="secondary" size="sm" icon={Plus} onClick={() => onRaiseCapa(selectedFinding)}>Raise CAPA</Button>}
                              </div>
                              {assignError && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{assignError}</p>}
                            </>
                          ) : (
                            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Awaiting QA to assign an owner.</p>
                          )
                        ) : (
                          // Already assigned (in the work loop) — show the assignee
                          // read-only and hide the dropdown so it doesn't look
                          // re-assignable (mirrors the deviation "Assigned to X" task
                          // display). Raise CAPA stays available to escalate.
                          <>
                            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                              Assigned to <strong style={{ color: "var(--text-primary)" }}>{ownerName(selectedFinding.owner)}</strong>
                              {(() => { const u = users.find((x) => x.id === selectedFinding.owner); return u ? ` · ${roleLabel(u.role)}` : ""; })()}
                            </p>
                            {canRaiseCapa && (
                              <div className="mt-2"><Button variant="secondary" size="sm" icon={Plus} onClick={() => onRaiseCapa(selectedFinding)}>Raise CAPA</Button></div>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      canRaiseCapa ? (
                        <Button variant="secondary" icon={Plus} fullWidth onClick={() => onRaiseCapa(selectedFinding)}>Raise CAPA</Button>
                      ) : null
                    )}
                  </div>
                )
              );
            })()}

            {/* Gap Step 4 — QA review (accept / rework), the SUBMITTED EVIDENCE
                bundle, and the conversation thread. Positioned BELOW Disposition
                so QA reviews the whole submission (notes + evidence + thread) as
                the final decision surface (#9/#10). Shown once the finding enters
                the submit/rework loop. */}
            {review && (review.status === "Submitted" || review.status === "Rework" || review.messages.length > 0) && (
              <div className="rounded-lg border p-3 mt-3" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className={LABEL} style={{ margin: 0 }}>QA review</h3>
                  <Badge variant={review.status === "Submitted" ? "purple" : review.status === "Rework" ? "red" : review.status === "Closed" ? "green" : "amber"}>{review.status}</Badge>
                </div>
                {review.completionNotes && (
                  <p className="text-[12px] mt-1.5" style={{ color: "var(--text-secondary)" }}><span className="font-medium">Completion notes:</span> {review.completionNotes}</p>
                )}
                {/* Evidence — split by origin (shared <DocumentCard>): Gap Evidence
                    (gap-native) vs Worklist Documents (received from the worker). */}
                {findingDocs.length > 0 && (
                  <div className="mt-2 space-y-3">
                    <DocGroup label="Gap Evidence" docs={gapDocs} />
                    <DocGroup label="Worklist Documents" docs={worklistDocs} />
                  </div>
                )}
                {/* The rework reason renders ONCE — in the Conversation thread
                    below, where reworkFinding auto-posts it as a durable, attributed
                    FindingMessage. A separate "Returned:" banner here repeated the
                    exact same text (the duplicate-Rework render). */}
                {isQAHead && review.status === "Submitted" && (
                  <div className="flex gap-2 mt-2">
                    <Button variant="primary" size="sm" icon={CheckCircle2} disabled={reviewBusy} loading={reviewBusy} onClick={() => void handleReviewAccept()}>Accept &amp; close</Button>
                    <Button variant="secondary" size="sm" icon={Wrench} disabled={reviewBusy} onClick={() => { setReviewError(null); setReworkReasonInput(""); setReworkOpen(true); }}>Send for rework</Button>
                  </div>
                )}
                <div className="mt-3 pt-2 border-t" style={{ borderColor: "var(--bg-border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Conversation</p>
                  <TaskThread messages={review.messages} currentUserId={user?.id} fmt={(iso) => dayjs.utc(iso).tz(timezone).format(`${dateFormat} HH:mm`)} />
                  {review.status !== "Closed" && (
                    <div className="flex items-end gap-2 mt-2">
                      <textarea className="input text-[12px] w-full min-h-14" placeholder="Message the assignee…" value={reviewMsg} onChange={(e) => setReviewMsg(e.target.value)} maxLength={2000} />
                      <Button variant="secondary" size="sm" icon={Send} disabled={reviewMsg.trim().length === 0} onClick={() => void handlePostReviewMsg()}>Send</Button>
                    </div>
                  )}
                </div>
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
            {!(review && (review.status === "Submitted" || review.status === "Rework" || review.messages.length > 0)) && findingDocs.length > 0 && (
              <div className="pt-4 border-t border-(--bg-border) space-y-3">
                <DocGroup label="Gap Evidence" docs={gapDocs} />
                <DocGroup label="Worklist Documents" docs={worklistDocs} />
              </div>
            )}

            {/* #8 — the inline "Audit Trail" collapse was removed: it duplicated
                the header-clock Audit Trail modal below. No audit DATA is dropped
                — Created + CAPA-raised + linked-system + edit history all live in
                that modal now. */}

          </div>
        )}
      </Modal>

      {/* #13 — scrollable Audit Trail modal (opened by the header Clock icon). */}
      {auditModalOpen && selectedFinding && (
        <Modal open onClose={() => setAuditModalOpen(false)} title={`Audit Trail — ${findingRef(selectedFinding)}`}>
          <div className="max-h-[60vh] overflow-y-auto space-y-2.5 text-[11px] pr-1">
            {selectedFinding.createdAt && (
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "var(--brand)" }} />
                <div>
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>Created</p>
                  <p style={{ color: "var(--text-muted)" }}>{ownerName(selectedFinding.owner)} &mdash; {dayjs.utc(selectedFinding.createdAt).tz(timezone).format("DD/MM/YYYY hh:mm A")}</p>
                </div>
              </div>
            )}
            {/* #8 — CAPA-raised entry (folded in from the removed inline collapse). */}
            {selectedFinding.capaId && (() => {
              const linkedCapa = capas.find((c) => c.id === selectedFinding.capaId) ?? capas.find((c) => c.findingId === selectedFinding.id);
              return linkedCapa ? (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#f59e0b" }} />
                  <div>
                    <p className="font-medium" style={{ color: "var(--text-primary)" }}>CAPA raised &mdash; {linkedCapa.reference ?? linkedCapa.id}</p>
                    <p style={{ color: "var(--text-muted)" }}>{ownerName(linkedCapa.owner)} &mdash; {linkedCapa.createdAt ? dayjs.utc(linkedCapa.createdAt).tz(timezone).format("DD/MM/YYYY hh:mm A") : "—"}</p>
                  </div>
                </div>
              ) : null;
            })()}
            {selectedFinding.editHistory && selectedFinding.editHistory.slice().reverse().map((edit) => (
              <div key={edit.editedAt} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#10b981" }} />
                <div>
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>Edited by {displayName({ name: edit.editedBy })}</p>
                  <p style={{ color: "var(--text-muted)" }}>{dayjs.utc(edit.editedAt).tz(timezone).format("DD/MM/YYYY hh:mm A")}</p>
                  {edit.reason && <p className="italic" style={{ color: "var(--text-secondary)" }}>&ldquo;{edit.reason}&rdquo;</p>}
                  {edit.changes.map((c, ci) => (
                    <p key={ci} style={{ color: "var(--text-secondary)" }}>{c.field}: <span style={{ color: "#ef4444" }}>{String(c.oldValue)}</span>{" → "}<span style={{ color: "#10b981" }}>{String(c.newValue)}</span></p>
                  ))}
                </div>
              </div>
            ))}
            {/* #8 — linked-system entry (folded in from the removed inline collapse). */}
            {selectedFinding.linkedSystemName && (
              <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                Linked system: <span style={{ color: "var(--text-primary)" }}>{selectedFinding.linkedSystemName}</span>
              </p>
            )}
            {(!selectedFinding.editHistory || selectedFinding.editHistory.length === 0) && (
              <p style={{ color: "var(--text-muted)" }}>No edits recorded yet.</p>
            )}
          </div>
        </Modal>
      )}

      {/* Save success popup */}
      <Popup isOpen={savedPopup} variant="success" title="Finding updated" description="Changes saved and recorded in audit trail." onDismiss={() => setSavedPopup(false)} />
    </div>
  );
}
