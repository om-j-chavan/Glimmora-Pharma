import { useEffect, useState } from "react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { roleLabel } from "@/lib/labels/roles";
import { CLOSING_NOTES_MIN } from "@/constants/capaValidation";
// CHANGE CONTROL HIDDEN — ShieldAlert dropped because its only consumer
// (the override-notice block below) is commented out. To re-enable:
// restore `ShieldAlert` to this import and uncomment the override block.
import { ShieldCheck } from "lucide-react";
import type { CAPA } from "@/store/capa.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { CAPA_STATUS_VARIANT as STATUS_VARIANT, getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { STATUS_LABEL } from "@/types/capa";

interface SignCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSign: (data: { meaning: string; password: string; effectivenessConfirmed: boolean; closingNotes: string }) => void;
  capa: CAPA | null;
  /** Substage 6.4 — display-only echo of the CC dependency override the
   *  operator captured upstream in ActionsPanel. The reason itself rides
   *  through CAPAPage state into signAndCloseCAPAServer; this prop only
   *  surfaces it to the signer so they can see what they are signing off
   *  on. */
  ccBlockOverride?: { reason: string } | null;
  /** Set by the parent when signAndCloseCAPAServer rejects (wrong
   *  password, missing approvals, CC dep gate, etc.). The modal stays
   *  open and renders this message inline so the user can correct and
   *  retry without losing the password they typed. Cleared by the parent
   *  on retry or on modal close. */
  error?: string | null;
  /** True while the server signing call is in flight. Disables the Sign
   *  button and prevents double-submit; the Button's `loading` prop
   *  swaps the icon for a spinner. */
  busy?: boolean;
}

