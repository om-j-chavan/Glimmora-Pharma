"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { generateReference, isReferenceConflict } from "@/lib/reference";
import {
  CHANGE_CONTROL_RISKS,
  CHANGE_CONTROL_STATUSES,
  CHANGE_TYPES,
  type ChangeControlStatus,
} from "@/lib/change-control-constants";
import {
  canonicalizeChangeControlTransitionContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import { readSigningProvenance } from "@/actions/capas/_shared";
import { SIGNING_AUDIT_MODULE } from "@/actions/capas/_types";
import { sanitizeServerError } from "@/lib/errors";

/** Substage 5.4 â€” only these transitions require a Part 11 e-signature.
 *  The rest (Draftâ†”In Review, Approvedâ†’In Implementation, In Implementation
 *  â†’Implemented) are administrative and stay unsigned. */
const SIGNED_TRANSITION_TARGETS: ReadonlySet<ChangeControlStatus> = new Set([
  "Approved",
  "Rejected",
  "Closed",
]);

/**
 * Substage 4.8 â€” Change Control Linkage.
 *
 * Six server actions: create / update / transition status / soft-delete on
 * the ChangeControl entity, plus link / unlink between CAPA â†” ChangeControl.
 * All actions follow the same patterns as the rest of the codebase
 * (requireAuth â†’ tenant scope â†’ zod validation â†’ audit row in same try
 * block â†’ revalidatePath â†’ NODE_ENV-gated dev errors).
 *
 * E-signature on CC approvals will adopt the SignedRecord pattern from
 * substage 5.4 in a future ticket; this v1 just records status transitions
 * with role gates and audit-log entries.
 */

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const AUDIT_MODULE_CC = "Change Control";
const AUDIT_MODULE_LINK = "CAPA / Change Control";

// Constants + types live in src/lib/change-control-constants.ts so this
// "use server" file only exports async functions (Next 16 enforces this
// at runtime â€” re-exporting non-functions from a "use server" file
// crashes the app).

/** Status transitions allowed by the state machine. Each entry maps the
 *  current status â†’ an array of allowed next statuses. Anything not in
 *  this map is rejected by transitionChangeControlStatus. */
const ALLOWED_TRANSITIONS: Record<ChangeControlStatus, ChangeControlStatus[]> = {
  Draft: ["In Review"],
  "In Review": ["Approved", "Rejected", "Draft"],
  Approved: ["In Implementation"],
  "In Implementation": ["Implemented"],
  Implemented: ["Closed"],
  Closed: [],
  Rejected: [],
};

/** Roles allowed to approve / reject / close â€” mirrors the QA-tier role
 *  set used elsewhere in the codebase. */
const QA_GATE_ROLES: ReadonlySet<string> = new Set([
  "qa_head",
  "customer_admin",
  "super_admin",
]);

/** Statuses that lock the CC against further edits / deletes. */
const FINALIZED_STATUSES: ReadonlySet<string> = new Set([
  "Implemented",
  "Closed",
  "Rejected",
]);

/** Statuses that block new CAPA links (you can't attach a fresh corrective-
 *  action linkage to a CC that's already done). Mirrors FINALIZED. */
const LINK_BLOCKED_CC_STATUSES = FINALIZED_STATUSES;

/** CAPA statuses that block new CC links (a closed CAPA shouldn't gain
 *  new corrective-implementation linkages â€” those belong on a fresh CAPA). */
const LINK_BLOCKED_CAPA_STATUSES: ReadonlySet<string> = new Set([
  "closed",
  "rejected",
]);

// â”€â”€ Schemas â”€â”€

const CreateChangeControlSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(4000),
  changeType: z.enum(CHANGE_TYPES),
  rationale: z.string().min(10).max(2000),
  risk: z.enum(CHANGE_CONTROL_RISKS),
  impactAssessment: z.string().max(4000).optional(),
  affectedSystems: z.string().max(1000).optional(),
  targetImplementationDate: z.string().optional(),
});

