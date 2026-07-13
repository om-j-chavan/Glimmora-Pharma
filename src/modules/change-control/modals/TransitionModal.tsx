"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ChangeControlStatus } from "@/lib/change-control-constants";
import type { CCDetail } from "../_shared";

/** Substage 5.4 — consequential transitions require a Part 11 e-signature. */
const SIGNED_TARGETS: ReadonlySet<ChangeControlStatus> = new Set([
  "Approved",
  "Rejected",
  "Closed",
]);

/**
 * Status-transition modal. Shared form for all CC state changes
 * (Submit for review / Approve / Reject / Request revisions / Start
 * implementation / Mark implemented / Close). Comment is required only
 * for Reject and "Request revisions" (returning to Draft from In Review);
 * actual implementation date is required only for the Implemented
 * transition. A password input is shown — and required — only when the
 * target status is one of the consequential set (Approved / Rejected /
 * Closed); other targets stay administrative.
 */
export function TransitionModal({
  cc,
  transitionTarget,
  transitionComment,
  transitionDate,
  transitionPassword,
  transitionBusy,
  transitionError,
  onCommentChange,
  onDateChange,
  onPasswordChange,
  onCancel,
  onConfirm,
}: {
  cc: CCDetail;
  transitionTarget: ChangeControlStatus;
  transitionComment: string;
  transitionDate: string;
  transitionPassword: string;
  transitionBusy: boolean;
  transitionError: string | null;
  onCommentChange: (s: string) => void;
  onDateChange: (s: string) => void;
  onPasswordChange: (s: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isSigned = SIGNED_TARGETS.has(transitionTarget);
  return (
    <Modal
      open
      onClose={transitionBusy ? () => undefined : onCancel}
      title={`Transition to ${transitionTarget}`}
    >
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        From <strong>{cc.status}</strong> →{" "}
        <strong>{transitionTarget}</strong>
      </p>
      {isSigned && (
        <p
          id="transition-part11-notice"
          className="alert alert-info mb-3 text-[11px]"
        >
          This transition requires a 21 CFR Part 11 signature. Your
          identity, the meaning of this signature ({transitionTarget}), and
          a content hash will be recorded and cannot be altered.
        </p>
      )}
      {transitionTarget === "Implemented" && (
        <div className="mb-3">
          <label
            htmlFor="transition-actual-date"
            className="block text-[11px] font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Actual implementation date *
          </label>
          <input
            id="transition-actual-date"
            type="date"
            className="input text-[12px]"
            value={transitionDate}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={transitionBusy}
          />
        </div>
      )}
      <textarea
        className="input text-[12px] min-h-[80px] mb-2"
        value={transitionComment}
        onChange={(e) => onCommentChange(e.target.value)}
        placeholder={
          transitionTarget === "Rejected" || transitionTarget === "Draft"
            ? "Reason (required)"
            : "Comment (optional)"
        }
        maxLength={2000}
        disabled={transitionBusy}
        aria-label="Transition comment"
      />
      {isSigned && (
        <div className="mb-2">
          <label
            htmlFor="transition-password"
            className="block text-[11px] font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Confirm your password <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            id="transition-password"
            type="password"
            className="input text-[12px]"
            value={transitionPassword}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Re-enter your password"
            disabled={transitionBusy}
            autoComplete="current-password"
          />
          <p
            className="text-[10px] mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            Required for identity verification under 21 CFR Part 11
          </p>
        </div>
      )}
      {transitionError && (
        <p
          role="alert"
          className="text-[11px] mb-2"
          style={{ color: "var(--danger)" }}
        >
          {transitionError}
        </p>
      )}
      <div
        className="flex justify-end gap-2 pt-2"
        style={{ borderTop: "1px solid var(--bg-border)" }}
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={transitionBusy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={
            transitionBusy ||
            (transitionTarget === "Implemented" && !transitionDate) ||
            ((transitionTarget === "Rejected" ||
              (transitionTarget === "Draft" && cc.status === "In Review")) &&
              transitionComment.trim().length === 0) ||
            (isSigned && transitionPassword.length === 0)
          }
          loading={transitionBusy}
          onClick={onConfirm}
        >
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
