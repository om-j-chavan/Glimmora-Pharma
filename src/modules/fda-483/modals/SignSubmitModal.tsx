import { ShieldCheck } from "lucide-react";
import type { FDA483Event } from "@/types/fda483";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { eventTypeBadge } from "../_shared";

export interface SignSubmitModalProps {
  open: boolean;
  liveEvent: FDA483Event | null;
  signMeaning: string;
  signPassword: string;
  onClose: () => void;
  onSignMeaningChange: (v: string) => void;
  onSignPasswordChange: (v: string) => void;
  onSubmit: () => void;
  /** Set by the parent when signSubmitFDA483Response rejects (wrong
   *  password, role gate, validation). The modal stays open and renders
   *  this message inline so the user can correct and retry without
   *  losing the meaning-dropdown selection. Cleared by the parent on
   *  retry or on modal close. */
  error?: string | null;
  /** True while the server signing call is in flight. Disables both
   *  buttons and shows a spinner on Sign so the user can't double-submit
   *  during a slow round-trip. */
  busy?: boolean;
}

export function SignSubmitModal({
  open,
  liveEvent,
  signMeaning,
  signPassword,
  onClose,
  onSignMeaningChange,
  onSignPasswordChange,
  onSubmit,
  error,
  busy,
}: SignSubmitModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sign & Submit to FDA"
    >
      <p id="sign-483-notice" className="alert alert-info mb-4 text-[12px]">
        This is a GxP electronic signature under 21 CFR Part 11. Your
        identity, the meaning of this signature, and a content hash will be
        recorded and cannot be altered.
      </p>
      {liveEvent && (
        <div
          className="rounded-lg p-3 mb-4 border"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--bg-border)",
          }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const t = eventTypeBadge(liveEvent.type);
              return <Badge variant={t.variant}>{t.label}</Badge>;
            })()}
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--text-primary)" }}
            >
              {liveEvent.referenceNumber}
            </span>
          </div>
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            {liveEvent.observations.length} observations
          </p>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Signature meaning *
          </label>
          <Dropdown
            value={signMeaning}
            onChange={onSignMeaningChange}
            placeholder="Select meaning..."
            width="w-full"
            options={[
              {
                value: "approve",
                label: "I approve this response as accurate and complete",
              },
              {
                value: "certify",
                label: "I certify the commitments are achievable",
              },
              {
                value: "authorize",
                label: "I authorize submission to the regulatory agency",
              },
            ]}
          />
        </div>
        <div>
          <label
            htmlFor="sign-483-pw"
            className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Confirm your password *
          </label>
          <input
            id="sign-483-pw"
            type="password"
            className="input text-[12px]"
            value={signPassword}
            onChange={(e) => onSignPasswordChange(e.target.value)}
            placeholder="Re-enter your password"
          />
          <p
            className="text-[10px] mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            Required for identity verification under 21 CFR Part 11
          </p>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="text-[11px] rounded-md p-2 mt-4"
          style={{
            background: "var(--danger-bg)",
            color: "var(--danger)",
            border: "1px solid var(--danger)",
          }}
        >
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Button
          variant="ghost"
          type="button"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={ShieldCheck}
          disabled={busy || !signMeaning || !signPassword}
          loading={busy}
          onClick={onSubmit}
        >
          Sign &amp; Submit
        </Button>
      </div>
    </Modal>
  );
}
