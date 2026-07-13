"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Lock,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { CAPAApproval as PrismaCAPAApproval } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import {
  loadApprovalsForCAPA,
  verifyCAPA,
  revokeCAPAVerification,
} from "@/actions/capas";
import { canApproveCAPA } from "@/lib/capa-approvals";
import type { CAPA } from "@/store/capa.slice";

/* ── SME Section 1, Stage 5 (FULL) — Independent QA Verification section ──
 *
 * Renders below ApprovalsSection in the Actions tab. Lifecycle:
 *   open / in_progress / pending_qa_review → grey "Verification will be
 *     required after approvals complete"
 *   pending_verification → form (if user is eligible) OR
 *     explanatory message (creator / approver / non-QA role)
 *   verified (still pending_verification + verifiedAt set) → green
 *     summary card with verifier name + notes; revoke button visible
 *     to the verifier
 *   closed / rejected → grey locked summary preserving the verifier name
 *
 * SoD client-side mirror:
 *   - userIsCreator: derived from capa.createdBy === currentUser.name
 *     (matches the server's name-equality comparison; same brittleness
 *     caveat as the existing approveCAPA self-approval guard)
 *   - userIsApprover: derived from the live approvals fetch
 *   - role gate: canApproveCAPA(role, capa.risk) — same tier-aware
 *     check the server uses
 *
 * Verification + revocation both go through SignClose-style modals so
 * the password re-prompt is consistent with approveCAPA / signAndCloseCAPA.
 */

const NOTES_MIN_LENGTH = 10;

