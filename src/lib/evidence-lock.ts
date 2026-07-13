import { prisma } from "@/lib/prisma";

/**
 * Internal helpers used by CAPA status-transition server actions to lock or
 * unlock the per-CAPA EvidenceItem rows when the CAPA leaves / re-enters the
 * investigation state.
 *
 * NOT a server action file (no `"use server"` directive) — these helpers are
 * called from already-authenticated server actions in src/actions/capas.ts.
 * They take an explicit `user` so the audit row reflects who triggered the
 * transition; callers MUST pass a resolved actor (resolveUserFk result):
 * { userId: actor.userId, name: actor.displayName, role: actor.role }. The
 * userId is null for admin (Tenant-row) actors — AUDIT Finding #5 / Rung 3G-2.
 * Tenant scoping is enforced by verifying the parent CAPA belongs to the
 * supplied tenantId before any writes.
 */

const AUDIT_MODULE_EVIDENCE = "CAPA / Evidence";
const AUDIT_MODULE_EFFECTIVENESS = "CAPA / Effectiveness";

interface ActorIdentity {
  userId: string | null;
  name: string;
  role: string;
}

/**
 * Locks every EvidenceItem for the given CAPA. Idempotent — items already
 * locked are skipped. Writes one EVIDENCE_LOCKED audit row per call when at
 * least one row was newly locked. lockedSignatureId stays null until the
 * e-signature flow lands (separate substage).
 */
export async function lockEvidenceForCAPA(
  capaId: string,
  tenantId: string,
  user: ActorIdentity,
): Promise<{ locked: number }> {
  return prisma.$transaction(async (tx) => {
    const capa = await tx.cAPA.findFirst({
      where: { id: capaId, tenantId },
      select: { id: true, description: true },
    });
    if (!capa) return { locked: 0 };

    const updated = await tx.evidenceItem.updateMany({
      where: { capaId, lockedAt: null },
      data: { lockedAt: new Date(), lockedBy: user.name },
    });

    if (updated.count > 0) {
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: user.userId,
          userName: user.name,
          userRole: user.role,
          module: AUDIT_MODULE_EVIDENCE,
          action: "EVIDENCE_LOCKED",
          recordId: capaId,
          recordTitle: capa.description.slice(0, 80),
          newValue: String(updated.count),
        },
      });
    }
    return { locked: updated.count };
  });
}

/**
 * Unlocks every EvidenceItem for the given CAPA. Idempotent — items that are
 * already unlocked are skipped. Used when a CAPA is reopened from
 * pending_qa_review / closed / rejected back to open / in_progress.
 */
export async function unlockEvidenceForCAPA(
  capaId: string,
  tenantId: string,
  user: ActorIdentity,
): Promise<{ unlocked: number }> {
  return prisma.$transaction(async (tx) => {
    const capa = await tx.cAPA.findFirst({
      where: { id: capaId, tenantId },
      select: { id: true, description: true },
    });
    if (!capa) return { unlocked: 0 };

    const updated = await tx.evidenceItem.updateMany({
      where: { capaId, NOT: { lockedAt: null } },
      data: { lockedAt: null, lockedBy: null, lockedSignatureId: null },
    });

    if (updated.count > 0) {
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: user.userId,
          userName: user.name,
          userRole: user.role,
          module: AUDIT_MODULE_EVIDENCE,
          action: "EVIDENCE_UNLOCKED",
          recordId: capaId,
          recordTitle: capa.description.slice(0, 80),
          newValue: String(updated.count),
        },
      });
    }
    return { unlocked: updated.count };
  });
}

/**
 * Locks every CAPAEffectivenessCriterion for the given CAPA. Idempotent;
 * mirrors lockEvidenceForCAPA exactly. Substage 4.6 — criteria become
 * immutable once the CAPA progresses to QA review so the success metrics
 * captured pre-implementation are exactly what's verified later.
 */
