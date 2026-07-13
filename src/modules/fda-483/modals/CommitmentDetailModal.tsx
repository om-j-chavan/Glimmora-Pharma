"use client";

/**
 * CommitmentDetailModal — edit OR complete a first-class FDA 483 commitment.
 *
 *  • EDIT mode: text / owner / due date / status (Pending · In Progress ·
 *    Cancelled) are editable; source linkage is read-only (set at creation).
 *  • COMPLETE mode: optional completion notes + optional evidence upload
 *    (reuses the shared DocumentUpload primitive), then completeCommitment.
 *
 * Self-contained: calls the server actions directly and reports back via
 * onChanged / onError so the parent only owns refresh + toast + modal state.
 */

import { useState, useEffect } from "react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DocumentUpload, type LinkedDocument } from "@/components/shared/DocumentUpload";
import { roleLabel } from "@/lib/labels/roles";
import type { Commitment } from "@/types/fda483";
import {
  updateCommitment as updateCommitmentServer,
  completeCommitment as completeCommitmentServer,
} from "@/actions/fda483";

export interface CommitmentDetailModalProps {
  open: boolean;
  mode: "edit" | "complete";
  commitment: Commitment | null;
  users: { id: string; name: string; status: string; role: string }[];
  onClose: () => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}

const labelCls = "text-[11px] font-semibold uppercase tracking-wider block mb-1";

function linkageLabel(c: Commitment): string {
  if (c.observationId) return `Observation #${c.observationNumber ?? "?"}`;
  if (c.capaId) return c.capaRef ?? c.capaId.slice(0, 8);
  return "Event-level commitment";
}

export function CommitmentDetailModal({ open, mode, commitment, users, onClose, onChanged, onError }: CommitmentDetailModalProps) {
  // Edit-mode buffers.
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<string>("Pending");
  // Complete-mode buffers.
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState<LinkedDocument[]>([]);
  const [busy, setBusy] = useState(false);

  // Re-seed whenever a different commitment / mode opens.
  useEffect(() => {
    if (!commitment) return;
    setText(commitment.text);
    setOwner(commitment.owner ?? "");
    setDueDate(commitment.dueDate ? dayjs(commitment.dueDate).format("YYYY-MM-DD") : "");
    setStatus(commitment.status === "Overdue" ? "Pending" : commitment.status);
    setNotes("");
    setEvidence([]);
  }, [commitment, mode, open]);

  if (!commitment) return null;

  async function handleSaveEdit() {
    if (!text.trim() || !owner || !dueDate) return;
    setBusy(true);
    const result = await updateCommitmentServer(commitment!.id, {
      text: text.trim(),
      owner,
      dueDate: dayjs(dueDate).utc().toISOString(),
      status: status as "Pending" | "In Progress" | "Cancelled",
    });
    setBusy(false);
    if (!result.success) {
      onError(result.error || "Failed to update commitment.");
      return;
    }
    onChanged("Commitment updated.");
    onClose();
  }

  async function handleComplete() {
    setBusy(true);
    const result = await completeCommitmentServer(commitment!.id, {
      completionNotes: notes.trim() || undefined,
      evidence: evidence.map((d) => ({
        fileName: d.fileName,
        fileUrl: d.dataUrl ?? "",
        fileType: d.fileType,
        fileSize: d.fileSize,
      })),
    });
    setBusy(false);
    if (!result.success) {
      onError(result.error || "Failed to complete commitment.");
      return;
    }
    onChanged("Commitment marked complete.");
    onClose();
  }

  const refLabel = commitment.reference ?? commitment.id.slice(0, 8);

  /* ── EDIT MODE ── */
  if (mode === "edit") {
    return (
      <Modal open={open} onClose={onClose} title={`Edit ${refLabel}`}>
        <div className="space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--text-muted)" }}>Commitment *</label>
            <textarea rows={2} className="input text-[12px] resize-none w-full" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--text-muted)" }}>Source</label>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {linkageLabel(commitment)} <span className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>(set at creation — read-only)</span>
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--text-muted)" }}>Owner *</label>
              <Dropdown
                value={owner}
                onChange={setOwner}
                placeholder="Select owner"
                width="w-full"
                options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: `${u.name} (${roleLabel(u.role)})` }))}
              />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-muted)" }}>Due date *</label>
              <input type="date" className="input text-[12px] w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--text-muted)" }}>Status</label>
            <Dropdown
              value={status}
              onChange={setStatus}
              width="w-full"
              options={["Pending", "In Progress", "Cancelled"].map((s) => ({ value: s, label: s }))}
            />
            <p className="text-[10px] mt-1 italic" style={{ color: "var(--text-muted)" }}>
              Use “Mark Complete” on the card to complete (captures completer + evidence).
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" type="button" onClick={handleSaveEdit} loading={busy} disabled={busy || !text.trim() || !owner || !dueDate}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  /* ── COMPLETE MODE ── */
  return (
    <Modal open={open} onClose={onClose} title={`Mark ${refLabel} as complete`}>
      <div className="space-y-4">
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Confirm this commitment is fulfilled.</p>
        <div>
          <label className={labelCls} style={{ color: "var(--text-muted)" }}>Completion notes</label>
          <textarea
            rows={3}
            className="input text-[12px] resize-none w-full"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes about how this was completed (optional)"
          />
        </div>
        <div>
          <label className={labelCls} style={{ color: "var(--text-muted)" }}>Evidence (optional)</label>
          <DocumentUpload
            recordId={commitment.id}
            recordTitle={refLabel}
            module="FDA 483"
            existingDocs={evidence}
            onUpload={(doc) => setEvidence((prev) => [...prev, doc])}
            onDelete={(docId) => setEvidence((prev) => prev.filter((d) => d.id !== docId))}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="button" onClick={handleComplete} loading={busy} disabled={busy}>
            Confirm Complete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