export function VerificationSection({ capa }: { capa: CAPA }) {
  const { role } = useRole();
  const currentUser = useAppSelector((s) => s.auth.user);

  const [approvals, setApprovals] = useState<PrismaCAPAApproval[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    const result = await loadApprovalsForCAPA(capa.id);
    if (!result.success) {
      setLoadError(result.error);
      setApprovals([]);
      return;
    }
    setApprovals(result.data as PrismaCAPAApproval[]);
  }, [capa.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isPendingVerification = capa.status === "pending_verification";
  const isClosed = capa.status === "closed";
  const isRejected = capa.status === "rejected";
  const isPreVerification =
    capa.status === "open" ||
    capa.status === "in_progress" ||
    capa.status === "pending_qa_review";
  const verified = Boolean(capa.verifiedAt);

  const canRoleVerify = canApproveCAPA(role, capa.risk);
  const userIsCreator = Boolean(
    currentUser && capa.createdBy && capa.createdBy === currentUser.name,
  );
  const liveApprovals = approvals ?? [];
  const userIsApprover = Boolean(
    currentUser &&
      liveApprovals.some(
        (a) => a.approverId === currentUser.id && a.revokedAt === null,
      ),
  );
  const userIsVerifier = Boolean(
    currentUser &&
      capa.verifiedById &&
      capa.verifiedById === currentUser.id,
  );

  const canVerify =
    isPendingVerification &&
    !verified &&
    canRoleVerify &&
    !userIsCreator &&
    !userIsApprover;

  // Edge case from the task spec: if the only eligible QA people in
  // this tenant already participated as creator + approver, nobody can
  // verify. Surface this clearly rather than just hiding the form.
  const noEligibleVerifierForCurrentUser =
    isPendingVerification &&
    !verified &&
    canRoleVerify &&
    (userIsCreator || userIsApprover);

  // Modal state for the password-bearing actions.
  const [intent, setIntent] = useState<"verify" | "revoke" | null>(null);
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const closeModal = () => {
    setIntent(null);
    setNotes("");
    setPassword("");
    setActionError(null);
  };

  const submitVerify = async () => {
    if (notes.trim().length < NOTES_MIN_LENGTH) {
      setActionError(`Add verification notes (at least ${NOTES_MIN_LENGTH} characters).`);
      return;
    }
    if (!password) {
      setActionError("Password is required.");
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await verifyCAPA(capa.id, {
      notes: notes.trim(),
      password,
    });
    setBusy(false);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    closeModal();
    await refresh();
  };

  const submitRevoke = async () => {
    if (!password) {
      setActionError("Password is required.");
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await revokeCAPAVerification(capa.id, { password });
    setBusy(false);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    closeModal();
    await refresh();
  };

  const badge = (() => {
    if (verified && isPendingVerification)
      return { variant: "green" as const, text: "Verified" };
    if (verified && isClosed) return { variant: "gray" as const, text: "Verified" };
    if (isPendingVerification)
      return { variant: "amber" as const, text: "Awaiting verifier" };
    if (isClosed || isRejected)
      return { variant: "gray" as const, text: "n/a" };
    return { variant: "gray" as const, text: "Not yet required" };
  })();

  return (
    <section
      className="rounded-lg p-3"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
      aria-labelledby="verification-heading"
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          id="verification-heading"
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Independent Verification
        </h3>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>

      {isPreVerification && (
        <p
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Independent verification will be required after all approvals are collected. The verifier must be distinct from the creator AND from every approver.
        </p>
      )}

      {loadError && (
        <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>
          {loadError}
        </p>
      )}

      {verified && (
        <div
          className="space-y-2 mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          <p className="text-[11px]">
            Verified by{" "}
            <span style={{ color: "var(--text-primary)" }}>
              {capa.verifiedBy}
            </span>
            {capa.verifiedAt && <> · {dayjs(capa.verifiedAt).fromNow()}</>}
          </p>
          {capa.verificationNotes && (
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
              {capa.verificationNotes}
            </p>
          )}
          {capa.verificationSignatureId && (
            <p
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              <CheckCircle2
                className="w-3 h-3 inline mr-1"
                style={{ color: "var(--success)" }}
                aria-hidden="true"
              />
              Part-11 verification signature recorded.
            </p>
          )}
        </div>
      )}

      {(isClosed || isRejected) && (
        <div
          role="status"
          className="alert alert-info flex items-start gap-2 mb-3"
        >
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px]">
            Verification locked — CAPA has reached a terminal state.
          </p>
        </div>
      )}

      {/* Eligibility messages — render when status is pending_verification
          and current user can't verify, so they know why the form isn't
          showing. Server enforces too; these are UX. */}
      {isPendingVerification && !verified && !canRoleVerify && (
        <p
          className="text-[11px] italic"
          style={{ color: "var(--text-muted)" }}
        >
          Verification is restricted to QA roles authorised for {capa.risk} CAPA approvals.
        </p>
      )}
      {noEligibleVerifierForCurrentUser && userIsCreator && (
        <p
          className="text-[11px] italic"
          style={{ color: "var(--text-muted)" }}
        >
          You created this CAPA — verification requires a different reviewer (separation of duties).
        </p>
      )}
      {noEligibleVerifierForCurrentUser && !userIsCreator && userIsApprover && (
        <p
          className="text-[11px] italic"
          style={{ color: "var(--text-muted)" }}
        >
          You approved this CAPA — verification requires a different reviewer (separation of duties).
        </p>
      )}

      {canVerify && (
        <Button
          variant="primary"
          size="sm"
          icon={ShieldCheck}
          onClick={() => setIntent("verify")}
        >
          Verify CAPA
        </Button>
      )}

      {verified && isPendingVerification && userIsVerifier && (
        <Button
          variant="ghost"
          size="sm"
          icon={RotateCcw}
          onClick={() => setIntent("revoke")}
        >
          Revoke my verification
        </Button>
      )}

      {intent && currentUser && (
        <Modal
          open
          onClose={busy ? () => undefined : closeModal}
          title={intent === "verify" ? "Independent QA Verification" : "Revoke Verification"}
        >
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            {intent === "verify"
              ? "You are attesting that this CAPA's work is correct and complete, independently of the creator and the approvers. Per Part 11 §11.200(a)(1)(ii), re-enter your password to sign."
              : "Revoking your verification preserves the original signed record (Part 11 immutability) and clears the verifiedAt pointer so re-verification can proceed. Re-enter your password to sign the revocation."}
          </p>
          {intent === "verify" && (
            <textarea
              className="input text-[12px] min-h-[80px] mb-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`Verification notes (≥ ${NOTES_MIN_LENGTH} chars) — what did you verify?`}
              maxLength={2000}
              disabled={busy}
              aria-label="Verification notes"
            />
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
              icon={intent === "verify" ? ShieldCheck : RotateCcw}
              onClick={() => void (intent === "verify" ? submitVerify() : submitRevoke())}
              disabled={
                busy ||
                !password ||
                (intent === "verify" && notes.trim().length < NOTES_MIN_LENGTH)
              }
              loading={busy}
            >
              {intent === "verify" ? "Sign verification" : "Sign revocation"}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
