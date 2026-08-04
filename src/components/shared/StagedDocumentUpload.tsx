"use client";

/**
 * <StagedDocumentUpload> — the ONE pre-create attachment picker.
 *
 * Used by "Add" forms where the record does not exist yet, so files cannot be
 * uploaded straight away: they are STAGED in the browser (the real `File` is
 * held) and the parent uploads them once the record has an id.
 *
 * This is the Gap Assessment "Upload evidence files" block extracted verbatim
 * from AddFindingModal (multi-file staging, <DocumentCard> previews with a
 * "Pending upload" pill, remove-behind-a-ConfirmModal), plus the two things
 * that block was missing and the shared <DocumentUpload> already had:
 *   • drag & drop onto the zone
 *   • supported-type + max-size validation, surfaced inline per rejected file
 * Both upload surfaces now validate against the SAME contract
 * (FILE_TYPE_ACCEPT / MAX_SIZE_MB, exported from DocumentUpload) — two pickers
 * accepting different files is a bug users only discover after picking one.
 *
 * State model: the parent OWNS the staged array (it has to — it is what gets
 * uploaded on submit). This component owns only the transient bits: drag-over,
 * per-pick rejection messages, and the pending-delete confirmation.
 *
 * Object-URL hygiene: every staged file carries a local object URL powering the
 * card's View button. Removal revokes it here; the parent must call
 * {@link revokeStagedFiles} when it discards the whole batch (on close / after
 * save) or the URLs leak for the lifetime of the document.
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Upload, Trash2, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { DocumentCard } from "@/components/shared/DocumentCard";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FILE_TYPE_ACCEPT, MAX_SIZE_MB } from "@/components/shared/DocumentUpload";

/** A file picked in an "Add" form, held client-side until the record exists. */
export interface StagedFile {
  /** Stable within the batch — used as the React key and the delete target. */
  id: string;
  /** The real File — this is what the parent uploads post-create. */
  file: File;
  name: string;
  sizeKb: number;
  /** Local object URL for the card's View button. Revoke when discarding. */
  url: string;
}

export interface StagedDocumentUploadProps {
  files: StagedFile[];
  /** Receives the next staged array (adds and removals both route through it). */
  onChange: (next: StagedFile[]) => void;
  /** Block title. */
  title?: string;
  /** One-line explanation of where these files end up. */
  hint?: string;
  disabled?: boolean;
  /** Per-card secondary line (e.g. Gap's inferred doc type). Size is appended. */
  metaFor?: (file: StagedFile) => string | undefined;
  /** Copy for the remove confirmation. */
  confirmTitle?: string;
  confirmMessage?: string;
}

/** Accepted extensions, derived from the shared accept string (".pdf,.doc,…"). */
const ACCEPTED_EXTENSIONS = FILE_TYPE_ACCEPT.split(",").map((e) => e.trim().replace(/^\./, "").toLowerCase());

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Revoke every staged object URL. Call from the parent when the batch is
 * discarded wholesale (modal close / after a successful save).
 */
export function revokeStagedFiles(files: StagedFile[]): void {
  files.forEach((f) => URL.revokeObjectURL(f.url));
}

export function StagedDocumentUpload({
  files,
  onChange,
  title = "Upload supporting documents",
  hint,
  disabled = false,
  metaFor,
  confirmTitle = "Remove this document?",
  confirmMessage = "It won't be uploaded with this record. You can add it again before saving.",
}: StagedDocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // Rejection messages from the LAST pick only — cleared on the next pick so
  // the list never accumulates stale complaints about files already dealt with.
  const [rejections, setRejections] = useState<string[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function addFiles(picked: File[]) {
    if (disabled || picked.length === 0) return;
    const rejected: string[] = [];
    const accepted: StagedFile[] = [];
    // Identity of an already-staged file — name+size+mtime, the same triple the
    // id is built from. Guards a double-pick of the same file.
    const seen = new Set(files.map((f) => `${f.name}|${f.file.size}|${f.file.lastModified}`));

    picked.forEach((file, i) => {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) {
        rejected.push(`${file.name} — unsupported file type.`);
        return;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        rejected.push(`${file.name} — larger than ${MAX_SIZE_MB} MB.`);
        return;
      }
      if (seen.has(key)) {
        rejected.push(`${file.name} — already added.`);
        return;
      }
      seen.add(key);
      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${files.length + i}`,
        file,
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        url: URL.createObjectURL(file),
      });
    });

    setRejections(rejected);
    if (accepted.length > 0) onChange([...files, ...accepted]);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    // Reset so re-picking the SAME file still fires a change event.
    e.currentTarget.value = "";
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files ?? []));
  }

  function confirmRemove() {
    if (!pendingDeleteId) return;
    const target = files.find((f) => f.id === pendingDeleteId);
    if (target) URL.revokeObjectURL(target.url);
    onChange(files.filter((f) => f.id !== pendingDeleteId));
    setPendingDeleteId(null);
  }

  return (
    <>
      <div className="rounded-lg border p-3" style={{ borderColor: "var(--bg-border)", background: "var(--bg-surface)" }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{title}</p>
            {hint && <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{hint}</p>}
          </div>
          <label className="inline-flex shrink-0">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={FILE_TYPE_ACCEPT}
              disabled={disabled}
              className="hidden"
              onChange={handleInputChange}
              aria-label="Choose files to upload"
            />
            <span
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium",
                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              )}
              style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              {files.length > 0 ? "Add more" : "Choose files"}
            </span>
          </label>
        </div>

        {/* Drop zone — click also opens the picker, so keyboard/mouse users who
            reach for the zone rather than the button get the same result. */}
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Drag and drop files here, or press Enter to browse"
          aria-disabled={disabled}
          onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => { if (!disabled) inputRef.current?.click(); }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); }
          }}
          className={clsx(
            "rounded-xl border-2 border-dashed p-5 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            dragOver ? "border-(--brand) bg-(--brand-muted)" : "border-(--bg-border) hover:border-(--brand)",
          )}
        >
          <Upload className="w-6 h-6 mx-auto mb-1.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>Drag &amp; drop files here</p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>or click to browse</p>
          <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
            Supported: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, TXT · Max {MAX_SIZE_MB} MB
          </p>
        </div>

        {/* Rejected picks — never silently dropped. */}
        {rejections.length > 0 && (
          <div role="alert" className="mt-2 flex items-start gap-2 p-2.5 rounded-lg" style={{ background: "var(--danger-bg)" }}>
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
            <ul className="list-none p-0 m-0 space-y-0.5">
              {rejections.map((r) => (
                <li key={r} className="text-[10px]" style={{ color: "var(--danger)" }}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Staged files — the shared <DocumentCard>, View opens the local file. */}
        {files.length > 0 && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {files.map((f) => {
              const extra = metaFor?.(f);
              return (
                <DocumentCard
                  key={f.id}
                  doc={{
                    id: f.id,
                    title: f.name,
                    meta: extra ? `${extra} · ${f.sizeKb} KB` : `${f.sizeKb} KB`,
                    badge: { label: "Pending upload", tone: "amber" },
                    viewHref: f.url,
                    downloadHref: null,
                  }}
                  onRemove={disabled ? undefined : () => setPendingDeleteId(f.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!pendingDeleteId}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={confirmRemove}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        icon={Trash2}
      />
    </>
  );
}
