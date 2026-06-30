"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { notify } from "@/lib/notify";
import {
  canonicalizeCAPAApprovalContent,
  canonicalizeCAPAApprovalRevocationContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import {
  APPROVAL_REQUIREMENTS,
  canApproveCAPA,
  evaluateApprovalProgress,
  type ApprovalTier,
} from "@/lib/capa-approvals";
import { getCAPAApprovals } from "@/lib/queries/capas";
import {
  APPROVAL_AUDIT_MODULE,
  SIGNING_AUDIT_MODULE,
  type ActionResult,
} from "./_types";
import { readSigningProvenance } from "./_shared";
import { sanitizeServerError } from "@/lib/errors";

/* â”€â”€ Substage 5.2 â€” Tiered Approval Routing + Substage 5.4 â€” e-sig â”€â”€â”€â”€â”€â”€â”€
 *
 * Count-based approvals keyed off APPROVAL_REQUIREMENTS in
 * src/lib/capa-approvals.ts. closure.ts's signAndCloseCAPA gates the
 * actual closure on evaluateApprovalProgress; the actions here are the
 * approver-side surface (record / revoke a single approval) plus the
 * client-callable read used by ApprovalsSection.
 *
 * Substage 5.4 layered Part 11 e-signatures on top: every approve and
 * revoke action mints a SignedRecord row with a SHA-256 content hash and
 * a re-authenticated password under Â§11.200(a)(1)(ii).
 */

// â”€â”€ Schemas â”€â”€

const ApproveCAPASchema = z.object({
  // Re-authentication password (Part 11 Â§11.200(a)(1)(ii)). Plaintext â€”
  // never logged, never echoed back. The action runs bcrypt.compare and
  // discards the value.
  password: z.string().min(1, "Password is required to sign"),
  comment: z.string().max(2000).optional(),
});

const RevokeCAPAApprovalSchema = z.object({
  password: z.string().min(1, "Password is required to sign"),
});

/**
 * Client-callable read wrapper â€” mirrors loadCriteriaForCAPA / loadEvidenceForCAPA.
 * The panel calls this from a client component to refresh after a successful
 * approve / revoke. Tenant-scoped via the parent-CAPA guard.
 */
export async function loadApprovalsForCAPA(
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const capa = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };
  const approvals = await getCAPAApprovals(session.user.tenantId, capaId);
  return { success: true, data: approvals };
}

/**
 * Record one approval against a CAPA in pending_qa_review. Distinct users
 * (by id) at the same role count once each; same user cannot approve
 * twice. The CAPA only closes once evaluateApprovalProgress(risk,
 * approvals, comments).satisfied === true, enforced inside
 * signAndCloseCAPA. Per substage 5.3 ("All reviewer comments adjudicated
 * and documented before approval"), this action also blocks while any
 * concern comment is unresolved â€” applies to intermediate approvals as
 * well as the final close.
 */
