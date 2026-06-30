"use client";

import { FileText, Download, ExternalLink, CheckCircle2, X } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { useTenantConfig } from "@/hooks/useTenantConfig";

/**
 * Reusable, MODEL-AGNOSTIC document list. Callers map their own row (Document /
 * EvidenceFile / WorklistDoc / CAPAOriginDoc / …) into the normalized
 * `DocItemView` shape — this component never touches a Prisma model and owns NO
 * upload logic (uploading stays in DocumentUpload / per-module inputs).
 *
 * View opens `viewHref ?? downloadHref` in a new tab; whether that previews vs
 * downloads is a property of the route (most app routes serve
 * Content-Disposition: attachment → download; only a few serve inline).
 */
export interface DocItemView {
  id: string;
  fileName: string;
  /** Authenticated download URL (/api/documents/{id}, /api/evidence/files/{id}, …) or a dataUrl. */
  downloadHref: string;
  /** Optional inline/preview URL; View opens viewHref ?? downloadHref. */
  viewHref?: string;
  uploadedBy?: string;
  /** ISO timestamp — formatted with the tenant's timezone + date format. */
  uploadedAt?: string;
  /** Category / source / status chip. */
  badge?: { label: string; tone?: BadgeVariant };
  size?: string;
  /** Freeform second-line detail (SHA, version, …). */
  meta?: string;
}

export interface DocListProps {
  docs: DocItemView[];
  /** When provided (and not readOnly), each row shows a Remove control. */
  onRemove?: (id: string) => void | Promise<void>;
  /** When provided (and not readOnly), each row shows an Approve control. */
  onApprove?: (id: string) => void | Promise<void>;
  /** Disables the Remove/Approve controls for the row whose id matches. */
  busyId?: string | null;
  showDownload?: boolean; // default true
  showView?: boolean; // default true
  emptyText?: string;
  readOnly?: boolean; // suppress Remove/Approve regardless of callbacks
}

export function DocList({
  docs,
  onRemove,
  onApprove,
  busyId = null,
  showDownload = true,
  showView = true,
  emptyText,
  readOnly = false,
}: DocListProps) {
  const { org } = useTenantConfig();

  if (docs.length === 0) {
    return emptyText ? <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>{emptyText}</p> : null;
  }

  const fmtDate = (iso?: string) => (iso ? dayjs.utc(iso).tz(org.timezone).format(org.dateFormat) : null);

  return (
    <ul className="space-y-1">
      {docs.map((d) => {
        const subtitle = [d.uploadedBy, fmtDate(d.uploadedAt), d.size, d.meta].filter(Boolean).join(" · ");
        const viewTarget = d.viewHref ?? d.downloadHref;
        const busy = busyId === d.id;
        return (
          <li key={d.id} className="flex items-center gap-2 text-[12px]">
            <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate font-medium" style={{ color: "var(--text-primary)" }}>{d.fileName}</span>
                {d.badge && <Badge variant={d.badge.tone ?? "gray"}>{d.badge.label}</Badge>}
              </div>
              {subtitle && <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
            </div>
            {showView && (
              <a href={viewTarget} target="_blank" rel="noreferrer" className="shrink-0" title="View" aria-label={`View ${d.fileName}`} style={{ color: "var(--text-muted)" }}>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            )}
            {showDownload && (
              <a href={d.downloadHref} download className="shrink-0" title="Download" aria-label={`Download ${d.fileName}`} style={{ color: "var(--text-muted)" }}>
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            )}
            {onApprove && !readOnly && (
              <button type="button" onClick={() => void onApprove(d.id)} disabled={busy} className="border-none bg-transparent cursor-pointer shrink-0" title="Approve" aria-label={`Approve ${d.fileName}`} style={{ color: "#10b981" }}>
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            {onRemove && !readOnly && (
              <button type="button" onClick={() => void onRemove(d.id)} disabled={busy} className="border-none bg-transparent cursor-pointer shrink-0" title="Remove" aria-label={`Remove ${d.fileName}`} style={{ color: "var(--text-muted)" }}>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
