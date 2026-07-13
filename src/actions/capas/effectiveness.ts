"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { canApproveCAPA } from "@/lib/capa-approvals";
import {
  canonicalizeCAPAEffectivenessContent,
  canonicalizeCAPAEffectivenessRevocationContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import {
  EFFECTIVENESS_AUDIT_MODULE,
  EFFECTIVENESS_VERDICTS,
  SIGNING_AUDIT_MODULE,
  type ActionResult,
} from "./_types";
import { readSigningProvenance } from "./_shared";
import { sanitizeServerError } from "@/lib/errors";

/* â”€â”€ SME Section 1, Stage 6 (FULL) â€” 90-day Effectiveness Review â”€â”€
 *
 * Manual review (no scheduled trigger â€” that's a deployment-platform
 * concern parked for post-launch). The reviewer attests that the CAPA
 * has been effective (or not) at preventing recurrence, ~90 days after
 * closure.
 *
 * SoD invariants enforced here:
 *   1. Reviewer â‰  closure signer. The user who signed the CAPA closure
 *      cannot review their own work.
 *   2. Reviewer â‰  verification signer. The independent verifier from
 *      Stage 5 cannot also conclude effectiveness.
 *   3. super_admin does NOT bypass SoD â€” same posture as verifyCAPA.
 *
 * Status invariants: only "closed" CAPAs are subject to effectiveness
 * review (rejected ones aren't). The CAPA stays in "closed" through
 * the review â€” verdict is recorded as metadata + a SignedRecord; no
 * status flip. An "ineffective" verdict surfaces a strong warning but
 * does not auto-create a new CAPA in this rung (future enhancement).
 *
 * Note: the lookup for closure-signer and verifier identities reads
 * the SignedRecord.signerId column directly (which is the real userId
 * across this codebase) rather than going through display-name
 * comparison â€” strong SoD signal, not brittle.
 */

const RecordEffectivenessSchema = z.object({
  verdict: z.enum(EFFECTIVENESS_VERDICTS),
  notes: z
    .string()
    .min(20, "Notes must be at least 20 characters")
    .max(4000, "Notes must be 4000 characters or fewer"),
  password: z.string().min(1, "Password is required to sign"),
  recurrenceObservations: z.array(z.string()).optional(),
});

const RevokeEffectivenessSchema = z.object({
  password: z.string().min(1, "Password is required to sign"),
});

/**
 * Record the 90-day effectiveness review verdict for a closed CAPA.
 * Mints a CAPA_EFFECTIVENESS_REVIEW SignedRecord and writes the verdict
 * + reviewer attribution onto the CAPA row.
 */
export async function recordEffectivenessReview(
  capaId: string,
  input: z.input<typeof RecordEffectivenessSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const parsed = RecordEffectivenessSchema.safeParse(input);
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
      closedAt: true,
      effectivenessDate: true,
      effectivenessReviewedAt: true,
      closureSignatureId: true,
      verificationSignatureId: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };

  // Status gate â€” only closed CAPAs are subject to effectiveness review.
  if (existing.status !== "closed") {
    return {
      success: false,
      error:
        "Effectiveness review applies only to closed CAPAs. Rejected or in-flight CAPAs are not subject to the 90-day check.",
    };
  }
  if (!existing.closedAt || !existing.effectivenessDate) {
    return {
      success: false,
      error:
        "This CAPA is missing the closure timestamp or the effectiveness due date. The backfill script (scripts/backfill-capa-effectiveness-due.ts) should populate these for legacy rows.",
    };
  }
  if (existing.effectivenessReviewedAt !== null) {
    return {
      success: false,
      error:
        "An effectiveness review has already been recorded for this CAPA. Revoke the existing review before recording a new one.",
    };
  }

  // Role gate â€” same set approveCAPA permits for this tier.
  if (!canApproveCAPA(session.user.role, existing.risk)) {
    return {
      success: false,
      error: `Your role cannot review effectiveness for a ${existing.risk} CAPA â€” only QA roles authorised for approval may review.`,
    };
  }

  // SoD â€” fetch the signer ids of the closure + verification signing
  // events. Block if the current user signed either.
  const blockingSigners: { recordType: string; signerId: string | null }[] = [];
  if (existing.closureSignatureId) {
    const closureSig = await prisma.signedRecord.findUnique({
      where: { id: existing.closureSignatureId },
      select: { signerId: true },
    });
    if (closureSig) blockingSigners.push({ recordType: "CAPA_CLOSURE", signerId: closureSig.signerId });
  }
  if (existing.verificationSignatureId) {
    const verSig = await prisma.signedRecord.findUnique({
      where: { id: existing.verificationSignatureId },
      select: { signerId: true },
    });
    if (verSig) blockingSigners.push({ recordType: "CAPA_VERIFICATION", signerId: verSig.signerId });
  }
  const conflict = blockingSigners.find((s) => s.signerId === session.user.id);
  if (conflict) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: EFFECTIVENESS_AUDIT_MODULE,
          action: "CAPA_EFFECTIVENESS_BLOCKED_SAME_SIGNER",
          recordId: capaId,
          recordTitle: (existing.reference ?? existing.description).slice(0, 80),
          newValue: JSON.stringify({
            attemptedBy: session.user.id,
            conflictingRecordType: conflict.recordType,
          }),
        },
      });
    } catch (err) {
      console.error("[action] failed to write CAPA_EFFECTIVENESS_BLOCKED_SAME_SIGNER audit:", err);
    }
    const which =
      conflict.recordType === "CAPA_CLOSURE"
        ? "signed the closure"
        : "signed the verification";
    return {
      success: false,
      error: `You ${which} for this CAPA. Independent effectiveness review requires a different reviewer (separation of duties).`,
    };
  }

  // Password re-verify (Part 11 Â§11.200(a)(1)(ii)).
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
          recordType: "CAPA_EFFECTIVENESS_REVIEW",
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
  const reviewedAt = passwordVerifiedAt;
  const canonicalContent = canonicalizeCAPAEffectivenessContent({
    capaId: existing.id,
    capaReference: existing.reference,
    capaDescription: existing.description,
    closedAt: existing.closedAt,
    effectivenessDueAt: existing.effectivenessDate,
    reviewedAt,
    verdict: parsed.data.verdict,
    notes: parsed.data.notes,
  });
  const contentHash = computeContentHash(canonicalContent);
  const contentSummary = `${existing.reference ?? existing.id} effectiveness reviewed by ${session.user.name} (${session.user.role}) â€” verdict: ${parsed.data.verdict}`;
  const provenance = await readSigningProvenance();

  try {
    const { capa, signedRecord } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "CAPA_EFFECTIVENESS_REVIEW",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: `Effectiveness Review â€” ${parsed.data.verdict}`,
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
          effectivenessReviewedAt: reviewedAt,
          effectivenessVerdict: parsed.data.verdict,
          effectivenessReviewedBy: session.user.name,
          effectivenessReviewedById: session.user.id,
          effectivenessReviewNotes: parsed.data.notes,
          effectivenessSignatureId: sig.id,
        },
      });
      return { capa: updated, signedRecord: sig };
    });

    // Paired audit rows â€” workflow + signing event.
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: EFFECTIVENESS_AUDIT_MODULE,
        action: "CAPA_EFFECTIVENESS_REVIEWED",
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          verdict: parsed.data.verdict,
          signatureId: signedRecord.id,
          notes: parsed.data.notes.slice(0, 500),
          recurrenceObservations: parsed.data.recurrenceObservations ?? [],
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
        action: "CAPA_EFFECTIVENESS_REVIEW_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.description.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: signedRecord.signatureMeaning,
          capaId,
        }),
      },
    });

    // Forensic breadcrumb â€” "ineffective" verdicts are searchable on
    // their own dedicated action code so a coordinator can pull every
    // CAPA found ineffective in a date range without scanning JSON.
    if (parsed.data.verdict === "ineffective") {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: EFFECTIVENESS_AUDIT_MODULE,
          action: "CAPA_FOUND_INEFFECTIVE",
          recordId: capaId,
          recordTitle: existing.description.slice(0, 80),
          newValue: JSON.stringify({
            verdict: parsed.data.verdict,
            signatureId: signedRecord.id,
            recurrenceObservations: parsed.data.recurrenceObservations ?? [],
          }),
        },
      });
    }

    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: { capa, signature: signedRecord } };
  } catch (err) {
    console.error("[action] recordEffectivenessReview failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to record effectiveness review") };
  }
}