export async function approveCAPA(
  capaId: string,
  input: z.input<typeof ApproveCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const parsed = ApproveCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const existing = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId: session.user.tenantId },
    select: {
      id: true,
      status: true,
      risk: true,
      description: true,
      reference: true,
      createdBy: true,
      createdById: true,
      ownerId: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (existing.status !== "pending_qa_review") {
    return {
      success: false,
      error: "CAPA is not awaiting approvals â€” submit it for QA review first.",
    };
  }
  // Role allowed for this tier? "Critical" needs qa_head + regulatory_affairs;
  // other tiers need qa_head only. Anyone else (it_cdo, viewer, etc.) gets
  // a hard rejection â€” they're not in the approver set for this tier.
  if (!canApproveCAPA(session.user.role, existing.risk)) {
    const tierReqs = APPROVAL_REQUIREMENTS[existing.risk as ApprovalTier];
    const allowedRoles = tierReqs
      ? tierReqs.map((r) => r.role.replace("_", " ")).join(" or ")
      : "an authorised approver";
    return {
      success: false,
      error: `Your role cannot approve a ${existing.risk} CAPA â€” ${allowedRoles} required.`,
    };
  }
  // Stage 5 (partial) â€” Part 11 Â§11.10(d) separation of duties.
  // Creator and approver MUST be distinct identities. Prefer the
  // authoritative createdById userId FK; fall back to display-name
  // comparison only for legacy rows whose createdById is null (predate the
  // FK / unresolvable backfill). ID comparison is robust against duplicate
  // display names and renames. No system/sentinel creator exists in this
  // codebase (verified via grep), so no bypass branch is needed for
  // automated flows â€” AI-driven CAPA creation still records the invoking
  // user as creator.
  const isSelfApproval = existing.createdById
    ? existing.createdById === session.user.id
    : Boolean(existing.createdBy) && existing.createdBy === session.user.name;
  if (isSelfApproval) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: APPROVAL_AUDIT_MODULE,
          action: "CAPA_APPROVAL_BLOCKED_SELF_APPROVAL",
          recordId: capaId,
          recordTitle: (existing.reference ?? existing.description).slice(0, 80),
          newValue: JSON.stringify({
            attemptedBy: session.user.id,
            capaCreator: existing.createdBy,
            comparedBy: existing.createdById ? "userId" : "displayName",
          }),
        },
      });
    } catch (err) {
      console.error("[action] failed to write CAPA_APPROVAL_BLOCKED_SELF_APPROVAL audit:", err);
    }
    return {
      success: false,
      error: "You cannot approve a CAPA you created. Separation of duties requires a different approver.",
    };
  }
  // Distinct-user rule â€” same user cannot stack two LIVE approvals against
  // the same CAPA. revokedAt: null filter means a previously-revoked
  // approval doesn't lock the user out of re-approving.
  const alreadyApproved = await prisma.cAPAApproval.findFirst({
    where: {
      capaId,
      tenantId: session.user.tenantId,
      approverId: session.user.id,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (alreadyApproved) {
    return {
      success: false,
      error: "You have already approved this CAPA. Approval requires distinct users.",
    };
  }
  // Â§5.3 â€” block approval while any concern comment is unresolved.
  // Counts isConcern && !resolvedAt && !deletedAt (deleted concerns are
  // treated as withdrawn).
  const unresolvedConcerns = await prisma.cAPAComment.count({
    where: {
      capaId,
      tenantId: session.user.tenantId,
      isConcern: true,
      resolvedAt: null,
      deletedAt: null,
    },
  });
  if (unresolvedConcerns > 0) {
    return {
      success: false,
      error: `Approval blocked: ${unresolvedConcerns} unresolved concern${unresolvedConcerns === 1 ? "" : "s"} must be resolved first.`,
    };
  }

  // Â§11.200(a)(1)(ii) â€” re-authenticate at the moment of signing. We
  // verify before any state change so a wrong password causes zero side
  // effects (other than the audit row, which is the point â€” every failed
  // signing attempt is recorded).
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
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          recordType: "CAPA_APPROVAL",
          attempt_at: new Date().toISOString(),
        }),
      },
    });
    return {
      success: false,
      error: "Password verification failed. Please try again.",
    };
  }

  // Build the canonical content + hash BEFORE the transaction so any
  // serialisation issue surfaces as a clean failure (no half-written rows).
  const passwordVerifiedAt = new Date();
  const approvedAt = passwordVerifiedAt; // single moment for both
  const canonicalContent = canonicalizeCAPAApprovalContent({
    capaId: existing.id,
    capaReference: existing.reference,
    capaDescription: existing.description,
    riskLevel: existing.risk,
    approverRole: session.user.role,
    approvedAt,
    comment: parsed.data.comment ?? null,
  });
  const contentHash = computeContentHash(canonicalContent);
  const contentSummary = `${existing.reference ?? existing.id} approved by ${session.user.name} (${session.user.role}) â€” risk: ${existing.risk}`;
  const provenance = await readSigningProvenance();

  try {
    // Atomic 3-step: create approval row first (so we have its id for
    // SignedRecord.recordId), then create the SignedRecord, then link
    // the approval back via signatureId. Either all three commit or none.
    const { approval, signedRecord, transitioned } = await prisma.$transaction(
      async (tx) => {
        const created = await tx.cAPAApproval.create({
          data: {
            tenantId: session.user.tenantId,
            capaId,
            approverRole: session.user.role,
            approverName: session.user.name,
            approverId: session.user.id,
            approvedAt,
            comment: parsed.data.comment ?? null,
            signatureId: null,
          },
        });
        const sig = await tx.signedRecord.create({
          data: {
            tenantId: session.user.tenantId,
            recordType: "CAPA_APPROVAL",
            recordId: created.id,
            signerId: session.user.id,
            signerName: session.user.name,
            signerRole: session.user.role,
            signerEmail: session.user.email,
            signatureMeaning: "Approved",
            contentHash,
            contentSummary,
            passwordVerifiedAt,
            ipAddress: provenance.ipAddress,
            userAgent: provenance.userAgent,
          },
        });
        const linked = await tx.cAPAApproval.update({
          where: { id: created.id },
          data: { signatureId: sig.id },
        });
        // SME Section 1, Stage 5 (FULL) â€” auto-transition to
        // [verification retired] this no longer flips status; the CAPA
        // stays in pending_qa_review and is directly closeable once the
        // tier requirement is satisfied. We still compute that below to
        // status flip all commit atomically â€” no window where another
        // process sees an "approved CAPA still in pending_qa_review".
        const allApprovals = await tx.cAPAApproval.findMany({
          where: { capaId, tenantId: session.user.tenantId, revokedAt: null },
          select: { approverRole: true, approverId: true },
        });
        const allComments = await tx.cAPAComment.findMany({
          where: { capaId, tenantId: session.user.tenantId },
          select: { isConcern: true, resolvedAt: true, deletedAt: true },
        });
        const newProgress = evaluateApprovalProgress(
          existing.risk as ApprovalTier,
          allApprovals,
          allComments,
        );
        // Verification step retired: do NOT flip status here. The CAPA
        // stays in pending_qa_review and is directly closeable once its
        // approvals are satisfied (closure re-checks the same gate).
        // readyForClosure only drives the notify + audit below.
        const readyForClosure = newProgress.satisfied;
        return { approval: linked, signedRecord: sig, transitioned: readyForClosure };
      },
    );

    // Two paired audit rows â€” one for the workflow event (CAPA_APPROVED),
    // one for the signing event (CAPA_APPROVAL_SIGNED). The signed event
    // points at the SignedRecord id so the audit trail and the
    // SignedRecord ledger cross-reference cleanly.
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: APPROVAL_AUDIT_MODULE,
        action: "CAPA_APPROVED",
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          role: session.user.role,
          name: session.user.name,
          comment: parsed.data.comment ?? null,
          signatureId: signedRecord.id,
        }),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "CAPA_APPROVAL_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: "Approved",
          capaId,
          approvalId: approval.id,
        }),
      },
    });

    // SME Section 1, Stage 5 (FULL) â€” paired audit row when this
    // approval was the one that completed the tier requirement, so the
    // CAPA is now fully approved and directly closeable. Separate row so
    // analytics can count "approvals collected" vs "ready for closure"
    // distinctly.
    if (transitioned) {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: APPROVAL_AUDIT_MODULE,
          action: "CAPA_READY_FOR_CLOSURE",
          recordId: capaId,
          recordTitle: existing.description.slice(0, 80),
          newValue: JSON.stringify({
            triggeredByApprovalId: approval.id,
            triggeredBySignatureId: signedRecord.id,
          }),
        },
      });
    }

    // Phase 2 — notify the driver their CAPA was approved (fault-isolated;
    // notify() skips the actor + null FKs). Does not affect the committed write.
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: existing.ownerId,
      actorUserId: actor.userId,
      type: "CAPA_APPROVED",
      title: `CAPA ${existing.reference ?? capaId} was approved`,
      body: transitioned ? "All approvals collected — ready to sign & close." : null,
      linkPath: `/capa/${capaId}`,
      entityType: "CAPA",
      entityId: capaId,
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: { approval, signature: signedRecord } };
  } catch (err) {
    console.error("[action] approveCAPA failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to record approval") };
  }
}

