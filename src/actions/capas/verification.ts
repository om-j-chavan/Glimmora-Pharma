"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { canApproveCAPA } from "@/lib/capa-approvals";
import {
  canonicalizeCAPAVerificationContent,
  canonicalizeCAPAVerificationRevocationContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import {
  SIGNING_AUDIT_MODULE,
  VERIFICATION_AUDIT_MODULE,
  VERIFICATION_INVALID_STATUS_MESSAGE,
  type ActionResult,
} from "./_types";
import { readSigningProvenance } from "./_shared";
import { sanitizeServerError } from "@/lib/errors";

/* â”€â”€ SME Section 1, Stage 5 (FULL) â€” Independent QA Verification â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Verification is the third QA signing event in the CAPA lifecycle:
 *   approveCAPA (per-approver) â†’ â€¦ â†’ all approvals satisfied
 *   â†’ approveCAPA auto-flips status to pending_verification
 *   â†’ verifyCAPA (this file) mints CAPA_VERIFICATION SignedRecord
 *   â†’ signAndCloseCAPA mints CAPA_CLOSURE SignedRecord (now gated on
 *     verifiedAt !== null)
 *
 * SoD invariants enforced here:
 *   1. Verifier â‰  creator. Compares by Deviation.createdById when
 *      available (post Stage-5 migration), falls back to display-name
 *      string. CAPA.createdBy is still display-name-only, so the
 *      comparison there remains by name with the same brittleness
 *      caveat as approveCAPA's self-approval guard.
 *   2. Verifier â‰  any approver. Queries CAPAApproval (revokedAt: null)
 *      and rejects if session.user.id appears in the approver set.
 *   3. super_admin does NOT bypass SoD. The verification record
 *      attests "an independent reviewer reviewed this CAPA" â€” that
 *      property is broken if a participant in any other role also
 *      signs verification, regardless of how privileged they are.
 *
 * Part 11 Â§11.200(a)(1)(ii) â€” password re-verification required, same
 * pattern as approveCAPA / signAndCloseCAPA.
 */

// â”€â”€ Schemas â”€â”€

const VerifyCAPASchema = z.object({
  password: z.string().min(1, "Password is required to sign"),
  notes: z
    .string()
    .min(10, "Notes must be at least 10 characters")
    .max(2000, "Notes must be 2000 characters or fewer"),
});

const RevokeCAPAVerificationSchema = z.object({
  password: z.string().min(1, "Password is required to sign"),
});

const REQUIRED_STATUS = "pending_verification";

/**
 * Mint the Part-11 verification signature for a CAPA. Caller must be in
 * a QA role for this CAPA's tier (same role set approveCAPA uses), MUST
 * be a different person from the creator AND from every approver, and
 * MUST re-authenticate at sign time.
 */
export async function verifyCAPA(
  capaId: string,
  input: z.input<typeof VerifyCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const parsed = VerifyCAPASchema.safeParse(input);
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
      reference: true,
      description: true,
      createdBy: true,
      createdById: true,
      ownerId: true,
      verifiedAt: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };

  if (existing.status !== REQUIRED_STATUS) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: VERIFICATION_AUDIT_MODULE,
          action: "CAPA_VERIFICATION_BLOCKED_STATUS",
          recordId: capaId,
          recordTitle: (existing.reference ?? existing.description).slice(0, 80),
          newValue: JSON.stringify({ currentStatus: existing.status }),
        },
      });
    } catch (err) {
      console.error("[action] failed to write CAPA_VERIFICATION_BLOCKED_STATUS audit:", err);
    }
    return { success: false, error: VERIFICATION_INVALID_STATUS_MESSAGE };
  }

  // Role gate â€” same set approveCAPA permits for this tier.
  if (!canApproveCAPA(session.user.role, existing.risk)) {
    return {
      success: false,
      error: `Your role cannot verify a ${existing.risk} CAPA â€” only QA roles authorised for approval may verify.`,
    };
  }

  // SoD 1 â€” verifier â‰  creator. CAPA.createdBy is a display-name string
  // (no createdById FK yet on this model; that migration lands in a
  // future rung). Name-equality only; same caveat as approveCAPA.
  // Prefer the authoritative createdById userId FK; fall back to display-name
  // comparison only for legacy rows whose createdById is null. Robust against
  // duplicate display names and renames.
  const isSelfVerification = existing.createdById
    ? existing.createdById === session.user.id
    : Boolean(existing.createdBy) && existing.createdBy === session.user.name;
  if (isSelfVerification) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: VERIFICATION_AUDIT_MODULE,
          action: "CAPA_VERIFICATION_BLOCKED_SELF",
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
      console.error("[action] failed to write CAPA_VERIFICATION_BLOCKED_SELF audit:", err);
    }
    return {
      success: false,
      error: "You cannot verify a CAPA you created. Independent verification requires a different reviewer.",
    };
  }

  // SoD 2 â€” verifier â‰  any approver. Approver identity is on
  // CAPAApproval.approverId (a real userId, not a string), so this
  // comparison is robust.
  const approverSelf = await prisma.cAPAApproval.findFirst({
    where: {
      capaId,
      tenantId: session.user.tenantId,
      approverId: session.user.id,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (approverSelf) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: VERIFICATION_AUDIT_MODULE,
          action: "CAPA_VERIFICATION_BLOCKED_APPROVER",
          recordId: capaId,
          recordTitle: (existing.reference ?? existing.description).slice(0, 80),
          newValue: JSON.stringify({ attemptedBy: session.user.id }),
        },
      });
    } catch (err) {
      console.error("[action] failed to write CAPA_VERIFICATION_BLOCKED_APPROVER audit:", err);
    }
    return {
      success: false,
      error: "You approved this CAPA. Independent verification requires a different reviewer (separation of duties).",
    };
  }

  // Idempotency guard â€” if verification already exists, don't mint a
  // duplicate. Clearing must go through revokeCAPAVerification first.
  if (existing.verifiedAt !== null) {
    return {
      success: false,
      error: "This CAPA has already been verified. Use revoke to undo before re-verifying.",
    };
  }

  // Â§11.200(a)(1)(ii) â€” re-authenticate at the moment of signing.
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
          recordType: "CAPA_VERIFICATION",
          attempt_at: new Date().toISOString(),
        }),
      },
    });
    return {
      success: false,
      error: "Password verification failed. Please try again.",
    };
  }

  // Build canonical content before the tx so any serialisation issue
  // surfaces cleanly. Mirrors approveCAPA.
  const passwordVerifiedAt = new Date();
  const verifiedAt = passwordVerifiedAt;
  const canonicalContent = canonicalizeCAPAVerificationContent({
    capaId: existing.id,
    capaReference: existing.reference,
    capaDescription: existing.description,
    riskLevel: existing.risk,
    verifiedAt,
    notes: parsed.data.notes,
  });
  const contentHash = computeContentHash(canonicalContent);
  const contentSummary = `${existing.reference ?? existing.id} verified by ${session.user.name} (${session.user.role}) â€” risk: ${existing.risk}`;
  const provenance = await readSigningProvenance();

  try {
    // Atomic: mint SignedRecord, flip CAPA fields (status stays
    // pending_verification â€” closure is a separate step).
    const { capa, signedRecord } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "CAPA_VERIFICATION",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: "Independent QA Verification",
          contentHash,
          contentSummary,
          passwordVerifiedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      const updated = await tx.cAPA.update({
        where: { id: capaId, tenantId: session.user.tenantId },
        data: {
          verifiedBy: session.user.name,
          verifiedById: session.user.id,
          verifiedAt,
          verificationNotes: parsed.data.notes,
          verificationSignatureId: sig.id,
        },
      });
      return { capa: updated, signedRecord: sig };
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: VERIFICATION_AUDIT_MODULE,
        action: "CAPA_VERIFIED",
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          verifierId: session.user.id,
          signatureId: signedRecord.id,
          notes: parsed.data.notes,
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
        action: "CAPA_VERIFICATION_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: "Independent QA Verification",
          capaId,
        }),
      },
    });

    // Phase 2 — notify the driver verification is complete (fault-isolated;
    // notify() skips the actor + null FKs). Does not affect the committed write.
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: existing.ownerId,
      actorUserId: actor.userId,
      type: "CAPA_VERIFIED",
      title: `CAPA ${existing.reference ?? capaId} was verified`,
      body: "Independent QA verification recorded — ready for closure.",
      linkPath: `/capa/${capaId}`,
      entityType: "CAPA",
      entityId: capaId,
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: { capa, signature: signedRecord } };
  } catch (err) {
    console.error("[action] verifyCAPA failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to record verification") };
  }
}

