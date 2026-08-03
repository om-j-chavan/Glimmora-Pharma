"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveCreateSiteId, resolveUserFk, requireGxPAuthor, ADMIN_DELETE_ROLES } from "@/lib/auth";
import { DEVIATION_QA_ROLES, canReportDeviation, canWriteQuality } from "@/lib/permissions/roleSets";
import { createDocument } from "@/actions/documents";
import {
  canonicalizeDeviationClosureContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import { readSigningProvenance } from "@/actions/capas/_shared";
import { SIGNING_AUDIT_MODULE } from "@/actions/capas/_types";
import {
  tenantSodOverrideOn,
  evaluateDeviationSodOverride,
  writeDeviationSodOverride,
  type DeviationSodControl,
} from "@/actions/capas/sod-override";
import { buildReferencePrefix, generateReference, isReferenceConflict } from "@/lib/reference";
import { FDA_SEVERITY, coerceSeverityCasing, normalizeSeverityForDisplay } from "@/lib/severity";
import { INVESTIGATION_RCA_METHODS } from "@/constants/rcaMethods";
import { sanitizeServerError } from "@/lib/errors";

// NOTE — actor identity (AUDIT Finding #2 / Rung 3E): never write
// `session.user.id` into a User FK column (createdById /
// investigationCompletedById / capaDecisionById). Admin logins are Tenant
// rows, so session.user.id is a Tenant id → FK violation. Resolve the actor
// via resolveUserFk() and gate authorship with requireGxPAuthor() (blocks
// super_admin). `session.user.id` is still correct for plain identity
// comparisons (SoD: reporter/investigator checks below).

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Attach an evidence document to a deviation. Persists via the SHARED document
 * pipeline (createDocument → fileStorage → Document row + DOCUMENT_UPLOADED
 * audit) — no parallel storage. This wrapper adds the deviation-specific guards:
 *  - parent-tenant verification: the deviation must exist in the actor's tenant
 *    (tenant from the session, NEVER the client) — else FORBIDDEN, no write/audit;
 *  - role gate DEVIATION_QA_ROLES (Part A — deviation-level evidence attach is a
 *    QA action; the task assignee uses attachDeviationTaskDocument instead);
 *  - linkedModule/linkedRecordId are SET server-side (any client value ignored)
 *    so a document can't be linked to a spoofed/foreign deviation;
 *  - a DEVIATION_EVIDENCE_ATTACHED audit row (module "Deviation").
 */
export async function attachDeviationDocument(
  deviationId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAuth();

  // Parent-tenant verification — load the deviation in the actor's tenant.
  const deviation = await prisma.deviation.findFirst({
    where: { id: deviationId, tenantId: session.user.tenantId },
    select: { id: true, reference: true, createdById: true },
  });
  if (!deviation) return { success: false, error: "FORBIDDEN" };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // Access gate — QA may attach to ANY deviation (Part A). ADDITIONALLY the
  // deviation's own REPORTER may attach to THEIR deviation: this is what the
  // create-modal optional upload uses (the reporter supplies supporting evidence
  // while reporting it). Every other non-QA role is still blocked, and the
  // detail-modal attach UI stays QA-only. A non-author reporter (e.g.
  // operations_head) bypasses createDocument's author gate exactly like the task
  // assignee does — the super_admin/viewer stops inside createDocument still apply.
  // Segregation of duties (RBAC pass) — the DOER (the deviation's reporter)
  // supplies supporting evidence; QA REVIEWS it and must NOT upload here. This
  // tightens the prior "QA or reporter" gate so QA-qua-reviewer is rejected.
  // (The low-priority task assignee uploads to THEIR task in the worklist.)
  const isReporter = !!deviation.createdById && deviation.createdById === actor.userId;
  if (!isReporter) {
    return { success: false, error: "QA reviews evidence and cannot upload it here — the deviation's reporter attaches supporting documents." };
  }

  // Link server-side (ignore any client-supplied linkage), then delegate to the
  // shared pipeline (file storage + Document row + its DOCUMENT_UPLOADED audit).
  formData.set("linkedModule", "Deviation Management");
  formData.set("linkedRecordId", deviationId);
  const created = await createDocument(formData, { bypassAuthorGate: isReporter });
  if (!created.success) return created;

  // Deviation-module attach audit (scoped to the actor's tenant).
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "Deviation",
      action: "DEVIATION_EVIDENCE_ATTACHED",
      recordId: deviationId,
      recordTitle: deviation.reference,
      newValue: JSON.stringify({ documentId: (created.data as { id?: string } | null)?.id ?? null }),
    },
  });

  revalidatePath("/deviation");
  return created;
}

const CloseDeviationSchema = z.object({
  password: z.string().min(1, "Password is required to sign"),
  // Part 11 — a closure MESSAGE is required (records the meaning of the signature).
  notes: z.string().min(5, "A closure message (at least 5 characters) is required").max(2000),
  // Single-QA SoD override (Phase 1) — supplied ONLY when a close identity self-check
  // fires with Tenant.sodSingleQAOverride ON and the deviation is non-Critical/Major.
  // Never removes the e-signature; recorded as a DeviationSODOverride waiver.
  sodOverrideReasonCode: z.string().optional(),
  sodOverrideJustification: z.string().optional(),
});

