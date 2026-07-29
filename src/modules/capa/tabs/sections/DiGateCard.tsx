"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useRole } from "@/hooks/useRole";
import { clearDIGate } from "@/actions/capas";
import { DI_CLEARANCE_MIN } from "@/constants/capaValidation";
import type { CAPA } from "@/store/capa.slice";

/**
 * Phase 4 — Data Integrity gate card (Review #3). Composition only: calls the
 * existing clearDIGate server action (role gate + audit live there). Pending is
 * NEUTRAL, not red — it's a to-do, not a failure — and the copy says what to DO
 * with a real [Clear DI gate] button (not the old "use Edit" that documented the
 * vocabulary bug as a feature). Cleared shows reviewer + date. Renders only when
 * capa.diGate is set.
 */
export function DiGateCard({ capa, onChange }: { capa: CAPA; onChange?: () => void }) {
  const { role } = useRole();
  const toast = useToast();
  const canClear = role === "qa_head" || role === "super_admin";
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleared = capa.diGateStatus === "cleared";

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await clearDIGate(capa.id, { notes: notes.trim() });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "Could not clear the DI gate.");
      return;
    }
    setOpen(false);
    setNotes("");
    toast.success("DI gate cleared.");
    onChange?.();
  };

  if (cleared) {
    return (
      <div className="rounded-md p-3 flex items-start gap-2" style={{ background: "var(--success-bg)", border: "1px solid var(--success)" }}>
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--success)" }} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold" style={{ color: "var(--success)" }}>Data integrity gate cleared</p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {capa.diGateReviewedBy ? `Cleared by ${capa.diGateReviewedBy}` : "Cleared"}
            {capa.diGateReviewDate ? ` · ${dayjs.utc(capa.diGateReviewDate).format("DD MMM YYYY")}` : ""}
          </p>
          {capa.diGateNotes && (
            <p className="text-[11px] mt-1 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>&ldquo;{capa.diGateNotes}&rdquo;</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--card-border, var(--bg-border))" }}>
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>Data integrity review pending</p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            A QA Head must clear this gate before the CAPA can be submitted for review.
          </p>
        </div>
        {canClear && (
          <Button variant="primary" size="sm" icon={ShieldCheck} onClick={() => setOpen(true)}>Clear DI gate</Button>
        )}
      </div>
      {open && (
        <Modal open onClose={busy ? () => undefined : () => setOpen(false)} title="Clear Data Integrity gate">
          <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
            What did you verify? Required (≥ {DI_CLEARANCE_MIN} characters) — this is the Part 11 clearance rationale.
          </p>
          <textarea
            className="input text-[12px] min-h-[80px] mb-2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Audit trails reviewed in all 12 LIMS modules; no gaps found."
            maxLength={2000}
            disabled={busy}
            aria-label="DI clearance notes"
          />
          {error && <p role="alert" className="text-[11px] mb-2" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" icon={ShieldCheck} loading={busy} disabled={busy || notes.trim().length < DI_CLEARANCE_MIN} onClick={() => void submit()}>Clear gate</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
