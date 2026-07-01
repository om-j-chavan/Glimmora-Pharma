"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import {
  CSV_STAGE_REVIEW_ROLES as STAGE_REVIEW_ROLES,
  CSV_SYSTEM_WRITE_ROLES as SYSTEM_WRITE_ROLES,
  CSV_SYSTEM_DELETE_ROLES as SYSTEM_DELETE_ROLES,
} from "@/lib/permissions/roleSets";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import { assertTenantOwnsParent, scopedWhere } from "@/lib/tenantScope";
import { createCAPA } from "@/actions/capas/lifecycle";
import { deriveSiteCode, isReferenceConflict } from "@/lib/reference";
import {
  verifyPasswordForSigning,
  computeContentHash,
  canonicalizeCSVValidationSignOffContent,
} from "@/lib/signing";
import { readSigningProvenance } from "@/actions/capas/_shared";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// ── Stage document upload constants (mirrors substage 3.2 EvidenceFile) ──
//
// Same MIME whitelist + size cap + retention floor so an inspector reading
// across the two surfaces sees one consistent file-handling policy rather
// than per-feature drift. Diverging here would force every audit checklist
// to enumerate two sets of rules.
const STAGE_DOC_MAX_FILE_MB = Number(process.env.STAGE_DOC_MAX_FILE_MB ?? "10");
const STAGE_DOC_MAX_FILE_BYTES = STAGE_DOC_MAX_FILE_MB * 1024 * 1024;
const STAGE_DOC_RETENTION_YEARS = 7;

const STAGE_DOC_ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
]);

// RUNG 3C — single canonical audit module string for the whole CSV/CSA module.
// Was "CSV / Validation" (a split that the audit-trail filter, which matches
// "CSV/CSA" by strict equality, could not surface — Finding #6). Renamed from
// STAGE_DOC_AUDIT_MODULE since it now backs every CSV/CSA audit write, not just
// stage-document events.
const CSV_AUDIT_MODULE = "CSV/CSA";

function nowPlusYears(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d;
}

const RemoveStageDocumentSchema = z.object({
  reason: z
    .string()
    .min(10, "Deletion reason must be at least 10 characters")
    .max(2000, "Deletion reason must be 2000 characters or fewer"),
});

const RiskEnum = z.enum(["HIGH", "MEDIUM", "LOW"]);

// All persistable GxPSystem fields (RUNG 1 — was 10 fields, now the full set).
// name/type required; everything else optional. Used by create (full) and
// update (partial).
const SystemWritableSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(1),
  vendor: z.string().min(1),
  version: z.string().min(1),
  gxpRelevance: z.string().optional(),
  // RUNG 3K — closed value space (was z.string()): only canonical
  // ComplianceStatus values are accepted at the server-action boundary.
  part11Status: z.enum(["Compliant", "Non-Compliant", "Partial", "In Progress", "N/A"]).optional(),
  annex11Status: z.enum(["Compliant", "Non-Compliant", "Partial", "In Progress", "N/A"]).optional(),
  gamp5Category: z.string().optional(),
  riskLevel: z.string().optional(),
  // RUNG 3D — validationStatus is intentionally NOT accepted here. It is
  // auto-derived from stages (deriveValidationStatus/syncValidationStatus),
  // manually overridden only via attestValidationStatus, and set on sign-off
  // only via signValidation. Accepting it on create/update would bypass that
  // provenance. See AUDIT-GLOBAL-PATTERNS.md Finding #3.
  siteId: z.string().optional(),
  intendedUse: z.string().optional(),
  gxpScope: z.string().optional(),
  criticalFunctions: z.string().optional(),
  riskFactors: z.string().optional(),
  plannedActions: z.string().optional(),
  owner: z.string().min(1),
  patientSafetyRisk: RiskEnum.optional(),
  productQualityImpact: RiskEnum.optional(),
  regulatoryExposure: RiskEnum.optional(),
  diImpact: RiskEnum.optional(),
  lastValidated: z.string().optional(), // ISO date string
  nextReview: z.string().optional(), // ISO date string
});
const CreateSystemSchema = SystemWritableSchema;
const UpdateSystemSchema = SystemWritableSchema.partial();

/** Map validated writable input → Prisma data, converting ISO date strings to
 *  Date (and "" → null so a cleared date persists as null). */
function toSystemData(d: Partial<z.infer<typeof SystemWritableSchema>>) {
  const { lastValidated, nextReview, ...rest } = d;
  return {
    ...rest,
    ...(lastValidated !== undefined ? { lastValidated: lastValidated ? new Date(lastValidated) : null } : {}),
    ...(nextReview !== undefined ? { nextReview: nextReview ? new Date(nextReview) : null } : {}),
  };
}

const STANDARD_STAGES = ["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR"] as const;

// CSA risk-based stage templates (Computer Software Assurance, FDA 2022). The
// stages a given GAMP 5 category must ACTIVELY validate. Stages not listed are
// still created — so the full V-model stays on record for an inspector — but
// auto-set to "skipped" with a documented rationale, so only the applicable
// stages need work. Tune a category's scope by editing its list here.
const STAGE_TEMPLATES: Record<string, readonly string[]> = {
  "1": ["IQ"],                                        // Infrastructure — install verification only
  "3": ["URS", "IQ", "OQ"],                           // Non-configured COTS — leverage supplier FS/DS
  "4": ["URS", "FS", "IQ", "OQ", "PQ"],               // Configured — DS via vendor config (auto-skipped)
  "5": ["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR"],  // Custom/bespoke — full V-model
};
// Unknown/missing category falls back to the full set (never under-scope by
// accident — over-validating is safe, under-validating is a compliance gap).
function applicableStagesFor(gamp5Category: string | undefined): ReadonlySet<string> {
  return new Set(STAGE_TEMPLATES[gamp5Category ?? ""] ?? STAGE_TEMPLATES["5"]);
}

// Role-sets now live in the shared role-set module so the client UI mirrors the
// exact same gates. Aliased to the local names so the rest of this file is
// unchanged. (Submit is open to all compliance roles; only viewers are blocked
// there; STAGE_REVIEW gates approve/reject; WRITE is validation work; DELETE is
// the narrower admin-tier set.) These three sets are imported at the top of
// this file from the shared role-set module so the client UI mirrors them.
// Statuses a stage may be submitted FROM (pre-review states; "rejected" is a
// legacy value — reject now lands a stage in "in_progress").
const SUBMITTABLE_STAGE_STATUSES: readonly string[] = ["not_started", "in_progress", "draft", "rejected"];

/**
 * Next per-site system reference: SYS-<SITE_CODE>-<NNNN> (4-digit, zero-padded,
 * sequential per site within the tenant). Reads the highest existing reference
 * for the prefix — because the suffix is zero-padded to a fixed width, lexical
 * desc equals numeric desc, so the top row carries the highest number. The
 * caller wraps create() in a retry loop (reference is globally @unique, so a
 * concurrent insert can collide and must re-derive). Throws past 9999.
 */