// Stage 2 (deviation redesign) — default triage priority from FDA severity.
// Critical → High, Major → Medium, Minor → Low. The reporter/QA can override
// in the UI; this is only the fallback when a caller omits priority.
function severityToPriority(severity: string): "Low" | "Medium" | "High" {
  const canon = normalizeSeverityForDisplay(severity, "fda");
  if (canon === "Critical") return "High";
  if (canon === "Major") return "Medium";
  return "Low";
}

const CreateDeviationSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  type: z.enum(["planned", "unplanned"]),
  category: z.enum(["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"]),
  // Accepts both lowercase (legacy callers) and TitleCase (new
  // callers); the preprocessor normalises to canonical FDA TitleCase
  // before validation. Database values written from this point forward
  // are TitleCase; existing lowercase rows are normalised at display
  // time by src/lib/severity.ts. See AUDIT Cat 1.
  severity: z.preprocess((v) => coerceSeverityCasing(v, "fda"), z.enum(FDA_SEVERITY)),
  area: z.string().min(1),
  immediateAction: z.string().min(5),
  // Stage 2 (deviation redesign) — `owner` is no longer collected at creation.
  // Triage priority instead; optional here, defaulted from severity via
  // severityToPriority when the caller omits it.
  priority: z.enum(["Low", "Medium", "High"]).optional(),
  dueDate: z.string().min(1).refine((d) => {
    // Defense-in-depth behind the DatePicker's client min — reject obviously-past
    // due dates even if the client is bypassed. Floored at yesterday (server-local)
    // to absorb client/server timezone skew.
    const f = new Date();
    f.setDate(f.getDate() - 1);
    const floor = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
    return d >= floor;
  }, "Due date cannot be in the past"),
  detectedDate: z.string().optional(),
  siteId: z.string().optional(),
  batchesAffected: z.string().optional(),
  // SME Section 1, Stage 6 (FULL) â€” optional recurrence link.
  // Reporter (or the suggested-matches UI) cites the prior CAPA whose
  // recurrence this Deviation represents. Validated server-side to
  // exist in the caller's tenant. Permissive about the prior CAPA's
  // status â€” non-closed parents are allowed but flagged in audit.
  previousCAPAId: z.string().optional(),
});

// RUNG 3D-Deviation — status intentionally removed (was the bypass that
// accepted any non-protected status string). Transitions go through dedicated
// guarded actions (startInvestigation / completeInvestigation /
// closeDeviation / rejectDeviation).
const UpdateDeviationSchema = CreateDeviationSchema.partial().extend({
  rootCause: z.string().optional(),
  rcaMethod: z.string().optional(),
});

const RejectSchema = z.object({
  reason: z.string().min(5, "A rejection message (at least 5 characters) is required"),
  // Part 11 — reject is now an electronic signature: password re-auth at signing.
  password: z.string().min(1, "Password is required to sign"),
});

