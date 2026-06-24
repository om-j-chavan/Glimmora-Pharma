"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { CAPA_CLOSE_ROLES } from "@/lib/permissions/roleSets";
import { lockCAPAArtifacts } from "@/lib/evidence-lock";
import {
  evaluateApprovalProgress,
  type ApprovalTier,
} from "@/lib/capa-approvals";
// CHANGE CONTROL HIDDEN — 6.4 dependency gate bypassed inside
// signAndCloseCAPA. `evaluateCCDependencies` stays imported because
// `loadCAPACCDeps` (the read-only helper exported from this file) still
// works for any future caller. The two gate-only helpers below are
// commented and re-added when the gate is restored.
import { evaluateCCDependencies } from "@/lib/cc-dependencies";
// import {
//   canMarkCAPAImplemented,
//   ccDepsSnapshot,
// } from "@/lib/cc-dependencies";
import {
  canonicalizeCAPAClosureContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import { SIGNING_AUDIT_MODULE, type ActionResult } from "./_types";
import { readSigningProvenance } from "./_shared";

const SignCloseCAPASchema = z.object({
  // Re-authentication password (Part 11 §11.200(a)(1)(ii)).
  password: z.string().min(1, "Password is required to sign"),
  // Free-form selection from the SignClose modal — e.g. "approve",
  // "verify", "confirm". Embedded in the canonical content so the
  // signed record carries the operator's stated meaning.
  signatureMeaning: z.string().min(1, "Signature meaning is required"),
  // The signer's attestation that they confirmed the effectiveness check at
  // sign time (the SignClose modal's "Effectiveness check confirmed" toggle).
  // Recorded in the closure-signature audit row so the toggle is not decorative.
  effectivenessConfirmed: z.boolean().optional(),
  ccBlockOverride: z
    .object({ reason: z.string().min(20) })
    .optional(),
});

/* ── CAPA closure path + CC dependency loader ──
 *
 * signAndCloseCAPA carries three gates:
 *   1. Substage 5.2 — count-based approval gate
 *   2. Substage 5.2 §5.3 — unresolved-concerns gate
 *   3. Substage 6.4 — Linked Change Control dependency gate (with
 *                     risk-proportionate hard / soft branches)
 *
 * loadCAPACCDeps is the client-callable read used by ActionsPanel's
 * Sign & Close pre-flight UX.
 */

export async function signAndCloseCAPA(
  id: string,
  input: z.input<typeof SignCloseCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SignCloseCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const ccBlockOverride = parsed.data.ccBlockOverride;

  if (!CAPA_CLOSE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can sign and close CAPAs" };
  }

  if (!session.user.gxpSignatory) {
    return { success: false, error: "GxP signatory authority is required to sign and close" };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Substage 5.2 — count-based approval gate + §5.3 unresolved-concerns
  // gate. Plus substage 6.4 — Linked Change Control dependency gate. All
  // three must clear before the lock + status flip so a CAPA can't enter
  // "closed" with either a pending approver slot, a pending discussion
  // concern, or an unfulfilled CC dependency.
  const existing = await prisma.cAPA.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true,
      risk: true,
      reference: true,
      description: true,
      status: true,
      ownerId: true,
      verifiedAt: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };

  // SME Section 1, Stage 5 (FULL) — closure requires an independent
  // verification to have happened first. The CAPA must be in
  // pending_verification AND verifiedAt must be populated. Audit any
  // attempted closure that bypasses this so an inspector can see who
  // tried to short-circuit the SoD invariant.
  if (existing.status !== "pending_verification" || existing.verifiedAt === null) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "CAPA / Verification",
          action: "CAPA_CLOSE_BLOCKED_NOT_VERIFIED",
          recordId: id,
          recordTitle: existing.description.slice(0, 80),
          newValue: JSON.stringify({
            currentStatus: existing.status,
            verifiedAt: existing.verifiedAt,
          }),
        },
      });
    } catch (err) {
      console.error("[action] failed to write CAPA_CLOSE_BLOCKED_NOT_VERIFIED audit:", err);
    }
    return {
      success: false,
      error:
        "Cannot close CAPA — independent verification is required first. An eligible verifier (distinct from creator and from every approver) must sign the verification step.",
    };
  }
  // CHANGE CONTROL HIDDEN — ccLinks query removed from the Promise.all
  // since the 6.4 gate that consumed it is bypassed. To re-enable:
  // restore the third query + the ccLinks identifier here, plus the
  // gate block below.
  // SME Section 1, Stage 4 (FULL) — also fetch the structured action
  // items for the incomplete-actions gate AND for binding into the
  // closure SignedRecord's contentHash.
  const [approvals, comments, actionItems] = await Promise.all([
    prisma.cAPAApproval.findMany({
      // revokedAt: null filters out approvals that were soft-revoked —
      // those slots are open again and don't count toward the gate.
      where: {
        capaId: id,
        tenantId: session.user.tenantId,
        revokedAt: null,
      },
      select: { approverRole: true, approverId: true },
    }),
    prisma.cAPAComment.findMany({
      where: { capaId: id, tenantId: session.user.tenantId },
      select: { isConcern: true, resolvedAt: true, deletedAt: true },
    }),
    prisma.cAPAActionItem.findMany({
      where: { capaId: id, tenantId: session.user.tenantId, deletedAt: null },
      orderBy: { sequence: "asc" },
      select: {
        id: true,
        sequence: true,
        description: true,
        status: true,
        completedById: true,
        completedAt: true,
      },
    }),
    // prisma.cAPAChangeControlLink.findMany({
    //   where: { capaId: id, tenantId: session.user.tenantId },
    //   include: {
    //     changeControl: {
    //       select: {
    //         id: true,
    //         reference: true,
    //         status: true,
    //         targetImplementationDate: true,
    //         deletedAt: true,
    //       },
    //     },
    //   },
    // }),
  ]);
  // SME Section 1, Stage 4 (FULL) — incomplete-actions gate. Every
  // structured action item must be in a terminal state (complete or
  // skipped) before the CAPA can close. "pending" or "in_progress"
  // items indicate unfinished commitments — closure would be premature.
  // Empty action list is acceptable (legacy CAPAs created before the
  // action-items migration may have none).
  const incompleteActions = actionItems.filter(
    (a) => a.status !== "complete" && a.status !== "skipped",
  );
  if (incompleteActions.length > 0) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "CAPA / Action Items",
          action: "CAPA_CLOSE_BLOCKED_INCOMPLETE_ACTIONS",
          recordId: id,
          recordTitle: existing.description.slice(0, 80),
          newValue: JSON.stringify({
            incompleteItemIds: incompleteActions.map((a) => a.id),
            incompleteCount: incompleteActions.length,
          }),
        },
      });
    } catch (err) {
      console.error("[action] failed to write CAPA_CLOSE_BLOCKED_INCOMPLETE_ACTIONS audit:", err);
    }
    const itemList = incompleteActions
      .slice(0, 5)
      .map((a) => `#${a.sequence}: ${a.description.slice(0, 40)}`)
      .join("; ");
    return {
      success: false,
      error: `Cannot close CAPA — ${incompleteActions.length} action item${incompleteActions.length === 1 ? "" : "s"} still pending or in progress. Complete or skip each item before closing. ${itemList}${incompleteActions.length > 5 ? "; …" : ""}`,
    };
  }

  const progress = evaluateApprovalProgress(
    existing.risk as ApprovalTier,
    approvals,
    comments,
  );
  if (!progress.satisfied) {
    if (progress.reason === "UNRESOLVED_CONCERNS") {
      return {
        success: false,
        error: `Approval blocked: ${progress.unresolvedConcerns} unresolved concern${progress.unresolvedConcerns === 1 ? "" : "s"} must be resolved first.`,
      };
    }
    const missingDesc = progress.missing
      .map(
        (r) =>
          `${r.count} more ${r.role.replace("_", " ")} approval${r.count === 1 ? "" : "s"}`,
      )
      .join("; ");
    return {
      success: false,
      error: `Cannot close CAPA — pending approvals: ${missingDesc}.`,
    };
  }

  // CHANGE CONTROL HIDDEN — 6.4 dependency gate bypassed. CAPAs now close
  // without consulting linked CC status. The action still accepts
  // ccBlockOverride in its input schema for backward compatibility, but
  // the value is ignored. To re-enable: uncomment the gate block below
  // and the dependent audit rows further down (CAPA_MARKED_IMPLEMENTED
  // carrying ccDepsSnapshot, CAPA_CC_BLOCK_OVERRIDDEN). The
  // ccBlockOverrideReason / ccBlockOverrideById / ccBlockOverrideByName /
  // ccBlockOverrideAt fields on the CAPA model are preserved.
  // const deps = evaluateCCDependencies(ccLinks);
  // const gate = canMarkCAPAImplemented({
  //   capaRisk: existing.risk,
  //   deps,
  //   overrideProvided: Boolean(ccBlockOverride),
  //   overrideReason: ccBlockOverride?.reason,
  // });
  // if (!gate.allowed) {
  //   if (gate.reason === "HARD_GATE_BLOCKED") {
  //     return {
  //       success: false,
  //       error: `Cannot mark CAPA as implemented: ${gate.details ?? "linked change controls not satisfied."}`,
  //     };
  //   }
  //   if (gate.reason === "SOFT_GATE_REQUIRES_OVERRIDE") {
  //     return {
  //       success: false,
  //       error: gate.details ?? "Linked change controls are still incomplete. Provide an override reason (min 20 chars) to proceed.",
  //     };
  //   }
  //   if (gate.reason === "OVERRIDE_REASON_TOO_SHORT") {
  //     return {
  //       success: false,
  //       error: gate.details ?? "Override reason must be at least 20 characters.",
  //     };
  //   }
  // }
  // const overrideUsed = gate.allowed && Boolean(ccBlockOverride) && deps.incompleteCount > 0;
  const overrideUsed = false;

  // §11.200(a)(1)(ii) — re-authenticate at the moment of signing. Mirrors
  // the approveCAPA pattern: verify before any state change so a wrong
  // password causes zero side effects beyond the failed-attempt audit row.
  const passwordOk = await verifyPasswordForSigning(
    session.user.id,
    parsed.data.password,
  );
  if (!passwordOk) {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "SIGNING_PASSWORD_FAILED",
        recordId: id,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          recordType: "CAPA_CLOSURE",
          attempt_at: new Date().toISOString(),
        }),
      },
    });
    return {
      success: false,
      error: "Password verification failed. Please try again.",
    };
  }

  try {
    const now = new Date();
    const effectivenessDue = new Date(now);
    effectivenessDue.setDate(effectivenessDue.getDate() + 90);

    // Defensive lock — usually already locked from submitForReview but
    // re-locking is a no-op for already-locked items. Outside the tx
    // because lockCAPAArtifacts is idempotent and uses its own queries.
    await lockCAPAArtifacts(id, session.user.tenantId, {
      userId: actor.userId,
      name: actor.displayName,
      role: actor.role,
    });

    // Build the canonical content + hash before the transaction so any
    // serialisation issue surfaces as a clean failure (no half-written rows).
    const passwordVerifiedAt = now;
    const closingComment = overrideUsed
      ? `[CC override] ${ccBlockOverride!.reason.trim()}`
      : null;
    const canonicalContent = canonicalizeCAPAClosureContent({
      capaId: existing.id,
      capaReference: existing.reference,
      capaDescription: existing.description,
      riskLevel: existing.risk,
      closedAt: now,
      closingComment,
      // SME Section 1, Stage 4 (FULL) — bind the closure signature to
      // the snapshot of every action item. Completion attribution
      // (completedById + completedAt) is included so an inspector can
      // reconstruct WHO completed WHICH action plus WHEN, all anchored
      // by the closure contentHash.
      actionItemsSummary: actionItems.map((a) => ({
        id: a.id,
        sequence: a.sequence,
        description: a.description,
        status: a.status,
        completedById: a.completedById,
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      })),
      // SME Section 1, Stage 6 (FULL) — bind the 90-day commitment.
      // effectivenessDue is the existing `effectivenessDate` column
      // populated atomically with closure (legacy name, semantic
      // "due-date for the effectiveness review").
      effectivenessDueAt: effectivenessDue,
    });
    const contentHash = computeContentHash(canonicalContent);
    const contentSummary = `${existing.reference ?? existing.id} closed by ${session.user.name} (${session.user.role}) — risk: ${existing.risk}`;
    const provenance = await readSigningProvenance();

    // Atomic: mint the SignedRecord, flip CAPA.status, link
    // CAPA.closureSignatureId. Either all three commit or none.
    const { capa, signedRecord } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "CAPA_CLOSURE",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: parsed.data.signatureMeaning,
          contentHash,
          contentSummary,
          passwordVerifiedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      const updated = await tx.cAPA.update({
        where: { id, tenantId: session.user.tenantId },
        data: {
          status: "closed",
          closedBy: session.user.name,
          closedAt: now,
          effectivenessCheck: true,
          effectivenessDate: effectivenessDue,
          closureSignatureId: sig.id,
          ...(overrideUsed
            ? {
                ccBlockOverrideReason: ccBlockOverride!.reason.trim(),
                ccBlockOverrideById: session.user.id,
                ccBlockOverrideByName: session.user.name,
                ccBlockOverrideAt: now,
              }
            : {}),
        },
      });
      return { capa: updated, signedRecord: sig };
    });

    if (capa.findingId) {
      await prisma.finding.update({
        where: { id: capa.findingId, tenantId: session.user.tenantId },
        data: { status: "closed" },
      });
    }

    // CHANGE CONTROL HIDDEN — depsForAudit removed because the gate it
    // backed is bypassed. To re-enable, uncomment.
    // const depsForAudit = ccDepsSnapshot(deps);
    // Existing CAPA_CLOSED audit (kept verbatim for analytics continuity).
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_CLOSED",
        recordId: id,
        recordTitle: capa.description.slice(0, 80),
      },
    });
    // Paired CAPA_CLOSURE_SIGNED row — points at the SignedRecord id so the
    // audit trail and the SignedRecord ledger cross-reference cleanly.
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "CAPA_CLOSURE_SIGNED",
        recordId: signedRecord.id,
        recordTitle: capa.description.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: parsed.data.signatureMeaning,
          effectivenessConfirmed: parsed.data.effectivenessConfirmed ?? false,
          capaId: capa.id,
        }),
      },
    });
    // CHANGE CONTROL HIDDEN — Substage 6.4 audit rows
    // (CAPA_MARKED_IMPLEMENTED carrying the ccDepsSnapshot, plus the
    // conditional CAPA_CC_BLOCK_OVERRIDDEN row) are suppressed because
    // the underlying gate is bypassed. The action strings remain available
    // for any future re-enable. To re-enable: restore depsForAudit above
    // plus this block.
    // await prisma.auditLog.create({
    //   data: {
    //     tenantId: session.user.tenantId,
    //     userId: session.user.id,
    //     userName: session.user.name,
    //     userRole: session.user.role,
    //     module: "CAPA",
    //     action: "CAPA_MARKED_IMPLEMENTED",
    //     recordId: id,
    //     recordTitle: capa.description.slice(0, 80),
    //     newValue: JSON.stringify({
    //       capaRisk: existing.risk,
    //       ccDepsSnapshot: depsForAudit,
    //       overrideUsed,
    //     }),
    //   },
    // });
    // if (overrideUsed) {
    //   await prisma.auditLog.create({
    //     data: {
    //       tenantId: session.user.tenantId,
    //       userId: session.user.id,
    //       userName: session.user.name,
    //       userRole: session.user.role,
    //       module: "CAPA",
    //       action: "CAPA_CC_BLOCK_OVERRIDDEN",
    //       recordId: id,
    //       recordTitle: capa.description.slice(0, 80),
    //       newValue: JSON.stringify({
    //         overrideReason: ccBlockOverride!.reason.trim(),
    //         capaRisk: existing.risk,
    //         incompleteCCs: depsForAudit.incompleteRefs,
    //       }),
    //     },
    //   });
    // }

    // Phase 2 — notify the driver their CAPA is closed (fault-isolated;
    // notify() skips the actor + null FKs). Does not affect the committed write.
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: existing.ownerId,
      actorUserId: actor.userId,
      type: "CAPA_CLOSED",
      title: `CAPA ${existing.reference ?? id} was closed`,
      body: existing.description?.slice(0, 200) ?? null,
      linkPath: `/capa/${id}`,
      entityType: "CAPA",
      entityId: id,
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    revalidatePath("/gap-assessment");
    revalidatePath("/");
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] signAndCloseCAPA failed:", err);
    return { success: false, error: "Failed to close CAPA" };
  }
}

