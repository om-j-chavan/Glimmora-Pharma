"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  GraduationCap,
  History,
  Lock,
  ShieldCheck,
  Thermometer,
  Trash2,
  Truck,
  Upload,
  Users,
  Wrench,
  X,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { roleLabel } from "@/lib/labels/roles";
import {
  addEvidenceFile,
  addEvidenceFileToCategory,
  rejectEvidenceCategory,
  loadEvidenceForCAPA,
  loadEvidenceNoteHistory,
  removeEvidenceFile,
  updateEvidenceStatus,
} from "@/actions/evidence";
import {
  EVIDENCE_CATEGORIES,
  type EvidenceCategory,
  type EvidenceItemSummary,
  type EvidenceStatus,
} from "@/lib/queries/evidence";

interface EvidenceCollectionPanelProps {
  capaId: string;
  /** Disables every mutation (status, notes, upload, remove). Used when the parent
   *  CAPA is closed or the viewer is read-only. */
  readOnly?: boolean;
  /** Invoked after every successful items load with the per-status counts so
   *  the parent (e.g. the CAPA detail page) can render a tab badge like "3/7"
   *  without re-querying. Optional — panel works standalone without it. */
  onCountsChange?: (counts: { complete: number; inProgress: number; pending: number; total: number }) => void;
  /** Parent CAPA status — the QA reject control only shows at pending_qa_review. */
  capaStatus?: string;
  /** Viewer may disposition (reject) evidence — qa_head (CAPA_REJECT_ROLES). SoD:
   *  not the assignee/author. Combined with capaStatus === "pending_qa_review". */
  canRejectEvidence?: boolean;
  /** Worklist surface for the single assigned worker: enables upload +
   *  propose-N/A; hides QA/author-only controls (mark COMPLETE/IN_PROGRESS,
   *  edit notes, remove files). The server enforces the same — this is UX. */
  assigneeMode?: boolean;
}

const CATEGORY_LABEL: Record<EvidenceCategory, string> = {
  BATCH_RECORDS: "Batch Records",
  TRAINING_RECORDS: "Training Records",
  EQUIPMENT_LOGS: "Equipment Logs",
  ENVIRONMENTAL_DATA: "Environmental Data",
  DEVIATION_HISTORY: "Deviation History",
  WITNESS_INTERVIEWS: "Witness Interviews",
  SUPPLIER_DATA: "Supplier Data",
};

const CATEGORY_ICON: Record<EvidenceCategory, typeof FileText> = {
  BATCH_RECORDS: FileText,
  TRAINING_RECORDS: GraduationCap,
  EQUIPMENT_LOGS: Wrench,
  ENVIRONMENTAL_DATA: Thermometer,
  DEVIATION_HISTORY: AlertTriangle,
  WITNESS_INTERVIEWS: Users,
  SUPPLIER_DATA: Truck,
};

// Batch 4 Part 4 — at-a-glance labels: Pending / In progress / Answered / N/A.
const STATUS_LABEL: Record<EvidenceStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETE: "Answered",
  NOT_APPLICABLE: "N/A",
  REJECTED: "Rejected by QA",
};

const STATUS_VARIANT: Record<EvidenceStatus, "gray" | "amber" | "green" | "blue" | "red"> = {
  PENDING: "gray",
  IN_PROGRESS: "amber",
  COMPLETE: "green",
  NOT_APPLICABLE: "blue",
  REJECTED: "red",
};

const ALLOWED_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,text/plain";

const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
];

