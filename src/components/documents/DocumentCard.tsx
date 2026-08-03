"use client";

import { FileText, Download, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Reusable attachment card. Renders a stored Document with View + Download that
 * both hit the authenticated, tenant-scoped `/api/documents/[id]` route (the
 * bytes live outside ./public, so this route is the only way to read them). Used
 * by the Support ticket detail view; generic enough for any module that links
 * Documents via `linkedModule`.
 *
 * Purpose-built for the server-fileStorage pipeline. (The older
 * components/shared/DocumentCard is coupled to the in-browser dataUrl model used
 * by CAPA/Deviation and does not fit records whose bytes live on the server.)
 */
export interface DocumentCardItem {
  id: string;
  fileName: string;
  originalFileName?: string | null;
  fileType?: string | null;
  /** Pre-formatted size string as stored on Document.fileSize (e.g. "1.2 MB"). */
  fileSize?: string | null;
  /** False for metadata/link-only Documents that carry no stored file. */
  hasFile: boolean;
}

export interface DocumentCardProps {
  doc: DocumentCardItem;
  /** Extra secondary line (e.g. "Uploaded by Priya · 03 Aug 2026"). */
  meta?: string;
  /** Optional remove action. OMIT for viewers and for roles the delete gate
   *  rejects — a rendered-but-forbidden control is worse than no control. */
  onRemove?: () => void;
  removing?: boolean;
}

export function DocumentCard({ doc, meta, onRemove, removing }: DocumentCardProps) {
  const name = doc.originalFileName ?? doc.fileName;
  const href = `/api/documents/${doc.id}`;
  // "PDF · 1.2 MB · Uploaded by …" — each part only when we actually have it.
  const secondary = [doc.fileType, doc.fileSize, meta].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 border-(--bg-border) bg-(--bg-elevated)">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--brand-muted)" }}>
        <FileText className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }} title={name}>{name}</p>
        {secondary && <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{secondary}</p>}
      </div>
      {doc.hasFile ? (
        <div className="flex items-center gap-3 shrink-0">
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] underline" style={{ color: "var(--brand)" }} aria-label={`View ${name}`}>
            <Eye className="w-3.5 h-3.5" aria-hidden="true" /> View
          </a>
          <a href={href} download={name} className="inline-flex items-center gap-1 text-[11px] underline" style={{ color: "var(--brand)" }} aria-label={`Download ${name}`}>
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Download
          </a>
        </div>
      ) : (
        <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>No file</span>
      )}
      {onRemove && (
        <Button
          type="button"
          variant="danger-ghost"
          size="xs"
          icon={Trash2}
          onClick={onRemove}
          loading={removing}
          disabled={removing}
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
          className="shrink-0 !border-transparent"
        />
      )}
    </div>
  );
}
