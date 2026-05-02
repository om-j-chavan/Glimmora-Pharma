"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
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
import {
  addEvidenceFile,
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

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  NOT_APPLICABLE: "Not Applicable",
};

const STATUS_VARIANT: Record<EvidenceStatus, "gray" | "amber" | "green" | "blue"> = {
  PENDING: "gray",
  IN_PROGRESS: "amber",
  COMPLETE: "green",
  NOT_APPLICABLE: "blue",
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

export function EvidenceCollectionPanel({ capaId, readOnly = false }: EvidenceCollectionPanelProps) {
  const [items, setItems] = useState<EvidenceItemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await loadEvidenceForCAPA(capaId);
    if (!result.success) {
      setError(result.error);
      setItems([]);
      setLoading(false);
      return;
    }
    setError(null);
    setItems(result.data as EvidenceItemSummary[]);
    setLoading(false);
  }, [capaId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

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

  return (
    <div className="space-y-3">
      {/* Progress summary */}
      <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {completedCount} of {totalCategories} categories complete
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-border)" }}>
          <div
            className="h-full transition-all duration-200"
            style={{ width: `${progressPct}%`, background: "var(--brand)" }}
            aria-hidden="true"
          />
        </div>
      </div>

      {(items ?? []).map((item) => (
        <EvidenceCard key={item.id} item={item} readOnly={readOnly} onChange={refresh} />
      ))}
    </div>
  );
}

/* ── Per-category card ── */

interface CardProps {
  item: EvidenceItemSummary;
  readOnly: boolean;
  onChange: () => void;
}

function EvidenceCard({ item, readOnly, onChange }: CardProps) {
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
        return;
      }
      onChange();
    }, 1000);
    return () => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
    };
    // status intentionally excluded — its own handler already saved if it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, item.id, disabled]);

  const handleStatusChange = async (next: EvidenceStatus) => {
    if (disabled) return;
    const previous = status;
    setStatus(next);
    setSavingStatus(true);
    setCardError(null);
    const result = await updateEvidenceStatus(item.id, { status: next, notes });
    setSavingStatus(false);
    if (!result.success) {
      setStatus(previous);
      setCardError(result.error);
      return;
    }
    onChange();
  };

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

      {/* Status + notes */}
      <div className="grid grid-cols-[120px_1fr] gap-2 items-start mb-3">
        <select
          className="select text-[12px]"
          value={status}
          onChange={(e) => handleStatusChange(e.target.value as EvidenceStatus)}
          disabled={disabled || savingStatus}
          aria-label={`Status for ${CATEGORY_LABEL[item.category]}`}
        >
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETE">Complete</option>
          <option value="NOT_APPLICABLE">Not Applicable</option>
        </select>
        <div>
          <textarea
            className="input text-[12px] min-h-[60px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes — what evidence is being collected, by whom, why…"
            disabled={disabled}
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
      <FileList item={item} disabled={disabled} onChange={onChange} />

      {/* Note history modal */}
      {historyOpen && (
        <NoteHistoryModal
          evidenceItemId={item.id}
          categoryLabel={CATEGORY_LABEL[item.category]}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </article>
  );
}

/* ── File list with upload + remove ── */

interface FileListProps {
  item: EvidenceItemSummary;
  disabled: boolean;
  onChange: () => void;
}

function FileList({ item, disabled, onChange }: FileListProps) {
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
      {item.files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-2 rounded-md p-2 text-[11px]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
        >
          <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{f.fileName}</p>
            <p style={{ color: "var(--text-muted)" }}>
              {formatSize(f.fileSize)} · {f.uploadedBy} · {dayjs(f.createdAt).fromNow()} ·{" "}
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
          {!disabled && (
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
      ))}

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
          className="rounded-md p-3 text-center cursor-pointer transition-colors"
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
          <Upload className="w-4 h-4 mx-auto mb-1" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {uploading ? "Uploading…" : "Drag & drop or click to upload"}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            PDF, PNG, JPG, XLSX, DOCX, CSV, TXT · Max {MAX_MB} MB
          </p>
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

// Avoid an unused-import warning for the lucide-react icons we conditionally render.
void ShieldCheck;
