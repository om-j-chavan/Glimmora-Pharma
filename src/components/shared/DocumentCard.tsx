"use client";

import { FileText, Eye, Download, Lock, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

/**
 * <DocumentCard> — the ONE shared, compact document tile (grid card) for every
 * module (Evidence & Documents, Gap Assessment, Worklist). It renders a
 * NORMALIZED view shape (`DocumentCardView`); each module supplies a small
 * adapter that maps its own doc shape into this shape (see the exported
 * `evidenceDocToCardView` / `worklistDocToCardView` below). This replaces the
 * previously-inline Evidence tile and the hand-rolled Gap/Worklist doc markup.
 */
export interface DocumentCardView {
  id: string;
  /** File name / document title. */
  title: string;
  /** One-line secondary text (e.g. "SOP · Jane · 12 Mar 2026"). */
  meta?: string;
  /** Origin / status pill. */
  badge?: { label: string; tone?: BadgeVariant };
  /** Locked = read-only mirror from another module. */
  locked?: boolean;
  /** Opens the file/link in a new tab (used when `onView` isn't provided). */
  viewHref?: string | null;
  /** Downloads a stored file. Null for link-only docs. */
  downloadHref?: string | null;
  /** External link — opened when there's no stored file to download. */
  linkUrl?: string | null;
}

export interface DocumentCardProps {
  doc: DocumentCardView;
  /** Custom View handler (e.g. open a details modal). Falls back to viewHref. */
  onView?: () => void;
  /** Optional selection checkbox (Evidence bulk-select). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Optional remove action (e.g. a worker removing their own evidence before
   *  submit). Renders a small danger button; omit for read-only cards. */
  onRemove?: () => void;
  removing?: boolean;
  className?: string;
}

export function DocumentCard({ doc, onView, selectable, selected, onToggleSelect, onRemove, removing, className }: DocumentCardProps) {
  const canView = !!onView || !!doc.viewHref;
  const canDownload = !!doc.downloadHref || !!doc.linkUrl;

  function view() {
    if (onView) onView();
    else if (doc.viewHref) window.open(doc.viewHref, "_blank", "noopener,noreferrer");
  }
  function download() {
    if (doc.downloadHref) {
      const a = document.createElement("a");
      a.href = doc.downloadHref;
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

  return (
    <div className={clsx("rounded-lg border bg-(--card-bg) p-3 flex flex-col gap-2", selected ? "border-(--brand) ring-1 ring-(--brand)" : "border-(--bg-border)", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {selectable && (
            <input type="checkbox" aria-label={`Select ${doc.title}`} checked={!!selected} onChange={onToggleSelect}
              className="cursor-pointer align-middle accent-(--brand)" />
          )}
          <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: "var(--brand-muted)" }}>
            <FileText className="w-4 h-4 text-(--brand)" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {doc.badge && <Badge variant={doc.badge.tone ?? "gray"}>{doc.badge.label}</Badge>}
          {doc.locked && <Lock className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium truncate text-(--text-primary)" title={doc.title}>{doc.title}</p>
        {doc.meta && <p className="text-[10px] text-(--text-muted) truncate">{doc.meta}</p>}
      </div>
      {(canView || canDownload || onRemove) && (
        <div className="flex items-center gap-1.5 mt-auto pt-1.5 border-t border-(--bg-border)">
          {canView && <Button variant="secondary" size="xs" icon={Eye} onClick={view}>View</Button>}
          {canDownload && <Button variant="ghost" size="xs" icon={Download} onClick={download}>{doc.downloadHref ? "Download" : "Open link"}</Button>}
          {onRemove && (
            <Button variant="danger-ghost" size="xs" icon={Trash2} loading={removing} disabled={removing} onClick={onRemove} className="ml-auto" aria-label={`Remove ${doc.title}`} />
          )}
        </div>
      )}
    </div>
  );
}
