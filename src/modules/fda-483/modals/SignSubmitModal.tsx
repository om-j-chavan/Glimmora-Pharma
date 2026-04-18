import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import type {
  FDA483Event,
  EventType,
} from "@/store/fda483.slice";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

function eventTypeBadge(t: EventType) {
  const m: Record<EventType, "red" | "amber" | "blue"> = {
    "FDA 483": "red",
    "Warning Letter": "red",
    "EMA Inspection": "amber",
    "MHRA Inspection": "amber",
    "WHO Inspection": "blue",
  };
  return <Badge variant={m[t]}>{t}</Badge>;
}

export interface SignSubmitModalProps {
  open: boolean;
  liveEvent: FDA483Event | null;  signMeaning: string;
  signPassword: string;
  onClose: () => void;
  onSignMeaningChange: (v: string) => void;
  onSignPasswordChange: (v: string) => void;
  onSubmit: () => void;
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
}: SignSubmitModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sign & Submit Response"
    >
      <p id="sign-483-notice" className="alert alert-info mb-4 text-[12px]">
        This is a GxP electronic signature under 21 CFR Part 11. Your
        identity, the meaning of this signature, and a content hash will be
        recorded and cannot be altered.
      </p>
      {liveEvent && (
        <div
          className={clsx(
            "rounded-lg p-3 mb-4",
            "bg-(--bg-surface) border border-(--bg-border)",
          )}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {eventTypeBadge(liveEvent.type)}
            <span className="font-mono text-[11px] text-[#0ea5e9]">
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
      <div className="flex justify-end gap-2 mt-4">
        <Button
          variant="ghost"
          type="button"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={ShieldCheck}
          disabled={!signMeaning || !signPassword}
          onClick={onSubmit}
        >
          Sign &amp; Submit
        </Button>
      </div>
    </Modal>
  );
}
