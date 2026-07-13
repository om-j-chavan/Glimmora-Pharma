"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor, COMPLIANCE_AUTHOR_ROLES } from "@/lib/auth";
import { scopedWhere } from "@/lib/tenantScope";
import { LOCKED_CAPA_STATUSES } from "@/lib/evidence-lock";
import { getCAPAEffectivenessCriteria } from "@/lib/queries/capa-criteria";
import { sanitizeServerError } from "@/lib/errors";

// â”€â”€ Result type â”€â”€

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// â”€â”€ Constants â”€â”€

const AUDIT_MODULE = "CAPA / Effectiveness";

const LOCKED_CAPA_MESSAGE =
  "Cannot add criteria â€” CAPA has progressed to QA review. Re-open the CAPA to modify.";
const LOCKED_CRITERION_MESSAGE =
  "Cannot modify a locked criterion â€” CAPA has progressed to QA review. Re-open the CAPA to modify.";

// â”€â”€ Schemas â”€â”€

const CriterionSchema = z.object({
  description: z.string().min(5, "Description must be at least 5 characters"),
  targetMetric: z.string().min(3, "Target metric must be at least 3 characters"),
  measurementMethod: z
    .string()
    .min(5, "Measurement method must be at least 5 characters"),
  targetValue: z
    .string()
    .min(1, "Target value is required")
    .max(500, "Target value must be 500 characters or fewer"),
  monitoringPeriod: z
    .string()
    .min(3, "Monitoring period must be at least 3 characters"),
});

// â”€â”€ Actions â”€â”€

/**
 * Client-callable read wrapper for the criteria panel. Mirrors
 * loadEvidenceForCAPA in src/actions/evidence.ts: requireAuth() + tenant
 * scope on the parent CAPA, then delegates to the cached query so the
 * read is request-deduped.
 */
export async function loadCriteriaForCAPA(
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const capa = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };
  const items = await getCAPAEffectivenessCriteria(
    session.user.tenantId,
    capaId,
  );
  return { success: true, data: items };
}

/**
 * Create a new effectiveness criterion attached to a CAPA in the current
 * tenant. Rejected if the CAPA has progressed past investigation per
 * substage 4.6's "locked at this stage, not modifiable post-implementation"
 * rule.
 */
