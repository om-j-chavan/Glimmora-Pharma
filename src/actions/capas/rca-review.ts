"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateSodOverride, tenantSodOverrideOn, writeSodOverride, type SodControl } from "./sod-override";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { canReviewRCA } from "@/lib/permissions/roleSets";
import {
  RCA_REVIEW_AUDIT_MODULE,
  RCA_REVIEW_INVALID_STATUS_MESSAGE,
  type ActionResult,
} from "./_types";
import { sanitizeServerError } from "@/lib/errors";

/* â”€â”€ SME Section 1, Stage 3 (FULL) â€” RCA Quality Review â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Three-action surface mirroring the substage-4.7 alignment review
 * (set / override / clear). Different audit module, different status
 * window, different SoD rule, but the same architectural shape so future
 * readers see one consistent pattern across both QA gates.
 *
 * Differences from alignment review:
 *   - Status window: RCA review is only valid while the CAPA is in
 *     "in_progress" â€” earlier ("open") there's no RCA to review yet;
 *     later (>= "pending_qa_review") the CAPA is past this phase and
 *     editing the RCA verdict would undermine the in-flight QA review.
 *   - SoD: the CAPA creator cannot review their own RCA. This is a
 *     stronger constraint than alignment (which doesn't enforce
 *     creator-vs-reviewer). createdBy is a display-name string today;
 *     the comparison is therefore by name, with the same brittleness
 *     caveat as the approveCAPA self-approval guard.
 *   - Verdict shape: rcaApproved is Boolean (true=approved /
 *     false=rejected) not an enum string; the override path applies
 *     only when overriding a prior rejection to approved-with-rationale.
 *
 * Auto-invalidation: editing the rca or rcaMethod fields via updateCAPA
 * after rcaApproved is true clears the review back to null (see
 * lifecycle.ts updateCAPA logic). This rung does NOT mint a SignedRecord
 * â€” RCA review is a procedural QA gate, not a Part-11-binding event;
 * the full Stage 3 verification step that DOES sign is the closure
 * SignedRecord later in the lifecycle.
 */

// â”€â”€ Schemas â”€â”€

const ReviewRCASchema = z.object({
  approved: z.boolean(),
  notes: z
    .string()
    .min(10, "Notes must be at least 10 characters")
    .max(2000, "Notes must be 2000 characters or fewer"),
  // Single-QA override (Phase 1) — used ONLY when a self-check fires with the flag ON.
  sodOverrideReasonCode: z.string().optional(),
  sodOverrideJustification: z.string().optional(),
});

const OverrideRCASchema = z.object({
  reason: z
    .string()
    .min(20, "Override reason must be at least 20 characters")
    .max(2000, "Override reason must be 2000 characters or fewer"),
  sodOverrideReasonCode: z.string().optional(),
  sodOverrideJustification: z.string().optional(),
});

// Roles authorised to set / override / clear an RCA review. Same role
// gate as alignment review â€” RCA quality is a QA procedural decision.
// canReviewRCA is imported from the shared role-set module (see import above)
// so the server gate and the client usePermissions hook share ONE definition.

// "in_progress" is the only valid status for an RCA review. "open" has
// no RCA yet, anything >= "pending_qa_review" is past this gate.
const RCA_REVIEW_VALID_STATUS = "in_progress";

/**
 * Record an RCA quality verdict on a CAPA. Approved (true) clears the
 * CAPA to proceed to action-plan + alignment review + full submission;
 * rejected (false) sends the RCA back for revision. A subsequent
 * approval after a rejection should use overrideRCAReview so the
 * dissenting verdict is preserved alongside the override rationale.
 */