async function nextSystemReference(tenantId: string, prefix: string): Promise<string> {
  const latest = await prisma.gxPSystem.findFirst({
    where: { tenantId, reference: { startsWith: `${prefix}-` } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  let next = 1;
  const m = latest?.reference?.match(/-(\d+)$/);
  if (m) {
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  if (next > 9999) throw new Error(`System reference sequence exhausted for ${prefix} (>9999).`);
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

/* ══════════════════════════════════════
 * Validation-status auto-derive (RUNG 1, Finding #2)
 * ══════════════════════════════════════ */

/**
 * Derive a system's validationStatus from its stages' statuses.
 * Precedence: Validated → Validation Failed → Under Review → In Progress →
 * Not Started. "Validated" = every stage resolved to approved/skipped with at
 * least one approved (covers all-7-approved and 6-approved+1-skipped).
 */
function deriveValidationStatus(stages: { status: string }[]): string {
  if (stages.length === 0) return "Not Started";
  const statuses = stages.map((s) => s.status);
  const approved = statuses.filter((s) => s === "approved").length;
  const skipped = statuses.filter((s) => s === "skipped").length;
  if (approved + skipped === statuses.length && approved >= 1) return "Validated";
  if (statuses.some((s) => s === "rejected")) return "Validation Failed";
  if (statuses.some((s) => s === "in_review")) return "Under Review";
  // Real progress = at least one stage APPROVED, or a stage actively worked
  // (in_progress/draft). Auto-skipped stages from the CSA category template are
  // NOT progress on their own — a freshly created system whose inapplicable
  // stages are pre-skipped must still read "Not Started" until real work begins.
  if (approved >= 1) return "In Progress";
  // RUNG 2.8 — a stage carrying evidence (status "in_progress", set on first
  // document upload) is honestly In Progress, never "Not Started".
  if (statuses.some((s) => s === "in_progress" || s === "draft")) return "In Progress";
  return "Not Started";
}

/** Recompute + persist a system's validationStatus from its stages, unless a
 *  manual attestation is in force (statusManuallySet). Logs the transition. */
async function syncValidationStatus(
  systemId: string,
  session: Awaited<ReturnType<typeof requireAuth>>,
): Promise<void> {
  const system = await prisma.gxPSystem.findUnique({
    where: { id: systemId },
    select: {
      validationStatus: true,
      statusManuallySet: true,
      signedOffAt: true,
      validationStages: { select: { status: true } },
    },
  });
  // Respect a manual attestation, and never clobber a recorded Part 11
  // sign-off — once signed off, the signature is the status authority
  // (cleared only by unsignValidation). (RUNG 2.6)
  if (!system || system.statusManuallySet || system.signedOffAt) return;
  const derived = deriveValidationStatus(system.validationStages);
  if (derived === system.validationStatus) return;
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  await prisma.gxPSystem.update({ where: { id: systemId }, data: { validationStatus: derived } });
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: CSV_AUDIT_MODULE,
      action: "SYSTEM_STATUS_AUTO_DERIVED",
      recordId: systemId,
      oldValue: system.validationStatus,
      newValue: derived,
    },
  });
}

/**
 * Auto-derive a risk level from GxP relevance. Moved here from the Add System
 * modal so the same defaulting applies no matter how a system is created
 * (modal, API, import). Critical → HIGH, Major → MEDIUM, Minor → LOW.
 */
function riskFromRelevance(gxpRelevance: string | undefined): "HIGH" | "MEDIUM" | "LOW" {
  if (gxpRelevance === "Critical") return "HIGH";
  if (gxpRelevance === "Minor") return "LOW";
  return "MEDIUM"; // Major / unspecified (column also defaults to "Major")
}

export async function createSystem(
  input: z.input<typeof CreateSystemSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  // RUNG 3A — gate creation to system-write roles (server-side, not just UI).
  if (!SYSTEM_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "You do not have permission to create systems." };
  }
  const parsed = CreateSystemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    // Auto-derive the 4 risk classifications + riskLevel from gxpRelevance
    // when the caller omits them (the simplified Add System modal does).
    const derivedRisk = riskFromRelevance(parsed.data.gxpRelevance);
    const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
    try {
      requireGxPAuthor(actor);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
    }

    // RUNG 2.7 — allocate a human-readable SYS-<SITE_CODE>-<NNNN> reference.
    // Site.code is canonical (same source every other module's reference
    // uses); a name-derived 3-letter code is the fallback for a misconfigured
    // site so creation never blocks.
    const site = parsed.data.siteId
      ? await prisma.site.findFirst({
          where: { id: parsed.data.siteId, tenantId: session.user.tenantId },
          select: { code: true, name: true },
        })
      : null;
    const siteCode = site?.code?.trim() || deriveSiteCode(site?.name);
    const prefix = `SYS-${siteCode}`;

    const MAX_REF_RETRIES = 5;
    let system: Awaited<ReturnType<typeof prisma.gxPSystem.create>> | null = null;
    for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
      const reference = await nextSystemReference(session.user.tenantId, prefix);
      try {
        system = await prisma.$transaction(async (tx) => {
          const created = await tx.gxPSystem.create({
            data: {
              ...toSystemData(parsed.data),
              // Re-assert required fields (toSystemData is typed Partial<>).
              name: parsed.data.name,
              type: parsed.data.type,
              tenantId: session.user.tenantId,
              reference,
              // Fresh systems have all stages "not_started"; status is always
              // "Not Started" at create (RUNG 3D — no caller-supplied override).
              validationStatus: "Not Started",
              riskLevel: parsed.data.riskLevel ?? derivedRisk,
              patientSafetyRisk: parsed.data.patientSafetyRisk ?? derivedRisk,
              productQualityImpact: parsed.data.productQualityImpact ?? derivedRisk,
              regulatoryExposure: parsed.data.regulatoryExposure ?? derivedRisk,
              diImpact: parsed.data.diImpact ?? derivedRisk,
              createdBy: session.user.name,
            },
          });
          // CSA risk-based scoping — only the stages applicable to this GAMP
          // category start as "not_started"; the rest are created pre-"skipped"
          // with a documented rationale (full V-model stays on record).
          const applicable = applicableStagesFor(parsed.data.gamp5Category);
          const catLabel = parsed.data.gamp5Category ? `GAMP Category ${parsed.data.gamp5Category}` : "this system";
          const skipReason = `Auto-skipped at creation — not in the CSA risk-based scope for ${catLabel}. Re-open if the validation plan requires it.`;
          await tx.validationStage.createMany({
            data: STANDARD_STAGES.map((stageName) => {
              const isApplicable = applicable.has(stageName);
              return isApplicable
                ? { systemId: created.id, stageName, status: "not_started" }
                : {
                    systemId: created.id,
                    stageName,
                    status: "skipped",
                    notes: skipReason,
                    approvedBy: "System · CSA template",
                    approvedDate: new Date(),
                  };
            }),
          });
          await tx.auditLog.create({
            data: {
              tenantId: session.user.tenantId,
              userId: actor.userId,
              userName: actor.displayName,
              userRole: actor.role,
              module: CSV_AUDIT_MODULE,
              action: "SYSTEM_CREATED",
              recordId: created.id,
              recordTitle: created.reference ?? parsed.data.name,
            },
          });
          return created;
        });
        break;
      } catch (err) {
        // Concurrent insert grabbed our sequence number — re-derive and retry.
        if (isReferenceConflict(err) && attempt < MAX_REF_RETRIES - 1) continue;
        throw err;
      }
    }
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] createSystem failed:", err);
    return { success: false, error: "Failed to create system" };
  }
}

