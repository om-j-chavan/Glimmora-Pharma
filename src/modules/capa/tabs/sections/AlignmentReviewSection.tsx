"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Lock,
  Pencil,
  RotateCcw,
  Save,
  ShieldAlert,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import {
  setCAPAAlignmentStatus,
  overrideCAPAAlignmentFlag,
  clearCAPAAlignmentReview,
} from "@/actions/capas";
import { LOCKED_CAPA_STATUSES } from "@/lib/evidence-lock";
import {
  ALIGNMENT_OVERRIDE_REASON_MIN_LENGTH,
  ALIGNMENT_STATUSES,
  type AlignmentStatus,
} from "@/lib/capa-alignment";
import type { CAPA } from "@/store/capa.slice";

/* ── Substage 4.7 — Alignment Review section ──
 *
 * Extracted from ActionsPanel as part of the file split. Behaviour
 * unchanged: reviewer assigns aligned / cosmetic / needs_review with
 * notes ≥ 10 chars; cosmetic verdicts can be overridden by a different
 * QA Head with a recorded rationale ≥ ALIGNMENT_OVERRIDE_REASON_MIN_LENGTH.
 */

const STATUS_LABEL: Record<AlignmentStatus, string> = {
  aligned: "Aligned",
  cosmetic: "Cosmetic",
  needs_review: "Needs Review",
};

const STATUS_VARIANT: Record<AlignmentStatus, "green" | "red" | "amber"> = {
  aligned: "green",
  cosmetic: "red",
  needs_review: "amber",
};

