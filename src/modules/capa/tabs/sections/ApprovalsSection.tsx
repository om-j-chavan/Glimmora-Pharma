"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  ShieldCheck,
} from "lucide-react";
import type {
  CAPAApproval as PrismaCAPAApproval,
  CAPAComment as PrismaCAPAComment,
} from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import {
  approveCAPA,
  revokeCAPAApproval,
  loadApprovalsForCAPA,
} from "@/actions/capas";
import { loadCommentsForCAPA } from "@/actions/capa-comments";
import {
  APPROVAL_REQUIREMENTS,
  canApproveCAPA,
  evaluateApprovalProgress,
  type ApprovalRequirement,
  type ApprovalTier,
} from "@/lib/capa-approvals";
import type { CAPA } from "@/store/capa.slice";
import { roleLabel } from "../utils/commentTree";
import { SignApprovalModal } from "../modals/SignApprovalModal";
import { ApprovalBriefPanel } from "./ApprovalBriefPanel";

/* ── Substage 5.2 — Approvals subsection ──
 *
 * Extracted from ActionsPanel as part of the file split. Behaviour
 * unchanged: count-based approval gate (1 qa_head + 1 RA for Critical;
 * 1 qa_head for High/Medium/Low), Part 11 e-sig via SignApprovalModal,
 * unresolved-concern gate from §5.3 enforced via comment refresh.
 *
 * The shell pumps `discussionVersion` down on every comment-thread
 * mutation so this section's evaluateApprovalProgress() runs against
 * fresh comment state and stays in sync with the close-button gate.
 */