const UpdateChangeControlSchema = z.object({
  description: z.string().min(10).max(4000).optional(),
  risk: z.enum(CHANGE_CONTROL_RISKS).optional(),
  impactAssessment: z.string().max(4000).optional(),
  affectedSystems: z.string().max(1000).optional(),
  targetImplementationDate: z.string().optional(),
});

const TransitionStatusSchema = z.object({
  newStatus: z.enum(CHANGE_CONTROL_STATUSES),
  comment: z.string().max(2000).optional(),
  // Required when transitioning In Implementation â†’ Implemented.
  actualImplementationDate: z.string().optional(),
  // Substage 5.4 â€” required only when newStatus âˆˆ {Approved, Rejected,
  // Closed}. Optional in the schema; the action enforces presence based
  // on the target status and writes a SignedRecord row + paired audit
  // event when the transition is consequential.
  password: z.string().optional(),
});

const DeleteSchema = z.object({
  reason: z.string().min(10).max(2000),
});

const LinkSchema = z.object({
  capaId: z.string().min(1),
  changeControlId: z.string().min(1),
  initiatedFrom: z.enum(["CAPA", "ChangeControl"]),
  linkRationale: z.string().max(2000).optional(),
});

const UnlinkSchema = z.object({
  reason: z.string().min(10).max(2000),
});

// â”€â”€ Read wrappers (client-callable) â”€â”€

/** Returns CCs the user can see (tenant-scoped, non-deleted by default).
 *  super_admin sees rows from any tenant. */