export async function reviewRCA(
  capaId: string,
  input: z.input<typeof ReviewRCASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewRCA(session.user.role)) {
    return {
      success: false,
      error: "Only QA Head, Customer Admin, or Super Admin can review RCA",
    };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const parsed = ReviewRCASchema.safeParse(input);
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
      reference: true,
      rca: true,
      rcaApproved: true,
      createdBy: true,
      createdById: true,
      // SoD (CAPA lifecycle rework) — the last RCA editor cannot approve it.
      rcaEditedById: true,
      // Single-QA override — Critical is a hard floor (never waivable).
      risk: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (existing.status !== RCA_REVIEW_VALID_STATUS) {
    return { success: false, error: RCA_REVIEW_INVALID_STATUS_MESSAGE };
  }
  if (!existing.rca || existing.rca.trim().length === 0) {
    return {
      success: false,
      error: "No root cause analysis to review â€” author must enter RCA text first.",
    };
  }

  // SoD â€” creator cannot review their own RCA. Prefer the authoritative
  // createdById userId FK; fall back to display-name comparison only for
  // legacy rows whose createdById is null (predate the FK / unresolvable
  // backfill). ID comparison is robust against duplicate names and renames.
  const isSelfReview = existing.createdById
    ? existing.createdById === session.user.id
    : Boolean(existing.createdBy) && existing.createdBy === session.user.name;
  // Single-QA override (Phase 1) — collect the waived control(s). Empty = normal path.
  const waivedControls: SodControl[] = [];
  let sodReason = "";
  let sodJustification = "";
  if (isSelfReview) {
    const flagOn = await tenantSodOverrideOn(session.user.tenantId);
    const d = evaluateSodOverride({
      risk: existing.risk,
      flagOn,
      existingBlockError: "You cannot review the RCA of a CAPA you created. Separation of duties requires a different reviewer.",
      input: parsed.data,
    });
    if (!d.proceed) {
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: session.user.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: RCA_REVIEW_AUDIT_MODULE,
            action: "RCA_REVIEW_BLOCKED_SELF_REVIEW",
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
        console.error("[action] failed to write RCA_REVIEW_BLOCKED_SELF_REVIEW audit:", err);
      }
      return { success: false, error: d.error };
    }
    waivedControls.push("RCA_APPROVAL");
    sodReason = d.reasonCode;
    sodJustification = d.justification;
  }

  // SoD (CAPA lifecycle rework) — the person who last EDITED the RCA text cannot
  // be the one who approves/rejects it (editor ≠ approver). rcaEditedById is
  // stamped by updateCAPA on an RCA edit; null (never edited via that path)
  // disables only this check. Complements the creator-vs-reviewer guard above.
  if (existing.rcaEditedById && existing.rcaEditedById === session.user.id) {
    if (waivedControls.length) {
      // Same person is creator AND editor — the override was already validated
      // above (non-Critical, flag on, reason/justification valid); record the
      // second waived control under the same justification.
      waivedControls.push("RCA_EDITOR_APPROVER");
    } else {
      const flagOn = await tenantSodOverrideOn(session.user.tenantId);
      const d = evaluateSodOverride({
        risk: existing.risk,
        flagOn,
        existingBlockError: "You edited this root cause analysis, so you cannot also approve it. A different QA reviewer must review it.",
        input: parsed.data,
      });
      if (!d.proceed) {
        try {
          await prisma.auditLog.create({
            data: {
              tenantId: session.user.tenantId,
              userId: actor.userId,
              userName: actor.displayName,
              userRole: actor.role,
              module: RCA_REVIEW_AUDIT_MODULE,
              action: "RCA_REVIEW_BLOCKED_EDITOR_IS_APPROVER",
              recordId: capaId,
              recordTitle: (existing.reference ?? existing.description).slice(0, 80),
              newValue: JSON.stringify({ attemptedBy: session.user.id, rcaEditedById: existing.rcaEditedById }),
            },
          });
        } catch (err) {
          console.error("[action] failed to write RCA_REVIEW_BLOCKED_EDITOR_IS_APPROVER audit:", err);
        }
        return { success: false, error: d.error };
      }
      waivedControls.push("RCA_EDITOR_APPROVER");
      sodReason = d.reasonCode;
      sodJustification = d.justification;
    }
  }

  try {
    const now = new Date();
    // A fresh review starts a fresh decision — wipe any prior override.
    // Same pattern as alignment review's wipe-on-status-change.
    const doReview = async (client: Prisma.TransactionClient) => {
      const capa = await client.cAPA.update({
        where: { id: capaId, tenantId: session.user.tenantId },
        data: {
          rcaApproved: parsed.data.approved,
          rcaReviewedBy: session.user.name,
          rcaReviewedById: session.user.id,
          rcaReviewedAt: now,
          rcaReviewNotes: parsed.data.notes,
          rcaOverrideBy: null,
          rcaOverrideById: null,
          rcaOverrideAt: null,
          rcaOverrideReason: null,
        },
      });
      await client.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: RCA_REVIEW_AUDIT_MODULE,
          action: parsed.data.approved
            ? "CAPA_RCA_REVIEW_APPROVED"
            : "CAPA_RCA_REVIEW_REJECTED",
          recordId: capaId,
          recordTitle: (existing.reference ?? existing.description).slice(0, 80),
          oldValue:
            existing.rcaApproved === null
              ? "null"
              : existing.rcaApproved
                ? "approved"
                : "rejected",
          newValue: JSON.stringify({
            approved: parsed.data.approved,
            notes: parsed.data.notes,
          }),
        },
      });
      return capa;
    };
    // Single-QA override: the review + waiver record(s) commit atomically in ONE
    // transaction. Normal path (no waiver) runs unchanged (update then audit).
    const capa = waivedControls.length
      ? await prisma.$transaction(async (tx) => {
          const c = await doReview(tx);
          for (const control of waivedControls) {
            await writeSodOverride(tx, {
              tenantId: session.user.tenantId,
              capaId,
              control,
              actorUserId: session.user.id,
              actorName: session.user.name,
              actorRole: session.user.role,
              reasonCode: sodReason,
              justification: sodJustification,
              recordTitle: existing.reference ?? existing.description,
              signedRecordId: null,
            });
          }
          return c;
        })
      : await doReview(prisma);
    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] reviewRCA failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to record RCA review") };
  }
}

/**
 * Override a prior RCA rejection so the CAPA can proceed. SoD: the
 * reviewer who recorded the rejection cannot override their own
 * verdict â€” a different QA reviewer must do so with a recorded
 * rationale. Mirrors overrideCAPAAlignmentFlag.
 */