export function ApprovalsSection({
  capa,
  discussionVersion,
}: {
  capa: CAPA;
  discussionVersion: number;
}) {
  const { role } = useRole();
  const currentUser = useAppSelector((s) => s.auth.user);
  const [approvals, setApprovals] = useState<PrismaCAPAApproval[] | null>(null);
  const [comments, setComments] = useState<PrismaCAPAComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Refetch BOTH approvals and comments — comments feed into
  // evaluateApprovalProgress's unresolved-concern count which gates approval.
  const refresh = useCallback(async () => {
    setLoadError(null);
    const [approvalsResult, commentsResult] = await Promise.all([
      loadApprovalsForCAPA(capa.id),
      loadCommentsForCAPA(capa.id),
    ]);
    if (!approvalsResult.success) {
      setLoadError(approvalsResult.error);
      setApprovals([]);
      setLoading(false);
      return;
    }
    setApprovals(approvalsResult.data as PrismaCAPAApproval[]);
    if (commentsResult.success) {
      setComments(commentsResult.data as PrismaCAPAComment[]);
    } else {
      // Tolerate a comments-load failure: the approval flow still works,
      // but the unresolved-concern gate falls back to "no concerns" UI-side
      // (the server enforces correctly regardless).
      setComments([]);
    }
    setLoading(false);
  }, [capa.id]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh, discussionVersion]);

  // Tier requirements + progress evaluation. We pass the same pure function
  // the same data the server's close-gate uses — comments included — so
  // the UI badge and the server's reason: "UNRESOLVED_CONCERNS" are aligned.
  const requirements: ApprovalRequirement[] =
    APPROVAL_REQUIREMENTS[capa.risk as ApprovalTier] ?? [];
  const safeApprovals = approvals ?? [];
  const progress = evaluateApprovalProgress(
    capa.risk as ApprovalTier,
    safeApprovals.map((a) => ({
      approverRole: a.approverRole,
      approverId: a.approverId,
    })),
    comments.map((c) => ({
      isConcern: c.isConcern,
      resolvedAt: c.resolvedAt,
      deletedAt: c.deletedAt,
    })),
  );
  const totalRequired = requirements.reduce((sum, r) => sum + r.count, 0);
  const totalCollected = totalRequired - progress.missing.reduce((s, r) => s + r.count, 0);

  const isPending = capa.status === "pending_qa_review";
  const isClosed = capa.status === "closed";
  const isRejected = capa.status === "rejected";
  const concernsBlock = progress.unresolvedConcerns > 0;

  // Eligibility for the current user to approve right now: role is in the
  // tier requirement, CAPA is awaiting approvals, user hasn't already
  // approved, and there are still slots to fill. Whether the button is
  // ENABLED is gated separately on unresolved-concerns count.
  const userAlreadyApproved = currentUser
    ? safeApprovals.some((a) => a.approverId === currentUser.id)
    : false;
  const slotsRemaining = progress.missing.length > 0;
  // Stage 5 (partial) — Part 11 §11.10(d) separation of duties.
  // Client mirror of the approveCAPA server guard: creator cannot be
  // their own approver. Display-name comparison (createdBy is a string,
  // not a userId) — same brittleness caveat as the server side.
  const userIsCreator = !!(
    currentUser && capa.createdBy && capa.createdBy === currentUser.name
  );
  const canApprove =
    isPending &&
    canApproveCAPA(role, capa.risk) &&
    !userAlreadyApproved &&
    !userIsCreator &&
    slotsRemaining;

  // Status-badge logic (per spec). "Ready for closure" only when satisfied
  // (which requires both slots full AND no unresolved concerns).
  const badge: { variant: "gray" | "amber" | "green" | "red"; text: string } = (() => {
    if (capa.status === "open" || capa.status === "in_progress") {
      return { variant: "gray", text: "Not yet submitted" };
    }
    if (isRejected) return { variant: "red", text: "Rejected" };
    if (isClosed) return { variant: "gray", text: "Closed" };
    if (progress.satisfied) return { variant: "green", text: "Ready for closure" };
    return {
      variant: "amber",
      text: `Awaiting approvals (${totalCollected}/${totalRequired})`,
    };
  })();

  // Sign-modal state. `intent` drives both title + which server action
  // runs on confirm; null = modal closed. The password is held only for
  // the lifetime of the modal and explicitly cleared on every close path.
  type SignIntent =
    | { kind: "approve" }
    | { kind: "revoke"; approvalId: string };
  const [signIntent, setSignIntent] = useState<SignIntent | null>(null);

  const closeSignModal = () => {
    setSignIntent(null);
  };

  const handleSignSubmit = async (
    password: string,
  ): Promise<{ success: true } | { success: false; error: string }> => {
    if (!signIntent) return { success: false, error: "No signing context" };
    setBusy(true);
    setActionError(null);
    if (signIntent.kind === "approve") {
      const result = await approveCAPA(capa.id, {
        password,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setBusy(false);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      setComment("");
      setSignIntent(null);
      await refresh();
      return { success: true };
    }
    // Revoke
    const result = await revokeCAPAApproval(signIntent.approvalId, {
      password,
    });
    setBusy(false);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    setSignIntent(null);
    await refresh();
    return { success: true };
  };

  return (
    <>
      {/* Feature J — read-only AI brief to support the reviewer. Self-gates on
          AGI mode/agent + pending_qa_review; renders null otherwise. */}
      <ApprovalBriefPanel
        capa={capa}
        approvalsCollected={totalCollected}
        approvalsRequired={totalRequired}
        unresolvedConcerns={progress.unresolvedConcerns}
      />
      <section
        className="rounded-lg p-3"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
        aria-labelledby="approvals-heading"
      >
      <div className="flex items-center justify-between mb-2">
        <h3
          id="approvals-heading"
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Approvals
        </h3>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>

      <p
        className="text-[11px] mb-2"
        style={{ color: "var(--text-secondary)" }}
      >
        Required for <strong>{capa.risk}</strong> CAPA:{" "}
        {requirements
          .map(
            (r) =>
              `${r.count} distinct ${roleLabel(r.role)} approval${r.count === 1 ? "" : "s"}`,
          )
          .join(" + ")}
        .
      </p>

      {loading && (
        <p
          role="status"
          aria-live="polite"
          className="text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          Loading approvals…
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>
          {loadError}
        </p>
      )}

      {!loading && !loadError && (
        <ul role="list" className="space-y-1.5 mb-2">
          {requirements.flatMap((req) => {
            const collected = safeApprovals.filter(
              (a) => a.approverRole === req.role,
            );
            const slots: React.ReactNode[] = [];
            for (let i = 0; i < req.count; i++) {
              const a = collected[i];
              if (a) {
                slots.push(
                  <li
                    key={`${req.role}-${i}`}
                    className="flex items-start gap-2 text-[11px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <Check
                      className="w-3.5 h-3.5 shrink-0 mt-0.5"
                      style={{ color: "var(--success)" }}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <span style={{ color: "var(--text-primary)" }}>
                        {roleLabel(req.role)} approval {i + 1} of {req.count} —{" "}
                        {a.approverName}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {" · "}
                        {dayjs(a.approvedAt).fromNow()}
                      </span>
                      {a.comment && (
                        <p
                          className="italic mt-0.5 whitespace-pre-wrap"
                          style={{ color: "var(--text-muted)" }}
                        >
                          &ldquo;{a.comment}&rdquo;
                        </p>
                      )}
                    </div>
                    {isPending &&
                      currentUser &&
                      a.approverId === currentUser.id && (
                        <button
                          type="button"
                          onClick={() =>
                            setSignIntent({ kind: "revoke", approvalId: a.id })
                          }
                          disabled={busy}
                          aria-label={`Revoke your approval`}
                          className="text-[10px] underline border-none bg-transparent cursor-pointer px-1"
                          style={{ color: "var(--danger)" }}
                        >
                          Revoke
                        </button>
                      )}
                  </li>,
                );
              } else {
                slots.push(
                  <li
                    key={`${req.role}-${i}`}
                    className="flex items-start gap-2 text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Circle
                      className="w-3.5 h-3.5 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>
                      {roleLabel(req.role)} approval {i + 1} of {req.count} —
                      Pending
                    </span>
                  </li>,
                );
              }
            }
            return slots;
          })}
        </ul>
      )}

      {progress.satisfied && isPending && (
        <p
          className="text-[11px] mt-2"
          style={{ color: "var(--success)" }}
        >
          <ShieldCheck
            className="w-3 h-3 inline mr-1"
            aria-hidden="true"
          />
          All required approvals collected. QA Head with signing authority can
          now Sign &amp; Close.
        </p>
      )}

      {canApprove && (
        <div className="space-y-2 mt-2">
          {concernsBlock && (
            <p
              role="alert"
              className="text-[11px] rounded-md p-2"
              style={{
                background: "var(--warning-bg)",
                color: "var(--warning)",
                border: "1px solid var(--warning)",
              }}
            >
              <AlertTriangle
                className="w-3 h-3 inline mr-1"
                aria-hidden="true"
              />
              Resolve {progress.unresolvedConcerns} concern
              {progress.unresolvedConcerns === 1 ? "" : "s"} above before
              approving.
            </p>
          )}
          <textarea
            className="input text-[12px] min-h-[60px]"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment"
            maxLength={2000}
            disabled={busy || concernsBlock}
            aria-label="Approval comment"
          />
          <Button
            variant="primary"
            size="sm"
            icon={ShieldCheck}
            disabled={busy || concernsBlock}
            onClick={() => setSignIntent({ kind: "approve" })}
            loading={busy}
          >
            Approve as {roleLabel(role)}
          </Button>
        </div>
      )}

      {/* Sign modal — Part 11 §11.200(a)(1)(ii) re-authentication. */}
      {signIntent && currentUser && (
        <SignApprovalModal
          intent={signIntent}
          currentUser={currentUser}
          capa={capa}
          comment={comment}
          busy={busy}
          onClose={closeSignModal}
          onSubmit={handleSignSubmit}
        />
      )}

      {isPending && userAlreadyApproved && (
        <p
          className="text-[11px] italic mt-2"
          style={{ color: "var(--text-muted)" }}
        >
          You have already recorded your approval. Use Revoke above to take it
          back.
        </p>
      )}

      {isPending &&
        !userAlreadyApproved &&
        userIsCreator &&
        canApproveCAPA(role, capa.risk) && (
          <p
            className="text-[11px] italic mt-2"
            style={{ color: "var(--text-muted)" }}
          >
            You created this CAPA — a different approver is required (separation of duties).
          </p>
        )}

      {isPending &&
        !userAlreadyApproved &&
        !userIsCreator &&
        !canApproveCAPA(role, capa.risk) && (
          <p
            className="text-[11px] italic mt-2"
            style={{ color: "var(--text-muted)" }}
          >
            Your role is not among the required approvers for a {capa.risk}{" "}
            CAPA.
          </p>
        )}

      {actionError && (
        <p
          role="alert"
          className="text-[11px] mt-2"
          style={{ color: "var(--danger)" }}
        >
          {actionError}
        </p>
      )}
      </section>
    </>
  );
}