export async function loadChangeControls(filters?: {
  status?: string;
  risk?: string;
  changeType?: string;
}): Promise<ActionResult> {
  const session = await requireAuth();
  const isSuperAdmin = session.user.role === "super_admin";
  const items = await prisma.changeControl.findMany({
    where: {
      ...(isSuperAdmin ? {} : { tenantId: session.user.tenantId }),
      deletedAt: null,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.risk ? { risk: filters.risk } : {}),
      ...(filters?.changeType ? { changeType: filters.changeType } : {}),
    },
    include: {
      _count: { select: { capaLinks: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return { success: true, data: items };
}

export async function loadChangeControlById(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const isSuperAdmin = session.user.role === "super_admin";
  const cc = await prisma.changeControl.findFirst({
    where: isSuperAdmin ? { id } : { id, tenantId: session.user.tenantId },
    include: {
      capaLinks: {
        include: {
          capa: {
            select: {
              id: true,
              reference: true,
              description: true,
              risk: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!cc) return { success: false, error: "Change control not found" };
  return { success: true, data: cc };
}

export async function loadCAPAChangeControlLinks(
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const isSuperAdmin = session.user.role === "super_admin";
  // Verify caller can see this CAPA before returning links.
  const capa = await prisma.cAPA.findFirst({
    where: isSuperAdmin ? { id: capaId } : { id: capaId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };
  const links = await prisma.cAPAChangeControlLink.findMany({
    where: { capaId },
    include: {
      changeControl: {
        select: {
          id: true,
          reference: true,
          title: true,
          changeType: true,
          risk: true,
          status: true,
          deletedAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return { success: true, data: links };
}

export async function loadChangeControlStatusHistory(
  ccId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const isSuperAdmin = session.user.role === "super_admin";
  // Verify CC visibility first so we don't leak audit rows for other tenants.
  const cc = await prisma.changeControl.findFirst({
    where: isSuperAdmin ? { id: ccId } : { id: ccId, tenantId: session.user.tenantId },
    select: { id: true, tenantId: true },
  });
  if (!cc) return { success: false, error: "Change control not found" };
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: cc.tenantId,
      module: AUDIT_MODULE_CC,
      recordId: ccId,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { success: true, data: rows };
}

/** Returns CAPAs the caller can link to â€” used by the CC-detail "Link a
 *  CAPA" picker. Excludes closed/rejected CAPAs (per LINK_BLOCKED_CAPA_STATUSES)
 *  and CAPAs already linked to the given CC. */
export async function loadLinkableCAPAs(ccId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const isSuperAdmin = session.user.role === "super_admin";
  const cc = await prisma.changeControl.findFirst({
    where: isSuperAdmin ? { id: ccId } : { id: ccId, tenantId: session.user.tenantId },
    select: { id: true, tenantId: true },
  });
  if (!cc) return { success: false, error: "Change control not found" };
  const existingLinks = await prisma.cAPAChangeControlLink.findMany({
    where: { changeControlId: ccId },
    select: { capaId: true },
  });
  const linkedIds = new Set(existingLinks.map((l) => l.capaId));
  const candidates = await prisma.cAPA.findMany({
    where: {
      tenantId: cc.tenantId,
      status: { notIn: Array.from(LINK_BLOCKED_CAPA_STATUSES) },
      id: { notIn: Array.from(linkedIds) },
      deletedAt: null,
    },
    select: {
      id: true,
      reference: true,
      description: true,
      risk: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { success: true, data: candidates };
}

/** Mirror of loadLinkableCAPAs for the CAPA-detail "Link a Change Control"
 *  picker. Excludes finalized CCs and CCs already linked to the given CAPA. */
export async function loadLinkableChangeControls(
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const isSuperAdmin = session.user.role === "super_admin";
  const capa = await prisma.cAPA.findFirst({
    where: isSuperAdmin ? { id: capaId } : { id: capaId, tenantId: session.user.tenantId },
    select: { id: true, tenantId: true },
  });
  if (!capa) return { success: false, error: "CAPA not found" };
  const existingLinks = await prisma.cAPAChangeControlLink.findMany({
    where: { capaId },
    select: { changeControlId: true },
  });
  const linkedIds = new Set(existingLinks.map((l) => l.changeControlId));
  const candidates = await prisma.changeControl.findMany({
    where: {
      tenantId: capa.tenantId,
      deletedAt: null,
      status: { notIn: Array.from(LINK_BLOCKED_CC_STATUSES) },
      id: { notIn: Array.from(linkedIds) },
    },
    select: {
      id: true,
      reference: true,
      title: true,
      changeType: true,
      risk: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { success: true, data: candidates };
}

// â”€â”€ 1. createChangeControl â”€â”€

export async function createChangeControl(
  input: z.input<typeof CreateChangeControlSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateChangeControlSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const actor = await resolveUserFk(
    session.user.id,
    session.user.tenantId,
    session.user.role,
  );

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }

  try {
    const MAX_RETRIES = 5;
    let cc: Awaited<ReturnType<typeof prisma.changeControl.create>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        cc = await prisma.$transaction(async (tx) => {
          // GLOBAL lookup (no tenantId filter). ChangeControl.reference has
          // a global @unique index, so two tenants each computing their
          // per-tenant max both produce "CC-2026-001" and the second insert
          // hits P2002. See the matching note in src/actions/capas/lifecycle.ts.
          const reference = await generateReference(
            "CC",
            new Date(),
            async (prefix, year) => {
              const row = await tx.changeControl.findFirst({
                where: {
                  reference: { startsWith: `${prefix}-${year}-` },
                },
                orderBy: { reference: "desc" },
                select: { reference: true },
              });
              return row?.reference ?? null;
            },
          );
          return tx.changeControl.create({
            data: {
              tenantId: session.user.tenantId,
              reference,
              title: parsed.data.title,
              description: parsed.data.description,
              changeType: parsed.data.changeType,
              rationale: parsed.data.rationale,
              risk: parsed.data.risk,
              impactAssessment: parsed.data.impactAssessment ?? null,
              affectedSystems: parsed.data.affectedSystems ?? null,
              targetImplementationDate: parsed.data.targetImplementationDate
                ? new Date(parsed.data.targetImplementationDate)
                : null,
              status: "Draft",
              owner: session.user.id,
              ownerName: session.user.name,
              createdBy: session.user.id,
              createdByName: session.user.name,
            },
          });
        });
        break;
      } catch (err) {
        lastErr = err;
        if (!isReferenceConflict(err)) throw err;
      }
    }
    if (!cc) {
      console.error("[action] createChangeControl exhausted retries:", lastErr);
      return { success: false, error: sanitizeServerError(lastErr, "Failed to allocate Change Control reference") };
    }
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE_CC,
        action: "CHANGE_CONTROL_CREATED",
        recordId: cc.id,
        recordTitle: `${cc.reference ?? cc.id} â€” ${cc.title.slice(0, 60)}`,
        newValue: JSON.stringify({
          changeType: cc.changeType,
          risk: cc.risk,
          targetImplementationDate: cc.targetImplementationDate?.toISOString() ?? null,
        }),
      },
    });
    revalidatePath("/change-control");
    return { success: true, data: cc };
  } catch (err) {
    console.error("[action] createChangeControl failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to create Change Control") };
  }
}

// â”€â”€ 2. updateChangeControl â”€â”€

export async function updateChangeControl(
  id: string,
  input: z.input<typeof UpdateChangeControlSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateChangeControlSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const isSuperAdmin = session.user.role === "super_admin";
  const existing = await prisma.changeControl.findFirst({
    where: isSuperAdmin ? { id } : { id, tenantId: session.user.tenantId },
  });
  if (!existing) return { success: false, error: "Change control not found" };
  if (existing.deletedAt !== null) {
    return { success: false, error: "Change control has been deleted." };
  }
  if (FINALIZED_STATUSES.has(existing.status)) {
    return {
      success: false,
      error: `Cannot edit a Change Control in '${existing.status}' status â€” it is locked.`,
    };
  }
  if (existing.status !== "Draft" && existing.status !== "In Review") {
    return {
      success: false,
      error: `Edits are only allowed in Draft or In Review status (currently '${existing.status}').`,
    };
  }

  const actor = await resolveUserFk(
    session.user.id,
    session.user.tenantId,
    session.user.role,
  );

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const before = {
      description: existing.description,
      risk: existing.risk,
      impactAssessment: existing.impactAssessment,
      affectedSystems: existing.affectedSystems,
      targetImplementationDate:
        existing.targetImplementationDate?.toISOString() ?? null,
    };
    const updated = await prisma.changeControl.update({
      where: { id },
      data: {
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.risk !== undefined ? { risk: parsed.data.risk } : {}),
        ...(parsed.data.impactAssessment !== undefined
          ? { impactAssessment: parsed.data.impactAssessment }
          : {}),
        ...(parsed.data.affectedSystems !== undefined
          ? { affectedSystems: parsed.data.affectedSystems }
          : {}),
        ...(parsed.data.targetImplementationDate !== undefined
          ? {
              targetImplementationDate: parsed.data.targetImplementationDate
                ? new Date(parsed.data.targetImplementationDate)
                : null,
            }
          : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: existing.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE_CC,
        action: "CHANGE_CONTROL_UPDATED",
        recordId: id,
        recordTitle: `${existing.reference ?? id} â€” ${existing.title.slice(0, 60)}`,
        oldValue: JSON.stringify(before),
        newValue: JSON.stringify({
          description: updated.description,
          risk: updated.risk,
          impactAssessment: updated.impactAssessment,
          affectedSystems: updated.affectedSystems,
          targetImplementationDate:
            updated.targetImplementationDate?.toISOString() ?? null,
        }),
      },
    });
    revalidatePath("/change-control");
    revalidatePath(`/change-control`);
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] updateChangeControl failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to update Change Control") };
  }
}

// â”€â”€ 3. transitionChangeControlStatus â”€â”€

export async function transitionChangeControlStatus(
  id: string,
  input: z.input<typeof TransitionStatusSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = TransitionStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const isSuperAdmin = session.user.role === "super_admin";
  const existing = await prisma.changeControl.findFirst({
    where: isSuperAdmin ? { id } : { id, tenantId: session.user.tenantId },
  });
  if (!existing) return { success: false, error: "Change control not found" };
  if (existing.deletedAt !== null) {
    return { success: false, error: "Change control has been deleted." };
  }

  const fromStatus = existing.status as ChangeControlStatus;
  const toStatus = parsed.data.newStatus;
  const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    return {
      success: false,
      error: `Transition from '${fromStatus}' to '${toStatus}' is not allowed.`,
    };
  }

  // Per-transition role + comment requirements.
  const isApproverRole = QA_GATE_ROLES.has(session.user.role);
  const isOwner = existing.owner === session.user.id;

  if (toStatus === "Approved" || toStatus === "Closed") {
    if (!isApproverRole) {
      return {
        success: false,
        error:
          "Only QA Head, Customer Admin, or Super Admin can approve or close a Change Control.",
      };
    }
  }
  if (toStatus === "Rejected") {
    if (!isApproverRole) {
      return {
        success: false,
        error: "Only QA Head, Customer Admin, or Super Admin can reject a Change Control.",
      };
    }
    if (!parsed.data.comment || parsed.data.comment.trim().length === 0) {
      return {
        success: false,
        error: "A comment is required when rejecting a Change Control.",
      };
    }
  }
  if (fromStatus === "In Review" && toStatus === "Draft") {
    if (!parsed.data.comment || parsed.data.comment.trim().length === 0) {
      return {
        success: false,
        error: "A comment is required when sending a Change Control back for revisions.",
      };
    }
  }
  if (toStatus === "In Implementation" || toStatus === "Implemented") {
    if (!isOwner && !isApproverRole) {
      return {
        success: false,
        error:
          "Only the Change Control owner (or QA Head / Customer Admin / Super Admin) can move it through implementation.",
      };
    }
  }
  if (toStatus === "Implemented") {
    if (!parsed.data.actualImplementationDate) {
      return {
        success: false,
        error: "An actual implementation date is required to mark a Change Control as Implemented.",
      };
    }
  }

  // Substage 5.4 â€” consequential transitions (Approved / Rejected / Closed)
  // require a Part 11 e-signature. Administrative transitions stay
  // unsigned. The signing block runs BEFORE the state change so a wrong
  // password yields zero side effects beyond the failed-attempt audit row.
  const actor = await resolveUserFk(
    session.user.id,
    session.user.tenantId,
    session.user.role,
  );

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  const isSignedTransition = SIGNED_TRANSITION_TARGETS.has(toStatus);
  if (isSignedTransition) {
    if (!parsed.data.password || parsed.data.password.length === 0) {
      return {
        success: false,
        error: `A password is required to sign a ${toStatus.toLowerCase()} transition under 21 CFR Part 11.`,
      };
    }
    const passwordOk = await verifyPasswordForSigning(
      session.user.id,
      parsed.data.password,
    );
    if (!passwordOk) {
      await prisma.auditLog.create({
        data: {
          tenantId: existing.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: SIGNING_AUDIT_MODULE,
          action: "SIGNING_PASSWORD_FAILED",
          recordId: id,
          recordTitle: `${existing.reference ?? id} â€” ${existing.title.slice(0, 60)}`,
          newValue: JSON.stringify({
            recordType: "CHANGE_CONTROL_TRANSITION",
            toStatus,
            attempt_at: new Date().toISOString(),
          }),
        },
      });
      return {
        success: false,
        error: "Password verification failed. Please try again.",
      };
    }
  }

  try {
    const transitionedAt = new Date();
    let signedRecordId: string | null = null;
    let contentHash: string | null = null;

    // Single status-change patch built once and shared by both the signed
    // and administrative paths below.
    const baseUpdateData = {
      status: toStatus,
      ...(toStatus === "Closed"
        ? {
            closedAt: transitionedAt,
            closedById: session.user.id,
            closedByName: session.user.name,
          }
        : {}),
      ...(toStatus === "Implemented" && parsed.data.actualImplementationDate
        ? {
            actualImplementationDate: new Date(
              parsed.data.actualImplementationDate,
            ),
          }
        : {}),
    };

    // Optimistic-lock predicate: `status: fromStatus` ensures two concurrent
    // transitions can't both succeed against the value we just read. If a
    // peer transition committed first, updateMany.count is 0 and we surface
    // STATE_CONFLICT so the caller can refresh and retry.
    let updated;
    if (isSignedTransition) {
      const canonicalContent = canonicalizeChangeControlTransitionContent({
        ccId: existing.id,
        ccReference: existing.reference,
        fromStatus,
        toStatus,
        comment: parsed.data.comment ?? null,
        transitionedAt,
      });
      contentHash = computeContentHash(canonicalContent);
      const contentSummary = `${existing.reference ?? existing.id} ${fromStatus} â†’ ${toStatus} signed by ${session.user.name} (${session.user.role})`;
      const provenance = await readSigningProvenance();

      const result = await prisma.$transaction(async (tx) => {
        const sig = await tx.signedRecord.create({
          data: {
            tenantId: existing.tenantId,
            recordType: "CHANGE_CONTROL_TRANSITION",
            recordId: existing.id,
            signerId: session.user.id,
            signerName: session.user.name,
            signerRole: session.user.role,
            signerEmail: session.user.email,
            signatureMeaning: toStatus, // "Approved" | "Rejected" | "Closed"
            contentHash: contentHash!,
            contentSummary,
            passwordVerifiedAt: transitionedAt,
            ipAddress: provenance.ipAddress,
            userAgent: provenance.userAgent,
          },
        });
        const updateRes = await tx.changeControl.updateMany({
          where: { id, status: fromStatus, deletedAt: null },
          data: { ...baseUpdateData, latestSignedTransitionId: sig.id },
        });
        if (updateRes.count === 0) {
          // Roll back the SignedRecord â€” the transition we signed for did
          // not commit. The tx-throw triggers the outer catch's STATE_CONFLICT
          // mapping.
          throw new Error("STATE_CONFLICT");
        }
        const row = await tx.changeControl.findUnique({ where: { id } });
        if (!row) throw new Error("STATE_CONFLICT");
        return { sig, row };
      });
      signedRecordId = result.sig.id;
      updated = result.row;
    } else {
      const updateRes = await prisma.changeControl.updateMany({
        where: { id, status: fromStatus, deletedAt: null },
        data: baseUpdateData,
      });
      if (updateRes.count === 0) {
        throw new Error("STATE_CONFLICT");
      }
      const row = await prisma.changeControl.findUnique({ where: { id } });
      if (!row) throw new Error("STATE_CONFLICT");
      updated = row;
    }

    // Best-effort post-commit audit-log writes. Wrapped so a logging failure
    // does not undo the already-committed transition. For signed transitions
    // the SignedRecord row is the legal Part 11 record; AuditLog is operational.
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: existing.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: AUDIT_MODULE_CC,
          action: "CHANGE_CONTROL_STATUS_CHANGED",
          recordId: id,
          recordTitle: `${existing.reference ?? id} â€” ${existing.title.slice(0, 60)}`,
          oldValue: fromStatus,
          newValue: JSON.stringify({
            status: toStatus,
            comment: parsed.data.comment ?? null,
            actualImplementationDate:
              parsed.data.actualImplementationDate ?? null,
            ...(signedRecordId ? { signatureId: signedRecordId } : {}),
          }),
        },
      });
    } catch (auditErr) {
      console.error(
        "[audit] CHANGE_CONTROL_STATUS_CHANGED log failed",
        auditErr,
      );
    }
    if (isSignedTransition && signedRecordId) {
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: existing.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: SIGNING_AUDIT_MODULE,
            action: "CHANGE_CONTROL_TRANSITION_SIGNED",
            recordId: signedRecordId,
            recordTitle: `${existing.reference ?? id} â€” ${existing.title.slice(0, 60)}`,
            newValue: JSON.stringify({
              signerId: session.user.id,
              contentHashPrefix: contentHash!.slice(0, 16),
              signatureMeaning: toStatus,
              ccId: existing.id,
              fromStatus,
              toStatus,
            }),
          },
        });
      } catch (auditErr) {
        console.error(
          "[audit] CHANGE_CONTROL_TRANSITION_SIGNED log failed",
          auditErr,
        );
      }
    }
    revalidatePath("/change-control");
    return { success: true, data: updated };
  } catch (err) {
    if (err instanceof Error && err.message === "STATE_CONFLICT") {
      return {
        success: false,
        error:
          "This Change Control was modified by another user. Refresh and try again.",
      };
    }
    console.error("[action] transitionChangeControlStatus failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to transition Change Control status") };
  }
}

// â”€â”€ 4. softDeleteChangeControl â”€â”€

export async function softDeleteChangeControl(
  id: string,
  input: z.input<typeof DeleteSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const isSuperAdmin = session.user.role === "super_admin";
  const existing = await prisma.changeControl.findFirst({
    where: isSuperAdmin ? { id } : { id, tenantId: session.user.tenantId },
    include: { _count: { select: { capaLinks: true } } },
  });
  if (!existing) return { success: false, error: "Change control not found" };
  if (existing.deletedAt !== null) {
    return { success: false, error: "Change control is already deleted." };
  }
  // Owner OR super_admin only.
  if (!isSuperAdmin && existing.owner !== session.user.id) {
    return {
      success: false,
      error: "Only the Change Control owner or Super Admin can delete it.",
    };
  }
  if (existing._count.capaLinks > 0) {
    return {
      success: false,
      error: `Cannot delete: ${existing._count.capaLinks} CAPA link${existing._count.capaLinks === 1 ? "" : "s"} must be removed first.`,
    };
  }

  const actor = await resolveUserFk(
    session.user.id,
    session.user.tenantId,
    session.user.role,
  );

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const updated = await prisma.changeControl.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: session.user.id,
        deletedByName: session.user.name,
        deletionReason: parsed.data.reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: existing.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE_CC,
        action: "CHANGE_CONTROL_SOFT_DELETED",
        recordId: id,
        recordTitle: `${existing.reference ?? id} â€” ${existing.title.slice(0, 60)}`,
        newValue: JSON.stringify({ reason: parsed.data.reason }),
      },
    });
    revalidatePath("/change-control");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] softDeleteChangeControl failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to delete Change Control") };
  }
}

