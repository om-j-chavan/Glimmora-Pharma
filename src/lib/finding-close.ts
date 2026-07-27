/**
 * SINGLE SOURCE OF TRUTH for "may this finding be closed?" (Item 17).
 *
 * Imported by BOTH the server (closeFinding / reviewFinding / updateFinding's
 * status→Closed transition all enforce it) and the client UI (the gap detail
 * renders the blocker + the pointer to the RCA section), so the two can never
 * disagree about what blocks a close. Framework-agnostic: NO React, NO Prisma —
 * plain data in, ordered blockers out. Same pattern as capa-readiness.ts and
 * permissions/roleSets.ts.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * A finding cannot be closed until its root cause analysis is recorded, AND the
 * person closing it is not the person who recorded it.
 *
 * The second half is what makes this a control rather than a formality. Of the
 * four ways a finding closes, THREE have no reviewer distinct from the RCA's
 * author:
 *   closeFinding                  — a QA-only direct close. No review moment.
 *   reviewFinding                 — SoD enforced, but reviewer != ASSIGNEE, which
 *                                   says nothing about who wrote the RCA.
 *   updateFinding status→Closed   — the general editor. No review moment.
 * Gating those on "an RCA exists" alone would let QA write the analysis and
 * immediately close on it: the gate would verify its own author's work. A
 * precondition checked by the person who satisfied it checks nothing.
 *
 * The escape hatch is deliberate, not incidental: the RAISER may author the RCA
 * (canEditFindingRecord), so the normal shape is raiser writes → QA closes. The
 * SoD pushes authorship toward the raiser, which is where Item 16 already decided
 * it belongs. It only degenerates when the raiser IS the sole QA Head — the same
 * edge reviewFinding's own SoD already has.
 *
 * ── WHAT THIS DOES NOT GATE ─────────────────────────────────────────────────
 * The CAPA cascade (FINDING_CLOSED_BY_CAPA, capas/closure.ts) is EXEMPT, and must
 * be: a finding escalated to a live CAPA is read-only (findingLockedByCapa), so it
 * can never receive a gap-side RCA. Gating that path would deadlock those records
 * permanently — they could neither take an RCA nor close without one. Five findings
 * in dev are in exactly that state today.
 *
 * The exemption is SAFE because closure-via-CAPA is already RCA-gated on the CAPA
 * side. The chain, link by link:
 *
 *   a finding closes via the cascade
 *     ← signAndCloseCAPA requires status ∈ (pending_qa_review | pending_verification)
 *                                                        capas/closure.ts:160
 *     ← ONLY submitForReview reaches pending_qa_review   capas/lifecycle.ts:1445
 *       (optimistic-locked on status "in_progress")
 *     ← submitForReview requires getCAPAReadiness().allMet  capas/lifecycle.ts:1406
 *     ← readiness requires rcaApproved === true          capa-readiness.ts:96
 *     ← rcaApproved is set by reviewRCA, SoD: reviewer != creator
 *                                                        capas/rca-review.ts:127
 *
 * ⚠ THE RISK, NAMED: signAndCloseCAPA NEVER CHECKS rcaApproved ITSELF. There is no
 * getCAPAReadiness call anywhere in capas/closure.ts. The backing for this
 * exemption is two steps away, in submitForReview's gate. If someone adds a second
 * door to pending_qa_review, or relaxes the readiness gate, this exemption silently
 * loses its justification and NOTHING FAILS — no test breaks, no type errors, and
 * findings start closing with no RCA anywhere. This comment is the only thing that
 * makes that dependency visible. If you are touching either of those, you are
 * touching this.
 *
 * ── GRANDFATHERED RECORDS ───────────────────────────────────────────────────
 * A gate binds NEW closures. Findings already Closed without an RCA (3 in dev) were
 * closed under the rules that existed then, and stay closed. They are not a backlog
 * to repair: saveFindingRCA refuses a Closed finding, so nobody CAN retro-fit one,
 * and nobody should try to with a backfill — that would be manufacturing an
 * assessment nobody performed, dated after the decision it supposedly justified.
 */

export interface CloseableFinding {
  /** The readable RCA mirror — the honest test for "was the assessment performed?",
   *  since it is what the detail renders and what a reader would read. */
  rootCause?: string | null;
  /** The RCA's author (Item 17). Null = never recorded, or recorded before the
   *  column existed — an UNKNOWN author, which never satisfies the SoD check. */
  rcaRecordedById?: string | null;
  /** Non-null while a live CAPA owns this gap — the cascade path, exempt above. */
  linkedCAPAId?: string | null;
}

export type FindingCloseBlockerKey = "rca_missing" | "rca_self_close";

export interface FindingCloseBlocker {
  key: FindingCloseBlockerKey;
  /** Shown verbatim to the user AND returned verbatim as the server's error, so the
   *  two never drift into telling different stories about the same refusal. */
  message: string;
}

/**
 * The blockers preventing `actorUserId` from closing `finding`, in order. Empty =
 * closeable. Pure.
 *
 * `actorUserId` may be null (an admin login with no User row). A null actor can
 * never match a null rcaRecordedById — the same fail-closed guard canEditRisk and
 * canEditFindingRecord use, for the same reason: null === null must not read as
 * "the same person".
 *
 * Callers are responsible for the CAPA exemption: pass a finding on the cascade
 * path and it will be blocked, because from this function's view it simply has no
 * RCA. capas/closure.ts does not call this at all — see the chain above.
 */
export function findingCloseBlockers(
  finding: CloseableFinding,
  actorUserId: string | null | undefined,
): FindingCloseBlocker[] {
  const blockers: FindingCloseBlocker[] = [];

  if (!finding.rootCause?.trim()) {
    blockers.push({
      key: "rca_missing",
      message: "This finding needs a root cause analysis before it can be closed.",
    });
    // No self-close check when there is no RCA: there is no author to compare
    // against, and reporting both would be two complaints about one absence.
    return blockers;
  }

  if (!!actorUserId && !!finding.rcaRecordedById && actorUserId === finding.rcaRecordedById) {
    blockers.push({
      key: "rca_self_close",
      message:
        "You recorded this finding's root cause analysis, so you cannot close it. Separation of duties requires a different reviewer.",
    });
  }

  return blockers;
}
