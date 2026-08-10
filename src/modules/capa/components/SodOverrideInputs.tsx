"use client";

/**
 * CAPA Single-QA Override — justification inputs (Phase 2, PART A).
 *
 * A controlled reason-code select + justification textarea, revealed at a gate ONLY
 * when the CURRENT user would trip that gate's SoD self-check AND the tenant flag is
 * ON AND the CAPA is non-Critical (the host decides — see `capa.sodReveal`). These
 * mirror the Phase-1 server rule byte-for-byte; the server re-validates, so this is
 * guidance, not the gate. Values feed the existing action's
 * `sodOverrideReasonCode` / `sodOverrideJustification` params.
 */

import { useId } from "react";
import { ShieldAlert } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/Textarea";

/** Kept in lockstep with SOD_REASON_CODES in src/actions/capas/sod-override.ts. */
export const SOD_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "SOLE_QA_ON_SITE", label: "Sole QA on site" },
  { value: "SECOND_QA_UNAVAILABLE", label: "Second QA unavailable" },
  { value: "OTHER", label: "Other" },
];

/** Min justification length — mirrors the server (evaluateSodOverride). */
export const SOD_JUSTIFICATION_MIN = 20;

/** True when the current reason + justification would satisfy the server rule.
 *  Hosts use this to gate their submit button so the UI can't send a request the
 *  server will reject. */
export function isSodOverrideValid(reasonCode: string, justification: string): boolean {
  return (
    SOD_REASON_OPTIONS.some((o) => o.value === reasonCode) &&
    justification.trim().length >= SOD_JUSTIFICATION_MIN
  );
}

interface Props {
  reasonCode: string;
  justification: string;
  onReasonCode: (v: string) => void;
  onJustification: (v: string) => void;
  disabled?: boolean;
  className?: string;
  /** Override the explanatory copy (defaults to the CAPA wording). Lets the same
   *  component serve deviations ("non-Critical/Major deviations", recorded on the
   *  deviation) without a second implementation. */
  description?: string;
}

const DEFAULT_DESCRIPTION =
  "You would normally be blocked here (independent QA review). Your tenant permits a single-QA override for non-Critical CAPAs; this override is recorded on the CAPA and in the audit trail.";

export function SodOverrideInputs({ reasonCode, justification, onReasonCode, onJustification, disabled, className, description }: Props) {
  const len = justification.trim().length;
  const tooShort = len > 0 && len < SOD_JUSTIFICATION_MIN;
  // Per-instance id so the justification label/field association stays unique.
  // RcaReviewSection renders TWO of these (approve-waiver + override-waived,
  // separate state), so a hardcoded id could collide in the DOM.
  const justificationId = `sod-justification-${useId()}`;
  return (
    <div
      className={`rounded-md p-2.5 ${className ?? ""}`}
      style={{ background: "var(--warning-bg, #fffbeb)", border: "1px solid var(--warning, #f59e0b)" }}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--warning, #b45309)" }} aria-hidden="true" />
        Single-QA override — a reason and justification are required to proceed
      </p>
      <p className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>
        {description ?? DEFAULT_DESCRIPTION}
      </p>
      <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Reason code</label>
      {/* The empty entry is a real OPTION, not a placeholder prop, so the user
          can still clear the choice back to "" exactly as the native <select>
          allowed. Passing it via `placeholder` would make the field
          unclearable once a reason is picked. */}
      <Dropdown
        value={reasonCode}
        onChange={onReasonCode}
        options={[
          { value: "", label: "Select a reason…" },
          ...SOD_REASON_OPTIONS,
        ]}
        disabled={disabled}
        size="sm"
        width="w-full"
        className="mb-2"
      />
      <label htmlFor={justificationId} className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Justification</label>
      <Textarea
        id={justificationId}
        rows={3}
        placeholder={`Why is a single-QA override warranted? (≥ ${SOD_JUSTIFICATION_MIN} characters)`}
        value={justification}
        disabled={disabled}
        maxLength={2000}
        onChange={(e) => onJustification(e.target.value)}
      />
      <p className="text-[10px] mt-1" style={{ color: tooShort ? "var(--danger)" : "var(--text-muted)" }}>
        {len}/{SOD_JUSTIFICATION_MIN} minimum{tooShort ? " — a little more detail is required." : ""}
      </p>
    </div>
  );
}
