"use client";

import { useState, useEffect } from "react";
import {
  Download, ShieldCheck, XCircle, Trash2, ExternalLink, Lock,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { EvidenceDocument, DocStatus } from "@/store/evidence.slice";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  approveDocument,
  rejectDocument,
  deleteDocument,
} from "@/actions/documents";
import { SignApproveDocumentModal } from "./SignApproveDocumentModal";
import { documentReviewState } from "../tabs/DocumentLibraryTab";

/** Capabilities mirror of usePermissions("evidence") — only the lifecycle
 *  actions this drawer surfaces. */
export interface DocumentActionCapabilities {
  canApprove: boolean;
  canSign: boolean;
  canReview: boolean;
  canDelete: boolean;
}

export interface DocumentDetailDrawerProps {
  doc: EvidenceDocument | null;
  open: boolean;
  /** Human source label ("CAPA evidence", "FDA 483", …) for aggregated docs. */
  sourceLabel: string;
  /** True when the doc is a read-only mirror aggregated from another module. */
  readOnly: boolean;
  can: DocumentActionCapabilities;
  timezone: string;
  dateFormat: string;
  onClose: () => void;
  /** Called after a successful approve / reject / delete so the parent can
   *  re-fetch server data (router.refresh) and close the drawer. */
  onChanged: () => void;
  onNavigate: (path: string, options?: { state?: Record<string, unknown> }) => void;
}

function statusBadge(s: DocStatus) {
  const m: Record<DocStatus, "green" | "blue" | "gray" | "red" | "amber"> = {
    Current: "green", Draft: "blue", Superseded: "gray", Missing: "red", "Under Review": "amber",
  };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function downloadDoc(doc: EvidenceDocument) {
  if (!doc.url) return;
  const isDataUrl = doc.url.startsWith("data:");
  const a = document.createElement("a");
  a.href = doc.url;
  if (isDataUrl) a.download = doc.title;
  else a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-(--bg-border)">
      <span className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="text-[12px] text-right min-w-0" style={{ color: "var(--text-primary)" }}>
        {children}
      </span>
    </div>
  );
}