export async function createDeviation(
  input: z.input<typeof CreateDeviationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateDeviationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Rung 3E — resolve the authoring identity to a real User FK (admins are
  // Tenant rows; super_admin is blocked from GxP authorship). See @/lib/auth.
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // Responsibility map - deviation is REPORT-FIRST: any functional "doer" role
  // OR qa_head may log one; viewer + admin roles are rejected server-side.
  if (!canReportDeviation(session.user.role)) {
    return { success: false, error: "Only a functional role or QA Head can report a deviation." };
  }
  // SME Section 1, Stage 6 (FULL) â€” if previousCAPAId is supplied,
  // verify it exists in the caller's tenant before persisting the
  // link. Permissive about its status (non-closed parents are allowed,
  // just flagged in the audit row below for the effectiveness
  // reviewer to notice).
  let priorCAPAStatus: string | null = null;
  if (parsed.data.previousCAPAId) {
    const prior = await prisma.cAPA.findFirst({
      where: { id: parsed.data.previousCAPAId, tenantId: session.user.tenantId },
      select: { id: true, status: true },
    });
    if (!prior) {
      return {
        success: false,
        error: "Cited recurrence CAPA not found in your tenant.",
      };
    }
    priorCAPAStatus = prior.status;
  }

  // SME final rung â€” site-scoped reference allocation. Same retry-on-
  // P2002 pattern createCAPA uses; bumps sequence when two concurrent
  // creates compute the same NNN. Site code resolved per call; falls
  // back to legacy "DEV-{year}-{NNN}" format when the deviation has no
  // siteId or the site has no code populated (backfill window).
  // Site-field rule (shared): super_admin / customer_admin pick a site
  // (required + tenant-validated); every other role is auto-scoped to their own
  // assigned site and the client siteId is ignored. See resolveCreateSiteId.
  const siteRes = await resolveCreateSiteId(session, parsed.data.siteId);
  if (!siteRes.ok) return { success: false, error: siteRes.error };
  const siteId = siteRes.siteId;

  let siteCodeForRef: string | null = null;
  if (siteId) {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { code: true },
    });
    siteCodeForRef = site?.code ?? null;
  }
  const referencePrefix = buildReferencePrefix("DEV", siteCodeForRef);

  const MAX_REF_RETRIES = 5;
  let deviation: Awaited<ReturnType<typeof prisma.deviation.create>> | null = null;
  let lastRefErr: unknown = null;
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    try {
      deviation = await prisma.$transaction(async (tx) => {
        const reference = await generateReference(
          referencePrefix,
          new Date(),
          async (prefix, year) => {
            const row = await tx.deviation.findFirst({
              where: { reference: { startsWith: `${prefix}-${year}-` } },
              orderBy: { reference: "desc" },
              select: { reference: true },
            });
            return row?.reference ?? null;
          },
        );
        return tx.deviation.create({
          data: {
            reference,
            title: parsed.data.title,
            description: parsed.data.description,
            type: parsed.data.type,
            category: parsed.data.category,
            severity: parsed.data.severity,
            area: parsed.data.area,
            immediateAction: parsed.data.immediateAction,
            // Owner = creator. The reporter is recorded as the deviation owner
            // (the session identity, which equals their User.id for site users —
            // the same value ownerName() resolves and any owner-gate compares).
            // Replaces the Stage-2 empty-string placeholder that rendered as
            // "Unknown user" and left selected.owner blank.
            owner: session.user.id,
            priority: parsed.data.priority ?? severityToPriority(parsed.data.severity),
            // Authoritative siteId from the site-field rule.
            siteId,
            batchesAffected: parsed.data.batchesAffected ?? null,
            tenantId: session.user.tenantId,
            status: "open",
            detectedBy: session.user.name,
            detectedDate: parsed.data.detectedDate ? new Date(parsed.data.detectedDate) : new Date(),
            dueDate: new Date(parsed.data.dueDate),
            // SME Section 1, Stage 5 (FULL) â€” dual-write the denormalised
            // display-name cache + the authoritative userId FK.
            createdBy: session.user.name,
            createdById: actor.userId,
            // SME Section 1, Stage 6 (FULL) â€” recurrence link.
            previousCAPAId: parsed.data.previousCAPAId ?? null,
          },
        });
      });
      break;
    } catch (err) {
      lastRefErr = err;
      if (!isReferenceConflict(err)) throw err;
    }
  }
  if (!deviation) {
    console.error("[action] createDeviation exhausted reference retries:", lastRefErr);
    return { success: false, error: sanitizeServerError(lastRefErr, "Failed to allocate deviation reference") };
  }

  try {
    if (parsed.data.previousCAPAId) {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Deviation Management",
          action: "DEVIATION_LINKED_TO_PRIOR_CAPA_AS_RECURRENCE",
          recordId: deviation.id,
          recordTitle: deviation.reference ?? parsed.data.title.slice(0, 80),
          newValue: JSON.stringify({
            previousCAPAId: parsed.data.previousCAPAId,
            priorCAPAStatus,
            atCreation: true,
          }),
        },
      });
    }
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_CREATED",
        recordId: deviation.id,
        recordTitle: deviation.reference ?? parsed.data.title.slice(0, 80),
        newValue: parsed.data.severity,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] createDeviation post-create steps failed:", err);
    return { success: false, error: "Failed to create deviation" };
  }
}

// RUNG 3D-Deviation — the closure-bypass guard (PROTECTED_DEVIATION_STATUSES)
// is removed: updateDeviation no longer accepts a status field at all, so there
// is nothing to guard. "closed"/"rejected" remain owned by closeDeviation /
// rejectDeviation; the new pre-terminal transitions are startInvestigation /
// completeInvestigation.

// NOTE: status field intentionally NOT accepted (Rung 3D-Deviation). Status
// changes route through dedicated guarded transitions:
//   open -> under_investigation:            startInvestigation
//   under_investigation -> pending_qa_review: completeInvestigation
//   -> closed:   closeDeviation
//   -> rejected: rejectDeviation
// See AUDIT-GLOBAL-PATTERNS.md Finding #4.
export async function updateDeviation(
  id: string,
  input: z.input<typeof UpdateDeviationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateDeviationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!canWriteQuality(session.user.role)) {
    return { success: false, error: "Viewers cannot perform this action." };
  }
  try {
    const { dueDate, detectedDate, ...rest } = parsed.data;
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...rest,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        ...(detectedDate ? { detectedDate: new Date(detectedDate) } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] updateDeviation failed:", err);
    return { success: false, error: "Failed to update deviation" };
  }
}

