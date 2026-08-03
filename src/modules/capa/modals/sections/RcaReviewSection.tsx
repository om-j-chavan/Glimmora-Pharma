"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Lock,
  Pencil,
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
  updateCAPA,
} from "@/actions/capas";
import type { CAPA } from "@/store/capa.slice";
import { SodOverrideInputs, isSodOverrideValid } from "@/modules/capa/components/SodOverrideInputs";

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
  // Single-QA override reveal (Phase 2, PART A). sodReveal is server-computed and
  // already folds in this user's identity + the tenant flag + Critical floor, so the
  // reveal here mirrors the Phase-1 gates exactly. approveWaiver covers BOTH self-
  // checks inside reviewRCA (creator=reviewer and editor=approver).
  const reveal = capa.sodReveal;
  const sodBase = Boolean(reveal?.flagOn) && Boolean(reveal) && !reveal!.isCritical;
  const approveWaiver = sodBase && (reveal!.rcaApproval || reveal!.rcaEditor);
  const rejectionWaiver = sodBase && reveal!.rcaRejectionOverride;

  const canOverrideBase =
    canReview && isReviewableStatus && rejected && !overridden && !userIsCreator;
  const canOverride = canOverrideBase && !rejectedSelf;
  // Override own rejection ONLY under the single-QA override (flag ON, non-Critical).
  const canOverrideWaived = canOverrideBase && rejectedSelf && rejectionWaiver;

  // Review form state.
  const [notes, setNotes] = useState("");
  // Single-QA override justification inputs (review form + override modal).
  const [sodReason, setSodReason] = useState("");
  const [sodJust, setSodJust] = useState("");
  const [ovSodReason, setOvSodReason] = useState("");
  const [ovSodJust, setOvSodJust] = useState("");
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
    if (approveWaiver && !isSodOverrideValid(sodReason, sodJust)) {
      setError("Select a reason code and add a justification (≥ 20 chars) to proceed under single-QA override.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await reviewRCA(capa.id, {
      approved: verdict,
      notes: notes.trim(),
      sodOverrideReasonCode: approveWaiver ? sodReason : undefined,
      sodOverrideJustification: approveWaiver ? sodJust.trim() : undefined,
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
    if (canOverrideWaived && !isSodOverrideValid(ovSodReason, ovSodJust)) {
      setOverrideError("Select a reason code and add a justification (≥ 20 chars) to proceed under single-QA override.");
      return;
    }
    setOverrideBusy(true);
    setOverrideError(null);
    const result = await overrideRCAReview(capa.id, {
      reason: overrideReason.trim(),
      sodOverrideReasonCode: canOverrideWaived ? ovSodReason : undefined,
      sodOverrideJustification: canOverrideWaived ? ovSodJust.trim() : undefined,
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

  // CAPA lifecycle rework — RCA text edit (Review-tab card). Editable only while
  // the CAPA is open / in_progress (updateCAPA's own status lock enforces this
  // server-side too). The write stamps rcaEditedById and, if the RCA was already
  // approved, auto-voids the approval (server) — so a DIFFERENT reviewer must
  // re-approve (editor ≠ approver).
  const canEditRca = canReview && (isPreReview || isReviewableStatus);
  const [editOpen, setEditOpen] = useState(false);
  const [rcaDraft, setRcaDraft] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const submitRcaEdit = async () => {
    if (rcaDraft.trim().length < 1) {
      setEditError("Root cause analysis cannot be empty.");
      return;
    }
    setEditBusy(true);
    setEditError(null);
    // title is required by the update schema; resend it unchanged so only the
    // RCA text edits (which triggers the server-side rcaEditedById stamp +
    // approval auto-void).
    const result = await updateCAPA(capa.id, { title: capa.title, rca: rcaDraft.trim() });
    setEditBusy(false);
    if (!result.success) {
      setEditError(result.error);
      return;
    }
    setEditOpen(false);
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
        <div className="flex items-center gap-2">
          {canEditRca && (
            <Button variant="ghost" size="xs" icon={Pencil} disabled={editBusy} onClick={() => { setRcaDraft(capa.rca ?? ""); setEditError(null); setEditOpen(true); }}>
              Edit RCA
            </Button>
          )}
          {reviewed ? (
            <Badge variant={approved ? "green" : "red"}>
              {approved ? "Approved" : "Rejected"}
            </Badge>
          ) : (
            <Badge variant="gray">Not yet reviewed</Badge>
          )}
        </div>
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

      {/* SoD message: creator cannot review their own RCA — UNLESS the single-QA
          override applies (flag ON, non-Critical), in which case the form + the
          justification inputs are revealed below instead. */}
      {isReviewableStatus && canReview && userIsCreator && !approveWaiver && (
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

      {/* Review form — only QA roles, only when CAPA is in_progress. Normally
          hidden for the creator; revealed WITH the single-QA override inputs when
          the waiver applies (flag ON, non-Critical). */}
      {isReviewableStatus && canReview && (!userIsCreator || approveWaiver) && (
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
          {approveWaiver && (
            <SodOverrideInputs
              reasonCode={sodReason}
              justification={sodJust}
              onReasonCode={setSodReason}
              onJustification={setSodJust}
              disabled={busy}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={CheckCircle2}
              disabled={busy || notes.trim().length < 10 || (approveWaiver && !isSodOverrideValid(sodReason, sodJust))}
              onClick={() => void submitReview(true)}
              loading={busy}
            >
              Approve RCA
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={XCircle}
              disabled={busy || notes.trim().length < 10 || (approveWaiver && !isSodOverrideValid(sodReason, sodJust))}
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

      {(canOverride || canOverrideWaived) && (
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
          {/* You rejected this RCA yourself — overriding your own rejection is only
              permitted under the single-QA override (in addition to the rationale
              above). */}
          {canOverrideWaived && (
            <SodOverrideInputs
              reasonCode={ovSodReason}
              justification={ovSodJust}
              onReasonCode={setOvSodReason}
              onJustification={setOvSodJust}
              disabled={overrideBusy}
              className="mb-2"
            />
          )}
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
              disabled={overrideBusy || overrideReason.trim().length < OVERRIDE_REASON_MIN_LENGTH || (canOverrideWaived && !isSodOverrideValid(ovSodReason, ovSodJust))}
              loading={overrideBusy}
            >
              Confirm override
            </Button>
          </div>
        </Modal>
      )}

      {/* Edit-RCA modal (CAPA lifecycle rework) — open/in_progress only. Saving
          via updateCAPA stamps rcaEditedById; if the RCA was approved the server
          auto-voids the approval so a DIFFERENT reviewer must re-approve. */}
      {editOpen && (
        <Modal open onClose={editBusy ? () => undefined : () => setEditOpen(false)} title="Edit root cause analysis">
          {approved === true && (
            <p className="text-[12px] mb-2 rounded-md px-2 py-1.5" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
              This RCA is approved. Editing it will <strong>clear the approval</strong> — a different QA reviewer must review it again.
            </p>
          )}
          <textarea
            className="input text-[12px] w-full min-h-32 mb-2"
            placeholder="Root cause analysis…"
            value={rcaDraft}
            onChange={(e) => setRcaDraft(e.target.value)}
            maxLength={10000}
            disabled={editBusy}
          />
          {editError && <p className="text-[11px] mb-2" style={{ color: "var(--danger)" }}>{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={editBusy} onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={editBusy} disabled={editBusy || rcaDraft.trim().length < 1} onClick={() => void submitRcaEdit()}>Save RCA</Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