/**
 * Revoke an effectiveness review the caller themselves recorded.
 * Mirrors revokeCAPAVerification â€” same-reviewer only, mints a
 * CAPA_EFFECTIVENESS_REVIEW_REVOCATION SignedRecord, clears the
 * review fields. Original signature row preserved (Part 11
 * immutability).
 */
export async function revokeEffectivenessReview(
  capaId: string,
  input: z.input<typeof RevokeEffectivenessSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const parsed = RevokeEffectivenessSchema.safeParse(input);
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
      effectivenessReviewedById: true,
      effectivenessReviewedAt: true,
      effectivenessVerdict: true,
      effectivenessSignatureId: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (existing.effectivenessReviewedAt === null) {
    return { success: false, error: "No effectiveness review to revoke." };
  }
  if (existing.effectivenessReviewedById !== session.user.id) {
    return {
      success: false,
      error: "You can only revoke your own effectiveness review.",
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
          recordType: "CAPA_EFFECTIVENESS_REVIEW_REVOCATION",
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
  const canonicalContent = canonicalizeCAPAEffectivenessRevocationContent({
    capaId: existing.id,
    capaReference: existing.reference,
    originalReviewedAt: existing.effectivenessReviewedAt,
    originalReviewerId: existing.effectivenessReviewedById ?? "",
    originalVerdict: existing.effectivenessVerdict ?? "",
    revokedAt,
    revokerId: session.user.id,
    revokerRole: session.user.role,
  });
  const contentHash = computeContentHash(canonicalContent);
  const contentSummary = `${existing.reference ?? existing.id} effectiveness review revoked by ${session.user.name}`;
  const provenance = await readSigningProvenance();

  try {
    const { revocationSignature } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "CAPA_EFFECTIVENESS_REVIEW_REVOCATION",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: "Effectiveness Review Revoked",
          contentHash,
          contentSummary,
          passwordVerifiedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      await tx.cAPA.update({
        where: { id: capaId, tenantId: session.user.tenantId },
        data: {
          effectivenessReviewedAt: null,
          effectivenessVerdict: null,
          effectivenessReviewedBy: null,
          effectivenessReviewedById: null,
          effectivenessReviewNotes: null,
          effectivenessSignatureId: null,
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
        module: EFFECTIVENESS_AUDIT_MODULE,
        action: "CAPA_EFFECTIVENESS_REVIEW_REVOKED",
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        oldValue: JSON.stringify({
          originalReviewedAt: existing.effectivenessReviewedAt.toISOString(),
          originalReviewerId: existing.effectivenessReviewedById,
          originalVerdict: existing.effectivenessVerdict,
          originalSignatureId: existing.effectivenessSignatureId,
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
    console.error("[action] revokeEffectivenessReview failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to revoke effectiveness review") };
  }
}