/**
 * Substage 6.4 — client-callable read of a CAPA's CC dependency state.
 * The Sign & Close button uses this for its pre-flight gate so the user
 * sees a hard-gate or soft-gate response BEFORE the SignClose modal
 * collects their e-signature credentials. Mirrors the
 * load{Approvals,Comments,Criteria}ForCAPA pattern.
 */
export async function loadCAPACCDeps(
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const capa = await prisma.cAPA.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id: capaId }
        : { id: capaId, tenantId: session.user.tenantId },
    select: { id: true, risk: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };
  const links = await prisma.cAPAChangeControlLink.findMany({
    // Tenant-scope the links read, mirroring the CAPA findFirst gate above.
    // super_admin is cross-tenant by design; everyone else is pinned to their
    // own tenant. session.user.tenantId is "" (never undefined) for a
    // tenantless principal, so a missing tenant matches zero rows — fail-closed.
    where:
      session.user.role === "super_admin"
        ? { capaId }
        : { capaId, tenantId: session.user.tenantId },
    include: {
      changeControl: {
        select: {
          id: true,
          reference: true,
          status: true,
          targetImplementationDate: true,
          deletedAt: true,
        },
      },
    },
  });
  const deps = evaluateCCDependencies(links);
  return {
    success: true,
    data: { capaRisk: capa.risk, deps },
  };
}
