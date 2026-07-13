"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Lock,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import {
  reviewRCA,
  overrideRCAReview,
  clearRCAReview,
} from "@/actions/capas";
import type { CAPA } from "@/store/capa.slice";

/* ── SME Section 1, Stage 3 (FULL) — RCA Review section ──
 *
 * Mirrors AlignmentReviewSection structurally so future readers see one
 * consistent pattern across the two QA gates. Differences:
 *   - rcaApproved is Boolean (approved/rejected) not an enum string.
 *   - Status window: only renders the review form while CAPA is
 *     in_progress; before then there is nothing to review, after then
 *     the verdict is locked in.
 *   - SoD: hides the form for the CAPA creator with a copy-matching
 *     explanation (server enforces the same; UI is convenience).
 *   - Override path: surfaces when a prior rejection is recorded and
 *     the current user differs from the rejecter.
 */

const OVERRIDE_REASON_MIN_LENGTH = 20;

export function RcaReviewSection({
  capa,
  onReviewChange,
}: {
  capa: CAPA;
  onReviewChange?: () => void;
}) {
  const { role } = useRole();
  const currentUser = useAppSelector((s) => s.auth.user);
  // Capability mirror of the server (excludes super_admin from authoring).
  const capaCan = usePermissions("capa");
  const canReview =
    (role === "qa_head" || role === "super_admin" || role === "customer_admin") && capaCan.canReview;

  // Tighter status window than alignment review — only valid in_progress.
  // open: nothing to review yet. pending_qa_review onward: past this gate.
  const isReviewableStatus = capa.status === "in_progress";
  const isPostReview =
    capa.status === "pending_qa_review" ||
    capa.status === "closed" ||
    capa.status === "rejected";
  const isPreReview = capa.status === "open";

  const approved = capa.rcaApproved;
  const reviewed = approved !== null && approved !== undefined;
  const rejected = approved === false;
  const overridden = Boolean(capa.rcaOverrideReason);

  // SoD mirror: creator cannot review their own RCA (server enforces).
  const userIsCreator = Boolean(
    currentUser && capa.createdBy && capa.createdBy === currentUser.name,
  );
  // Override SoD: rejecter cannot override their own rejection.
  const rejectedSelf =
    Boolean(capa.rcaReviewedById) &&
    capa.rcaReviewedById === currentUser?.id;
  const canOverride =
    canReview &&
    isReviewableStatus &&
    rejected &&
    !overridden &&
    !rejectedSelf &&
    !userIsCreator;

  // Review form state.
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const submitReview = async (verdict: boolean) => {
    if (notes.trim().length < 10) {
      setError("Add review notes (at least 10 characters).");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await reviewRCA(capa.id, {
      approved: verdict,
      notes: notes.trim(),
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setNotes("");
    onReviewChange?.();
  };

  const submitOverride = async () => {
    if (overrideReason.trim().length < OVERRIDE_REASON_MIN_LENGTH) {
      setOverrideError(
        `Add an override reason (at least ${OVERRIDE_REASON_MIN_LENGTH} characters).`,
      );
      return;
    }
    setOverrideBusy(true);
    setOverrideError(null);
    const result = await overrideRCAReview(capa.id, {
      reason: overrideReason.trim(),
    });
    setOverrideBusy(false);
    if (!result.success) {
      setOverrideError(result.error);
      return;
    }
    setOverrideOpen(false);
    setOverrideReason("");
    onReviewChange?.();
  };

  const clearReview = async () => {
    setBusy(true);
    setError(null);
    const result = await clearRCAReview(capa.id);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setNotes("");
    onReviewChange?.();
  };

  return (
    <section
      className="rounded-lg p-3"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
      aria-labelledby="rca-review-heading"
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          id="rca-review-heading"
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          RCA Review
        </h3>
        {reviewed ? (
          <Badge variant={approved ? "green" : "red"}>
            {approved ? "Approved" : "Rejected"}
          </Badge>
        ) : (
          <Badge variant="gray">Not yet reviewed</Badge>
        )}
      </div>

      {isPreReview && (
        <p
          className="text-[12px] mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          Author must enter the root cause analysis before QA can review.
        </p>
      )}

      {isPostReview && (
        <div
          role="status"
          className="alert alert-info flex items-start gap-2 mb-3"
        >
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px]">
            RCA review locked — CAPA has progressed past the review phase.
          </p>
        </div>
      )}

      {reviewed && (
        <div className="space-y-2 mb-3">
          <p
            className="text-[11px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Reviewed by{" "}
            <span style={{ color: "var(--text-primary)" }}>
              {capa.rcaReviewedBy}
            </span>
            {capa.rcaReviewedAt && (
              <> · {dayjs(capa.rcaReviewedAt).fromNow()}</>
            )}
          </p>
          {capa.rcaReviewNotes && (
            <p
              className="text-[12px] whitespace-pre-wrap"
              style={{ color: "var(--text-primary)" }}
            >
              <span
                className="font-semibold mr-1"
                style={{ color: "var(--text-muted)" }}
              >
                Notes:
              </span>
              {capa.rcaReviewNotes}
            </p>
          )}

          {rejected && !overridden && (
            <div
              className="flex items-start gap-2 p-2 rounded-md"
              style={{
                background: "var(--danger-bg)",
                border: "1px solid var(--danger)",
              }}
            >
              <ShieldAlert
                className="w-3.5 h-3.5 mt-0.5 shrink-0"
                style={{ color: "var(--danger)" }}
                aria-hidden="true"
              />
              <p className="text-[11px]" style={{ color: "var(--danger)" }}>
                RCA rejected. Author must revise and request re-review, or a different QA reviewer can override with a rationale.
              </p>
            </div>
          )}

          {rejected && overridden && (
            <div
              className="rounded-md p-2"
              style={{
                background: "var(--success-bg)",
                border: "1px solid var(--success)",
              }}
            >
              <p
                className="text-[11px] font-semibold"
                style={{ color: "var(--success)" }}
              >
                <CheckCircle2
                  className="w-3 h-3 inline mr-1"
                  aria-hidden="true"
                />
                Rejection overridden by {capa.rcaOverrideBy}
                {capa.rcaOverrideAt && (
                  <> · {dayjs(capa.rcaOverrideAt).fromNow()}</>
                )}
              </p>
              {capa.rcaOverrideReason && (
                <p
                  className="text-[11px] mt-1 whitespace-pre-wrap"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span
                    className="font-semibold mr-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Reason:
                  </span>
                  {capa.rcaOverrideReason}
                </p>
              )}
            </div>
          )}

          {rejected && !overridden && rejectedSelf && (
            <p
              className="text-[11px] italic"
              style={{ color: "var(--text-muted)" }}
            >
              You rejected this RCA. A different QA reviewer must override before submission.
            </p>
          )}
        </div>
      )}

      {/* SoD message: creator cannot review their own RCA. */}
      {isReviewableStatus && canReview && userIsCreator && (
        <p
          className="text-[11px] italic mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          You created this CAPA. RCA review requires a different QA reviewer (separation of duties).
        </p>
      )}

      {/* Non-QA roles get a one-liner instead of the form. */}
      {isReviewableStatus && !canReview && (
        <p
          className="text-[11px] italic"
          style={{ color: "var(--text-muted)" }}
        >
          RCA review is restricted to QA roles (QA Head, Customer Admin, or Super Admin).
        </p>
      )}

      {/* Review form — only QA roles, only when CAPA is in_progress,
          only when reviewer ≠ creator. */}
      {isReviewableStatus && canReview && !userIsCreator && (
        <div className="space-y-2">
          <textarea
            className="input text-[12px] min-h-[60px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Review notes (≥ 10 chars) — required for any verdict"
            maxLength={2000}
            disabled={busy}
            aria-label="RCA review notes"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={CheckCircle2}
              disabled={busy || notes.trim().length < 10}
              onClick={() => void submitReview(true)}
              loading={busy}
            >
              Approve RCA
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={XCircle}
              disabled={busy || notes.trim().length < 10}
              onClick={() => void submitReview(false)}
              loading={busy}
            >
              Reject RCA
            </Button>
            {reviewed && (
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                disabled={busy}
                onClick={() => void clearReview()}
              >
                Clear review
              </Button>
            )}
          </div>
          {error && (
            <p
              role="alert"
              className="text-[11px]"
              style={{ color: "var(--danger)" }}
            >
              {error}
            </p>
          )}
        </div>
      )}

      {canOverride && (
        <Button
          variant="danger"
          size="sm"
          icon={ShieldAlert}
          className="mt-2"
          onClick={() => setOverrideOpen(true)}
        >
          Override rejection
        </Button>
      )}

      {overrideOpen && (
        <Modal
          open
          onClose={overrideBusy ? () => undefined : () => setOverrideOpen(false)}
          title="Override RCA rejection"
        >
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
            You are overriding {capa.rcaReviewedBy ?? "the reviewer"}&apos;s
            rejection so this CAPA&apos;s RCA can proceed. Per Part 11 ALCOA+,
            a recorded rationale of ≥ {OVERRIDE_REASON_MIN_LENGTH} characters is required.
          </p>
          <textarea
            className="input text-[12px] min-h-[80px] mb-2"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Why is this override warranted?"
            aria-label="Override reason"
            maxLength={2000}
            disabled={overrideBusy}
          />
          {overrideError && (
            <p
              role="alert"
              className="text-[11px] mb-2"
              style={{ color: "var(--danger)" }}
            >
              {overrideError}
            </p>
          )}
          <div
            className="flex justify-end gap-2 pt-2"
            style={{ borderTop: "1px solid var(--bg-border)" }}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOverrideOpen(false)}
              disabled={overrideBusy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={ShieldAlert}
              onClick={() => void submitOverride()}
              disabled={overrideBusy || overrideReason.trim().length < OVERRIDE_REASON_MIN_LENGTH}
              loading={overrideBusy}
            >
              Confirm override
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