export async function createCriterion(
  capaId: string,
  input: z.input<typeof CriterionSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CriterionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const capa = await prisma.cAPA.findFirst({
    where: { id: capaId, tenantId: session.user.tenantId },
    select: { id: true, status: true, description: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };
  if (LOCKED_CAPA_STATUSES.has(capa.status)) {
    return { success: false, error: LOCKED_CAPA_MESSAGE };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const criterion = await prisma.cAPAEffectivenessCriterion.create({
      data: {
        ...parsed.data,
        capaId,
        tenantId: session.user.tenantId,
        createdBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "EFFECTIVENESS_CRITERION_CREATED",
        recordId: criterion.id,
        recordTitle: capa.description.slice(0, 80),
        newValue: JSON.stringify(parsed.data),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${capaId}`);
    return { success: true, data: criterion };
  } catch (err) {
    console.error("[action] createCriterion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to create effectiveness criterion") };
  }
}

/**
 * Update an existing criterion. Two-layer lock check: (a) the criterion's
 * own lockedAt (set by lockCriteriaForCAPA when the parent CAPA crosses
 * into a LOCKED_CAPA_STATUSES state); (b) the parent CAPA's status
 * (defence in depth â€” protects against the rare race where a criterion
 * was created while the CAPA was in flight to a locked state).
 */
export async function updateCriterion(
  criterionId: string,
  input: z.input<typeof CriterionSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CriterionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const existing = await prisma.cAPAEffectivenessCriterion.findFirst({
    where: { id: criterionId, tenantId: session.user.tenantId },
    include: {
      capa: { select: { id: true, status: true, description: true } },
    },
  });
  if (!existing) return { success: false, error: "Criterion not found" };
  if (existing.lockedAt !== null) {
    return { success: false, error: LOCKED_CRITERION_MESSAGE };
  }
  if (LOCKED_CAPA_STATUSES.has(existing.capa.status)) {
    return { success: false, error: LOCKED_CAPA_MESSAGE };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const before = {
      description: existing.description,
      targetMetric: existing.targetMetric,
      measurementMethod: existing.measurementMethod,
      targetValue: existing.targetValue,
      monitoringPeriod: existing.monitoringPeriod,
    };
    const criterion = await prisma.cAPAEffectivenessCriterion.update({
      where: scopedWhere(session, criterionId),
      data: {
        ...parsed.data,
        updatedBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "EFFECTIVENESS_CRITERION_UPDATED",
        recordId: criterionId,
        recordTitle: existing.capa.description.slice(0, 80),
        oldValue: JSON.stringify(before),
        newValue: JSON.stringify(parsed.data),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    return { success: true, data: criterion };
  } catch (err) {
    console.error("[action] updateCriterion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to update effectiveness criterion") };
  }
}

/**
 * Hard-delete a criterion. The audit row's oldValue captures the full
 * pre-delete snapshot â€” no soft-delete column needed for inspection
 * traceability since the deletion event itself is part of the immutable
 * audit log.
 */
export async function deleteCriterion(
  criterionId: string,
  reason?: string,
): Promise<ActionResult> {
  const session = await requireAuth();

  const existing = await prisma.cAPAEffectivenessCriterion.findFirst({
    where: { id: criterionId, tenantId: session.user.tenantId, deletedAt: null },
    include: {
      capa: { select: { id: true, status: true, description: true } },
    },
  });
  if (!existing) return { success: false, error: "Criterion not found" };
  if (existing.lockedAt !== null) {
    return { success: false, error: LOCKED_CRITERION_MESSAGE };
  }
  if (LOCKED_CAPA_STATUSES.has(existing.capa.status)) {
    return { success: false, error: LOCKED_CAPA_MESSAGE };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const snapshot = {
      description: existing.description,
      targetMetric: existing.targetMetric,
      measurementMethod: existing.measurementMethod,
      targetValue: existing.targetValue,
      monitoringPeriod: existing.monitoringPeriod,
    };
    // Soft-delete (Part 11 retention) — row retained; criteria list/count
    // queries filter deletedAt so the readiness gate ignores it.
    await prisma.cAPAEffectivenessCriterion.update({
      where: scopedWhere(session, criterionId),
      data: {
        deletedAt: new Date(),
        deletedById: actor.userId,
        deletedByName: actor.displayName,
        deletionReason: reason ? reason.slice(0, 200) : null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "EFFECTIVENESS_CRITERION_DELETED",
        recordId: criterionId,
        recordTitle: existing.capa.description.slice(0, 80),
        oldValue: JSON.stringify(snapshot),
        newValue: reason ? reason.slice(0, 200) : null,
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteCriterion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to delete effectiveness criterion") };
  }
}

export async function restoreCriterion(criterionId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const existing = await prisma.cAPAEffectivenessCriterion.findFirst({
    where: { id: criterionId, tenantId: session.user.tenantId },
    include: { capa: { select: { id: true, status: true } } },
  });
  if (!existing) return { success: false, error: "Criterion not found" };
  if (!existing.deletedAt) return { success: false, error: "Criterion is not deleted." };
  if (LOCKED_CAPA_STATUSES.has(existing.capa.status)) {
    return { success: false, error: LOCKED_CAPA_MESSAGE };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    await prisma.cAPAEffectivenessCriterion.update({
      where: scopedWhere(session, criterionId),
      data: { deletedAt: null, deletedById: null, deletedByName: null, deletionReason: null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE,
        action: "EFFECTIVENESS_CRITERION_RESTORED",
        recordId: criterionId,
        recordTitle: criterionId,
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${existing.capa.id}`);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] restoreCriterion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to restore effectiveness criterion") };
  }
}
