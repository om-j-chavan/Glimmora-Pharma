"use client";

/**
 * QA close confirmation for a gap finding — closing message + identity re-auth
 * + (when required) a single-QA SoD waiver.
 *
 * ⚠️ SIGNED BUT UNVERIFIED. reviewFinding now mints a FINDING_CLOSURE
 * SignedRecord (Part 2), so this IS a 21 CFR Part 11 e-signature in code — but
 * the signature has never been verified against Postgres. verifyFindingClosure
 * must pass on a Neon branch, and the migrations are still UNAPPLIED, before any
 * of this may be described to a user or an inspector as a validated signature.
 * Modelled on the deviation close modal (DeviationPage.tsx).
 *
 * The SoD override below is the RECORDED EXCEPTION to a close identity check,
 * never a bypass: it is revealed only when the server says a waiver would be
 * accepted (FindingCloseSodReveal — flag on, non-Critical, a self-check tripped),
 * and the server re-validates independently. It adds to the signature; it never
 * replaces it.
 */

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SodOverrideInputs, isSodOverrideValid } from "@/modules/capa/components/SodOverrideInputs";

export interface FindingCloseModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: {
    password: string;
    closureNotes: string;
    sodOverrideReasonCode?: string;
    sodOverrideJustification?: string;
  }) => void | Promise<void>;
  busy: boolean;
  error: string | null;
  /** Human reference shown in the title (e.g. "FND-HYD-2026-0004"). */
  reference: string;
  /** Server floor for the closing message — passed in so the hint can never
   *  drift from the zod rule it mirrors. */
  notesMin: number;
  /** ⚠️ UNVERIFIED — single-QA SoD override. True when THIS closer trips a close
   *  identity self-check under the tenant flag on a non-Critical finding, so a
   *  waiver is required IN ADDITION to the signature. Server-computed
   *  (FindingCloseSodReveal) — the client never evaluates the severity ceiling. */
  overrideNeeded: boolean;
}

export function FindingCloseModal({ open, onClose, onConfirm, busy, error, reference, notesMin, overrideNeeded }: FindingCloseModalProps) {
  const [closureNotes, setClosureNotes] = useState("");
  const [password, setPassword] = useState("");
  const [sodReason, setSodReason] = useState("");
  const [sodJust, setSodJust] = useState("");

  // Clear on close (success or cancel). The password must not outlive the modal;
  // the notes go with it so a reopened dialog starts clean.
  useEffect(() => {
    if (!open) {
      setClosureNotes("");
      setPassword("");
      setSodReason("");
      setSodJust("");
    }
  }, [open]);

  if (!open) return null;

  // A credential of only whitespace is not a credential.
  const passwordBlank = password.length > 0 && password.trim().length === 0;
  const notesShort = closureNotes.trim().length > 0 && closureNotes.trim().length < notesMin;
  const canSubmit =
    !busy &&
    password.trim().length > 0 &&
    closureNotes.trim().length >= notesMin &&
    (!overrideNeeded || isSodOverrideValid(sodReason, sodJust));

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      title={`Close gap — ${reference}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!canSubmit}
            // Send the password exactly as typed (never trim a credential — a real
            // password may contain spaces); only the non-empty check is trimmed.
            onClick={() => void onConfirm({
              password,
              closureNotes: closureNotes.trim(),
              sodOverrideReasonCode: overrideNeeded ? sodReason : undefined,
              sodOverrideJustification: overrideNeeded ? sodJust.trim() : undefined,
            })}
          >
            Close gap
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="alert alert-info text-[12px]">
          This is a GxP electronic signature under 21 CFR Part 11. Your identity, the
          meaning of this signature, and a content hash will be recorded and cannot be
          altered.
        </div>

        <div>
          <label htmlFor="finding-close-notes" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">
            Closing message <span className="text-(--danger)">*</span>
          </label>
          <textarea
            id="finding-close-notes"
            className="input text-[12px] min-h-[70px]"
            value={closureNotes}
            onChange={(e) => setClosureNotes(e.target.value)}
            maxLength={2000}
            aria-invalid={notesShort || undefined}
            aria-describedby="finding-close-notes-hint"
            placeholder={`What resolves this gap? (≥ ${notesMin} characters)`}
          />
          <p id="finding-close-notes-hint" className="text-[10px] mt-1" style={{ color: notesShort ? "var(--danger)" : "var(--text-muted)" }}>
            Recorded on the finding and in its audit trail. At least {notesMin} characters.
          </p>
        </div>

        <div>
          <label htmlFor="finding-close-password" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">
            Confirm your password <span className="text-(--danger)">*</span>
          </label>
          <input
            id="finding-close-password"
            type="password"
            className="input text-[12px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Re-enter your password"
            aria-invalid={passwordBlank || undefined}
            aria-describedby={passwordBlank ? "finding-close-password-error" : undefined}
          />
          {passwordBlank && (
            <p id="finding-close-password-error" role="alert" className="text-[10px] mt-1" style={{ color: "var(--danger)" }}>
              Password cannot be blank or only spaces.
            </p>
          )}
        </div>

        {/* Single-QA override — required IN ADDITION to the signature above when
            this closer trips a close identity self-check under the flag on a
            non-Critical finding. Flag off / Critical ⇒ not shown; the server's
            existing SoD block applies unchanged. */}
        {overrideNeeded && (
          <SodOverrideInputs
            reasonCode={sodReason}
            justification={sodJust}
            onReasonCode={setSodReason}
            onJustification={setSodJust}
            disabled={busy}
            description="You would normally be blocked here (independent QA review). Your tenant permits a single-QA override for non-Critical findings; this override is recorded on the finding and in the audit trail, in addition to your Part 11 signature."
          />
        )}

        {error && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    </Modal>
  );
}
