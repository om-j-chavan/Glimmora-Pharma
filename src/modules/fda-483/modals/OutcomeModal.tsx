"use client";

/**
 * OutcomeModal — Feature: Record FDA Outcome (closes the 483 lifecycle).
 *
 * After the response is submitted, Regulatory Affairs records what the FDA
 * replied (Acknowledged / Closed / Warning Letter / Follow-up Requested),
 * optionally attaches the FDA letter, and signs it under 21 CFR Part 11 (the
 * same password re-auth + SignedRecord pattern as Sign & Submit). Self-managed
 * state; the parent's onSubmit throws on failure so the modal stays open with
 * an inline error (e.g. wrong password).
 */

import { useState } from "react";
import { Gavel } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import type { OutcomeType } from "@/types/fda483";

const MAX_SIZE_MB = 25;

export interface OutcomePayload {
  outcomeType: OutcomeType;
  note?: string;
  password: string;
  signatureMeaning: string;
  document?: { fileName: string; fileUrl: string; fileType?: string; fileSize?: string };
}

export interface OutcomeModalProps {
  open: boolean;
  onClose: () => void;
  referenceNumber: string;
  /** Records the outcome; throws on failure so the modal keeps the inputs. */
  onSubmit: (payload: OutcomePayload) => Promise<void>;
}

const OUTCOME_OPTIONS: { value: OutcomeType; label: string }[] = [
  { value: "Acknowledged", label: "Acknowledged — FDA confirmed receipt (satisfactory)" },
  { value: "Closed", label: "Closed — FDA satisfied, no further action" },
  { value: "Warning Letter", label: "Warning Letter — escalated" },
  { value: "Follow-up Requested", label: "Follow-up Requested — reopen for revised response" },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function OutcomeModal({ open, onClose, referenceNumber, onSubmit }: OutcomeModalProps) {
  const toast = useToast();
  const [outcomeType, setOutcomeType] = useState<OutcomeType | "">("");
  const [note, setNote] = useState("");
  const [meaning, setMeaning] = useState("");
  const [password, setPassword] = useState("");
  const [doc, setDoc] = useState<{ fileName: string; fileUrl: string; fileType?: string; fileSize?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOutcomeType("");
    setNote("");
    setMeaning("");
    setPassword("");
    setDoc(null);
    setBusy(false);
    setError(null);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File is too large. Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }
    try {
      const url = await readFileAsDataUrl(file);
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      setDoc({
        fileName: file.name,
        fileUrl: url,
        fileType: ext || undefined,
        fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      });
    } catch {
      toast.error("Could not read the file.");
    }
  }

  async function handleSubmit() {
    if (!outcomeType || !meaning || !password) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        outcomeType,
        note: note.trim() || undefined,
        password,
        signatureMeaning: meaning,
        document: doc ?? undefined,
      });
      reset(); // parent closes on success
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record outcome. Please try again.");
      setBusy(false); // stay open
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Record FDA Outcome" persistent={busy}>
      <p className="alert alert-info mb-4 text-[12px]">
        Recording the FDA outcome is a GxP electronic signature under 21 CFR Part 11.
        Your identity, the meaning, and a content hash are recorded and cannot be altered.
      </p>

      <div
        className="rounded-lg p-3 mb-4 border"
        style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}
      >
        <span className="font-mono text-[11px]" style={{ color: "var(--text-primary)" }}>
          {referenceNumber}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>
            FDA outcome *
          </label>
          <Dropdown
            value={outcomeType}
            onChange={(v) => setOutcomeType(v as OutcomeType)}
            placeholder="Select the FDA reply..."
            width="w-full"
            options={OUTCOME_OPTIONS}
          />
        </div>

        <div>
          <label htmlFor="outcome-note" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>
            Note <span className="normal-case" style={{ color: "var(--text-muted)" }}>(optional)</span>
          </label>
          <textarea
            id="outcome-note"
            rows={3}
            className="input w-full text-[12px] resize-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. EIR received, classification VAI; no further action requested."
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>
            FDA letter <span className="normal-case" style={{ color: "var(--text-muted)" }}>(optional)</span>
          </label>
          {doc ? (
            <div className="flex items-center justify-between gap-2 text-[12px] p-2 rounded-md border" style={{ borderColor: "var(--bg-border)" }}>
              <span className="truncate" style={{ color: "var(--text-primary)" }}>{doc.fileName}</span>
              <Button variant="ghost" size="xs" onClick={() => setDoc(null)}>Remove</Button>
            </div>
          ) : (
            <input
              type="file"
              className="text-[12px]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          )}
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>
            Signature meaning *
          </label>
          <Dropdown
            value={meaning}
            onChange={setMeaning}
            placeholder="Select meaning..."
            width="w-full"
            options={[
              { value: "certify", label: "I certify this is the FDA's official reply" },
              { value: "approve", label: "I approve closing this event on this outcome" },
            ]}
          />
        </div>

        <div>
          <label htmlFor="outcome-pw" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>
            Confirm your password *
          </label>
          <input
            id="outcome-pw"
            type="password"
            className="input text-[12px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Re-enter your password"
          />
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            Required for identity verification under 21 CFR Part 11
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[11px] rounded-md p-2 mt-4" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" type="button" onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={Gavel}
          disabled={busy || !outcomeType || !meaning || !password}
          loading={busy}
          onClick={handleSubmit}
        >
          Record &amp; Sign
        </Button>
      </div>
    </Modal>
  );
}