// â”€â”€ 5. linkCAPAToChangeControl â”€â”€

export async function linkCAPAToChangeControl(
  input: z.input<typeof LinkSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = LinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const isSuperAdmin = session.user.role === "super_admin";
  const [capa, cc] = await Promise.all([
    prisma.cAPA.findFirst({
      where: isSuperAdmin
        ? { id: parsed.data.capaId }
        : { id: parsed.data.capaId, tenantId: session.user.tenantId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        reference: true,
        description: true,
      },
    }),
    prisma.changeControl.findFirst({
      where: isSuperAdmin
        ? { id: parsed.data.changeControlId }
        : { id: parsed.data.changeControlId, tenantId: session.user.tenantId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        reference: true,
        title: true,
        deletedAt: true,
      },
    }),
  ]);
  if (!capa) return { success: false, error: "CAPA not found" };
  if (!cc) return { success: false, error: "Change control not found" };
  if (cc.deletedAt !== null) {
    return { success: false, error: "Cannot link to a deleted Change Control." };
  }
  if (capa.tenantId !== cc.tenantId) {
    // Defence-in-depth â€” both lookups already enforce tenant scope, but
    // this guards a super_admin from inadvertently linking across tenants.
    return {
      success: false,
      error: "CAPA and Change Control belong to different tenants.",
    };
  }
  if (LINK_BLOCKED_CC_STATUSES.has(cc.status)) {
    return {
      success: false,
      error: `Cannot link to a Change Control in '${cc.status}' status.`,
    };
  }
  if (LINK_BLOCKED_CAPA_STATUSES.has(capa.status)) {
    return {
      success: false,
      error: `Cannot link a CAPA in '${capa.status}' status to a Change Control.`,
    };
  }

  const actor = await resolveUserFk(
    session.user.id,
    session.user.tenantId,
    session.user.role,
  );

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const link = await prisma.cAPAChangeControlLink.create({
      data: {
        tenantId: capa.tenantId,
        capaId: capa.id,
        changeControlId: cc.id,
        initiatedFrom: parsed.data.initiatedFrom,
        linkRationale: parsed.data.linkRationale ?? null,
        linkedById: session.user.id,
        linkedByName: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: capa.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE_LINK,
        action: "CAPA_CC_LINKED",
        recordId: link.id,
        recordTitle: `${capa.reference ?? capa.id} â†” ${cc.reference ?? cc.id}`,
        newValue: JSON.stringify({
          capaId: capa.id,
          capaReference: capa.reference,
          changeControlId: cc.id,
          changeControlReference: cc.reference,
          initiatedFrom: parsed.data.initiatedFrom,
          linkRationale: parsed.data.linkRationale ?? null,
        }),
      },
    });
    revalidatePath("/change-control");
    revalidatePath("/capa");
    revalidatePath(`/capa/${capa.id}`);
    return { success: true, data: link };
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "P2002") {
      return {
        success: false,
        error: "This CAPA is already linked to this Change Control.",
      };
    }
    console.error("[action] linkCAPAToChangeControl failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to link CAPA to Change Control") };
  }
}