export async function closeDeviation(
  id: string,
  input: z.input<typeof CloseDeviationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CloseDeviationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can close deviations" };
  }

  const existing = await prisma.deviation.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true,
      title: true,
      severity: true,
      rootCause: true,
      linkedCAPAId: true,
      // Lifecycle precondition (finding #2) + SoD (finding #1). status gates the
      // close to a ready state; createdById / investigationCompletedById let the
      // signer be compared against the reporter and the investigator.
      status: true,
      createdById: true,
      investigationCompletedById: true,
    },
  });
  if (!existing) return { success: false, error: "Deviation not found" };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Stage 4 (deviation redesign) — low-priority task path: if this deviation
  // was worked as a DeviationTask, the SIGNED close also completes the task,
  // and SoD requires the closer (reviewer) ≠ the task assignee (ID-based FK
  // compare, REUSABLES.md). No-op for deviations with no task.
  const activeTask = await prisma.deviationTask.findFirst({
    where: { deviationId: id, tenantId: session.user.tenantId, deletedAt: null, status: { notIn: ["closed", "cancelled"] } },
    select: { id: true, assigneeId: true, status: true },
  });
  // ── Single-QA SoD override (Phase 1) ─────────────────────────────────────
  // The three identity checks (task-assignee here, reporter + investigator below)
  // are each WAIVABLE when Tenant.sodSingleQAOverride is ON and the deviation is
  // non-Critical/Major — but ONLY with a recorded reason code + justification, and
  // the e-signature is NEVER removed (the waiver rows are written inside the same
  // password-verified SignedRecord transaction). Compute the self-checks up front;
  // read the flag only if at least one fires, so the flag-OFF / no-self paths stay
  // byte-for-byte unchanged and add no query. A closer who trips multiple checks
  // yields one DeviationSODOverride row per waived control.
  const reporterSelf = !!existing.createdById && existing.createdById === actor.userId;
  const investigatorSelf =
    !!existing.investigationCompletedById && existing.investigationCompletedById === actor.userId;
  const assigneeSelf = !!activeTask?.assigneeId && activeTask.assigneeId === actor.userId;
  const sodFlagOn =
    reporterSelf || investigatorSelf || assigneeSelf
      ? await tenantSodOverrideOn(session.user.tenantId)
      : false;
  const waivedControls: Array<{ control: DeviationSodControl; reasonCode: string; justification: string }> = [];

  if (assigneeSelf) {
    const decision = evaluateDeviationSodOverride({
      severity: existing.severity,
      flagOn: sodFlagOn,
      existingBlockError:
        "Separation of duties: the task assignee cannot also sign its closure. A different QA Head must close it.",
      input: parsed.data,
    });
    if (!decision.proceed) return { success: false, error: decision.error };
    waivedControls.push({ control: "DEV_CLOSE_ASSIGNEE", reasonCode: decision.reasonCode, justification: decision.justification });
  }

  // ── Lifecycle precondition (finding #2) ──────────────────────────────────
  // A Part 11 signed close requires the WORK to be complete — enforced here, not
  // by the client hiding the button (DeviationPage.tsx:659/942). Two paths,
  // matching the two close triggers in the UI:
  //   • task path — the assigned DeviationTask must be SUBMITTED for review.
  //   • investigation path (no active task) — the deviation must be at
  //     pending_qa_review, OR still capa_pending with its linked CAPA already
  //     closed. The second case exists because the capa_pending →
  //     pending_qa_review unblock in signAndCloseCAPA is best-effort POST-COMMIT
  //     (capas/closure.ts:488-490), so a crash there can strand a ready deviation
  //     in capa_pending; without this branch it would be un-closeable.
  if (activeTask) {
    if (activeTask.status !== "submitted") {
      return { success: false, error: "This deviation's task hasn't been submitted for review yet — it can't be signed closed." };
    }
  } else if (existing.status !== "pending_qa_review") {
    let recoverable = false;
    if (existing.status === "capa_pending" && existing.linkedCAPAId) {
      const linkedForClose = await prisma.cAPA.findFirst({
        where: { id: existing.linkedCAPAId, tenantId: session.user.tenantId },
        select: { status: true },
      });
      recoverable = linkedForClose?.status === "closed";
    }
    if (!recoverable) {
      return { success: false, error: "This deviation isn't ready to close — its investigation must be complete and under QA review first." };
    }
  }

  // ── SoD (finding #1) ─────────────────────────────────────────────────────
  // The closer signs off the investigation, so they must be neither the reporter
  // nor the investigator — mirroring guardCapaDecision. Compared on the
  // authoritative User FK (actor.userId), the value these columns are STORED as
  // (finding #3). The task-assignee check above covers the low-priority path.
  if (reporterSelf) {
    const decision = evaluateDeviationSodOverride({
      severity: existing.severity,
      flagOn: sodFlagOn,
      existingBlockError:
        "Separation of duties: the reporter of a deviation cannot sign its closure. A different QA Head must close it.",
      input: parsed.data,
    });
    if (!decision.proceed) return { success: false, error: decision.error };
    waivedControls.push({ control: "DEV_CLOSE_REPORTER", reasonCode: decision.reasonCode, justification: decision.justification });
  }
  if (investigatorSelf) {
    const decision = evaluateDeviationSodOverride({
      severity: existing.severity,
      flagOn: sodFlagOn,
      existingBlockError:
        "Separation of duties: the investigator cannot sign the closure of their own investigation. A different QA Head must close it.",
      input: parsed.data,
    });
    if (!decision.proceed) return { success: false, error: decision.error };
    waivedControls.push({ control: "DEV_CLOSE_INVESTIGATOR", reasonCode: decision.reasonCode, justification: decision.justification });
  }

  // SME Section 1, Stage 1 â€” CAPA Decision Gate.
  // A Critical deviation cannot be closed until a CAPA exists and is linked.
  // The linked CAPA must also still exist in this tenant (an orphan
  // linkedCAPAId from a previously hard-deleted CAPA does not satisfy the
  // gate). CAPA has no soft-delete column (deletedAt is not on the model),
  // so existence is the only check.
  // Handles both legacy lowercase ("critical") and TitleCase
  // ("Critical") rows; see src/lib/severity.ts for the unification.
  if (normalizeSeverityForDisplay(existing.severity, "fda") === "Critical") {
    let gateBlocked = false;
    let gateReason:
      | "critical_no_linked_capa"
      | "critical_linked_capa_missing"
      | "critical_link_inconsistent"
      | null = null;
    let inconsistentCapaDeviationId: string | null = null;
    if (!existing.linkedCAPAId) {
      gateBlocked = true;
      gateReason = "critical_no_linked_capa";
    } else {
      // SME Section 1, Stage 2 (FULL) â€” also fetch deviationId for the
      // bidirectional-consistency check. Records that disagree (CAPA.X.deviationId
      // !== this.id even though this.linkedCAPAId === X.id) signal a
      // data-integrity violation introduced by some non-atomic write path;
      // block closure so the inconsistency is investigated rather than
      // signed-over.
      const linkedCapa = await prisma.cAPA.findFirst({
        where: { id: existing.linkedCAPAId, tenantId: session.user.tenantId },
        select: { id: true, deviationId: true },
      });
      if (!linkedCapa) {
        gateBlocked = true;
        gateReason = "critical_linked_capa_missing";
      } else if (linkedCapa.deviationId !== existing.id) {
        gateBlocked = true;
        gateReason = "critical_link_inconsistent";
        inconsistentCapaDeviationId = linkedCapa.deviationId;
      }
    }
    if (gateBlocked) {
      const auditAction =
        gateReason === "critical_link_inconsistent"
          ? "DEVIATION_CLOSE_BLOCKED_LINK_INCONSISTENT"
          : "DEVIATION_CLOSE_BLOCKED_NO_CAPA";
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: session.user.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "Deviation Management",
            action: auditAction,
            recordId: existing.id,
            recordTitle: existing.title.slice(0, 80),
            newValue: JSON.stringify({
              severity: "critical",
              reason: gateReason,
              linkedCAPAId: existing.linkedCAPAId ?? null,
              ...(gateReason === "critical_link_inconsistent"
                ? { capaDeviationId: inconsistentCapaDeviationId }
                : {}),
            }),
          },
        });
      } catch (err) {
        console.error(`[action] failed to write ${auditAction} audit:`, err);
      }
      if (gateReason === "critical_link_inconsistent") {
        return {
          success: false,
          error:
            "CAPA_DEVIATION_LINK_INCONSISTENT â€” the linked CAPA does not back-reference this deviation. The records have drifted; investigate before closing.",
        };
      }
      return {
        success: false,
        error:
          "Critical deviations require a linked CAPA before closure. Raise a CAPA from this deviation first.",
      };
    }
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
        recordId: id,
        recordTitle: existing.title.slice(0, 80),
        newValue: JSON.stringify({
          recordType: "DEVIATION_CLOSURE",
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
    const closedAt = new Date();
    const canonicalContent = canonicalizeDeviationClosureContent({
      deviationId: existing.id,
      title: existing.title,
      severity: existing.severity,
      rootCause: existing.rootCause,
      closingComment: parsed.data.notes ?? null,
      closedAt,
    });
    const contentHash = computeContentHash(canonicalContent);
    const contentSummary = `Deviation ${existing.id.slice(0, 8)} (${existing.severity}) closed by ${session.user.name} (${session.user.role})`;
    const provenance = await readSigningProvenance();

    const { deviation, signedRecord } = await prisma.$transaction(
      async (tx) => {
        const sig = await tx.signedRecord.create({
          data: {
            tenantId: session.user.tenantId,
            recordType: "DEVIATION_CLOSURE",
            recordId: existing.id,
            signerId: session.user.id,
            signerName: session.user.name,
            signerRole: session.user.role,
            signerEmail: session.user.email,
            signatureMeaning: "Closed",
            contentHash,
            contentSummary,
            passwordVerifiedAt: closedAt,
            ipAddress: provenance.ipAddress,
            userAgent: provenance.userAgent,
          },
        });
        const updated = await tx.deviation.update({
          where: { id, tenantId: session.user.tenantId },
          data: {
            status: "closed",
            closedBy: session.user.name,
            closedDate: closedAt,
            closureNotes: parsed.data.notes ?? null,
            closureSignatureId: sig.id,
          },
        });
        // Single-QA SoD override (Phase 1) — one waiver row + audit per waived
        // identity check, linked to THIS closure signature, atomic with the close.
        // Empty on the normal path (no query, no rows). The signature above is
        // never conditional on the waiver — identity-independence is waived, the
        // e-signature is not.
        for (const w of waivedControls) {
          await writeDeviationSodOverride(tx, {
            tenantId: session.user.tenantId,
            deviationId: existing.id,
            control: w.control,
            actorUserId: actor.userId,
            actorName: actor.displayName,
            actorRole: actor.role,
            reasonCode: w.reasonCode,
            justification: w.justification,
            recordTitle: existing.title,
            signedRecordId: sig.id,
          });
        }
        // Stage 4 (deviation redesign) — complete the linked low-priority task
        // on the signed close (the deviation IS the regulated record; the task
        // work was lightweight). SoD was enforced above. Atomic with the close.
        if (activeTask) {
          await tx.deviationTask.update({
            where: { id: activeTask.id, tenantId: session.user.tenantId },
            data: { status: "closed", reviewedAt: closedAt, reviewedById: actor.userId },
          });
        }
        return { deviation: updated, signedRecord: sig };
      },
    );

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_CLOSED",
        recordId: id,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "DEVIATION_CLOSED_AND_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.title.slice(0, 80),
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: "Closed",
          deviationId: existing.id,
        }),
      },
    });
    revalidatePath("/deviation");
    revalidatePath("/");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] closeDeviation failed:", err);
    return { success: false, error: "Failed to close deviation" };
  }
}

