/**
 * CSV/CSA post-sign-off write lock (audit findings C2 + C3).
 *
 * A GxPSystem with `signedOffAt != null` carries a Part 11 e-signature whose
 * `signedOffContentHash` binds a specific snapshot of that system's state.
 * Until this module existed, `signedOffAt` was read for DISPLAY and for the
 * status-authority check in syncValidationStatus, but never as a WRITE LOCK —
 * so the inputs the hash commits to stayed freely mutable and the signature
 * could desync silently.
 *
 * This is the single guard every affected action calls. Two rules govern what
 * gets locked, and both matter:
 *
 *   LOCK   — the action writes something the canonicaliser HASHES
 *            (stage tallies, RTM coverage, part11/annex11 posture, the open-
 *            findings count, nextReview) or writes stage EVIDENCE.
 *   DON'T  — the action writes something outside the signed content. Over-
 *            locking a signed record is its own failure mode: post-validation
 *            work (raising a CAPA, tracking DI remediation, roadmap planning)
 *            must stay possible on a validated system.
 *
 * Callers are responsible for their own tenant/IDOR check BEFORE calling these
 * helpers — the lookups here are deliberately id-only so the guard cannot
 * change the existence-leak semantics a caller already established (every
 * current caller resolves and tenant-scopes its target first).
 *
 * Revocation (unsignValidation) is deliberately NOT locked — it is the
 * documented way out, and the error messages below point at it.
 */

import { prisma } from "@/lib/prisma";

/** Shown verbatim to the user. Names the escape hatch rather than dead-ending. */
export const SIGNED_OFF_LOCK_MESSAGE =
  "This system is signed off — its validated state is bound to a Part 11 " +
  "e-signature and cannot be changed. Revoke the sign-off first if this record " +
  "genuinely needs to change.";

/**
 * Returns the lock error message when the system carries a sign-off, else null.
 * `null` for a missing system too: the caller has already established existence
 * and ownership, and a not-found is that caller's error to report, not ours.
 */
export async function signOffLockError(systemId: string): Promise<string | null> {
  const sys = await prisma.gxPSystem.findUnique({
    where: { id: systemId },
    select: { signedOffAt: true },
  });
  return sys?.signedOffAt ? SIGNED_OFF_LOCK_MESSAGE : null;
}

/** Stage-scoped variant — resolves the parent system from a ValidationStage id. */
export async function signOffLockErrorForStage(stageId: string): Promise<string | null> {
  const stage = await prisma.validationStage.findUnique({
    where: { id: stageId },
    select: { system: { select: { signedOffAt: true } } },
  });
  return stage?.system?.signedOffAt ? SIGNED_OFF_LOCK_MESSAGE : null;
}

/** RTM-scoped variant — resolves the parent system from an RTMEntry id. */
export async function signOffLockErrorForRtmEntry(entryId: string): Promise<string | null> {
  const entry = await prisma.rTMEntry.findUnique({
    where: { id: entryId },
    select: { system: { select: { signedOffAt: true } } },
  });
  return entry?.system?.signedOffAt ? SIGNED_OFF_LOCK_MESSAGE : null;
}