// â”€â”€ 6. unlinkCAPAFromChangeControl â”€â”€

export async function unlinkCAPAFromChangeControl(
  linkId: string,
  input: z.input<typeof UnlinkSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UnlinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (!QA_GATE_ROLES.has(session.user.role)) {
    return {
      success: false,
      error: "Only QA Head, Customer Admin, or Super Admin can unlink a CAPA from a Change Control.",
    };
  }
  const isSuperAdmin = session.user.role === "super_admin";
  const link = await prisma.cAPAChangeControlLink.findFirst({
    where: isSuperAdmin ? { id: linkId } : { id: linkId, tenantId: session.user.tenantId },
    include: {
      capa: { select: { id: true, reference: true } },
      changeControl: { select: { id: true, reference: true } },
    },
  });
  if (!link) return { success: false, error: "Link not found" };

  const actor = await resolveUserFk(
    session.user.id,
    session.user.tenantId,
    session.user.role,
  );

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const snapshot = {
      capaId: link.capaId,
      capaReference: link.capa.reference,
      changeControlId: link.changeControlId,
      changeControlReference: link.changeControl.reference,
      initiatedFrom: link.initiatedFrom,
      linkRationale: link.linkRationale,
      linkedByName: link.linkedByName,
      linkedAt: link.createdAt.toISOString(),
    };
    await prisma.cAPAChangeControlLink.delete({ where: { id: linkId } });
    await prisma.auditLog.create({
      data: {
        tenantId: link.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: AUDIT_MODULE_LINK,
        action: "CAPA_CC_UNLINKED",
        recordId: linkId,
        recordTitle: `${link.capa.reference ?? link.capaId} â†” ${link.changeControl.reference ?? link.changeControlId}`,
        oldValue: JSON.stringify(snapshot),
        newValue: JSON.stringify({ reason: parsed.data.reason }),
      },
    });
    revalidatePath("/change-control");
    revalidatePath("/capa");
    revalidatePath(`/capa/${link.capaId}`);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] unlinkCAPAFromChangeControl failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to unlink CAPA from Change Control") };
  }
}