export function AlignmentReviewSection({
  capa,
  onAlignmentChange,
}: {
  capa: CAPA;
  onAlignmentChange?: () => void;
}) {
  const { role } = useRole();
  const toast = useToast();
  const currentUser = useAppSelector((s) => s.auth.user);
  // Capability mirror of the server (excludes super_admin from authoring).
  const capaCan = usePermissions("capa");
  const canReview =
    (role === "qa_head" || role === "super_admin" || role === "customer_admin") && capaCan.canReview;

  const isLocked = LOCKED_CAPA_STATUSES.has(capa.status);
  const status = capa.alignmentStatus;
  const reviewed = Boolean(status);
  const overridden = Boolean(capa.alignmentOverrideReason);
  const flaggedSelf =
    Boolean(capa.alignmentReviewedById) &&
    capa.alignmentReviewedById === currentUser?.id;

  // Override button visibility: must be cosmetic, no override yet, current
  // user can review, and the user did NOT flag the CAPA themselves
  // (separation-of-duties UI gate; the server enforces too).
  const canOverride =
    canReview &&
    !isLocked &&
    status === "cosmetic" &&
    !overridden &&
    !flaggedSelf;

  // Batch 4 Part 3 — view/edit modes. EDIT shows the textarea + verdict picker
  // + Save/Cancel; VIEW shows the saved verdict + reasoning + Edit affordance.
  const [editing, setEditing] = useState(false);
  // Mutation form state — pendingStatus is the picked verdict (committed by Save).
  const [pendingStatus, setPendingStatus] = useState<AlignmentStatus | null>(status ?? null);
  const [notes, setNotes] = useState(capa.alignmentNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setNotes(capa.alignmentNotes ?? "");
    setPendingStatus(status ?? null);
    setError(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setNotes(capa.alignmentNotes ?? "");
    setPendingStatus(status ?? null);
    setError(null);
    setEditing(false);
  };
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const submitNewStatus = async (s: AlignmentStatus) => {
    if (notes.trim().length < 10) {
      setError("Add a brief rationale (≥ 10 characters) — it's the audit record for this verdict.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await setCAPAAlignmentStatus(capa.id, {
      status: s,
      notes: notes.trim(),
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      toast.error(result.error || "Could not save alignment verdict.");
      return;
    }
    setEditing(false);
    toast.success(`Alignment set to ${STATUS_LABEL[s]}.`);
    onAlignmentChange?.();
  };

  const submitOverride = async () => {
    if (overrideReason.trim().length < ALIGNMENT_OVERRIDE_REASON_MIN_LENGTH) {
      setOverrideError(
        `Add an override reason (at least ${ALIGNMENT_OVERRIDE_REASON_MIN_LENGTH} characters).`,
      );
      return;
    }
    setOverrideBusy(true);
    setOverrideError(null);
    const result = await overrideCAPAAlignmentFlag(capa.id, {
      reason: overrideReason.trim(),
    });
    setOverrideBusy(false);
    if (!result.success) {
      setOverrideError(result.error);
      return;
    }
    setOverrideOpen(false);
    setOverrideReason("");
    onAlignmentChange?.();
  };

  const clearReview = async () => {
    setBusy(true);
    setError(null);
    const result = await clearCAPAAlignmentReview(capa.id);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      toast.error(result.error || "Could not clear alignment review.");
      return;
    }
    setEditing(false);
    setPendingStatus(null);
    setNotes("");
    toast.success("Alignment review cleared.");
    onAlignmentChange?.();
  };

  return (
    <section
      className="rounded-lg p-3"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
      aria-labelledby="alignment-review-heading"
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          id="alignment-review-heading"
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Alignment Review
        </h3>
        {status ? (
          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        ) : (
          <Badge variant="gray">Not yet reviewed</Badge>
        )}
      </div>

      {isLocked && (
        <div
          role="status"
          className="alert alert-info flex items-start gap-2 mb-3"
        >
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px]">
            Alignment review locked — CAPA has progressed to QA review.
          </p>
        </div>
      )}

      {/* Batch 4 Part 3 — VIEW mode: clean display of the saved verdict. */}
      {reviewed && !editing && (
        <div className="space-y-2 mb-3">
          <p
            className="text-[11px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Reviewed by{" "}
            <span style={{ color: "var(--text-primary)" }}>
              {capa.alignmentReviewedBy}
            </span>
            {capa.alignmentReviewedAt && (
              <> · {dayjs(capa.alignmentReviewedAt).fromNow()}</>
            )}
          </p>
          {capa.alignmentNotes && (
            <p
              className="text-[12px] whitespace-pre-wrap"
              style={{ color: "var(--text-primary)" }}
            >
              <span
                className="font-semibold mr-1"
                style={{ color: "var(--text-muted)" }}
              >
                Reasoning:
              </span>
              {capa.alignmentNotes}
            </p>
          )}

          {status === "cosmetic" && !overridden && (
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
                Flagged as cosmetic. A different QA Head must override for
                submission, or revise actions and re-review.
              </p>
            </div>
          )}

          {status === "cosmetic" && overridden && (
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
                Cosmetic flag overridden by {capa.alignmentOverrideBy}
                {capa.alignmentOverrideAt && (
                  <> · {dayjs(capa.alignmentOverrideAt).fromNow()}</>
                )}
              </p>
              {capa.alignmentOverrideReason && (
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
                  {capa.alignmentOverrideReason}
                </p>
              )}
            </div>
          )}

          {status === "cosmetic" && !overridden && flaggedSelf && (
            <p
              className="text-[11px] italic"
              style={{ color: "var(--text-muted)" }}
            >
              You flagged this CAPA as cosmetic. A different QA Head must
              override before submission.
            </p>
          )}
          {canReview && !isLocked && (
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" icon={Pencil} onClick={startEdit}>Edit</Button>
              <Button variant="ghost" size="sm" icon={RotateCcw} disabled={busy} onClick={() => void clearReview()}>Clear review</Button>
            </div>
          )}
        </div>
      )}

      {/* Read-only message when not reviewed and the viewer can't review. */}
      {!reviewed && !(canReview && !isLocked) && (
        <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
          Not yet reviewed. Action plan must be reviewed before submission.
        </p>
      )}

      {/* Batch 4 Part 3 — EDIT mode: reasoning + verdict picker + Save/Cancel. */}
      {(editing || !reviewed) && canReview && !isLocked && (
        <div className="space-y-2">
          <textarea
            className="input text-[12px] min-h-[60px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reasoning (≥ 10 chars) — the audit record for this verdict"
            maxLength={2000}
            disabled={busy}
            aria-label="Alignment review notes"
          />
          <div className="flex flex-wrap gap-2">
            {ALIGNMENT_STATUSES.map((s) => (
              <Button
                key={s}
                variant={pendingStatus === s ? "primary" : "secondary"}
                size="sm"
                disabled={busy}
                onClick={() => setPendingStatus(s)}
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {reviewed && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={cancelEdit}>Cancel</Button>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={Save}
              disabled={busy || !pendingStatus || notes.trim().length < 10}
              loading={busy}
              onClick={() => pendingStatus && void submitNewStatus(pendingStatus)}
            >
              Save verdict
            </Button>
          </div>
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
          Override cosmetic flag
        </Button>
      )}

      {overrideOpen && (
        <Modal
          open
          onClose={overrideBusy ? () => undefined : () => setOverrideOpen(false)}
          title="Override cosmetic flag"
        >
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
            You are overriding {capa.alignmentReviewedBy ?? "the reviewer"}&apos;s
            cosmetic flag so this CAPA can be submitted. Per Part 11 ALCOA+,
            a recorded rationale of ≥ 20 characters is required.
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
              disabled={overrideBusy || overrideReason.trim().length < ALIGNMENT_OVERRIDE_REASON_MIN_LENGTH}
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