export async function overrideRCAReview(
  capaId: string,
  input: z.input<typeof OverrideRCASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewRCA(session.user.role)) {
    return {
      success: false,
      error: "Only QA Head, Customer Admin, or Super Admin can override an RCA review",
    };
  }
  const parsed = OverrideRCASchema.safeParse(input);
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
      reference: true,
      rcaApproved: true,
      rcaReviewedBy: true,
      rcaReviewedById: true,
      rcaOverrideBy: true,
      risk: true,
    },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (existing.status !== RCA_REVIEW_VALID_STATUS) {
    return { success: false, error: RCA_REVIEW_INVALID_STATUS_MESSAGE };
  }
  if (existing.rcaApproved !== false) {
    return {
      success: false,
      error: "Override is only valid when the RCA is currently rejected.",
    };
  }
  if (existing.rcaOverrideBy !== null) {
    return {
      success: false,
      error: "This RCA rejection has already been overridden.",
    };
  }
  // Separation of duties — the reviewer who rejected the RCA cannot override their
  // own rejection (+ single-QA override, Phase 1).
  const waivedControls: SodControl[] = [];
  let sodReason = "";
  let sodJustification = "";
  if (existing.rcaReviewedById && existing.rcaReviewedById === session.user.id) {
    const flagOn = await tenantSodOverrideOn(session.user.tenantId);
    const d = evaluateSodOverride({
      risk: existing.risk,
      flagOn,
      existingBlockError:
        "The reviewer who rejected this RCA cannot override their own verdict. " +
        "A different QA reviewer must override.",
      input: parsed.data,
    });
    if (!d.proceed) return { success: false, error: d.error };
    waivedControls.push("RCA_REJECTION_OVERRIDE");
    sodReason = d.reasonCode;
    sodJustification = d.justification;
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const now = new Date();
    const doOverride = async (client: Prisma.TransactionClient) => {
      const capa = await client.cAPA.update({
        where: { id: capaId, tenantId: session.user.tenantId },
        data: {
          rcaApproved: true,
          rcaOverrideBy: session.user.name,
          rcaOverrideById: session.user.id,
          rcaOverrideAt: now,
          rcaOverrideReason: parsed.data.reason,
        },
      });
      await client.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: RCA_REVIEW_AUDIT_MODULE,
          action: "CAPA_RCA_REVIEW_OVERRIDE",
          recordId: capaId,
          recordTitle: (existing.reference ?? existing.description).slice(0, 80),
          oldValue: `${existing.rcaReviewedBy ?? "(unknown)"} rejected`,
          newValue: JSON.stringify({
            overrideBy: session.user.name,
            reason: parsed.data.reason,
          }),
        },
      });
      return capa;
    };
    const capa = waivedControls.length
      ? await prisma.$transaction(async (tx) => {
          const c = await doOverride(tx);
          await writeSodOverride(tx, {
            tenantId: session.user.tenantId,
            capaId,
            control: "RCA_REJECTION_OVERRIDE",
            actorUserId: session.user.id,
            actorName: session.user.name,
            actorRole: session.user.role,
            reasonCode: sodReason,
            justification: sodJustification,
            recordTitle: existing.reference ?? existing.description,
            signedRecordId: null,
          });
          return c;
        })
      : await doOverride(prisma);
    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] overrideRCAReview failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to override RCA review") };
  }
}

/**
 * Wipe all 9 RCA-review fields back to null so a reviewer can start over.
 * Subject to the same role + status checks as set/override. Mirrors
 * clearCAPAAlignmentReview's permissive scope â€” any reviewer in the
 * role gate can clear; the audit trail captures who did it.
 */
export async function clearRCAReview(capaId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canReviewRCA(session.user.role)) {
    return {
      success: false,
      error: "Only QA Head, Customer Admin, or Super Admin can clear an RCA review",
    };
  }

  const existing = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId: session.user.tenantId },
    select: { id: true, status: true, description: true, reference: true, rcaApproved: true },
  });
  if (!existing) return { success: false, error: "CAPA not found" };
  if (existing.status !== RCA_REVIEW_VALID_STATUS) {
    return { success: false, error: RCA_REVIEW_INVALID_STATUS_MESSAGE };
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
        rcaApproved: null,
        rcaReviewedBy: null,
        rcaReviewedById: null,
        rcaReviewedAt: null,
        rcaReviewNotes: null,
        rcaOverrideBy: null,
        rcaOverrideById: null,
        rcaOverrideAt: null,
        rcaOverrideReason: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: RCA_REVIEW_AUDIT_MODULE,
        action: "CAPA_RCA_REVIEW_CLEARED",
        recordId: capaId,
        recordTitle: (existing.reference ?? existing.description).slice(0, 80),
        oldValue:
          existing.rcaApproved === null
            ? "null"
            : existing.rcaApproved
              ? "approved"
              : "rejected",
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] clearRCAReview failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to clear RCA review") };
  }
}