export async function rejectDeviation(
  id: string,
  input: z.input<typeof RejectSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can reject deviations" };
  }
  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Rejection reason must be at least 5 characters" };
  }
  // Lifecycle precondition (finding #2) — reject is a QA disposition of a
  // COMPLETED investigation (→ "additional investigation needed"), so it is only
  // valid from pending_qa_review, matching the sole client trigger
  // (DeviationPage.tsx:667). Checked BEFORE the signature so a doomed reject never
  // prompts for a password. Server-enforced, not client-gated.
  const existing = await prisma.deviation.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { status: true },
  });
  if (!existing) return { success: false, error: "Deviation not found" };
  if (existing.status !== "pending_qa_review") {
    return { success: false, error: "A deviation can only be rejected while it is under QA review (pending QA review)." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // §11.200(a)(1)(ii) — re-authenticate at the moment of signing. Reject is a
  // Part 11 electronic signature: the password is verified SERVER-SIDE against
  // the real credential (never compared on the client). A wrong password blocks
  // the action and is itself audited.
  const passwordOk = await verifyPasswordForSigning(session.user.id, parsed.data.password);
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
        newValue: JSON.stringify({ recordType: "DEVIATION_REJECTION", attempt_at: new Date().toISOString() }),
      },
    });
    return { success: false, error: "Password verification failed. The signature was not applied." };
  }

  try {
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "rejected" },
    });
    // Part 11 SIGNATURE RECORD — who signed (userId/name/role), when (signedAt),
    // the action (DEVIATION_REJECTED), and the message. This audit row IS the
    // reject signature record.
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_REJECTED",
        recordId: id,
        newValue: JSON.stringify({ signed: true, signedAt: new Date().toISOString(), message: parsed.data.reason.slice(0, 500) }),
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] rejectDeviation failed:", err);
    return { success: false, error: "Failed to reject deviation" };
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Tier 2, Items 3 + 4 — Investigation + CAPA Decision workflow.
 *
 * SoD chain (Separation of Duties), enforced server-side here and mirrored
 * in the UI:
 *   • Reporter      = Deviation.createdById (set at creation)
 *   • Investigator  = Deviation.investigationCompletedById (set on complete)
 *   • CAPA decider  = Deviation.capaDecisionById (must differ from BOTH the
 *                     reporter and the investigator, and must be QA-role)
 *
 * createdById is nullable for the backfill window; when it is null we cannot
 * prove who the reporter was, so the reporter-vs-self guard is skipped for
 * that row (documented gap — legacy rows pre-date the createdById FK).
 * ────────────────────────────────────────────────────────────────────── */