// NOTE: validationStatus is intentionally NOT accepted here (Rung 3D). All
// status changes route through dedicated paths — auto-derive (syncValidationStatus),
// manual attestation (attestValidationStatus), or sign-off (signValidation).
// Do not re-add it to SystemWritableSchema. See AUDIT-GLOBAL-PATTERNS.md Finding #3.
export async function updateSystem(
  id: string,
  input: z.input<typeof UpdateSystemSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  // RUNG 3A — gate edits to system-write roles (server-side, not just UI).
  if (!SYSTEM_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "You do not have permission to edit systems." };
  }
  // RUNG 1: was unvalidated (audit Finding #7). Validate before write.
  const parsed = UpdateSystemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const system = await prisma.gxPSystem.update({
      where: { id, tenantId: session.user.tenantId },
      data: toSystemData(parsed.data),
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_UPDATED",
        recordId: id,
        // RUNG 2.7 — show the human-readable reference in audit views.
        recordTitle: system.reference ?? system.name,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] updateSystem failed:", err);
    return { success: false, error: "Failed to update system" };
  }
}

export async function submitStageForReview(stageId: string): Promise<ActionResult> {
  const session = await requireAuth();
  // RUNG 2.7 — submit is open to all compliance roles (Validation Lead, QA
  // Head, IT/CDO, admins). Read-only viewers are blocked. Granting QA Head
  // submit weakens Part 11 SoD by design; the audit entry below still records
  // the actor (userName + userRole) so every submission is attributable.
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot submit stages for review." };
  }
  // Load for tenant scope (IDOR guard) + status precondition (all roles).
  const stage0 = await prisma.validationStage.findFirst({
    where: session.user.role === "super_admin"
      ? { id: stageId }
      : { id: stageId, system: { tenantId: session.user.tenantId } },
    select: { id: true, status: true },
  });
  if (!stage0) return { success: false, error: "FORBIDDEN" };
  // RUNG 2.8-verify — a stage can only be submitted from a pre-review state;
  // blocks re-submitting one that is already under review or approved/skipped.
  if (!SUBMITTABLE_STAGE_STATUSES.includes(stage0.status)) {
    return { success: false, error: "This stage cannot be submitted — it is already under review or completed." };
  }
  // Resubmit guard (stage rework tasks) — a stage with open rework tasks
  // delegated to staff cannot go back to QA until every task is closed. Half-
  // finished rework must not reach the QA reviewer.
  const openReworkTasks = await prisma.validationStageTask.count({
    where: { validationStageId: stageId, deletedAt: null, status: { in: ["pending", "in_progress", "submitted", "rework"] } },
  });
  if (openReworkTasks > 0) {
    return { success: false, error: `Resolve the ${openReworkTasks} open rework task${openReworkTasks === 1 ? "" : "s"} on this stage before resubmitting for QA review.` };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "in_review",
        submittedBy: session.user.name,
        // RUNG 2.8 — stable principal id for the self-approval guardrail.
        submittedById: session.user.id,
        submittedDate: new Date(),
        // Resubmitting after a rejection clears the prior rejection record.
        rejectedBy: null,
        rejectedById: null,
        rejectedDate: null,
        rejectionReason: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "STAGE_SUBMITTED_FOR_REVIEW",
        recordId: stageId,
        newValue: stage.stageName,
      },
    });
    await syncValidationStatus(stage.systemId, session);
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] submitStageForReview failed:", err);
    return { success: false, error: "Failed to submit stage" };
  }
}

export async function approveStage(stageId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!STAGE_REVIEW_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can approve stages" };
  }
  // Load the stage for tenant scope (IDOR guard) AND the self-approval check.
  const stage0 = await prisma.validationStage.findFirst({
    where: session.user.role === "super_admin"
      ? { id: stageId }
      : { id: stageId, system: { tenantId: session.user.tenantId } },
    select: { id: true, status: true, submittedById: true },
  });
  if (!stage0) return { success: false, error: "FORBIDDEN" };
  // RUNG 2.8-verify — a stage can only be approved while Under Review. This is
  // also the null-submitter guard: only submitStageForReview sets "in_review"
  // (and a submittedById), so an in_review stage always carries a submitter to
  // compare against below — a never-submitted (null) stage can never reach here.
  if (stage0.status !== "in_review") {
    return { success: false, error: "This stage is not under review — it must be submitted for QA review before it can be approved." };
  }
  // RUNG 2.8 — bright-line SoD: the user who submitted a stage may NOT approve
  // it. Compared on session.user.id (a Tenant id for admins, a User id
  // otherwise) — NOT resolveUserFk, which would null out admin identities and
  // silently defeat the guardrail. Enforced here server-side, not just in UI.
  if (stage0.submittedById && stage0.submittedById === session.user.id) {
    return { success: false, error: "Segregation of duties: you cannot approve a stage you submitted. A different QA reviewer must approve it." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "approved",
        approvedBy: session.user.name,
        approvedById: session.user.id,
        approvedDate: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "STAGE_APPROVED",
        recordId: stageId,
        newValue: `${stage.stageName} → approved`,
      },
    });
    await syncValidationStatus(stage.systemId, session);
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] approveStage failed:", err);
    return { success: false, error: "Failed to approve stage" };
  }
}

export async function rejectStage(stageId: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!STAGE_REVIEW_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can reject stages" };
  }
  // Load for tenant scope (IDOR guard) + status precondition.
  const stage0 = await prisma.validationStage.findFirst({
    where: session.user.role === "super_admin"
      ? { id: stageId }
      : { id: stageId, system: { tenantId: session.user.tenantId } },
    select: { id: true, status: true },
  });
  if (!stage0) return { success: false, error: "FORBIDDEN" };
  // RUNG 2.8-verify — only a stage Under Review can be rejected.
  if (stage0.status !== "in_review") {
    return { success: false, error: "This stage is not under review — only a stage submitted for QA review can be rejected." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        // RUNG 2.8 — reject bounces the stage back to In Progress for rework
        // (not a terminal "rejected"); the reason is retained + surfaced to the
        // Validation Lead until the stage is resubmitted.
        status: "in_progress",
        rejectedBy: session.user.name,
        rejectedById: session.user.id,
        rejectedDate: new Date(),
        rejectionReason: reason,
        // Clear any stale submission marker — it must be resubmitted.
        submittedById: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "STAGE_REJECTED",
        recordId: stageId,
        newValue: reason.slice(0, 200),
      },
    });
    await syncValidationStatus(stage.systemId, session);
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] rejectStage failed:", err);
    return { success: false, error: "Failed to reject stage" };
  }
}

// RUNG 3B — a reason (≥10 chars) is required to archive or restore a system,
// mirroring removeStageDocument. Recorded in deletionReason + the audit log.
const SystemDeletionSchema = z.object({
  reason: z
    .string()
    .min(10, "A reason of at least 10 characters is required")
    .max(2000, "Reason must be 2000 characters or fewer"),
});