export function DocumentDetailDrawer({
  doc, open, sourceLabel, readOnly, can, timezone, dateFormat,
  onClose, onChanged, onNavigate,
}: DocumentDetailDrawerProps) {
  const [signOpen, setSignOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whenever the drawer closes, wipe any half-open sub-modal / draft reason so
  // it can't resurface when a different document is opened next.
  useEffect(() => {
    if (!open) {
      setSignOpen(false);
      setRejectOpen(false);
      setDeleteOpen(false);
      setReason("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!doc) return null;

  const isApproved = doc.rawStatus === "approved";
  const isRejected = doc.rawStatus === "rejected";
  // Native docs only: platform gates come from `can`; the record's own state
  // decides which transitions still make sense.
  const showApprove = !readOnly && can.canApprove && can.canSign && !isApproved;
  const showReject = !readOnly && can.canReview && !isApproved && !isRejected;
  const showDelete = !readOnly && can.canDelete;
  const hasActions = showApprove || showReject || showDelete;

  function resetSub() {
    setBusy(false);
    setError(null);
    setReason("");
    setSignOpen(false);
    setRejectOpen(false);
    setDeleteOpen(false);
  }

  async function handleApprove(data: { password: string }) {
    if (!doc) return;
    setBusy(true);
    setError(null);
    const res = await approveDocument(doc.id, { password: data.password });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "Failed to approve document.");
      return;
    }
    resetSub();
    onChanged();
  }

  async function handleReject() {
    if (!doc) return;
    if (reason.trim().length < 3) {
      setError("A reason is required (min 3 characters).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await rejectDocument(doc.id, reason.trim());
    setBusy(false);
    if (!res.success) {
      setError(res.error || "Failed to reject document.");
      return;
    }
    resetSub();
    onChanged();
  }

  async function handleDelete() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    const res = await deleteDocument(doc.id, reason.trim() || undefined);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "Failed to delete document.");
      return;
    }
    resetSub();
    onChanged();
  }

  const expired = !!doc.expiryDate && dayjs.utc(doc.expiryDate).isBefore(dayjs());
  const review = documentReviewState(doc);
  const reviewColor = review === "overdue" ? "#ef4444" : review === "due" ? "#f59e0b" : undefined;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title="Document details"
        width="md"
        footer={
          hasActions ? (
            <div className="flex items-center justify-end gap-2 flex-wrap">
              {showDelete && (
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => { setError(null); setReason(""); setDeleteOpen(true); }}>
                  Delete
                </Button>
              )}
              {showReject && (
                <Button variant="ghost" size="sm" icon={XCircle} onClick={() => { setError(null); setReason(""); setRejectOpen(true); }}>
                  Reject
                </Button>
              )}
              {showApprove && (
                <Button variant="primary" size="sm" icon={ShieldCheck} onClick={() => { setError(null); setSignOpen(true); }}>
                  Sign &amp; Approve
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {/* Title block */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {statusBadge(doc.status)}
              <Badge variant="gray">{doc.type}</Badge>
              <Badge variant="gray">{doc.area}</Badge>
              {readOnly && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-(--bg-surface)" style={{ color: "var(--text-muted)" }}>
                  <Lock className="w-3 h-3" aria-hidden="true" /> {sourceLabel}
                </span>
              )}
            </div>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{doc.title}</h3>
            <p className="font-mono text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{doc.reference}</p>
          </div>

          {/* Metadata */}
          <div>
            <Row label="Version">v{doc.version}</Row>
            <Row label="Author">{doc.author || "—"}</Row>
            {doc.reviewedBy && <Row label="Approved by">{doc.reviewedBy}</Row>}
            <Row label="Effective">{doc.effectiveDate ? dayjs.utc(doc.effectiveDate).tz(timezone).format(dateFormat) : "—"}</Row>
            <Row label="Expiry">
              {doc.expiryDate ? (
                <span className={expired ? "text-[#ef4444]" : undefined}>
                  {dayjs.utc(doc.expiryDate).tz(timezone).format(dateFormat)}{expired ? " · Expired" : ""}
                </span>
              ) : "—"}
            </Row>
            <Row label="Next review">
              {doc.nextReviewDate ? (
                <span style={{ color: reviewColor }}>
                  {dayjs.utc(doc.nextReviewDate).tz(timezone).format(dateFormat)}
                  {review === "overdue" ? " · Overdue" : review === "due" ? " · Review due" : ""}
                </span>
              ) : "—"}
            </Row>
            {typeof doc.sizeKb === "number" && <Row label="Size">{doc.sizeKb} KB</Row>}
          </div>

          {/* Tags */}
          {doc.tags.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Tags</p>
              <div className="flex gap-1 flex-wrap">
                {doc.tags.map((t) => <Badge key={t} variant="gray">{t}</Badge>)}
              </div>
            </div>
          )}
          {doc.complianceTags.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Compliance</p>
              <div className="flex gap-1 flex-wrap">
                {doc.complianceTags.map((t) => (
                  <span key={t} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-(--info-bg) text-[#6366f1]">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Links / actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {doc.url && (
              <Button variant="ghost" size="sm" icon={Download} onClick={() => downloadDoc(doc)}>Download</Button>
            )}
            {doc.findingId && (
              <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => onNavigate("/gap-assessment", { state: { openFindingId: doc.findingId } })}>Open finding</Button>
            )}
            {doc.capaId && (
              <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => onNavigate("/capa", { state: { openCapaId: doc.capaId } })}>Open CAPA</Button>
            )}
            {doc.eventId && (
              <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => onNavigate("/fda-483")}>Open FDA 483</Button>
            )}
          </div>

          {readOnly && (
            <p className="alert alert-info text-[12px]">
              This is a read-only mirror of evidence managed in its source module ({sourceLabel}). Approve, reject or remove it there.
            </p>
          )}
        </div>
      </Drawer>

      {/* Sign & Approve (Part 11 e-signature) */}
      <SignApproveDocumentModal
        open={signOpen}
        documentTitle={doc.title}
        documentVersion={doc.version}
        busy={busy}
        error={error}
        onClose={() => { if (!busy) { setSignOpen(false); setError(null); } }}
        onConfirm={handleApprove}
      />

      {/* Reject with reason */}
      <Modal
        open={rejectOpen}
        onClose={() => { if (!busy) { setRejectOpen(false); setError(null); setReason(""); } }}
        title="Reject document"
      >
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Rejecting <strong>{doc.title}</strong> marks it not-approved. The reason is recorded in the audit trail.
          </p>
          <textarea
            className="input text-[12px] w-full min-h-[90px]"
            placeholder="Reason for rejection…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
          {error && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => { setRejectOpen(false); setError(null); setReason(""); }} disabled={busy}>Cancel</Button>
            <Button variant="primary" icon={XCircle} loading={busy} disabled={busy || reason.trim().length < 3} onClick={handleReject}>Reject</Button>
          </div>
        </div>
      </Modal>

      {/* Delete (soft-delete, 7y retention) with optional reason */}
      <Modal
        open={deleteOpen}
        onClose={() => { if (!busy) { setDeleteOpen(false); setError(null); setReason(""); } }}
        title="Delete document"
      >
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Remove <strong>{doc.title}</strong> from the library. This is a soft-delete — the record is retained for Part 11 and can be restored by an administrator.
          </p>
          <textarea
            className="input text-[12px] w-full min-h-[70px]"
            placeholder="Reason (optional)…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
          {error && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => { setDeleteOpen(false); setError(null); setReason(""); }} disabled={busy}>Cancel</Button>
            <Button variant="primary" icon={Trash2} loading={busy} disabled={busy} onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