// Phase 1.5 — canonical values from the shared constant (was no-space drift).
const SaveInvestigationSchema = z.object({
  rcaMethod: z.enum(INVESTIGATION_RCA_METHODS),
  // Structured form buffer as JSON text (codebase convention — see the
  // rcaData column note in schema.prisma). Optional on save-progress.
  rcaData: z.string().max(20000).optional(),
  rootCause: z.string().max(10000).optional(),
});

const CompleteInvestigationSchema = SaveInvestigationSchema.extend({
  // Synthesized human-readable root cause — required to complete.
  rootCause: z.string().min(1, "Root cause is required to complete the investigation").max(10000),
});

const CapaDecisionSchema = z.object({
  capaRequired: z.boolean(),
  // Justification is required for EITHER verdict (audit trail matters
  // whether a CAPA is raised or explicitly waived).
  reason: z.string().min(5, "A justification (at least 5 characters) is required"),
});

function isQARole(role: string): boolean {
  return DEVIATION_QA_ROLES.includes(role);
}

export async function saveInvestigationProgress(
  id: string,
  input: z.input<typeof SaveInvestigationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SaveInvestigationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const existing = await prisma.deviation.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, title: true, reference: true, status: true, createdById: true },
  });
  if (!existing) return { success: false, error: "Deviation not found" };
  if (existing.status === "closed" || existing.status === "rejected") {
    return { success: false, error: "Cannot edit the investigation of a closed or rejected deviation." };
  }
  // Responsibility map - viewers are read-only; every mutation rejects viewer.
  if (!canWriteQuality(session.user.role)) {
    return { success: false, error: "Viewers cannot perform this action." };
  }
  // Resolve the actor FK before the SoD check — createdById is STORED as
  // actor.userId (createDeviation) and schema.prisma:872-876 names it the
  // authoritative FK for SoD. Compare FK-to-FK, not FK-to-session-id (finding #3).
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // SoD — the reporter cannot perform the investigation.
  if (existing.createdById && existing.createdById === actor.userId) {
    return { success: false, error: "Investigation must be performed by someone other than the reporter." };
  }
  try {
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        rcaMethod: parsed.data.rcaMethod,
        rcaData: parsed.data.rcaData ?? null,
        ...(parsed.data.rootCause !== undefined ? { rootCause: parsed.data.rootCause } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_INVESTIGATION_SAVED",
        recordId: id,
        recordTitle: existing.reference ?? existing.title.slice(0, 80),
        newValue: JSON.stringify({ rcaMethod: parsed.data.rcaMethod }),
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] saveInvestigationProgress failed:", err);
    return { success: false, error: "Failed to save investigation progress" };
  }
}