/**
 * Revoke an earlier verification the caller themselves recorded. Only
 * the verifier can revoke their own verification, and only while the
 * CAPA is still pending_verification (revocation after closure would
 * require closure to be undone first, intentionally not possible here).
 *
 * Mirrors revokeCAPAApproval â€” the original verification SignedRecord
 * is preserved (Part 11 immutability); a NEW CAPA_VERIFICATION_REVOCATION
 * SignedRecord is appended; CAPA's verifiedAt / verifiedBy* / verificationSignatureId
 * fields are wiped to null so re-verification is possible.
 */
export async function revokeCAPAVerification(
  capaId: string,
  input: z.input<typeof RevokeCAPAVerificationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const parsed = RevokeCAPAVerificationSchema.safeParse(input);
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
      reference: true,
      description: true,
      verifiedById: true,
      verifiedAt: true,
      verificationSignatureId: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (existing.verifiedAt === null) {
    return { success: false, error: "This CAPA has not been verified." };
  }
  if (existing.status !== REQUIRED_STATUS) {
    return {
      success: false,
      error: "Cannot revoke verification â€” the CAPA has already progressed past verification.",
    };
  }
  if (existing.verifiedById !== session.user.id) {
    return {
      success: false,
      error: "You can only revoke your own verification.",
    };
  }

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
          recordType: "CAPA_VERIFICATION_REVOCATION",
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
  const canonicalContent = canonicalizeCAPAVerificationRevocationContent({
    capaId: existing.id,
    capaReference: existing.reference,
    originalVerifiedAt: existing.verifiedAt,
    originalVerifierId: existing.verifiedById ?? "",
    revokedAt,
    revokerId: session.user.id,
    revokerRole: session.user.role,
  });
  const contentHash = computeContentHash(canonicalContent);
  const contentSummary = `${existing.reference ?? existing.id} verification revoked by ${session.user.name}`;
  const provenance = await readSigningProvenance();

  try {
    const { revocationSignature } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "CAPA_VERIFICATION_REVOCATION",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: "Verification Revoked",
          contentHash,
          contentSummary,
          passwordVerifiedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      // Wipe verification fields so re-verification can proceed. The
      // original verification SignedRecord row is preserved (immutable).
      await tx.cAPA.update({
        where: { id: capaId, tenantId: session.user.tenantId },
        data: {
          verifiedBy: null,
          verifiedById: null,
          verifiedAt: null,
          verificationNotes: null,
          verificationSignatureId: null,
        },
      });
      return { revocationSignature: sig };
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: VERIFICATION_AUDIT_MODULE,
        action: "CAPA_VERIFICATION_REVOKED",
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        oldValue: JSON.stringify({
          originalVerifiedAt: existing.verifiedAt.toISOString(),
          originalVerifierId: existing.verifiedById,
          originalSignatureId: existing.verificationSignatureId,
        }),
        newValue: JSON.stringify({
          revocationSignatureId: revocationSignature.id,
        }),
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: { revocationSignature } };
  } catch (err) {
    console.error("[action] revokeCAPAVerification failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to revoke verification") };
  }
}