/**
 * RUNG 3B — SOFT-delete a system. Was a hard cascade delete that destroyed
 * every ValidationStage + StageDocument + RTMEntry + RoadmapActivity tied to
 * the system, contradicting the Part 11 StageDocument retention discipline
 * (contentHashSha256 + retainUntil + 7-year floor). Now sets deletedAt; the
 * children stay attached to the archived row and are hidden by the
 * `deletedAt: null` read filters. The schema cascade relations are left
 * unchanged (they simply never fire, since the row is never hard-deleted).
 * Role gate (customer_admin / super_admin) preserved from Rung 3A.
 */
export async function deleteSystem(
  id: string,
  input: z.input<typeof SystemDeletionSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!SYSTEM_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an admin can delete systems." };
  }
  const parsed = SystemDeletionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const existing = await prisma.gxPSystem.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, reference: true, name: true, deletedAt: true },
  });
  if (!existing) return { success: false, error: "System not found" };
  if (existing.deletedAt) return { success: false, error: "System is already archived." };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const deletedById = (await resolveUserFk(session.user.id, session.user.tenantId, session.user.role)).userId;
  try {
    await prisma.gxPSystem.update({
      where: { id, tenantId: session.user.tenantId },
      data: { deletedAt: new Date(), deletedById, deletionReason: parsed.data.reason },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_SOFT_DELETED",
        recordId: id,
        recordTitle: existing.reference ?? existing.name,
        newValue: parsed.data.reason.slice(0, 200),
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteSystem failed:", err);
    return { success: false, error: "Failed to archive system" };
  }
}

/**
 * RUNG 3B — restore a soft-deleted system. Admin-only (same gate as delete);
 * clears the soft-delete metadata and re-surfaces the row + its children.
 */
export async function restoreSystem(
  id: string,
  input: z.input<typeof SystemDeletionSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!SYSTEM_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an admin can restore systems." };
  }
  const parsed = SystemDeletionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const existing = await prisma.gxPSystem.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, reference: true, name: true, deletedAt: true },
  });
  if (!existing) return { success: false, error: "System not found" };
  if (!existing.deletedAt) return { success: false, error: "System is not archived." };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    await prisma.gxPSystem.update({
      where: { id, tenantId: session.user.tenantId },
      data: { deletedAt: null, deletedById: null, deletionReason: null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_RESTORED",
        recordId: id,
        recordTitle: existing.reference ?? existing.name,
        newValue: parsed.data.reason.slice(0, 200),
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] restoreSystem failed:", err);
    return { success: false, error: "Failed to restore system" };
  }
}

/* ══════════════════════════════════════
 * SKIP STAGE (QA Head only)
 * ══════════════════════════════════════ */

export async function skipStage(stageId: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can skip stages" };
  }
  if (!reason.trim()) {
    return { success: false, error: "Skip reason required" };
  }
  // Load the stage to enforce tenant ownership AND the DS-only skip rule
  // server-side (audit Finding #14 — was UI-only). super_admin bypasses the
  // tenant clause but the DS rule applies to everyone.
  const stage0 = await prisma.validationStage.findFirst({
    where: session.user.role === "super_admin"
      ? { id: stageId }
      : { id: stageId, system: { tenantId: session.user.tenantId } },
    select: { id: true, stageName: true },
  });
  if (!stage0) return { success: false, error: "FORBIDDEN" };
  if (stage0.stageName !== "DS") {
    return { success: false, error: "Only the DS (Design Specification) stage can be skipped." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: {
        status: "skipped",
        approvedBy: session.user.name,
        approvedDate: new Date(),
        rejectionReason: reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "STAGE_SKIPPED",
        recordId: stageId,
        newValue: reason.slice(0, 200),
      },
    });
    await syncValidationStatus(stage.systemId, session);
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] skipStage failed:", err);
    return { success: false, error: "Failed to skip stage" };
  }
}

/* ══════════════════════════════════════
 * UPDATE STAGE NOTES
 * ══════════════════════════════════════ */