export async function completeInvestigation(
  id: string,
  input: z.input<typeof CompleteInvestigationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CompleteInvestigationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const existing = await prisma.deviation.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, title: true, reference: true, status: true, createdById: true },
  });
  if (!existing) return { success: false, error: "Deviation not found" };
  if (existing.status === "closed" || existing.status === "rejected") {
    return { success: false, error: "Cannot complete the investigation of a closed or rejected deviation." };
  }
  // Responsibility map - viewers are read-only; every mutation rejects viewer.
  if (!canWriteQuality(session.user.role)) {
    return { success: false, error: "Viewers cannot perform this action." };
  }
  // Rung 3E — resolve actor to a real User FK; block super_admin authorship.
  // Resolved before the SoD check so the reporter comparison is FK-to-FK, the
  // way createdById is stored (finding #3).
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (existing.createdById && existing.createdById === actor.userId) {
    return { success: false, error: "Investigation must be performed by someone other than the reporter." };
  }
  try {
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        rcaMethod: parsed.data.rcaMethod,
        rcaData: parsed.data.rcaData ?? null,
        rootCause: parsed.data.rootCause,
        investigationCompletedAt: new Date(),
        investigationCompletedById: actor.userId,
      },
    });
    // INVESTIGATION-FIRST model — completing the investigation hands the
    // deviation off to QA review (pending_qa_review), where QA dispositions it
    // by priority (low → task, high/med → CAPA) and performs the signed close.
    // (Replaces the former separate submitDeviationForReview step.) Guarded to
    // advance ONLY from under_investigation, so re-editing a completed RCA at a
    // later status never resets capa_pending / pending_qa_review back.
    if (existing.status === "under_investigation") {
      await prisma.deviation.updateMany({
        where: { id, tenantId: session.user.tenantId, status: "under_investigation" },
        data: { status: "pending_qa_review" },
      });
    }
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_INVESTIGATION_COMPLETED",
        recordId: id,
        recordTitle: existing.reference ?? existing.title.slice(0, 80),
        newValue: JSON.stringify({ rcaMethod: parsed.data.rcaMethod, completedBy: session.user.name }),
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] completeInvestigation failed:", err);
    return { success: false, error: "Failed to complete investigation" };
  }
}

/**
 * RUNG 3D-Deviation — guarded open -> under_investigation transition (was the
 * UI "Start investigation" button writing status through updateDeviation).
 * Optimistic-locked on status="open"; viewers blocked. The RCA segregation of
 * duties (investigator != reporter) is enforced at completeInvestigation,
 * unchanged — starting the investigation phase is administrative.
 */
export async function startInvestigation(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Part A access-control fix — starting an investigation is a QA action
  // (mirrors closeDeviation/rejectDeviation). Was only viewer-blocked, which
  // leaked to every non-viewer author (e.g. regulatory_affairs).
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can start an investigation." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const updated = await prisma.deviation.updateMany({
    where: { id, tenantId: session.user.tenantId, status: "open" },
    data: { status: "under_investigation" },
  });
  if (updated.count === 0) {
    return { success: false, error: "Only an open deviation can be moved into investigation." };
  }
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "Deviation Management",
      action: "DEVIATION_INVESTIGATION_STARTED",
      recordId: id,
      oldValue: "open",
      newValue: "under_investigation",
    },
  });
  revalidatePath("/deviation");
  return { success: true, data: null };
}

/** Shared validation for save/edit of the CAPA decision (SoD + QA role +
 *  investigation-complete precondition). Returns the loaded row on success. */
