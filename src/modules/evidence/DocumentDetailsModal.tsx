"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, Lock, Pencil, Trash2, Download } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { deleteDocument } from "@/actions/documents";
import { formatDocumentSource } from "@/lib/labels/documentSource";
import type { EvidenceLibraryDoc } from "@/lib/queries/evidenceLibrary";

/**
 * Read-only-aware Document Details (shared Modal). Shows humanised metadata, a
 * Download button (downloads a stored file; for a LINK-ONLY doc it opens the
 * URL instead), a clickable Linked URL when present, a readably-formatted
 * description (parses a legacy JSON dump into labelled fields), and — only for a
 * here-origin document the viewer may act on — Edit / Delete. A locked
 * (other-module) doc shows a lock banner + reason and NO edit/delete.
 */
export function DocumentDetailsModal({
  doc,
  onClose,
  onEdit,
  onChanged,
}: {
  doc: EvidenceLibraryDoc | null;
  onClose: () => void;
  onEdit: (doc: EvidenceLibraryDoc) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!doc) return null;

  async function doDelete() {
    if (!doc?.actionTargetId) return;
    setBusy(true);
    const res = await deleteDocument(doc.actionTargetId);
    setBusy(false);
    setConfirmDelete(false);
    if (!res.success) { toast.error(res.error); return; }
    toast.success("Document deleted.");
    onChanged();
    onClose();
  }

  // Download: a stored file downloads; a link-only doc opens its URL instead.
  function download() {
    if (!doc) return;
    if (doc.hasFile && doc.url) {
      const a = document.createElement("a");
      a.href = doc.url;
      a.download = doc.title || "document";
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (doc.linkUrl) {
      window.open(doc.linkUrl, "_blank", "noopener,noreferrer");
    }
  }

  const uploaded = doc.uploadedAt ? dayjs(doc.uploadedAt).format("DD MMM YYYY, HH:mm") : "—";
  const downloadable = doc.hasFile ? !!doc.url : !!doc.linkUrl;

  return (
    <>
      <Modal
        open
        onClose={busy ? () => {} : onClose}
        title="Document details"
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {doc.canEdit && (
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => onEdit(doc)}>Edit</Button>
              )}
              {doc.canDelete && (
                <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {downloadable && (
                <Button variant="primary" size="sm" icon={Download} onClick={download}>
                  {doc.hasFile ? "Download" : "Open link"}
                </Button>
              )}
              {doc.hasFile && doc.url && (
                <Button variant="secondary" size="sm" icon={ExternalLink} onClick={() => window.open(doc.url!, "_blank", "noopener,noreferrer")}>View</Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-(--text-primary)">{doc.title}</h3>
            {doc.locked && (
              <Badge variant="gray"><span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden="true" /> Read-only</span></Badge>
            )}
          </div>

          {doc.locked && doc.lockReason && (
            <div className="rounded-lg p-3 text-[12px] flex items-start gap-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}>
              <Lock className="w-4 h-4 mt-0.5 shrink-0 text-(--text-muted)" aria-hidden="true" />
              <span>{doc.lockReason}</span>
            </div>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            <Field label="Source module" value={formatDocumentSource(doc.originLabel)} />
            <Field label="Type" value={doc.category ?? "—"} />
            <Field label="Uploader" value={doc.uploaderName} />
            <Field label="Uploaded" value={uploaded} />
            <Field label="Status" value={prettyStatus(doc.status)} />
            <Field label="Version" value={doc.version ?? "—"} />
            <Field label="File type" value={fileTypeLabel(doc.fileType, doc.hasFile, !!doc.linkUrl)} />
            <Field label="Size" value={doc.fileSize ?? "—"} />
            {doc.linkedRef && <Field label="Linked record" value={doc.linkedRef} />}
          </dl>

          {/* Linked URL — a clickable hyperlink (only when the doc has one). */}
          {doc.linkUrl && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-(--text-muted) mb-1">Linked URL</p>
              <a href={doc.linkUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-(--brand) hover:underline inline-flex items-center gap-1 break-all">
                {doc.linkUrl}
                <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
              </a>
            </div>
          )}

          <div>
            <p className="text-[11px] uppercase tracking-wider text-(--text-muted) mb-1">Description</p>
            <DescriptionBlock raw={doc.description} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title="Delete document?"
        message={`“${doc.title}” will be removed from the library (soft-deleted, retained per Part 11).`}
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={busy}
      />
    </>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-(--text-muted) mb-0.5">{label}</dt>
      <dd className="text-[13px] text-(--text-primary)">{value}</dd>
    </div>
  );
}

function prettyStatus(s: string): string {
  return s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Raw mime/extension → a readable label (item 5). */
function fileTypeLabel(ft: string | null, hasFile: boolean, hasLink: boolean): string {
  if (!ft) return hasFile ? "File" : hasLink ? "Web link" : "—";
  const t = ft.toLowerCase();
  const rules: [RegExp, string][] = [
    [/pdf/, "PDF Document"],
    [/wordprocessingml|msword|(^|\.)docx?$/, "Word Document"],
    [/spreadsheetml|ms-?excel|(^|\.)xlsx?$/, "Excel Spreadsheet"],
    [/csv/, "CSV Spreadsheet"],
    [/png/, "Image (PNG)"],
    [/jpe?g/, "Image (JPEG)"],
    [/gif/, "Image (GIF)"],
    [/text\/plain|(^|\.)txt$/, "Text File"],
  ];
  for (const [re, label] of rules) if (re.test(t)) return label;
  return ft.replace(/^\./, "").toUpperCase();
}

/* ── Description formatting (item 7): a legacy JSON dump renders as labelled
   fields; plain text renders as-is; empty degrades to an em-dash. ── */
function DescriptionBlock({ raw }: { raw: string | null }) {
  if (!raw || !raw.trim()) return <p className="text-[13px] text-(--text-muted)">—</p>;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    // Only the parse is fragile — keep it (and nothing else) inside try/catch.
    // JSON.parse never yields `undefined`, so it doubles as the failure sentinel.
    // JSX is constructed OUTSIDE the try so render errors aren't silently swallowed.
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = undefined; /* not valid JSON → fall through to plain text */
    }
    if (parsed !== undefined) {
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed as Record<string, unknown>).filter(([, v]) => v != null && v !== "");
        if (entries.length) {
          return (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              {entries.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-(--text-muted)">{prettifyKey(k)}</dt>
                  <dd className="text-(--text-primary) break-words">{scalarText(v)}</dd>
                </div>
              ))}
            </dl>
          );
        }
      }
      return <p className="text-[13px] text-(--text-primary) whitespace-pre-wrap break-words">{typeof parsed === "string" ? parsed : JSON.stringify(parsed)}</p>;
    }
  }
  return <p className="text-[13px] text-(--text-primary) whitespace-pre-wrap break-words">{raw}</p>;
}

function prettifyKey(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function scalarText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.map(scalarText).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
