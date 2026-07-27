"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { Paperclip, Upload, X } from "lucide-react";
import clsx from "clsx";
import type { Finding } from "@/store/findings.slice";
import { formatReference } from "@/lib/reference";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FINDING_EDIT_REASON_MIN } from "@/constants/capaValidation";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt";
const MAX_SIZE_MB = 10;

interface EvidenceLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Saving the LINK is an edit to the finding (updateFinding), so it carries the
   *  same mandatory reason-for-change as the detail's Edit form — Item 16 made it
   *  required on the SERVER, and this is the second caller. Uploading a FILE is a
   *  different action (uploadFindingEvidence) and needs no reason. */
  onSave: (findingId: string, evidenceLink: string, reason: string) => void | Promise<{ ok: boolean; error?: string }>;
  onUpload: (findingId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  findingId: string;
  currentLink: string;
  finding: Finding | undefined;
}

export function EvidenceLinkModal({ isOpen, onClose, onSave, onUpload, findingId, currentLink, finding }: EvidenceLinkModalProps) {
  const [evidenceInput, setEvidenceInput] = useState(currentLink);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Sync controlled state when the target finding changes.
    setEvidenceInput(currentLink);
    setFile(null);
    setReason("");
    setError("");
  }, [currentLink, findingId]);

  const displayRef = finding ? formatReference("FND", finding) : findingId;

  function handleClose() {
    onClose();
    setEvidenceInput("");
    setFile(null);
    setReason("");
    setError("");
    setBusy(false);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_SIZE_MB} MB limit`);
      return;
    }
    setError("");
    setFile(f);
  }

  async function handleSubmit() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (file) {
        const res = await onUpload(findingId, file);
        if (!res.ok) {
          setError(res.error || "Upload failed. Please try again.");
          return;
        }
      } else {
        const res = await onSave(findingId, evidenceInput.trim(), reason.trim());
        if (res && !res.ok) {
          setError(res.error || "Failed to save. Please try again.");
          return;
        }
      }
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  // The file path uploads (no reason); the link path edits the finding, so it needs
  // one. Mirrors the server floor rather than inventing a second number.
  const canSubmit = file
    ? true
    : evidenceInput.trim().length > 0 && reason.trim().length >= FINDING_EDIT_REASON_MIN;

  return (
    <Modal open={isOpen} onClose={handleClose} title={currentLink ? "Update evidence document" : "Link evidence document"}>
      <div className={clsx("rounded-lg p-3 mb-4 border", "bg-(--bg-surface) border-(--bg-border)")}>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Linking evidence for</p>
        <p className="font-mono text-[12px] font-semibold text-[#0ea5e9] mt-0.5">{displayRef}</p>
        {finding && <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{finding.requirement}</p>}
      </div>

      {/* Document reference / link */}
      <label htmlFor="evidence-input" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Document reference or link</label>
      <input id="evidence-input" type="text" className="input text-[12px]" value={evidenceInput} onChange={(e) => setEvidenceInput(e.target.value)} placeholder="e.g. SOP-QC-042-v3 or https://docs.company.com/..." aria-describedby="evidence-hint" disabled={!!file} />
      <p id="evidence-hint" className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Enter a document ID, filename, or URL — or upload a file below.</p>

      {/* Upload */}
      <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--bg-border)", background: "var(--bg-surface)" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>Upload evidence document</p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Stored and linked to this finding. PDF, DOCX, XLSX, CSV, image · max {MAX_SIZE_MB} MB.</p>
          </div>
          <label className="inline-flex">
            <input type="file" className="hidden" accept={ACCEPT} onChange={handleFileChange} aria-label="Choose evidence file" />
            <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium cursor-pointer" style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}>
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              Choose file
            </span>
          </label>
        </div>
        {file && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
            <div className="min-w-0">
              <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{file.name}</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{Math.max(1, Math.round(file.size / 1024))} KB</p>
            </div>
            <button type="button" onClick={() => setFile(null)} className="border-none bg-transparent p-1 cursor-pointer" style={{ color: "var(--text-muted)" }} aria-label="Remove selected file">
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Item 16 — reason-for-change, required for the LINK save because that is an
          edit to a GxP record (updateFinding). Hidden on the upload path: uploading
          a document is uploadFindingEvidence, a different action with its own trail.
          The alternative — a canned reason supplied by the code — would be the app
          writing a human justification it did not have. */}
      {!file && (
        <div className="mt-4">
          <label htmlFor="evidence-reason" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">
            Reason for edit <span className="text-[#ef4444]">*</span>
          </label>
          <textarea
            id="evidence-reason"
            className="input text-[12px] w-full min-h-16"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            placeholder="Why is this evidence reference being set or changed?"
            aria-describedby="evidence-reason-hint"
          />
          <p id="evidence-reason-hint" className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            Recorded in the finding&apos;s audit trail. At least {FINDING_EDIT_REASON_MIN} characters.
          </p>
        </div>
      )}

      {error && <p role="alert" className="text-[11px] text-[#ef4444] mt-3 p-2 rounded-lg" style={{ background: "var(--danger-bg)" }}>{error}</p>}

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="ghost" type="button" onClick={handleClose}>Cancel</Button>
        <Button variant="primary" icon={file ? Upload : Paperclip} loading={busy} disabled={!canSubmit} onClick={handleSubmit}>
          {file ? "Upload evidence" : currentLink ? "Update evidence" : "Link evidence"}
        </Button>
      </div>
    </Modal>
  );
}