async function guardCapaDecision(
  id: string,
  session: Awaited<ReturnType<typeof requireAuth>>,
  // The authoritative User FK for SoD — the value createdById /
  // investigationCompletedById are stored as. Passed in (resolved by the caller)
  // so the comparison is FK-to-FK, not FK-to-session-id (finding #3).
  actorUserId: string | null,
) {
  if (!isQARole(session.user.role)) {
    return { ok: false as const, error: "CAPA decision requires QA approval." };
  }
  const existing = await prisma.deviation.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true, title: true, reference: true, status: true,
      createdById: true, investigationCompletedById: true, investigationCompletedAt: true,
      capaDecisionMade: true, capaDecisionRequired: true, capaDecisionReason: true,
    },
  });
  if (!existing) return { ok: false as const, error: "Deviation not found" };
  if (existing.status === "closed" || existing.status === "rejected") {
    return { ok: false as const, error: "Cannot decide CAPA on a closed or rejected deviation." };
  }
  if (!existing.investigationCompletedAt) {
    return { ok: false as const, error: "Complete the investigation before deciding on a CAPA." };
  }
  // SoD — the decider cannot be the reporter or the investigator.
  if (existing.createdById && existing.createdById === actorUserId) {
    return { ok: false as const, error: "The CAPA decision cannot be made by the reporter (segregation of duties)." };
  }
  if (existing.investigationCompletedById && existing.investigationCompletedById === actorUserId) {
    return { ok: false as const, error: "The CAPA decision cannot be made by the investigator (segregation of duties)." };
  }
  return { ok: true as const, existing };
}

export async function saveCAPADecision(
  id: string,
  input: z.input<typeof CapaDecisionSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CapaDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Rung 3E — resolve actor to a real User FK; block super_admin authorship.
  // Resolved before the guard so its SoD compares the FK (finding #3).
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  const guard = await guardCapaDecision(id, session, actor.userId);
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        capaDecisionMade: true,
        capaDecisionRequired: parsed.data.capaRequired,
        capaDecisionReason: parsed.data.reason,
        capaDecisionAt: new Date(),
        capaDecisionById: actor.userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_CAPA_DECISION_MADE",
        recordId: id,
        recordTitle: guard.existing.reference ?? guard.existing.title.slice(0, 80),
        newValue: JSON.stringify({ capaRequired: parsed.data.capaRequired, reason: parsed.data.reason }),
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] saveCAPADecision failed:", err);
    return { success: false, error: "Failed to save CAPA decision" };
  }
}

export async function editCAPADecision(
  id: string,
  input: z.input<typeof CapaDecisionSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CapaDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Rung 3E — resolve actor to a real User FK; block super_admin authorship.
  // Resolved before the guard so its SoD compares the FK (finding #3).
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  const guard = await guardCapaDecision(id, session, actor.userId);
  if (!guard.ok) return { success: false, error: guard.error };
  if (!guard.existing.capaDecisionMade) {
    return { success: false, error: "No existing CAPA decision to edit. Use Save Decision first." };
  }
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const deviation = await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        capaDecisionRequired: parsed.data.capaRequired,
        capaDecisionReason: parsed.data.reason,
        capaDecisionAt: new Date(),
        capaDecisionById: actor.userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_CAPA_DECISION_UPDATED",
        recordId: id,
        recordTitle: guard.existing.reference ?? guard.existing.title.slice(0, 80),
        oldValue: JSON.stringify({
          capaRequired: guard.existing.capaDecisionRequired,
          reason: guard.existing.capaDecisionReason,
        }),
        newValue: JSON.stringify({ capaRequired: parsed.data.capaRequired, reason: parsed.data.reason }),
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: deviation };
  } catch (err) {
    console.error("[action] editCAPADecision failed:", err);
    return { success: false, error: "Failed to update CAPA decision" };
  }
}

export async function deleteDeviation(id: string, reason?: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // Rung 3J.1 — destructive delete is admin-tier (mirrors SYSTEM_DELETE_ROLES),
  // narrower than the block-viewer gate on deviation create/update.
  if (!ADMIN_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an administrator can delete a deviation." };
  }
  try {
    const existing = await prisma.deviation.findFirst({
      where: { id, tenantId: session.user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return { success: false, error: "Deviation not found" };
    // Soft-delete (Part 11 retention) — row retained; list queries filter deletedAt.
    await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
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
        module: "Deviation Management",
        action: "DEVIATION_DELETED",
        recordId: id,
        newValue: reason ? reason.slice(0, 200) : null,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteDeviation failed:", err);
    return { success: false, error: "Failed to delete deviation" };
  }
}

export async function restoreDeviation(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!ADMIN_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an administrator can restore a deviation." };
  }
  try {
    const existing = await prisma.deviation.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true, deletedAt: true },
    });
    if (!existing) return { success: false, error: "Deviation not found" };
    if (!existing.deletedAt) return { success: false, error: "Deviation is not deleted." };
    await prisma.deviation.update({
      where: { id, tenantId: session.user.tenantId },
      data: { deletedAt: null, deletedById: null, deletedByName: null, deletionReason: null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Deviation Management",
        action: "DEVIATION_RESTORED",
        recordId: id,
      },
    });
    revalidatePath("/deviation");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] restoreDeviation failed:", err);
    return { success: false, error: "Failed to restore deviation" };
  }
}

