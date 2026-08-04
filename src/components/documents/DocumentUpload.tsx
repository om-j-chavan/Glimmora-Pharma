"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload, FileText, X, Eye, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { createDocument } from "@/actions/documents";

/**
 * Multi-file attachment picker for the server-fileStorage pipeline.
 *
 * This is a CONTROLLED collector: it holds no upload logic of its own — it just
 * manages a `File[]` (add / validate / de-dupe / per-file remove) and hands it
 * back via `onChange`. The parent decides WHEN to persist. That separation is
 * deliberate for the ticket flow: a ticket must exist before its attachments can
 * be linked (they need `linkedRecordId`), so the parent creates the ticket
 * first, then calls `uploadDocuments(files, { module, recordId })` with the
 * returned id.
 *
 * Purpose-built for the `createDocument(FormData) → fileStorage → /api/documents/[id]`
 * path. (components/shared/DocumentUpload persists an in-browser base64 dataUrl
 * and can't produce server-stored bytes that /api/documents/[id] can stream;
 * components/shared/StagedDocumentUpload is the same idea for modules whose
 * post-create upload goes through their own module action.)
 *
 * Validation is enforced in `addFiles`, not by the `accept` attribute alone —
 * a DROPPED file bypasses `accept` entirely, so type and size are both checked
 * in code and every rejection is reported through `onReject`.
 */

const DEFAULT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt";
const DEFAULT_MAX_MB = 10; // matches EVIDENCE_MAX_FILE_MB / createDocument's server cap

export interface DocumentUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  maxSizeMb?: number;
  /** Surfaced when a file is rejected client-side (type, size, duplicate). The
   *  server re-checks size and ownership regardless. */
  onReject?: (message: string) => void;
}

/** Human-readable size for the per-file row. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentUpload({
  files,
  onChange,
  disabled = false,
  accept = DEFAULT_ACCEPT,
  maxSizeMb = DEFAULT_MAX_MB,
  onReject,
}: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Extensions derived from the accept string so the two can never disagree.
  const allowed = accept.split(",").map((e) => e.trim().replace(/^\./, "").toLowerCase()).filter(Boolean);

  function addFiles(list: FileList | File[] | null) {
    if (!list || disabled) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (allowed.length > 0 && !allowed.includes(ext)) {
        onReject?.(`${f.name} isn't a supported file type.`);
        continue;
      }
      if (f.size > maxSizeMb * 1024 * 1024) {
        onReject?.(`${f.name} exceeds the ${maxSizeMb} MB limit.`);
        continue;
      }
      // De-dupe by name+size so double-selecting the same file is a no-op —
      // reported rather than silently swallowed, so the user isn't left
      // wondering why their second pick did nothing.
      if (next.some((x) => x.name === f.name && x.size === f.size)) {
        onReject?.(`${f.name} has already been added.`);
        continue;
      }
      next.push(f);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  // View a pending (not-yet-uploaded) file by opening a temporary object URL in
  // a new tab. Released after a delay so the new tab has time to load it.
  function view(f: File) {
    const url = URL.createObjectURL(f);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 rounded-lg border px-3 py-2 border-(--bg-border) bg-(--bg-surface)">
              <FileText className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate text-[12px]" style={{ color: "var(--text-primary)" }} title={f.name}>{f.name}</span>
              <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{formatSize(f.size)}</span>
              <button type="button" onClick={() => view(f)} aria-label={`View ${f.name}`} className="border-none bg-transparent cursor-pointer shrink-0 inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--brand)" }}>
                <Eye className="w-3.5 h-3.5" aria-hidden="true" /> View
              </button>
              {!disabled && (
                <button type="button" onClick={() => remove(i)} aria-label={`Remove ${f.name}`} className="border-none bg-transparent cursor-pointer shrink-0 inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <X className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={clsx(
            "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 cursor-pointer text-center transition-colors",
            dragOver ? "border-(--brand) bg-(--brand-muted)" : "border-(--bg-border) hover:border-(--brand)",
          )}
        >
          <Upload className="w-5 h-5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>Drag &amp; drop files here, or click to browse</span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>PDF, PNG, JPG, DOCX, XLSX, CSV, TXT · max {maxSizeMb} MB each · multiple allowed</span>
          <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
      )}
      {disabled && files.length === 0 && (
        <p className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          No files selected.
        </p>
      )}
    </div>
  );
}

/**
 * Persist collected files as Documents linked to a record, via the shared
 * `createDocument` server action (bytes → fileStorage → downloadable at
 * `/api/documents/[id]`). Returns per-file tallies so the caller can toast a
 * partial failure, plus the first error message so the caller can say WHY
 * rather than just "failed" (a role rejection reads very differently from a
 * size rejection).
 *
 * IMPORTANT — call this AFTER the parent record exists: each upload needs the
 * record's id for `linkedRecordId`. In the ticket flow the modal creates the
 * ticket first and passes the returned id here. (This is the correct ordering;
 * firing uploads before the record exists would orphan them.)
 *
 * NOTE: `createDocument` enforces the document-author role set (excludes viewer
 * and non-author site roles). A requester without an author role will see uploads
 * fail here — surface `failed` as a toast rather than a silent drop, and prefer
 * gating the UI on `usePermissions("evidence").canCreate` so the control never
 * renders for a role that can't use it.
 */
export async function uploadDocuments(
  files: File[],
  opts: { module: string; recordId: string },
  /** Per-file progress for a determinate "Uploading 2 of 5…" indicator. Fired
   *  after each file settles, so `done` counts attempts, not successes. */
  onProgress?: (done: number, total: number) => void,
): Promise<{ uploaded: number; failed: number; firstError?: string }> {
  let uploaded = 0;
  let failed = 0;
  let firstError: string | undefined;
  const total = files.length;
  for (const file of files) {
    const fd = new FormData();
    fd.set("fileName", file.name);
    fd.set("linkedModule", opts.module);
    fd.set("linkedRecordId", opts.recordId);
    fd.set("file", file);
    try {
      const res = await createDocument(fd);
      if (res.success) uploaded++;
      else {
        failed++;
        firstError ??= res.error;
      }
    } catch {
      failed++;
      firstError ??= "Upload failed. Please try again.";
    }
    onProgress?.(uploaded + failed, total);
  }
  return { uploaded, failed, firstError };
}