// CHANGE CONTROL HIDDEN — `ccBlockOverride` is still in the props type so
// callers (CAPAPage) don't need to change, but it's intentionally not
// destructured because the override-notice block is commented out below.
export function SignCloseModal({ isOpen, onClose, onSign, capa, error, busy }: SignCloseModalProps) {
  const [signMeaning, setSignMeaning] = useState("");
  const [signPassword, setSignPassword] = useState("");
  const [effectivenessConfirmed, setEffectivenessConfirmed] = useState(false);
  const [closingNotes, setClosingNotes] = useState("");
  const signer = useAppSelector((s) => s.auth.user);
  const { role } = useRole();

  // Clear inputs when the modal closes (success or cancel). Keeping them
  // populated across submit attempts means a wrong-password retry doesn't
  // force the user to retype both fields — they edit the password and
  // re-click. Password leaving the modal state on close is the security
  // win that matters.
  useEffect(() => {
    if (!isOpen) {
      setSignMeaning("");
      setSignPassword("");
      setEffectivenessConfirmed(false);
      setClosingNotes("");
    }
  }, [isOpen]);

  if (!capa) return null;

  // A signature credential of only whitespace is not a signature. Reject it
  // (the button is also disabled below; this is the defensive belt).
  const passwordBlank = signPassword.length > 0 && signPassword.trim().length === 0;

  function handleSign() {
    if (!signMeaning || signPassword.trim().length === 0 || closingNotes.trim().length < CLOSING_NOTES_MIN) return;
    // Send the password exactly as typed (never trim a credential — a real
    // password may contain spaces); only the non-empty check is trimmed.
    onSign({ meaning: signMeaning, password: signPassword, effectivenessConfirmed, closingNotes: closingNotes.trim() });
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Sign & Close CAPA">
      <div>
        <div id="sign-part11-notice" className="alert alert-info mb-4">This is a GxP electronic signature under 21 CFR Part 11. Your identity, the meaning of this signature, and a content hash will be recorded and cannot be altered.</div>
        {/* CHANGE CONTROL HIDDEN — override notice suppressed alongside
            the rest of the CC user-facing surface. To re-enable: re-add
            ShieldAlert to the lucide-react import, restore ccBlockOverride
            to the destructure, and uncomment this block.
        {ccBlockOverride && (
          <div
            role="status"
            className="alert mb-4 flex items-start gap-2"
            style={{
              background: "var(--warning-bg)",
              color: "var(--warning)",
              border: "1px solid var(--warning)",
            }}
          >
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-semibold">
                Linked Change Control override in effect
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                You are sealing this CAPA before all linked Change Controls
                reach Implemented. The reason below will be recorded against
                the CAPA and the audit trail.
              </p>
              <p className="text-[11px] mt-1 italic" style={{ color: "var(--text-primary)" }}>
                &ldquo;{ccBlockOverride.reason}&rdquo;
              </p>
            </div>
          </div>
        )}
        */}
        <div className={clsx("rounded-lg p-3 mb-4 border", "bg-(--bg-surface) border-(--bg-border)")}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-[#0ea5e9] font-semibold" title={capa.id}>{capa.reference ?? `CAPA-LEGACY-${capa.id.slice(0, 8)}`}</span>
            <Badge variant={getSeverityVariant(capa.risk, "generic")}>{normalizeSeverityForDisplay(capa.risk, "generic") ?? capa.risk}</Badge>
            <Badge variant={STATUS_VARIANT[capa.status]}>{STATUS_LABEL[capa.status]}</Badge>
          </div>
          <p className="text-[12px] mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{capa.description}</p>
        </div>
        <div className="space-y-4">
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Signature meaning <span className="text-(--danger)">*</span></p><Dropdown value={signMeaning} onChange={setSignMeaning} placeholder="Select meaning..." width="w-full" options={[{ value: "approve", label: "I approve the corrective actions as complete and effective" }, { value: "verify", label: "I verify the root cause analysis is adequate" }, { value: "confirm", label: "I confirm evidence is sufficient for closure" }]} /></div>
          <div><label htmlFor="sign-password" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Confirm your password <span className="text-(--danger)">*</span></label><input id="sign-password" type="password" className="input text-[12px]" value={signPassword} onChange={(e) => setSignPassword(e.target.value)} placeholder="Re-enter your password" aria-invalid={passwordBlank} aria-describedby={passwordBlank ? "sign-password-error" : undefined} />{passwordBlank ? <p id="sign-password-error" role="alert" className="text-[10px] mt-1" style={{ color: "var(--danger)" }}>Signature password cannot be blank or only spaces.</p> : <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Required for identity verification under 21 CFR Part 11</p>}</div>
          <div>
            <label htmlFor="sign-closing-notes" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Closing notes <span className="text-(--danger)">*</span></label>
            <textarea id="sign-closing-notes" className="input text-[12px] min-h-[70px]" value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)}
              placeholder={`What resolves this CAPA? (≥ ${CLOSING_NOTES_MIN} characters — bound into the signature's content hash)`} maxLength={4000} />
            <p className="text-[10px] mt-1" style={{ color: closingNotes.trim().length > 0 && closingNotes.trim().length < CLOSING_NOTES_MIN ? "var(--danger)" : "var(--text-muted)" }}>
              Recorded on the CAPA and hashed into the Part 11 signature.
            </p>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Accepted by: <strong style={{ color: "var(--text-primary)" }}>{signer?.name ?? "—"}{role ? ` (${roleLabel(role)})` : ""}</strong> · {dayjs().format("DD MMM YYYY")}
          </p>
          {capa.effectivenessCheck && (
            <div className={clsx("flex items-center justify-between p-3 rounded-lg border", "bg-(--bg-surface) border-(--bg-border)")}>
              <Toggle id="eff-confirm" checked={effectivenessConfirmed} onChange={setEffectivenessConfirmed} label="Effectiveness check confirmed" description="90-day monitoring will be scheduled" />
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="text-[11px] rounded-md p-2"
              style={{
                background: "var(--danger-bg)",
                color: "var(--danger)",
                border: "1px solid var(--danger)",
              }}
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button
              variant="primary"
              icon={ShieldCheck}
              disabled={busy || !signMeaning || signPassword.trim().length === 0 || closingNotes.trim().length < CLOSING_NOTES_MIN || (capa.effectivenessCheck && !effectivenessConfirmed)}
              loading={busy}
              onClick={handleSign}
            >
              Sign &amp; Close CAPA
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