const MAX_MB = 10;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EvidenceCollectionPanel({ capaId, readOnly = false, onCountsChange, capaStatus, canRejectEvidence = false, assigneeMode = false }: EvidenceCollectionPanelProps) {
  const [items, setItems] = useState<EvidenceItemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // QA reject (per-evidence disposition) — only at pending_qa_review, qa_head.
  const canReject = canRejectEvidence && capaStatus === "pending_qa_review";
  const panelToast = useToast();
  const [rejectItem, setRejectItem] = useState<EvidenceItemSummary | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  // Per-category expanded state. Categories with any activity (status not
  // Pending OR files OR notes) seed expanded on first load; truly empty
  // categories collapse so the tab doesn't render seven near-empty cards
  // that bury the few that matter. The user's explicit toggles after that
  // win — `expandedSet === null` is the "before first items load" sentinel
  // so the seed-from-items effect can run exactly once.
  const [expandedSet, setExpandedSet] = useState<Set<string> | null>(null);

  function toggleExpanded(category: string) {
    setExpandedSet((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function expandAll() {
    setExpandedSet(new Set(EVIDENCE_CATEGORIES));
  }

  function collapseAll() {
    setExpandedSet(new Set());
  }

  const isExpanded = (category: string): boolean =>
    (expandedSet ?? new Set<string>()).has(category);

  const refresh = useCallback(async () => {
    const result = await loadEvidenceForCAPA(capaId);
    if (!result.success) {
      setError(result.error);
      setItems([]);
      setLoading(false);
      return;
    }
    setError(null);
    const loaded = result.data as EvidenceItemSummary[];
    setItems(loaded);
    setLoading(false);
    if (onCountsChange) {
      // Treat NOT_APPLICABLE the same as COMPLETE for the "X of N done"
      // tally — both are terminal states that don't need follow-up. PENDING
      // is the only true "not yet started" state for the badge.
      const total = EVIDENCE_CATEGORIES.length;
      let complete = 0;
      let inProgress = 0;
      let pending = 0;
      for (const it of loaded) {
        if (it.status === "COMPLETE" || it.status === "NOT_APPLICABLE") complete++;
        else if (it.status === "IN_PROGRESS") inProgress++;
        else pending++;
      }
      onCountsChange({ complete, inProgress, pending, total });
    }
  }, [capaId, onCountsChange]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // QA rejects ONE evidence category in place — sets it REJECTED and re-opens
  // just that category for the assignee. The CAPA stays in pending_qa_review
  // (no whole-CAPA bounce). Reason required (≥ 5).
  async function handleRejectEvidence() {
    if (!rejectItem) return;
    if (rejectReason.trim().length < 5) { setRejectError("Add a brief reason (at least 5 characters)."); return; }
    setRejecting(true);
    setRejectError(null);
    const res = await rejectEvidenceCategory(rejectItem.id, { reason: rejectReason.trim() });
    setRejecting(false);
    if (!res.success) { setRejectError(res.error || "Could not reject evidence."); panelToast.error(res.error || "Could not reject evidence."); return; }
    setRejectItem(null);
    setRejectReason("");
    panelToast.success("Evidence rejected — returned to the assignee for rework (CAPA stays in QA review).");
    await refresh();
  }

  // Batch 4 Part 4 — every category collapsed by default (the status pill +
  // file count make the row legible without expanding). Seeds once on first
  // load; manual toggles afterward aren't undone by a save round-trip.
  useEffect(() => {
    if (expandedSet !== null || items === null) return;
    setExpandedSet(new Set());
  }, [items, expandedSet]);

  if (loading && items === null) {
    return (
      <div role="status" aria-live="polite" className="py-8 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        Loading evidence categories…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="alert alert-danger">
        {error}
      </div>
    );
  }

  const totalCategories = EVIDENCE_CATEGORIES.length;
  const completedCount = (items ?? []).filter(
    (it) => it.status === "COMPLETE" || it.status === "NOT_APPLICABLE",
  ).length;
  const progressPct = Math.round((completedCount / totalCategories) * 100);
  // Whole-CAPA lock state — set when the CAPA has progressed to QA review,
  // closed, or rejected. lockEvidenceForCAPA flips every item at once, so
  // .some() and .every() agree. We use .some() for an early-warning banner
  // even if a future change ever lands a partial-lock state.
  const isLocked = (items ?? []).some((it) => it.isLocked);

  return (
    <div className="space-y-3">
      {/* Whole-tab lock banner (REQ-3). Per-card warning still appears below. */}
      {isLocked && (
        <div role="status" className="alert alert-info flex items-start gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[12px] font-semibold">Evidence collection locked</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              The parent CAPA has progressed to QA review. Re-open the CAPA to
              modify evidence.
            </p>
          </div>
        </div>
      )}

      {/* Progress summary + expand/collapse toggle. The toggle is purely
          UI convenience; expansion state is transient (lost on tab swap)
          per spec — it isn't a user preference worth persisting. */}
      <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {completedCount} of {totalCategories} categories complete
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAll}
              className="text-[11px] underline border-none bg-transparent cursor-pointer p-0"
              style={{ color: "var(--brand)" }}
              aria-label="Expand all categories"
            >
              Expand all
            </button>
            <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>·</span>
            <button
              type="button"
              onClick={collapseAll}
              className="text-[11px] underline border-none bg-transparent cursor-pointer p-0"
              style={{ color: "var(--brand)" }}
              aria-label="Collapse all categories"
            >
              Collapse all
            </button>
            <span className="text-[11px] ml-2" style={{ color: "var(--text-muted)" }}>{progressPct}%</span>
          </div>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-border)" }}>
          <div
            className="h-full transition-all duration-200"
            style={{ width: `${progressPct}%`, background: "var(--brand)" }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* STEP 2 — single uploader with a category dropdown; files auto-file into
          the chosen GxP category. Hidden when read-only or while the CAPA is
          locked for QA review (a re-opened category uses its own card upload). */}
      {!readOnly && !isLocked && <CategoryUpload capaId={capaId} onChange={refresh} />}

      {(items ?? []).map((item) => (
        <EvidenceCard
          key={item.id}
          item={item}
          readOnly={readOnly}
          onChange={refresh}
          isExpanded={isExpanded(item.category)}
          onToggleExpanded={() => toggleExpanded(item.category)}
          canReject={canReject}
          assigneeMode={assigneeMode}
          onReject={() => { setRejectItem(item); setRejectReason(""); setRejectError(null); }}
        />
      ))}

      {/* QA per-evidence reject modal (qa_head @ pending_qa_review). */}
      {rejectItem && (
        <Modal open onClose={() => { if (!rejecting) { setRejectItem(null); setRejectError(null); } }} title={`Reject "${CATEGORY_LABEL[rejectItem.category]}" evidence`}>
          <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
            Rejecting re-opens <strong>just this category</strong> for the assignee to re-work; the CAPA stays in <strong>QA review</strong>. Record why it&rsquo;s inadequate (≥ 5 characters).
          </p>
          <textarea
            className="input text-[12px] w-full min-h-20"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={2000}
            placeholder="e.g. Batch record is illegible / missing the deviation reference…"
          />
          {rejectError && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{rejectError}</p>}
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="secondary" size="sm" disabled={rejecting} onClick={() => { setRejectItem(null); setRejectError(null); }}>Cancel</Button>
            <Button variant="danger" size="sm" disabled={rejecting || rejectReason.trim().length < 5} loading={rejecting} onClick={() => void handleRejectEvidence()}>Reject evidence</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Single uploader with a category dropdown (STEP 2) ── */

function CategoryUpload({ capaId, onChange }: { capaId: string; onChange: () => void }) {
  const [category, setCategory] = useState<EvidenceCategory>(EVIDENCE_CATEGORIES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPick = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setErr(null);
      if (file.size > MAX_MB * 1024 * 1024) { setErr(`File exceeds ${MAX_MB} MB limit`); return; }
      if (!ALLOWED_MIME_PREFIXES.some((m) => file.type === m)) { setErr("File type not allowed"); return; }
      const fd = new FormData();
      fd.append("file", file);
      setBusy(true);
      const res = await addEvidenceFileToCategory(capaId, category, fd);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      if (!res.success) { setErr(res.error); return; }
      onChange();
    },
    [capaId, category, onChange],
  );

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
      <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>Add evidence</p>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="input text-[12px]"
          value={category}
          onChange={(e) => setCategory(e.target.value as EvidenceCategory)}
          disabled={busy}
          aria-label="Evidence category"
        >
          {EVIDENCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          disabled={busy}
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
        <Button variant="secondary" size="sm" icon={Upload} disabled={busy} loading={busy} onClick={() => inputRef.current?.click()}>
          Upload to category
        </Button>
      </div>
      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
        Picks the GxP category and files your document there. Max {MAX_MB} MB.
      </p>
      {err && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{err}</p>}
    </div>
  );
}

/* ── Per-category card ── */

interface CardProps {
  item: EvidenceItemSummary;
  readOnly: boolean;
  onChange: () => void;
  /** When false, the card renders as a single-row collapsed summary
   *  with a chevron. Click anywhere on the row toggles via
   *  onToggleExpanded. The card body (status, notes, files, drop area)
   *  is unmounted in collapsed state so its useEffects don't run. */
  isExpanded: boolean;
  onToggleExpanded: () => void;
  /** QA reviewer may reject this evidence item (qa_head @ pending_qa_review). */
  canReject?: boolean;
  /** Assignee surface — restrict the status dropdown to propose-N/A, lock notes,
   *  hide file-remove. Upload stays enabled (server allows the assignee). */
  assigneeMode?: boolean;
  onReject?: () => void;
}

function EvidenceCard({ item, readOnly, onChange, isExpanded, onToggleExpanded, canReject = false, assigneeMode = false, onReject }: CardProps) {
  const toast = useToast();
  const Icon = CATEGORY_ICON[item.category];
  const locked = item.isLocked;
  const disabled = readOnly || locked;

  // Local state mirrors server values until next refresh, with debounce on notes.
  const [status, setStatus] = useState<EvidenceStatus>(item.status);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Sync local state when parent refreshes us with new server values.
  useEffect(() => {
    setStatus(item.status);
    setNotes(item.notes ?? "");
  }, [item.status, item.notes, item.updatedAt]);

  // Debounced notes save (1 second after typing stops).
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialNotes = useRef(item.notes ?? "");
  useEffect(() => {
    initialNotes.current = item.notes ?? "";
  }, [item.notes, item.id]);

  useEffect(() => {
    if (disabled) return;
    if (notes === initialNotes.current) return;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setSavingNotes(true);
      setCardError(null);
      const result = await updateEvidenceStatus(item.id, { status, notes });
      setSavingNotes(false);
      if (!result.success) {
        setCardError(result.error);
        toast.error(result.error || "Could not save evidence notes.");
        return;
      }
      toast.success("Evidence notes saved.");
      onChange();
    }, 1000);
    return () => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
    };
    // status intentionally excluded — its own handler already saved if it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, item.id, disabled]);

  // Track an NA-related transition that needs a reason. Setting this opens
  // the NAReasonModal; submitting it calls commitStatusChange with the
  // reason; cancelling reverts the dropdown to its previous value.
  const [pendingNATransition, setPendingNATransition] = useState<EvidenceStatus | null>(null);

  const commitStatusChange = async (
    next: EvidenceStatus,
    naReason?: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const previous = status;
    setStatus(next);
    setSavingStatus(true);
    setCardError(null);
    const result = await updateEvidenceStatus(item.id, {
      status: next,
      notes,
      ...(naReason ? { naReason } : {}),
    });
    setSavingStatus(false);
    if (!result.success) {
      setStatus(previous);
      setCardError(result.error);
      toast.error(result.error || "Could not update evidence.");
      return { ok: false, error: result.error };
    }
    toast.success("Evidence updated.");
    onChange();
    return { ok: true };
  };

  const handleStatusChange = async (next: EvidenceStatus) => {
    if (disabled) return;
    if (next === status) return;
    // NA transitions (to or from) require a reason — defer until the modal
    // collects it. Server still re-validates min length (defence in depth).
    const transitioningToNA = status !== "NOT_APPLICABLE" && next === "NOT_APPLICABLE";
    const transitioningFromNA = status === "NOT_APPLICABLE" && next !== "NOT_APPLICABLE";
    if (transitioningToNA || transitioningFromNA) {
      setPendingNATransition(next);
      return;
    }
    await commitStatusChange(next);
  };

  // Collapsed-row variant — single-line summary the user can click to
  // expand. Defined after all the card's hooks so React's hook ordering
  // stays stable as expansion state toggles. The expanded variant below
  // is rendered when isExpanded is true.
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={false}
        aria-label={`Expand ${CATEGORY_LABEL[item.category]}`}
        className="w-full flex items-center gap-3 rounded-lg p-2.5 text-left cursor-pointer transition-colors duration-150 hover:bg-(--bg-hover)"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "var(--brand-muted)" }}
          aria-hidden="true"
        >
          <Icon className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
            {CATEGORY_LABEL[item.category]}
          </p>
          {/* FIX 3 — clarity: a category with files that isn't resolved yet says
              so explicitly (amber) instead of a silent count, so a fresh upload
              on a collapsed row reads as "there but not done", not "missing". */}
          {(() => {
            const n = item.files.length;
            const resolved = status === "COMPLETE" || status === "NOT_APPLICABLE";
            const unresolvedWithFiles = n > 0 && !resolved;
            const text = n > 0
              ? (resolved
                  ? `${n} file${n === 1 ? "" : "s"} attached`
                  : `${n} file${n === 1 ? "" : "s"} • not yet marked resolved`)
              : status === "NOT_APPLICABLE"
                ? "Marked not applicable"
                : status === "COMPLETE"
                  ? "Answered — no files"
                  : "No files yet";
            return (
              <p className="text-[10px]" style={{ color: unresolvedWithFiles ? "var(--status-waiting)" : "var(--text-muted)" }}>
                {text}
              </p>
            );
          })()}
        </div>
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        <ChevronRight
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: "var(--text-muted)" }}
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <article
      className="rounded-lg p-3"
      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      aria-labelledby={`ev-${item.id}-heading`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 mb-2">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "var(--brand-muted)" }}
          aria-hidden="true"
        >
          <Icon className="w-4 h-4" style={{ color: "var(--brand)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 id={`ev-${item.id}-heading`} className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {CATEGORY_LABEL[item.category]}
          </h4>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {item.files.length} file{item.files.length === 1 ? "" : "s"}
            {item.deletedFileCount > 0 && ` · ${item.deletedFileCount} removed`}
          </p>
        </div>
        {/* Collapse button — always available on the expanded card so the
            user can re-fold a category they're done with. */}
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={`Collapse ${CATEGORY_LABEL[item.category]}`}
          className="p-1 rounded border-none bg-transparent cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          title="Collapse"
        >
          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {item.hasNoteHistory && (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="p-1 rounded border-none bg-transparent cursor-pointer"
              style={{ color: "var(--brand)" }}
              aria-label={`View notes history for ${CATEGORY_LABEL[item.category]}`}
              title="View notes history"
            >
              <History className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        </div>
      </div>

      {locked && (
        <div className="mb-2 flex items-start gap-2 rounded-md p-2" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "var(--warning)" }} aria-hidden="true" />
          <p className="text-[11px]" style={{ color: "var(--warning)" }}>
            This evidence package was locked. Contact QA to unlock.
          </p>
        </div>
      )}

      {/* QA rejection — red pin so the driver sees exactly what to fix
          (mirrors the action-item rework banner). */}
      {item.status === "REJECTED" && (
        <div className="mb-2 flex items-start gap-2 rounded-md p-2" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}>
          <p className="text-[11px]" style={{ color: "var(--danger)" }}>
            <strong>Rejected by QA:</strong> {item.rejectionReason || "Re-work required before resubmission."}
          </p>
        </div>
      )}

      {/* QA reviewer reject control (qa_head @ pending_qa_review only — SoD). */}
      {canReject && item.status !== "REJECTED" && (
        <div className="mb-2">
          <Button variant="danger" size="xs" onClick={onReject}>Reject this evidence</Button>
        </div>
      )}

      {/* Phase B G2 — teaching empty state for a pending category. */}
      {status === "PENDING" && !locked && (
        <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
          Needs files or N/A + reason. The assigned worker uploads evidence; QA reviews and marks it complete.
        </p>
      )}

      {/* Status + notes */}
      <div className="grid grid-cols-[150px_1fr] gap-2 items-start mb-3">
        <Dropdown
          value={status}
          onChange={(v) => void handleStatusChange(v as EvidenceStatus)}
          // Assignee may only PROPOSE N/A (server allows assignee → NOT_APPLICABLE
          // only); COMPLETE/IN_PROGRESS stay QA/author. Once N/A, exiting is
          // author-only, so the control locks.
          disabled={disabled || savingStatus || (assigneeMode && status === "NOT_APPLICABLE")}
          width="w-full"
          options={(assigneeMode
            ? Array.from(new Set<EvidenceStatus>([status, "NOT_APPLICABLE"]))
            : (["PENDING", "IN_PROGRESS", "COMPLETE", "NOT_APPLICABLE"] as EvidenceStatus[])
          ).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
        <div>
          <textarea
            className="input text-[12px] min-h-[60px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes — what evidence is being collected, by whom, why…"
            disabled={disabled || assigneeMode}
            aria-label={`Notes for ${CATEGORY_LABEL[item.category]}`}
            maxLength={10_000}
          />
          {savingNotes && (
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Saving…</p>
          )}
        </div>
      </div>

      {cardError && (
        <p role="alert" className="text-[11px] mb-2" style={{ color: "var(--danger)" }}>
          {cardError}
        </p>
      )}

      {/* Files */}
      <FileList item={item} disabled={disabled} assigneeMode={assigneeMode} onChange={onChange} />

      {/* Note history modal */}
      {historyOpen && (
        <NoteHistoryModal
          evidenceItemId={item.id}
          categoryLabel={CATEGORY_LABEL[item.category]}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {/* NA-transition reason modal (REQ-1) */}
      {pendingNATransition && (
        <NAReasonModal
          fromStatus={status}
          toStatus={pendingNATransition}
          categoryLabel={CATEGORY_LABEL[item.category]}
          onCancel={() => setPendingNATransition(null)}
          onSubmit={async (reason) => {
            const target = pendingNATransition;
            const result = await commitStatusChange(target, reason);
            if (result.ok) setPendingNATransition(null);
            return result;
          }}
        />
      )}
    </article>
  );
}

/* ── File list with upload + remove ── */

interface FileListProps {
  item: EvidenceItemSummary;
  disabled: boolean;
  /** Assignee surface — keep upload, hide the author-only file-remove control. */
  assigneeMode?: boolean;
  onChange: () => void;
}

function FileList({ item, disabled, assigneeMode = false, onChange }: FileListProps) {
  // CAPA Evidence batch — resolve the uploader's role for file provenance.
  const { users } = useTenantConfig();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removeFor, setRemoveFor] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setUploadError(null);
      // Client-side guards (server re-validates).
      if (file.size > MAX_MB * 1024 * 1024) {
        setUploadError(`File exceeds ${MAX_MB} MB limit`);
        return;
      }
      const mimeOk = ALLOWED_MIME_PREFIXES.some((m) => file.type === m);
      if (!mimeOk) {
        setUploadError("File type not allowed");
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      setUploading(true);
      const result = await addEvidenceFile(item.id, fd);
      setUploading(false);
      if (!result.success) {
        setUploadError(result.error);
        return;
      }
      onChange();
    },
    [item.id, onChange],
  );

  return (
    <div className="space-y-1.5">
      {item.files.length === 0 && (
        <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
          No files uploaded yet.
        </p>
      )}
      {item.files.map((f) => {
        // Full provenance: resolve the uploader's role for name + role display.
        const uploaderUser = f.uploadedById ? users.find((x) => x.id === f.uploadedById) : undefined;
        const uploaderLabel = uploaderUser ? `${f.uploadedBy} (${roleLabel(uploaderUser.role)})` : f.uploadedBy;
        return (
        <div
          key={f.id}
          className="flex items-center gap-2 rounded-md p-2 text-[11px]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
        >
          <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{f.fileName}</p>
            <p style={{ color: "var(--text-muted)" }}>
              {CATEGORY_LABEL[item.category]} · {formatSize(f.fileSize)} · {uploaderLabel} · {dayjs(f.createdAt).fromNow()} ·{" "}
              <span title={`SHA-256: ${f.contentHashSha256}`} className="font-mono">
                SHA {f.contentHashSha256.slice(0, 8)}
              </span>
            </p>
          </div>
          <a
            href={`/api/evidence/files/${f.id}`}
            className="p-1 rounded border-none cursor-pointer"
            style={{ color: "var(--brand)" }}
            aria-label={`Download ${f.fileName}`}
            title="Download"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
          {!disabled && !assigneeMode && (
            <button
              type="button"
              onClick={() => setRemoveFor(f.id)}
              className="p-1 rounded border-none bg-transparent cursor-pointer"
              style={{ color: "var(--danger)" }}
              aria-label={`Remove ${f.fileName}`}
              title="Remove (requires reason)"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        );
      })}

      {!disabled && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFiles(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className="rounded-md px-3 py-2 cursor-pointer transition-colors flex items-center gap-2"
          style={{
            border: `1px dashed ${dragOver ? "var(--brand)" : "var(--bg-border)"}`,
            background: dragOver ? "var(--brand-muted)" : "transparent",
          }}
          role="button"
          tabIndex={0}
          aria-label="Upload evidence file"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          {/* Batch 4 Part 4 — compact single-row dropzone (was a large box). */}
          <Upload className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {uploading ? "Uploading…" : "Drag & drop or click to upload"}
          </span>
          <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
            Max {MAX_MB} MB
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files?.[0]);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </div>
      )}

      {uploadError && (
        <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>
          {uploadError}
        </p>
      )}

      {removeFor && (
        <RemoveFileModal
          fileId={removeFor}
          fileName={item.files.find((x) => x.id === removeFor)?.fileName ?? ""}
          onClose={() => setRemoveFor(null)}
          onRemoved={() => {
            setRemoveFor(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}

/* ── Remove-file modal (requires reason) ── */

interface RemoveModalProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
  onRemoved: () => void;
}

function RemoveFileModal({ fileId, fileName, onClose, onRemoved }: RemoveModalProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal open onClose={onClose} title={`Remove ${fileName}`}>
      <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
        Soft-delete only — the underlying file remains on disk and the audit
        trail records the removal. A reason of at least 10 characters is
        required per Part 11.
      </p>
      <textarea
        className="input text-[12px] min-h-[80px] mb-2"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this file being removed?"
        aria-label="Deletion reason"
        maxLength={500}
      />
      {err && (
        <p role="alert" className="text-[11px] mb-2" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--bg-border)" }}>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          size="sm"
          icon={Trash2}
          disabled={busy || reason.trim().length < 10}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const result = await removeEvidenceFile(fileId, { reason: reason.trim() });
            setBusy(false);
            if (!result.success) {
              setErr(result.error);
              return;
            }
            onRemoved();
          }}
        >
          {busy ? "Removing…" : "Remove file"}
        </Button>
      </div>
    </Modal>
  );
}

/* ── Note-history modal ── */

interface HistoryProps {
  evidenceItemId: string;
  categoryLabel: string;
  onClose: () => void;
}

function NoteHistoryModal({ evidenceItemId, categoryLabel, onClose }: HistoryProps) {
  type Version = {
    id: string;
    notes: string;
    statusAtTime: string;
    createdBy: string;
    createdAt: Date;
  };
  type Loaded = {
    current: { notes: string | null; status: EvidenceStatus };
    versions: Version[];
  };
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadEvidenceNoteHistory(evidenceItemId)
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          setErr(result.error);
        } else {
          setData(result.data as Loaded);
        }
      })
      .catch((reason) => {
        // Without this catch, a network/server crash leaves both `data`
        // and `err` null forever — the modal renders a permanent
        // "Loading…" state with no recovery. Routing rejection through
        // the same setErr the modal already renders means the user sees
        // the existing role="alert" red message and can close + reopen
        // to retry.
        if (cancelled) return;
        console.error(
          "[EvidenceCollectionPanel] loadEvidenceNoteHistory failed:",
          reason,
        );
        setErr("Couldn't load notes history. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [evidenceItemId]);

  return (
    <Modal open onClose={onClose} title={`Notes history — ${categoryLabel}`}>
      {err && (
        <p role="alert" className="text-[12px]" style={{ color: "var(--danger)" }}>{err}</p>
      )}
      {!data && !err && (
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</p>
      )}
      {data && (
        <div className="space-y-3">
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
              Current ({data.current.status})
            </h3>
            <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
              {data.current.notes ?? <em style={{ color: "var(--text-muted)" }}>No notes</em>}
            </p>
          </section>
          {data.versions.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No prior versions.</p>
          ) : (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Previous versions
              </h3>
              <ol className="space-y-2">
                {data.versions.map((v) => (
                  <li key={v.id} className="rounded-md p-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                    <div className="flex items-center gap-2 mb-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      <span>{dayjs(v.createdAt).format("DD MMM YYYY HH:mm")}</span>
                      <span>·</span>
                      <span>{v.createdBy}</span>
                      <span>·</span>
                      <Badge variant={STATUS_VARIANT[v.statusAtTime as EvidenceStatus] ?? "gray"}>
                        {STATUS_LABEL[v.statusAtTime as EvidenceStatus] ?? v.statusAtTime}
                      </Badge>
                    </div>
                    <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{v.notes}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
      <div className="flex justify-end pt-3 mt-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
        <Button variant="secondary" size="sm" icon={X} onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

/* ── NA-transition reason modal ── */

interface NAReasonProps {
  fromStatus: EvidenceStatus;
  toStatus: EvidenceStatus;
  categoryLabel: string;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

function NAReasonModal({ fromStatus, toStatus, categoryLabel, onCancel, onSubmit }: NAReasonProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const direction = toStatus === "NOT_APPLICABLE" ? "to-na" : "from-na";
  const title =
    direction === "to-na"
      ? `Mark ${categoryLabel} as Not Applicable`
      : `Change ${categoryLabel} from Not Applicable`;
  const blurb =
    direction === "to-na"
      ? "Per Part 11 ALCOA+, marking a category Not Applicable requires a recorded rationale (≥10 characters)."
      : `Reverting from Not Applicable to ${STATUS_LABEL[toStatus]} requires a recorded rationale (≥10 characters).`;

  const reasonValid = reason.trim().length >= 10;

  return (
    <Modal open onClose={busy ? () => undefined : onCancel} title={title}>
      <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
        {blurb}
      </p>
      <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
        {STATUS_LABEL[fromStatus]} → {STATUS_LABEL[toStatus]}
      </p>
      <textarea
        className="input text-[12px] min-h-[80px] mb-2"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this category being marked / unmarked Not Applicable?"
        aria-label="NA transition reason"
        maxLength={2000}
        disabled={busy}
      />
      {err && (
        <p role="alert" className="text-[11px] mb-2" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--bg-border)" }}>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !reasonValid}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const result = await onSubmit(reason.trim());
            setBusy(false);
            if (!result.ok) setErr(result.error);
          }}
        >
          {busy ? "Saving…" : "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}

// Avoid an unused-import warning for the lucide-react icons we conditionally render.
void ShieldCheck;
