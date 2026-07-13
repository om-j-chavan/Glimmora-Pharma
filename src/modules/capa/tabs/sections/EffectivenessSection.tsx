"use client";

import { useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Lock,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import {
  recordEffectivenessReview,
  revokeEffectivenessReview,
} from "@/actions/capas";
import { canApproveCAPA } from "@/lib/capa-approvals";
import type { CAPA } from "@/store/capa.slice";

/* ── SME Section 1, Stage 6 (FULL) — Effectiveness Review section ──
 *
 * Renders below VerificationSection. Lifecycle:
 *   CAPA not yet closed → grey "scheduled at closure"
 *   closed, effectivenessDate > now → blue "due in N days" countdown
 *   closed, effectivenessDate <= now, no review → red "overdue Nd"
 *     with a Record button for eligible reviewers
 *   reviewed: green / amber / red based on verdict
 *
 * Lock states + SoD mirror the server (recordEffectivenessReview).
 * The client knows verifiedById from the CAPA prop directly (Stage 5
 * plumbing) but doesn't know the closure signerId — that comparison
 * happens server-side via SignedRecord lookup.
 */

const VERDICT_LABEL: Record<string, string> = {
  effective: "Effective",
  ineffective: "Ineffective",
  partial: "Partial",
};
const VERDICT_VARIANT: Record<string, "green" | "amber" | "red"> = {
  effective: "green",
  partial: "amber",
  ineffective: "red",
};

export function EffectivenessSection({ capa }: { capa: CAPA }) {
  const { role } = useRole();
  const currentUser = useAppSelector((s) => s.auth.user);

  const isClosed = capa.status === "closed";
  const dueAt = capa.effectivenessDate ? dayjs.utc(capa.effectivenessDate) : null;
  const now = dayjs();
  const isReviewed = Boolean(capa.effectivenessReviewedAt);
  const isOverdue = isClosed && !isReviewed && dueAt !== null && dueAt.isBefore(now);
  const daysToDue = dueAt !== null ? dueAt.diff(now, "day") : null;
  const verdict = capa.effectivenessVerdict;

  const canRoleReview = canApproveCAPA(role, capa.risk);
  const userIsReviewer = Boolean(
    currentUser &&
      capa.effectivenessReviewedById &&
      capa.effectivenessReviewedById === currentUser.id,
  );
  const canRecordReview =
    isClosed && !isReviewed && canRoleReview && currentUser !== null;

  // Modal state for record + revoke.
  const [intent, setIntent] = useState<"record" | "revoke" | null>(null);
  const [verdictChoice, setVerdictChoice] = useState<"effective" | "ineffective" | "partial">(
    "effective",
  );
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const closeModal = () => {
    setIntent(null);
    setVerdictChoice("effective");
    setNotes("");
    setPassword("");
    setActionError(null);
  };

  const submitRecord = async () => {
    if (notes.trim().length < 20) {
      setActionError("Add review notes (at least 20 characters).");
      return;
    }
    if (!password) {
      setActionError("Password is required.");
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await recordEffectivenessReview(capa.id, {
      verdict: verdictChoice,
      notes: notes.trim(),
      password,
    });
    setBusy(false);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    closeModal();
    // capa is from Redux; the calling shell should refresh after close.
  };

  const submitRevoke = async () => {
    if (!password) {
      setActionError("Password is required.");
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await revokeEffectivenessReview(capa.id, { password });
    setBusy(false);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    closeModal();
  };

  const badge = (() => {
    if (isReviewed && verdict)
      return { variant: VERDICT_VARIANT[verdict], text: VERDICT_LABEL[verdict] };
    if (isOverdue) return { variant: "red" as const, text: `Overdue ${Math.abs(daysToDue ?? 0)}d` };
    if (isClosed && dueAt !== null) {
      const d = daysToDue ?? 0;
      return { variant: "blue" as const, text: d <= 0 ? "Due today" : `Due in ${d}d` };
    }
    return { variant: "gray" as const, text: "Scheduled at closure" };
  })();

  return (
    <section
      className="rounded-lg p-3"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
      aria-labelledby="effectiveness-heading"
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          id="effectiveness-heading"
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Effectiveness Review
        </h3>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>

      {!isClosed && (
        <p
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Effectiveness review will be scheduled 90 days after closure.
        </p>
      )}

      {isClosed && dueAt !== null && !isReviewed && (
        <div className="mb-3">
          <p
            className="text-[11px]"
            style={{ color: "var(--text-secondary)" }}
          >
            <Clock className="w-3 h-3 inline mr-1" aria-hidden="true" />
            Due {dueAt.format("DD MMM YYYY")}
            {daysToDue !== null && (
              <>
                {" — "}
                {daysToDue >= 0 ? `in ${daysToDue} days` : `${Math.abs(daysToDue)} days ago`}
              </>
            )}
          </p>
        </div>
      )}

      {isOverdue && (
        <div
          role="alert"
          className="flex items-start gap-2 p-2 rounded-md mb-3"
          style={{
            background: "var(--danger-bg)",
            border: "1px solid var(--danger)",
          }}
        >
          <AlertOctagon
            className="w-3.5 h-3.5 mt-0.5 shrink-0"
            style={{ color: "var(--danger)" }}
            aria-hidden="true"
          />
          <p className="text-[11px]" style={{ color: "var(--danger)" }}>
            Effectiveness review overdue. Record the verdict to keep the audit chain current.
          </p>
        </div>
      )}

      {isReviewed && verdict && (
        <div
          className="space-y-2 mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          <p className="text-[11px]">
            Reviewed by{" "}
            <span style={{ color: "var(--text-primary)" }}>
              {capa.effectivenessReviewedBy}
            </span>
            {capa.effectivenessReviewedAt && (
              <> · {dayjs(capa.effectivenessReviewedAt).fromNow()}</>
            )}
          </p>
          {capa.effectivenessReviewNotes && (
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
              {capa.effectivenessReviewNotes}
            </p>
          )}
          {capa.effectivenessSignatureId && (
            <p
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              <CheckCircle2
                className="w-3 h-3 inline mr-1"
                style={{ color: "var(--success)" }}
                aria-hidden="true"
              />
              Part-11 effectiveness signature recorded.
            </p>
          )}
        </div>
      )}

      {/* "Ineffective" verdict — strong warning panel. */}
      {isReviewed && verdict === "ineffective" && (
        <div
          role="alert"
          className="flex items-start gap-2 p-2 rounded-md mb-3"
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
            This CAPA was found <strong>ineffective</strong>. Consider raising a new CAPA addressing the same root cause; link any new Deviations/Findings as recurrences of this CAPA so the pattern is searchable.
          </p>
        </div>
      )}

      {/* Eligibility messages. */}
      {isClosed && !isReviewed && !canRoleReview && (
        <p
          className="text-[11px] italic mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          Effectiveness review is restricted to QA roles authorised for {capa.risk} CAPA approvals.
        </p>
      )}

      {canRecordReview && (
        <Button
          variant="primary"
          size="sm"
          icon={CheckCircle2}
          onClick={() => setIntent("record")}
        >
          Record effectiveness review
        </Button>
      )}

      {isReviewed && userIsReviewer && isClosed && (
        <Button
          variant="ghost"
          size="sm"
          icon={RotateCcw}
          onClick={() => setIntent("revoke")}
        >
          Revoke my review
        </Button>
      )}

      {/* Lock note for already-reviewed CAPAs in a terminal state with
          a different viewer. */}
      {isReviewed && !userIsReviewer && (
        <p
          className="text-[11px] italic flex items-center gap-1"
          style={{ color: "var(--text-muted)" }}
        >
          <Lock className="w-3 h-3" aria-hidden="true" />
          Review locked — only {capa.effectivenessReviewedBy} can revoke.
        </p>
      )}

      {intent && currentUser && (
        <Modal
          open
          onClose={busy ? () => undefined : closeModal}
          title={intent === "record" ? "Record Effectiveness Review" : "Revoke Effectiveness Review"}
        >
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            {intent === "record"
              ? "Per Part 11 §11.200(a)(1)(ii), re-enter your password to sign the verdict. Server enforces SoD — reviewer must be different from closure signer AND verification signer."
              : "Revoking your review preserves the original signed record and clears the verdict so re-review can proceed."}
          </p>
          {intent === "record" && (
            <>
              <p
                className="text-[11px] font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Verdict
              </p>
              <Dropdown
                value={verdictChoice}
                onChange={(v) => setVerdictChoice(v as "effective" | "ineffective" | "partial")}
                options={[
                  { value: "effective", label: "Effective — CAPA prevented recurrence" },
                  { value: "partial", label: "Partial — improvement but not fully prevented" },
                  { value: "ineffective", label: "Ineffective — recurrence observed" },
                ]}
                width="w-full"
              />
              <textarea
                className="input text-[12px] min-h-[100px] mt-2 mb-2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Review notes (≥ 20 chars) — what evidence supports the verdict?"
                maxLength={4000}
                disabled={busy}
                aria-label="Effectiveness review notes"
              />
            </>
          )}
          <input
            type="password"
            className="input text-[12px] w-full mb-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            disabled={busy}
            aria-label="Password"
          />
          {actionError && (
            <p
              role="alert"
              className="text-[11px] mb-2"
              style={{ color: "var(--danger)" }}
            >
              {actionError}
            </p>
          )}
          <div
            className="flex justify-end gap-2 pt-2"
            style={{ borderTop: "1px solid var(--bg-border)" }}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={closeModal}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={intent === "record" ? CheckCircle2 : RotateCcw}
              onClick={() => void (intent === "record" ? submitRecord() : submitRevoke())}
              disabled={
                busy ||
                !password ||
                (intent === "record" && notes.trim().length < 20)
              }
              loading={busy}
            >
              {intent === "record" ? "Sign verdict" : "Sign revocation"}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
