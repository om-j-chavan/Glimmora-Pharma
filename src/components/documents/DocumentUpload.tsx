"use client";

import { useRef } from "react";
import { Upload, FileText, X, Eye } from "lucide-react";
import { createDocument } from "@/actions/documents";

/**
 * Multi-file attachment picker for the server-fileStorage pipeline.
 *
 * This is a CONTROLLED collector: it holds no upload logic of its own — it just
 * manages a `File[]` (add / de-dupe / per-file remove) and hands it back via
 * `onChange`. The parent decides WHEN to persist. That separation is deliberate
 * for the ticket flow: a ticket must exist before its attachments can be linked
 * (they need `linkedRecordId`), so the parent creates the ticket first, then
 * calls `uploadDocuments(files, { module, recordId })` with the returned id.
 *
 * Purpose-built for the `createDocument(FormData) → fileStorage → /api/documents/[id]`
 * path. (components/shared/DocumentUpload persists an in-browser base64 dataUrl
 * and can't produce server-stored bytes that /api/documents/[id] can stream.)
 */

const DEFAULT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt";
const DEFAULT_MAX_MB = 10; // matches EVIDENCE_MAX_FILE_MB / createDocument's server cap

export interface DocumentUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  maxSizeMb?: number;
  /** Surfaced when a file is rejected client-side (size). The server re-checks. */
  onReject?: (message: string) => void;
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

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > maxSizeMb * 1024 * 1024) {
        onReject?.(`${f.name} exceeds the ${maxSizeMb} MB limit.`);
        continue;
      }
      // De-dupe by name+size so double-selecting the same file is a no-op.
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
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

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 rounded-lg border px-3 py-2 border-(--bg-border) bg-(--bg-surface)">
              <FileText className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate text-[12px]" style={{ color: "var(--text-primary)" }} title={f.name}>{f.name}</span>
              <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
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
        <label className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 cursor-pointer text-center transition-colors border-(--bg-border) hover:border-(--brand)">
          <Upload className="w-5 h-5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>Click to add files</span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>PDF, PNG, JPG, DOCX, XLSX, CSV, TXT · max {maxSizeMb} MB each · multiple allowed</span>
          <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
      )}
    </div>
  );
}

/**
 * Persist collected files as Documents linked to a record, via the shared
 * `createDocument` server action (bytes → fileStorage → downloadable at
 * `/api/documents/[id]`). Returns per-file tallies so the caller can toast a
 * partial failure.
 *
 * IMPORTANT — call this AFTER the parent record exists: each upload needs the
 * record's id for `linkedRecordId`. In the ticket flow the modal creates the
 * ticket first and passes the returned id here. (This is the correct ordering;
 * firing uploads before the record exists would orphan them.)
 *
 * NOTE: `createDocument` enforces the document-author role set (excludes viewer
 * and non-author site roles). A requester without an author role will see uploads
 * fail here — surface `failed` as a toast rather than a silent drop.
 */
export async function uploadDocuments(
  files: File[],
  opts: { module: string; recordId: string },
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;
  for (const file of files) {
    const fd = new FormData();
    fd.set("fileName", file.name);
    fd.set("linkedModule", opts.module);
    fd.set("linkedRecordId", opts.recordId);
    fd.set("file", file);
    try {
      const res = await createDocument(fd);
      if (res.success) uploaded++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { uploaded, failed };
}