/**
 * Revoke an approval the caller themselves recorded. Only the approver
 * who placed the row can take it back, and only while the CAPA is still
 * in pending_qa_review (revocation after closure would require the close
 * to be undone first, which is intentionally not possible here).
 *
 * Substage 5.4 â€” revocation is a Part 11 signing event in its own right.
 * The original approval row is NOT deleted: it carries `revokedAt` +
 * `revokedSignatureId` so the audit chain stays intact. The original
 * SignedRecord is also preserved (Part 11 immutability). A NEW
 * SignedRecord with recordType = "CAPA_APPROVAL_REVOCATION" is appended,
 * with its own contentHash + password re-verification.
 */
export async function revokeCAPAApproval(
  approvalId: string,
  input: z.input<typeof RevokeCAPAApprovalSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const parsed = RevokeCAPAApprovalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const existing = await prisma.cAPAApproval.findFirst({
    where: { id: approvalId, tenantId: session.user.tenantId },
    include: {
      capa: {
        select: {
          id: true,
          status: true,
          description: true,
          reference: true,
          verifiedAt: true,
        },
      },
    },
  });
  if (!existing) return { success: false, error: "Approval not found" };
  if (existing.revokedAt !== null) {
    return { success: false, error: "Approval has already been revoked." };
  }
  // SME Section 1, Stage 5 (FULL) â€” allow revocation from BOTH
  // pending_qa_review (the original behaviour) AND pending_verification
  // (the new state introduced by the verification gate). After closure
  // / rejection revocation is no longer allowed â€” those are terminal.
  if (
    existing.capa.status !== "pending_qa_review" &&
    existing.capa.status !== "pending_verification"
  ) {
    return {
      success: false,
      error:
        "Cannot revoke approval â€” the CAPA has already moved past QA review.",
    };
  }
  if (existing.approverId !== session.user.id) {
    return {
      success: false,
      error: "You can only revoke your own approval.",
    };
  }

  // Â§11.200(a)(1)(ii) password re-verification â€” same as the approve path.
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
        recordId: existing.capa.id,
        recordTitle: existing.capa.description.slice(0, 80),
        newValue: JSON.stringify({
          recordType: "CAPA_APPROVAL_REVOCATION",
          approvalId: existing.id,
          attempt_at: new Date().toISOString(),
        }),
      },
    });
    return {
      success: false,
      error: "Password verification failed. Please try again.",
    };
  }

  const passwordVerifiedAt = new Date();
  const revokedAt = passwordVerifiedAt;
  const canonicalContent = canonicalizeCAPAApprovalRevocationContent({
    approvalId: existing.id,
    capaId: existing.capa.id,
    capaReference: existing.capa.reference,
    originalApprovedAt: existing.approvedAt,
    originalApproverRole: existing.approverRole,
    originalApproverId: existing.approverId,
    revokedAt,
    revokerId: session.user.id,
    revokerRole: session.user.role,
  });
  const contentHash = computeContentHash(canonicalContent);
  const contentSummary = `${existing.capa.reference ?? existing.capa.id} approval by ${existing.approverName} (${existing.approverRole}) revoked by ${session.user.name}`;
  const provenance = await readSigningProvenance();

  // SME Section 1, Stage 5 (FULL) â€” if the CAPA had already advanced to
  // pending_verification (and possibly been verified), this revocation
  // breaks the "all approvals satisfied" invariant. Auto-invalidate the
  // verification fields AND walk the status back to pending_qa_review
  // so the verifier (if any) and the rest of the workflow can re-converge.
  const wasInVerificationPhase =
    existing.capa.status === "pending_verification";
  const verificationWasComplete = existing.capa.verifiedAt !== null;

  try {
    const { revocationSignature } = await prisma.$transaction(
      async (tx) => {
        // 1. Mint the revocation SignedRecord (immutable; never deleted
        //    even if the underlying approval is later resigned by another
        //    user).
        const sig = await tx.signedRecord.create({
          data: {
            tenantId: session.user.tenantId,
            recordType: "CAPA_APPROVAL_REVOCATION",
            recordId: existing.id,
            signerId: session.user.id,
            signerName: session.user.name,
            signerRole: session.user.role,
            signerEmail: session.user.email,
            signatureMeaning: "Revoked",
            contentHash,
            contentSummary,
            passwordVerifiedAt,
            ipAddress: provenance.ipAddress,
            userAgent: provenance.userAgent,
          },
        });
        // 2. Mark the approval revoked + link to the revocation signature.
        //    The original signatureId stays untouched â€” the original
        //    approval SignedRecord is preserved (Part 11 immutability).
        await tx.cAPAApproval.update({
          where: { id: approvalId },
          data: {
            revokedAt,
            revokedSignatureId: sig.id,
          },
        });
        // 3. Auto-invalidate verification when the CAPA was past approval.
        //    Wipes the verification fields (the verifier may have signed
        //    against a now-incomplete approval set â€” that attestation
        //    is no longer valid). Status reverts to pending_qa_review so
        //    the workflow can re-converge naturally. The original
        //    verification SignedRecord row (if minted) is preserved per
        //    Part 11 immutability â€” only the verifiedAt pointer clears.
        if (wasInVerificationPhase) {
          await tx.cAPA.update({
            where: { id: existing.capa.id, tenantId: session.user.tenantId },
            data: {
              status: "pending_qa_review",
              verifiedBy: null,
              verifiedById: null,
              verifiedAt: null,
              verificationNotes: null,
              verificationSignatureId: null,
            },
          });
        }
        return { revocationSignature: sig };
      },
    );

    const snapshot = {
      approverRole: existing.approverRole,
      approverName: existing.approverName,
      approverId: existing.approverId,
      approvedAt: existing.approvedAt.toISOString(),
      comment: existing.comment,
      originalSignatureId: existing.signatureId,
    };
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: APPROVAL_AUDIT_MODULE,
        action: "CAPA_APPROVAL_REVOKED",
        recordId: existing.capa.id,
        recordTitle: existing.capa.description.slice(0, 80),
        oldValue: JSON.stringify(snapshot),
        newValue: JSON.stringify({
          revocationSignatureId: revocationSignature.id,
          revokedBy: session.user.name,
        }),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "CAPA_APPROVAL_REVOKED_AND_SIGNED",
        recordId: revocationSignature.id,
        recordTitle: existing.capa.description.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: "Revoked",
          approvalId: existing.id,
          capaId: existing.capa.id,
        }),
      },
    });

    // SME Section 1, Stage 5 (FULL) â€” audit the cascading verification
    // invalidation if it fired. Forensic-significant: "approval X was
    // revoked, which invalidated verification Y" needs to be queryable
    // as one chain in the audit log.
    if (wasInVerificationPhase) {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "CAPA / Verification",
          action: "CAPA_VERIFICATION_INVALIDATED_BY_APPROVAL_REVOKE",
          recordId: existing.capa.id,
          recordTitle: existing.capa.description.slice(0, 80),
          newValue: JSON.stringify({
            triggeredByApprovalRevoke: approvalId,
            verificationWasComplete,
          }),
        },
      });
    }

    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    return { success: true, data: { revocationSignature } };
  } catch (err) {
    console.error("[action] revokeCAPAApproval failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to revoke approval") };
  }
}
