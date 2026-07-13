"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { canReviewAlignment } from "@/lib/permissions/roleSets";
import { LOCKED_CAPA_STATUSES } from "@/lib/evidence-lock";
import {
  ALIGNMENT_OVERRIDE_REASON_MIN_LENGTH,
  ALIGNMENT_STATUSES,
} from "@/lib/capa-alignment";
import {
  ALIGNMENT_AUDIT_MODULE,
  ALIGNMENT_LOCKED_MESSAGE,
  type ActionResult,
} from "./_types";
import { sanitizeServerError } from "@/lib/errors";

/* â”€â”€ Substage 4.7 â€” Action-to-Cause Alignment Review â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Three-action surface (set / override / clear) keyed off the alignment*
 * columns added in migration add_capa_alignment_review. The submission
 * gate inside lifecycle.ts's submitForReview enforces the workflow
 * consequence: a CAPA cannot leave investigation unless a reviewer has
 * either marked it "aligned" or a separate qa_head has overridden a
 * "cosmetic" verdict.
 */

// â”€â”€ Schemas â”€â”€

const AlignmentStatusSchema = z.object({
  status: z.enum(ALIGNMENT_STATUSES),
  notes: z
    .string()
    .min(10, "Notes must be at least 10 characters")
    .max(2000, "Notes must be 2000 characters or fewer"),
});

const AlignmentOverrideSchema = z.object({
  reason: z
    .string()
    .min(
      ALIGNMENT_OVERRIDE_REASON_MIN_LENGTH,
      `Override reason must be at least ${ALIGNMENT_OVERRIDE_REASON_MIN_LENGTH} characters`,
    )
    .max(2000, "Override reason must be 2000 characters or fewer"),
});

// Roles authorised to set / override / clear alignment review. Matches the
// existing canCloseCapa role gate but does NOT require gxpSignatory â€”
// alignment review is a procedural decision, not an e-signed event.
// canReviewAlignment is imported from the shared role-set module (see import
// above) so the server gate and client usePermissions share ONE definition.

/**
 * Record (or update) the reviewer's action-to-cause alignment verdict on
 * a CAPA. A status change always wipes any prior override â€” a fresh review
 * starts a fresh decision.
 */
export async function setCAPAAlignmentStatus(
  capaId: string,
  input: z.input<typeof AlignmentStatusSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewAlignment(session.user.role)) {
    return {
      success: false,
      error: "Only QA Head, Customer Admin, or Super Admin can set alignment status",
    };
  }
  const parsed = AlignmentStatusSchema.safeParse(input);
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
      description: true,
      alignmentStatus: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (LOCKED_CAPA_STATUSES.has(existing.status)) {
    return { success: false, error: ALIGNMENT_LOCKED_MESSAGE };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const now = new Date();
    const statusChanged = existing.alignmentStatus !== parsed.data.status;
    const capa = await prisma.cAPA.update({
      where: { id: capaId, tenantId: session.user.tenantId },
      data: {
        alignmentStatus: parsed.data.status,
        alignmentNotes: parsed.data.notes,
        alignmentReviewedBy: session.user.name,
        alignmentReviewedById: session.user.id,
        alignmentReviewedAt: now,
        // Status transition wipes the override fields. A fresh decision
        // starts from a clean slate so a stale override can't survive a
        // back-and-forth review cycle.
        ...(statusChanged
          ? {
              alignmentOverrideBy: null,
              alignmentOverrideById: null,
              alignmentOverrideAt: null,
              alignmentOverrideReason: null,
            }
          : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: ALIGNMENT_AUDIT_MODULE,
        action: "ALIGNMENT_STATUS_SET",
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        oldValue: existing.alignmentStatus ?? "null",
        newValue: JSON.stringify({
          status: parsed.data.status,
          notes: parsed.data.notes,
        }),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] setCAPAAlignmentStatus failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to set alignment status") };
  }
}

/**
 * Override a "cosmetic" alignment flag so the CAPA can be submitted. The
 * separation-of-duties check at the heart of this action: the reviewer who
 * flagged the CAPA cannot override their own flag. A different qa_head /
 * customer_admin / super_admin must clear it.
 */
export async function overrideCAPAAlignmentFlag(
  capaId: string,
  input: z.input<typeof AlignmentOverrideSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewAlignment(session.user.role)) {
    return {
      success: false,
      error: "Only QA Head, Customer Admin, or Super Admin can override an alignment flag",
    };
  }
  const parsed = AlignmentOverrideSchema.safeParse(input);
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
      description: true,
      alignmentStatus: true,
      alignmentReviewedBy: true,
      alignmentReviewedById: true,
      alignmentOverrideBy: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (LOCKED_CAPA_STATUSES.has(existing.status)) {
    return { success: false, error: ALIGNMENT_LOCKED_MESSAGE };
  }
  if (existing.alignmentStatus !== "cosmetic") {
    return {
      success: false,
      error: "Override is only valid when alignment status is 'cosmetic'.",
    };
  }
  if (existing.alignmentOverrideBy !== null) {
    return {
      success: false,
      error: "This cosmetic flag has already been overridden.",
    };
  }
  // Separation of duties â€” the reviewer who set the cosmetic flag cannot
  // override it. A different qa_head must do so.
  if (
    existing.alignmentReviewedById &&
    existing.alignmentReviewedById === session.user.id
  ) {
    return {
      success: false,
      error:
        "The reviewer who flagged this CAPA as cosmetic cannot override their own flag. " +
        "A different QA Head must override.",
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const now = new Date();
    const capa = await prisma.cAPA.update({
      where: { id: capaId, tenantId: session.user.tenantId },
      data: {
        alignmentOverrideBy: session.user.name,
        alignmentOverrideById: session.user.id,
        alignmentOverrideAt: now,
        alignmentOverrideReason: parsed.data.reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: ALIGNMENT_AUDIT_MODULE,
        action: "ALIGNMENT_STATUS_OVERRIDE",
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        oldValue: `${existing.alignmentReviewedBy ?? "(unknown)"} flagged as cosmetic`,
        newValue: JSON.stringify({
          overrideBy: session.user.name,
          reason: parsed.data.reason,
        }),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] overrideCAPAAlignmentFlag failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to override alignment flag") };
  }
}

/**
 * Wipe all 9 alignment fields back to null so a reviewer can start over.
 * Subject to the same lock + role checks as the set/override actions.
 */
export async function clearCAPAAlignmentReview(
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewAlignment(session.user.role)) {
    return {
      success: false,
      error: "Only QA Head, Customer Admin, or Super Admin can clear an alignment review",
    };
  }

  const existing = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId: session.user.tenantId },
    select: { id: true, status: true, description: true, alignmentStatus: true },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (LOCKED_CAPA_STATUSES.has(existing.status)) {
    return { success: false, error: ALIGNMENT_LOCKED_MESSAGE };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const capa = await prisma.cAPA.update({
      where: { id: capaId, tenantId: session.user.tenantId },
      data: {
        alignmentStatus: null,
        alignmentNotes: null,
        alignmentReviewedBy: null,
        alignmentReviewedById: null,
        alignmentReviewedAt: null,
        alignmentOverrideBy: null,
        alignmentOverrideById: null,
        alignmentOverrideAt: null,
        alignmentOverrideReason: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: ALIGNMENT_AUDIT_MODULE,
        action: "ALIGNMENT_REVIEW_CLEARED",
        recordId: capaId,
        recordTitle: existing.description.slice(0, 80),
        oldValue: existing.alignmentStatus ?? "null",
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] clearCAPAAlignmentReview failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to clear alignment review") };
  }
}