export async function updateStageNotes(stageId: string, notes: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.validationStage.findFirst({
      where: { id: stageId, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const stage = await prisma.validationStage.update({
      where: { id: stageId },
      data: { notes },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "STAGE_NOTES_UPDATED",
        recordId: stageId,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: stage };
  } catch (err) {
    console.error("[action] updateStageNotes failed:", err);
    return { success: false, error: "Failed to update notes" };
  }
}

/* ══════════════════════════════════════
 * ROADMAP ACTIVITIES
 *
 * Schema fields: id, systemId, title, type, status,
 * startDate?, endDate?, owner?, completionType?, createdAt, updatedAt.
 * (No `activityType`, `priority`, `completedBy`, or `completedAt` columns —
 * spec assumed those; we omit them.)
 * ══════════════════════════════════════ */

const AddRoadmapActivitySchema = z.object({
  systemId: z.string().min(1),
  title: z.string().min(3),
  type: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  owner: z.string().optional(),
  completionType: z.string().optional(),
});

export async function addRoadmapActivity(
  input: z.input<typeof AddRoadmapActivitySchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AddRoadmapActivitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // IDOR guard — verify the caller's tenant owns the parent system.
  // RoadmapActivity has no tenantId column (scopes via system.tenantId).
  const parent = await assertTenantOwnsParent<{
    id: string;
    tenantId: string;
    name: string;
  }>(session, "gxpSystem", parsed.data.systemId, { name: true });
  if (!parent) return { success: false, error: "FORBIDDEN" };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!SYSTEM_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const activity = await prisma.roadmapActivity.create({
      data: {
        systemId: parsed.data.systemId,
        title: parsed.data.title,
        type: parsed.data.type,
        owner: parsed.data.owner ?? null,
        completionType: parsed.data.completionType ?? null,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        status: "Planned",
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: parent.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "ROADMAP_ACTIVITY_ADDED",
        recordId: parsed.data.systemId,
        recordTitle: `${parent.name} — ${parsed.data.title}`,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: activity };
  } catch (err) {
    console.error("[action] addRoadmapActivity failed:", err);
    return { success: false, error: "Failed to add activity" };
  }
}

export async function updateRoadmapActivity(id: string, status: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.roadmapActivity.findFirst({
      where: { id, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const activity = await prisma.roadmapActivity.update({
      where: { id },
      data: { status },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "ROADMAP_ACTIVITY_UPDATED",
        recordId: id,
        newValue: status,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: activity };
  } catch (err) {
    console.error("[action] updateRoadmapActivity failed:", err);
    return { success: false, error: "Failed to update activity" };
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Stage document uploads (CSV/CSA validation lifecycle)
 *
 * Mirrors the substage 3.2 EvidenceFile pattern: tenant-scope check via
 * the parent stage → system → tenant chain, MIME + size whitelist,
 * SHA-256 content hash, sanitised filename, hash-prefixed storage key
 * for natural idempotence on duplicate uploads, soft-delete only (Part 11
 * §11.10(e)). Lock signal is the parent stage's `status === "approved"` —
 * once a stage is sealed, no document mutations are allowed.
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Tenant-scope guard: returns the ValidationStage joined to its System's
 * tenantId, or null if missing or owned by another tenant. super_admin
 * bypasses scope (matches the convention used elsewhere in this file).
 */
async function loadStageScoped(stageId: string) {
  const session = await requireAuth();
  const stage = await prisma.validationStage.findUnique({
    where: { id: stageId },
    include: {
      system: { select: { id: true, name: true, tenantId: true } },
    },
  });
  if (!stage) return { session, stage: null as null };
  if (
    session.user.role !== "super_admin" &&
    stage.system.tenantId !== session.user.tenantId
  ) {
    return { session, stage: null as null };
  }
  return { session, stage };
}

const STAGE_LOCKED_MESSAGE =
  "This stage is locked — documents cannot be added once approved.";

/**
 * Upload a document attached to a single ValidationStage. Accepts FormData
 * with `stageId` (string) and `file` (File). Stage must not be approved;
 * file must clear MIME + size whitelist; resulting StageDocument row is
 * paired with one audit-log entry on success.
 */
export async function addStageDocument(
  formData: FormData,
): Promise<
  ActionResult<{
    id: string;
    fileName: string;
    originalFileName: string;
    fileSize: number;
    contentHashSha256: string;
  }>
> {
  const stageId = formData.get("stageId");
  const file = formData.get("file");

  if (typeof stageId !== "string" || stageId.length === 0) {
    return { success: false, error: "Missing stageId" };
  }
  if (!(file instanceof File)) {
    return { success: false, error: "No file provided" };
  }
  if (file.size === 0) {
    return { success: false, error: "File is empty" };
  }
  if (file.size > STAGE_DOC_MAX_FILE_BYTES) {
    return {
      success: false,
      error: `File exceeds ${STAGE_DOC_MAX_FILE_MB} MB limit`,
    };
  }
  if (!STAGE_DOC_ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      error:
        "Unsupported file type. Allowed: PDF, PNG, JPG, DOCX, XLSX, CSV, TXT",
    };
  }

  const { session, stage } = await loadStageScoped(stageId);
  if (!stage) return { success: false, error: "Stage not found" };
  if (stage.status === "approved") {
    return { success: false, error: STAGE_LOCKED_MESSAGE };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!SYSTEM_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHashSha256 = createHash("sha256").update(buffer).digest("hex");
    const sanitized = sanitizeFilename(file.name);

    // Hash-prefixed key so re-uploading the same bytes lands at the same
    // storage path (idempotent on disk; the DB still gets a new row so the
    // upload event itself is recorded).
    const storageKey = `stage-documents/${stage.systemId}/${stage.id}/${contentHashSha256}-${sanitized}`;
    const { url } = await fileStorage.save(storageKey, buffer, file.type);

    const created = await prisma.stageDocument.create({
      data: {
        tenantId: stage.system.tenantId,
        validationStageId: stage.id,
        fileName: sanitized,
        originalFileName: sanitized,
        fileSize: file.size,
        fileType: file.type,
        fileUrl: url,
        contentHashSha256,
        retainUntil: nowPlusYears(STAGE_DOC_RETENTION_YEARS),
        uploadedById: session.user.id,
        uploadedByName: session.user.name,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: stage.system.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "STAGE_DOCUMENT_UPLOADED",
        recordId: created.id,
        recordTitle: `${stage.system.name} — ${stage.stageName}`,
        newValue: JSON.stringify({
          originalFileName: sanitized,
          fileSize: file.size,
          contentHashSha256Prefix: contentHashSha256.slice(0, 16),
        }),
      },
    });

    // RUNG 2.8 — honest status: a stage that now carries evidence is no longer
    // "Not Started". Move it to "in_progress" (and re-derive the system status)
    // on the first upload; leave submitted/approved/etc. stages untouched.
    if (stage.status === "not_started") {
      await prisma.validationStage.update({
        where: { id: stage.id },
        data: { status: "in_progress" },
      });
      await syncValidationStatus(stage.systemId, session);
    }

    revalidatePath("/csv-csa");
    return {
      success: true,
      data: {
        id: created.id,
        fileName: sanitized,
        originalFileName: sanitized,
        fileSize: file.size,
        contentHashSha256,
      },
    };
  } catch (err) {
    console.error("[action] addStageDocument failed:", err);
    return { success: false, error: "Failed to upload document" };
  }
}

/**
 * Soft-delete a stage document. The disk bytes are preserved (Part 11
 * Enduring) and the DB row remains queryable — only the deletedAt /
 * deletedBy / deletionReason metadata is set. Reason ≥ 10 chars required.
 * Locked stages (status = "approved") reject deletes, same as uploads.
 */
export async function removeStageDocument(
  documentId: string,
  input: z.input<typeof RemoveStageDocumentSchema>,
): Promise<ActionResult> {
  const parsed = RemoveStageDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const session = await requireAuth();
  const doc = await prisma.stageDocument.findUnique({
    where: { id: documentId },
    include: {
      validationStage: {
        include: {
          system: { select: { id: true, name: true, tenantId: true } },
        },
      },
    },
  });
  if (!doc) return { success: false, error: "Document not found" };
  if (
    session.user.role !== "super_admin" &&
    doc.validationStage.system.tenantId !== session.user.tenantId
  ) {
    return { success: false, error: "Document not found" };
  }
  if (doc.deletedAt !== null) {
    return { success: false, error: "Document is already removed" };
  }
  if (doc.validationStage.status === "approved") {
    return { success: false, error: STAGE_LOCKED_MESSAGE };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.stageDocument.update({
        where: { id: documentId },
        data: {
          deletedAt: new Date(),
          deletedById: session.user.id,
          deletedByName: session.user.name,
          deletionReason: parsed.data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: doc.validationStage.system.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: CSV_AUDIT_MODULE,
          action: "STAGE_DOCUMENT_SOFT_DELETED",
          recordId: documentId,
          recordTitle: `${doc.validationStage.system.name} — ${doc.validationStage.stageName}`,
          oldValue: JSON.stringify({
            originalFileName: doc.originalFileName,
            fileSize: doc.fileSize,
          }),
          newValue: JSON.stringify({
            deletionReason: parsed.data.reason,
          }),
        },
      });
    });

    // RUNG 2.8 — honesty in reverse: if the last evidence is removed from a
    // stage that was only "in_progress" (auto-set by upload, not yet submitted),
    // return it to "Not Started" so the status never overstates progress.
    if (doc.validationStage.status === "in_progress") {
      const remaining = await prisma.stageDocument.count({
        where: { validationStageId: doc.validationStageId, deletedAt: null },
      });
      if (remaining === 0) {
        await prisma.validationStage.update({
          where: { id: doc.validationStageId },
          data: { status: "not_started" },
        });
        await syncValidationStatus(doc.validationStage.system.id, session);
      }
    }

    revalidatePath("/csv-csa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] removeStageDocument failed:", err);
    return { success: false, error: "Failed to remove document" };
  }
}

/* ══════════════════════════════════════
 * RUNG 1 — real persistence for the former "false-success" editors.
 * All tenant-scoped via where:{id,tenantId} (same pattern as updateSystem);
 * none write a User FK, so resolveUserFk is not needed.
 * ══════════════════════════════════════ */

export async function saveRiskFactors(systemId: string, riskFactors: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!SYSTEM_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const system = await prisma.gxPSystem.update({
      where: { id: systemId, tenantId: session.user.tenantId },
      data: { riskFactors },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_RISK_FACTORS_UPDATED",
        recordId: systemId,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] saveRiskFactors failed:", err);
    return { success: false, error: "Failed to save risk factors" };
  }
}

const RiskClassificationSchema = z.object({
  patientSafetyRisk: RiskEnum.optional(),
  productQualityImpact: RiskEnum.optional(),
  regulatoryExposure: RiskEnum.optional(),
  diImpact: RiskEnum.optional(),
});

export async function saveRiskClassification(
  systemId: string,
  input: z.input<typeof RiskClassificationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = RiskClassificationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!SYSTEM_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const system = await prisma.gxPSystem.update({
      where: { id: systemId, tenantId: session.user.tenantId },
      data: parsed.data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_RISK_CLASSIFICATION_UPDATED",
        recordId: systemId,
        newValue: JSON.stringify(parsed.data),
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] saveRiskClassification failed:", err);
    return { success: false, error: "Failed to save risk classification" };
  }
}

export async function saveNextReview(
  systemId: string,
  nextReview: string | null,
  lastValidated?: string | null,
): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!SYSTEM_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const system = await prisma.gxPSystem.update({
      where: { id: systemId, tenantId: session.user.tenantId },
      data: {
        nextReview: nextReview ? new Date(nextReview) : null,
        ...(lastValidated !== undefined ? { lastValidated: lastValidated ? new Date(lastValidated) : null } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_REVIEW_DATES_UPDATED",
        recordId: systemId,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] saveNextReview failed:", err);
    return { success: false, error: "Failed to save review dates" };
  }
}

const RemediationSchema = z.object({
  remediationPlan: z.string().optional(),
  remediationStatus: z.enum(["open", "in-progress", "closed"]).optional(),
});

export async function saveRemediation(
  systemId: string,
  input: z.input<typeof RemediationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = RemediationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!SYSTEM_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  try {
    const system = await prisma.gxPSystem.update({
      where: { id: systemId, tenantId: session.user.tenantId },
      data: {
        remediationPlan: parsed.data.remediationPlan ?? null,
        ...(parsed.data.remediationStatus !== undefined ? { remediationStatus: parsed.data.remediationStatus } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_REMEDIATION_UPDATED",
        recordId: systemId,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] saveRemediation failed:", err);
    return { success: false, error: "Failed to save remediation" };
  }
}

/* ── Manual status attestation (QA Head / super_admin) ── */

const AttestStatusSchema = z.object({
  status: z.enum(["Validated", "In Progress", "Overdue", "Not Started", "Under Review", "Validation Failed"]),
  reason: z.string().min(3, "A reason is required to attest a status manually"),
});

export async function attestValidationStatus(
  systemId: string,
  input: z.input<typeof AttestStatusSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can manually attest validation status" };
  }
  const parsed = AttestStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const system = await prisma.gxPSystem.update({
      where: { id: systemId, tenantId: session.user.tenantId },
      data: {
        validationStatus: parsed.data.status,
        statusManuallySet: true,
        statusManualReason: parsed.data.reason,
        statusManuallySetAt: new Date(),
        statusManuallySetByName: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_STATUS_MANUALLY_ATTESTED",
        recordId: systemId,
        newValue: JSON.stringify({ status: parsed.data.status, reason: parsed.data.reason }),
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] attestValidationStatus failed:", err);
    return { success: false, error: "Failed to attest status" };
  }
}

export async function resetToAutoDerivedStatus(systemId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can reset to auto-derived status" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    // Clear the manual flag first so syncValidationStatus will recompute.
    await prisma.gxPSystem.update({
      where: { id: systemId, tenantId: session.user.tenantId },
      data: {
        statusManuallySet: false,
        statusManualReason: null,
        statusManuallySetAt: null,
        statusManuallySetByName: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_STATUS_AUTO_RESUMED",
        recordId: systemId,
      },
    });
    // Re-derive from current stage state (also logs SYSTEM_STATUS_AUTO_DERIVED
    // if the value changes).
    await syncValidationStatus(systemId, session);
    revalidatePath("/csv-csa");
    const system = await prisma.gxPSystem.findFirst({ where: scopedWhere(session, systemId) });
    return { success: true, data: system };
  } catch (err) {
    console.error("[action] resetToAutoDerivedStatus failed:", err);
    return { success: false, error: "Failed to reset status" };
  }
}

/* ══════════════════════════════════════
 * RUNG 2 — cross-module FK linking (Finding / CAPA ↔ system).
 * Role-gated (qa_head / customer_admin / super_admin) + tenant-scoped on
 * both sides (Phase 12 security hardening).
 * ══════════════════════════════════════ */

function canManageSystemLinks(role: string): boolean {
  // Gap-link-fix-2 — broadened to the compliance-authoring set (mirrors
  // CAPA_WRITE_ROLES in capas/lifecycle.ts): every role that can author a
  // Finding/CAPA can link it to a system at creation time. Excludes viewer
  // (read-only). raiseCAPAFromSystem also uses this gate but stays effectively
  // bound by createCAPA's own CAPA_WRITE_ROLES check, so the sets now align.
  return (
    role === "csv_val_lead" ||
    role === "qa_head" ||
    role === "regulatory_affairs" ||
    role === "customer_admin" ||
    role === "super_admin"
  );
}

async function assertSystemInTenant(systemId: string, tenantId: string): Promise<boolean> {
  const sys = await prisma.gxPSystem.findFirst({ where: { id: systemId, tenantId }, select: { id: true } });
  return !!sys;
}

export async function linkFindingToSystem(systemId: string, findingId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canManageSystemLinks(session.user.role)) {
    return { success: false, error: "You do not have permission to link findings." };
  }
  if (!(await assertSystemInTenant(systemId, session.user.tenantId))) {
    return { success: false, error: "FORBIDDEN" };
  }
  // Scope the finding to the caller's tenant too (IDOR guard on both sides).
  const finding = await prisma.finding.findFirst({ where: { id: findingId, tenantId: session.user.tenantId }, select: { id: true, reference: true } });
  if (!finding) return { success: false, error: "FORBIDDEN" };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    await prisma.finding.update({ where: scopedWhere(session, findingId), data: { systemId } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_FINDING_LINKED",
        recordId: systemId,
        newValue: finding.reference ?? findingId,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: { systemId, findingId } };
  } catch (err) {
    console.error("[action] linkFindingToSystem failed:", err);
    return { success: false, error: "Failed to link finding" };
  }
}

export async function unlinkFindingFromSystem(systemId: string, findingId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canManageSystemLinks(session.user.role)) {
    return { success: false, error: "You do not have permission to unlink findings." };
  }
  const finding = await prisma.finding.findFirst({ where: { id: findingId, tenantId: session.user.tenantId, systemId }, select: { id: true, reference: true } });
  if (!finding) return { success: false, error: "FORBIDDEN" };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    await prisma.finding.update({ where: scopedWhere(session, findingId), data: { systemId: null } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_FINDING_UNLINKED",
        recordId: systemId,
        newValue: finding.reference ?? findingId,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: { systemId, findingId } };
  } catch (err) {
    console.error("[action] unlinkFindingFromSystem failed:", err);
    return { success: false, error: "Failed to unlink finding" };
  }
}

const RaiseCAPAFromSystemSchema = z.object({
  description: z.string().min(10, "Description must be at least 10 characters"),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  owner: z.string().optional(),
  dueDate: z.string().min(1, "Due date is required"),
});

export async function raiseCAPAFromSystem(
  systemId: string,
  input: z.input<typeof RaiseCAPAFromSystemSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!canManageSystemLinks(session.user.role)) {
    return { success: false, error: "You do not have permission to raise a CAPA." };
  }
  const parsed = RaiseCAPAFromSystemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const system = await prisma.gxPSystem.findFirst({ where: { id: systemId, tenantId: session.user.tenantId }, select: { id: true, siteId: true, reference: true } });
  if (!system) return { success: false, error: "FORBIDDEN" };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // Delegate to the canonical createCAPA (reference allocation, audit, etc.),
  // tagging source = "CSV/CSA" and the new systemId FK.
  const result = await createCAPA({
    source: "CSV/CSA",
    systemId,
    // Phase A — title required; derive from the CSV/CSA description.
    title: parsed.data.description.slice(0, 120),
    description: parsed.data.description,
    risk: parsed.data.risk,
    owner: parsed.data.owner,
    dueDate: parsed.data.dueDate,
    siteId: system.siteId ?? undefined,
  });
  if (!result.success) return result;
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: CSV_AUDIT_MODULE,
        action: "SYSTEM_CAPA_RAISED",
        recordId: systemId,
        recordTitle: system.reference ?? undefined,
      },
    });
  } catch (err) {
    console.error("[action] raiseCAPAFromSystem audit failed:", err);
  }
  revalidatePath("/csv-csa");
  return result;
}

/* ══════════════════════════════════════
 * RUNG 2.6 — Part 11 validation sign-off
 *
 * signValidation: QA Head / super_admin signs off a fully-executed system.
 *   Gates on every stage being approved/skipped + no open findings + no open
 *   critical/high CAPAs, re-authenticates the signer's password (Part 11
 *   §11.200), hashes the signed state, writes an immutable SignedRecord
 *   (recordType "CSV_VALIDATION_SIGNOFF"), snapshots the state onto
 *   GxPSystem, and forces validationStatus = "Validated".
 * unsignValidation: super_admin only — clears the sign-off snapshot and
 *   re-derives status from stages. The SignedRecord ledger row is left
 *   intact (Part 11 immutability); a revocation audit entry is added.
 * getSignOffReadiness: read-only gate computation for the Sign Off tab.
 * ══════════════════════════════════════ */

const COMPLETE_STAGE_STATUSES = new Set(["approved", "skipped"]);

// NOTE — actor identity: resolveUserFk() (from @/lib/auth) maps a session
// principal to a real User.id or null. signedOffById / deletedById here are
// stored as a valid User id or null (admin Tenant ids must never leak in).
// See AUDIT Finding #2 / Rung 3E.

/** Part 11 / Annex 11 columns store free text ("Compliant" | "Partial" |
 *  "N/A" | "Non-Compliant"). Only an explicit "Compliant" snapshots as a pass. */
function isCompliantStatus(s: string | null | undefined): boolean {
  return (s ?? "").trim().toLowerCase() === "compliant";
}

// RTM coverage = share of requirements whose FS/IQ/OQ/PQ trace is complete.
// RTMEntry carries the derived `traceabilityStatus` ("complete"|"partial"|
// "missing"/"broken") written by deriveRtmCoverage in src/actions/rtm.ts.
function rtmCoverageOf(entries: { traceabilityStatus: string }[]): number {
  const done = entries.filter((e) => e.traceabilityStatus.toLowerCase() === "complete").length;
  return entries.length === 0 ? 0 : Math.round((done / entries.length) * 100);
}

interface SignOffReadiness {
  allStagesComplete: boolean;
  outstandingStages: string[];
  // RUNG 3A.2 — read-only per-stage detail derived from existing validationStages
  // (no new columns / status words) so the Sign Off tab can surface every
  // stage's blocker, not just a names-only summary.
  stages: { name: string; status: string }[];
  approvedCount: number;
  stagesTotal: number;
  currentRtmCoverage: number;
  openFindings: number;
  openCriticalCAPAs: number;
  readyToSign: boolean;
}

async function computeReadiness(systemId: string, tenantId: string): Promise<SignOffReadiness | null> {
  const system = await prisma.gxPSystem.findFirst({
    where: { id: systemId, tenantId },
    select: {
      validationStages: { select: { stageName: true, status: true } },
      rtmEntries: { select: { traceabilityStatus: true } },
      findings: { select: { status: true } },
      capas: { select: { status: true, risk: true } },
    },
  });
  if (!system) return null;
  const outstandingStages = system.validationStages
    .filter((s) => !COMPLETE_STAGE_STATUSES.has(s.status))
    .map((s) => s.stageName);
  const allStagesComplete = system.validationStages.length > 0 && outstandingStages.length === 0;
  const openFindings = system.findings.filter((f) => f.status !== "Closed").length;
  const openCriticalCAPAs = system.capas.filter(
    (c) => c.status.toLowerCase() !== "closed" && ["critical", "high"].includes((c.risk ?? "").toLowerCase()),
  ).length;
  return {
    allStagesComplete,
    outstandingStages,
    stages: system.validationStages.map((s) => ({ name: s.stageName, status: s.status })),
    approvedCount: system.validationStages.filter((s) => s.status === "approved").length,
    stagesTotal: system.validationStages.length,
    currentRtmCoverage: rtmCoverageOf(system.rtmEntries),
    openFindings,
    openCriticalCAPAs,
    readyToSign: allStagesComplete && openFindings === 0 && openCriticalCAPAs === 0,
  };
}

export async function getSignOffReadiness(systemId: string): Promise<ActionResult<SignOffReadiness>> {
  const session = await requireAuth();
  const readiness = await computeReadiness(systemId, session.user.tenantId);
  if (!readiness) return { success: false, error: "System not found" };
  return { success: true, data: readiness };
}

const SignValidationSchema = z.object({
  nextReviewDate: z.string().min(1, "Next review date is required"),
  reason: z.string().min(10, "Sign-off meaning must be at least 10 characters"),
  password: z.string().min(1, "Password is required to sign"),
});

export async function signValidation(
  systemId: string,
  input: z.input<typeof SignValidationSchema>,
): Promise<ActionResult<{ signatureId: string; contentHash: string }>> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can sign off validation." };
  }
  const parsed = SignValidationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const system = await prisma.gxPSystem.findFirst({
    where: { id: systemId, tenantId: session.user.tenantId },
    select: {
      id: true, name: true, reference: true, signedOffAt: true,
      part11Status: true, annex11Status: true,
      validationStages: { select: { stageName: true, status: true } },
      rtmEntries: { select: { traceabilityStatus: true } },
      findings: { select: { status: true } },
      capas: { select: { status: true, risk: true } },
    },
  });
  if (!system) return { success: false, error: "System not found" };
  if (system.signedOffAt) {
    return { success: false, error: "This system is already signed off. Revoke the existing sign-off before re-signing." };
  }

  // Gate 1 — every stage approved or skipped.
  const outstanding = system.validationStages.filter((s) => !COMPLETE_STAGE_STATUSES.has(s.status));
  if (system.validationStages.length === 0 || outstanding.length > 0) {
    const detail = outstanding.map((s) => s.stageName).join(", ") || "no stages exist";
    return { success: false, error: `Cannot sign off — outstanding stage(s): ${detail}.` };
  }
  // Gate 2 — no open findings.
  const openFindings = system.findings.filter((f) => f.status !== "Closed").length;
  if (openFindings > 0) {
    return { success: false, error: `Cannot sign off — ${openFindings} open finding(s) require remediation first.` };
  }
  // Gate 3 — no open critical/high CAPAs.
  const openCriticalCAPAs = system.capas.filter(
    (c) => c.status.toLowerCase() !== "closed" && ["critical", "high"].includes((c.risk ?? "").toLowerCase()),
  ).length;
  if (openCriticalCAPAs > 0) {
    return { success: false, error: `Cannot sign off — ${openCriticalCAPAs} open critical/high CAPA(s) must be closed first.` };
  }

  // Part 11 §11.200 — re-authenticate the signer's password.
  const passwordOk = await verifyPasswordForSigning(session.user.id, parsed.data.password);
  if (!passwordOk) {
    return {
      success: false,
      error: "Password verification failed. Sign-off not recorded.",
      fieldErrors: { password: ["Incorrect password"] },
    };
  }

  // Snapshot the signed state + compute the deterministic content hash.
  const stagesApproved = system.validationStages.filter((s) => s.status === "approved").length;
  const stagesTotal = system.validationStages.length;
  const rtmCoverage = rtmCoverageOf(system.rtmEntries);
  const part11Compliant = isCompliantStatus(system.part11Status);
  const annex11Compliant = isCompliantStatus(system.annex11Status);
  const nextReviewDate = new Date(parsed.data.nextReviewDate);
  const signedAt = new Date();
  const reference = system.reference ?? system.id.slice(0, 8);

  const contentHash = computeContentHash(
    canonicalizeCSVValidationSignOffContent({
      systemId: system.id,
      reference,
      stagesApproved,
      stagesTotal,
      rtmCoverage,
      part11Compliant,
      annex11Compliant,
      openFindings,
      nextReviewIso: nextReviewDate.toISOString(),
      signatureMeaning: parsed.data.reason,
      signerEmail: session.user.email,
      signedAtIso: signedAt.toISOString(),
    }),
  );
  const provenance = await readSigningProvenance();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const signedOffById = (await resolveUserFk(session.user.id, session.user.tenantId, session.user.role)).userId;

  try {
    const sig = await prisma.$transaction(async (tx) => {
      const signed = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "CSV_VALIDATION_SIGNOFF",
          recordId: system.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: parsed.data.reason,
          contentHash,
          contentSummary: `CSV/CSA validation sign-off — ${reference} (${system.name}) by ${session.user.name} (${session.user.role}); ${stagesApproved}/${stagesTotal} stages approved, RTM ${rtmCoverage}%`,
          passwordVerifiedAt: signedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      await tx.gxPSystem.update({
        where: { id: system.id },
        data: {
          validationStatus: "Validated",
          nextReview: nextReviewDate,
          lastValidated: signedAt,
          signedOffAt: signedAt,
          signedOffById,
          signedOffByName: session.user.name,
          signedOffReason: parsed.data.reason,
          signedOffContentHash: contentHash,
          signedOffSignatureId: signed.id,
          signedOffPart11Compliant: part11Compliant,
          signedOffAnnex11Compliant: annex11Compliant,
          signedOffRtmCoverage: rtmCoverage,
          signedOffStagesApproved: stagesApproved,
          signedOffStagesTotal: stagesTotal,
          // A sign-off supersedes any manual attestation; signedOffAt is now
          // the status authority (syncValidationStatus bails while it's set).
          statusManuallySet: false,
          statusManualReason: null,
          statusManuallySetAt: null,
          statusManuallySetByName: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: CSV_AUDIT_MODULE,
          action: "SYSTEM_VALIDATION_SIGNED",
          recordId: system.id,
          recordTitle: reference,
          newValue: JSON.stringify({
            stagesApproved, stagesTotal, rtmCoverage, part11Compliant, annex11Compliant,
            nextReview: nextReviewDate.toISOString(), contentHashPrefix: contentHash.slice(0, 16), signatureId: signed.id,
          }),
        },
      });
      return signed;
    });
    revalidatePath("/csv-csa");
    return { success: true, data: { signatureId: sig.id, contentHash } };
  } catch (err) {
    console.error("[action] signValidation failed:", err);
    return { success: false, error: "Failed to record sign-off" };
  }
}