export async function lockCriteriaForCAPA(
  capaId: string,
  tenantId: string,
  user: ActorIdentity,
): Promise<{ locked: number }> {
  return prisma.$transaction(async (tx) => {
    const capa = await tx.cAPA.findFirst({
      where: { id: capaId, tenantId },
      select: { id: true, description: true },
    });
    if (!capa) return { locked: 0 };

    const updated = await tx.cAPAEffectivenessCriterion.updateMany({
      where: { capaId, tenantId, lockedAt: null },
      data: { lockedAt: new Date(), lockedBy: user.name },
    });

    if (updated.count > 0) {
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: user.userId,
          userName: user.name,
          userRole: user.role,
          module: AUDIT_MODULE_EFFECTIVENESS,
          action: "CRITERIA_LOCKED",
          recordId: capaId,
          recordTitle: capa.description.slice(0, 80),
          newValue: String(updated.count),
        },
      });
    }
    return { locked: updated.count };
  });
}

/**
 * Unlocks every CAPAEffectivenessCriterion for the given CAPA. Idempotent.
 */
export async function unlockCriteriaForCAPA(
  capaId: string,
  tenantId: string,
  user: ActorIdentity,
): Promise<{ unlocked: number }> {
  return prisma.$transaction(async (tx) => {
    const capa = await tx.cAPA.findFirst({
      where: { id: capaId, tenantId },
      select: { id: true, description: true },
    });
    if (!capa) return { unlocked: 0 };

    const updated = await tx.cAPAEffectivenessCriterion.updateMany({
      where: { capaId, tenantId, NOT: { lockedAt: null } },
      data: { lockedAt: null, lockedBy: null, lockedSignatureId: null },
    });

    if (updated.count > 0) {
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: user.userId,
          userName: user.name,
          userRole: user.role,
          module: AUDIT_MODULE_EFFECTIVENESS,
          action: "CRITERIA_UNLOCKED",
          recordId: capaId,
          recordTitle: capa.description.slice(0, 80),
          newValue: String(updated.count),
        },
      });
    }
    return { unlocked: updated.count };
  });
}

/**
 * Convenience: lock both evidence items AND effectiveness criteria for a
 * CAPA. Called by every status transition that crosses into a locked state
 * (4 call sites in capas.ts — submitForReview, signAndCloseCAPA, rejectCAPA,
 * updateCAPA boundary detection). Each helper is independently idempotent so
 * partial failures retry cleanly.
 */
export async function lockCAPAArtifacts(
  capaId: string,
  tenantId: string,
  user: ActorIdentity,
): Promise<{ evidenceLocked: number; criteriaLocked: number }> {
  const evidence = await lockEvidenceForCAPA(capaId, tenantId, user);
  const criteria = await lockCriteriaForCAPA(capaId, tenantId, user);
  return { evidenceLocked: evidence.locked, criteriaLocked: criteria.locked };
}

/**
 * Inverse of lockCAPAArtifacts — unlocks both on reopen.
 */
export async function unlockCAPAArtifacts(
  capaId: string,
  tenantId: string,
  user: ActorIdentity,
): Promise<{ evidenceUnlocked: number; criteriaUnlocked: number }> {
  const evidence = await unlockEvidenceForCAPA(capaId, tenantId, user);
  const criteria = await unlockCriteriaForCAPA(capaId, tenantId, user);
  return {
    evidenceUnlocked: evidence.unlocked,
    criteriaUnlocked: criteria.unlocked,
  };
}

/**
 * Status set that means "investigation is closed; evidence must be locked".
 * Centralised so both the lock-on-transition and the unlock-on-reopen logic
 * agree on the boundary.
 */
export const LOCKED_CAPA_STATUSES: ReadonlySet<string> = new Set([
  "pending_qa_review",
  // SME Section 1, Stage 5 (FULL) — added when the verification gate
  // landed. Once approvals collected, evidence + RCA + alignment + new
  // action-item edits should stay locked through verification too.
  // status-only updates on action items (mark complete/skipped) are
  // gated separately inside updateActionItem.
  "pending_verification",
  "closed",
  "rejected",
]);