const UnsignValidationSchema = z.object({
  reason: z.string().min(10, "A reason (≥10 chars) is required to revoke a sign-off"),
});

export async function unsignValidation(
  systemId: string,
  input: z.input<typeof UnsignValidationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  // Revoking a Part 11 sign-off is a privileged correction — super_admin only.
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Only a super admin can revoke a validation sign-off." };
  }
  const parsed = UnsignValidationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const system = await prisma.gxPSystem.findFirst({
    where: { id: systemId, tenantId: session.user.tenantId },
    select: { id: true, reference: true, signedOffAt: true, signedOffContentHash: true, signedOffSignatureId: true },
  });
  if (!system) return { success: false, error: "System not found" };
  if (!system.signedOffAt) return { success: false, error: "This system is not signed off." };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.gxPSystem.update({
        where: { id: system.id },
        data: {
          signedOffAt: null,
          signedOffById: null,
          signedOffByName: null,
          signedOffReason: null,
          signedOffContentHash: null,
          signedOffSignatureId: null,
          signedOffPart11Compliant: null,
          signedOffAnnex11Compliant: null,
          signedOffRtmCoverage: null,
          signedOffStagesApproved: null,
          signedOffStagesTotal: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: CSV_AUDIT_MODULE,
          action: "SYSTEM_VALIDATION_UNSIGNED",
          recordId: system.id,
          recordTitle: system.reference ?? system.id.slice(0, 8),
          oldValue: system.signedOffContentHash ?? undefined,
          newValue: JSON.stringify({ reason: parsed.data.reason, revokedSignatureId: system.signedOffSignatureId }),
        },
      });
    });
    // signedOffAt is now null → re-derive status from current stage state.
    await syncValidationStatus(system.id, session);
    revalidatePath("/csv-csa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] unsignValidation failed:", err);
    return { success: false, error: "Failed to revoke sign-off" };
  }
}
