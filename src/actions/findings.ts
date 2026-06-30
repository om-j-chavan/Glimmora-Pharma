"use server";

/**
 * Server Actions for Gap Assessment findings.
 *
 * Reference implementation â€” shows the pattern for
 * migrating from Redux dispatch + API routes to
 * Server Actions + revalidatePath.
 *
 * Each action:
 *  1. Checks auth via requireAuth()
 *  2. Validates input with Zod
 *  3. Mutates via Prisma
 *  4. Creates audit log entry
 *  5. Revalidates the page cache
 *  6. Returns result (no throw â€” return errors)
 */

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor, COMPLIANCE_AUTHOR_ROLES, ADMIN_DELETE_ROLES } from "@/lib/auth";
import { DEVIATION_QA_ROLES, isAssignedToTask } from "@/lib/permissions/roleSets";
import { EVIDENCE_CATEGORIES } from "@/lib/queries/evidence";
import { notify } from "@/lib/notify";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import { buildReferencePrefix, generateReference, isReferenceConflict } from "@/lib/reference";
import { sanitizeServerError } from "@/lib/errors";
import { CAPA_RCA_METHODS } from "@/constants/rcaMethods";

// Shared with the create form (AddFindingModal) — keep this the single source
// of truth for the minimum requirement length so client and server never
// disagree (a mismatch made short edits fail silently).
const MIN_REQUIREMENT = 10;

// â”€â”€ Schemas â”€â”€

const CreateFindingSchema = z.object({
  requirement: z.string().min(MIN_REQUIREMENT, `Requirement must be at least ${MIN_REQUIREMENT} characters`),
  purpose: z.string().optional(),
  area: z.string().min(1, "Area is required"),
  framework: z.string().optional(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]),
  // Owner is server-stamped to the creator (session) — accepted but ignored if
  // sent, so it can't be spoofed from the client. Optional for that reason.
  owner: z.string().optional(),
  targetDate: z.string().min(1, "Target date is required"),
  siteId: z.string().optional(),
  evidenceLink: z.string().optional(),
  // Gap RCA (Batch B) — structured method + JSON detail; rootCause is the
  // readable mirror serialized by the modal (rcaDetailToText).
  rootCause: z.string().optional(),
  rcaMethod: z.enum(CAPA_RCA_METHODS).optional(),
  rcaDetail: z.string().optional(),
  // SME Section 1, Stage 6 (FULL) â€” optional recurrence link, same
  // semantic as Deviation.previousCAPAId.
  previousCAPAId: z.string().optional(),
});

const UpdateFindingSchema = z.object({
  requirement: z.string().min(MIN_REQUIREMENT).optional(),
  purpose: z.string().optional(),
  area: z.string().min(1).optional(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
  status: z.enum(["Open", "In Progress", "Closed"]).optional(),
  owner: z.string().min(1).optional(),
  targetDate: z.string().optional(),
  rootCause: z.string().optional(),
  // Gap RCA (Batch B) — structured method + JSON detail (rootCause = mirror).
  rcaMethod: z.enum(CAPA_RCA_METHODS).optional(),
  rcaDetail: z.string().optional(),
  evidenceLink: z.string().optional(),
  linkedCAPAId: z.string().optional(),
  // Free-text rationale recorded alongside the edit-history diff. Not a column
  // on Finding — it lands in FindingEdit.reason.
  reason: z.string().optional(),
});

// â”€â”€ Return types â”€â”€

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// â”€â”€ Actions â”€â”€

export async function createFinding(input: z.input<typeof CreateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // SME Section 1, Stage 6 (FULL) â€” validate the optional recurrence
  // link before persisting. Same pattern as createDeviation.
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

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }

  // SME final rung â€” site-scoped reference allocation. Same retry-on-
  // P2002 shape as createDeviation / createCAPA.
  let siteCodeForRef: string | null = null;
  if (parsed.data.siteId) {
    const site = await prisma.site.findUnique({
      where: { id: parsed.data.siteId },
      select: { code: true },
    });
    siteCodeForRef = site?.code ?? null;
  }
  const referencePrefix = buildReferencePrefix("FND", siteCodeForRef);

  const MAX_REF_RETRIES = 5;
  let finding: Awaited<ReturnType<typeof prisma.finding.create>> | null = null;
  let lastRefErr: unknown = null;
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    try {
      finding = await prisma.$transaction(async (tx) => {
        const reference = await generateReference(
          referencePrefix,
          new Date(),
          async (prefix, year) => {
            const row = await tx.finding.findFirst({
              where: { reference: { startsWith: `${prefix}-${year}-` } },
              orderBy: { reference: "desc" },
              select: { reference: true },
            });
            return row?.reference ?? null;
          },
        );
        return tx.finding.create({
          data: {
            ...parsed.data,
            reference,
            tenantId: session.user.tenantId,
            // Owner = the creator, stamped from the session (never the client
            // payload) so it can't be spoofed. Overrides any sent `owner`.
            owner: session.user.id,
            // RUNG 3H — canonical Title Case (matches the schema default, the
            // updateFinding enum, the FindingStatus type, and all read sites).
            status: "Open",
            createdBy: session.user.name,
            targetDate: new Date(parsed.data.targetDate),
          },
        });
      });
      break;
    } catch (err) {
      lastRefErr = err;
      if (!isReferenceConflict(err)) throw err;
    }
  }
  if (!finding) {
    console.error("[action] createFinding exhausted reference retries:", lastRefErr);
    return { success: false, error: sanitizeServerError(lastRefErr, "Failed to allocate finding reference") };
  }

  try {

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Gap Assessment",
        action: "FINDING_CREATED",
        recordId: finding.id,
        recordTitle: finding.reference
          ? `${finding.reference} — ${parsed.data.requirement.slice(0, 60)}`
          : parsed.data.requirement.slice(0, 80),
        newValue: parsed.data.severity,
      },
    });
    if (parsed.data.previousCAPAId) {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          action: "FINDING_LINKED_TO_PRIOR_CAPA_AS_RECURRENCE",
          recordId: finding.id,
          recordTitle: parsed.data.requirement.slice(0, 80),
          newValue: JSON.stringify({
            previousCAPAId: parsed.data.previousCAPAId,
            priorCAPAStatus,
            atCreation: true,
          }),
        },
      });
    }

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] createFinding failed:", err);
    return { success: false, error: "Failed to create finding" };
  }
}

// Human-readable labels + value formatting for the edit-history diff. Only
// the fields a user can actually change through the detail form are diffed.
const DIFF_FIELDS: { key: "requirement" | "purpose" | "owner" | "targetDate" | "evidenceLink" | "status" | "rcaMethod" | "rootCause"; label: string }[] = [
  { key: "requirement", label: "Requirement" },
  { key: "purpose", label: "Purpose" },
  { key: "owner", label: "Owner" },
  { key: "targetDate", label: "Target date" },
  { key: "evidenceLink", label: "Evidence link" },
  { key: "status", label: "Status" },
  // RCA — track the method + the readable rootCause mirror so edits to a
  // finding's root-cause analysis are captured in the edit-history diff.
  { key: "rcaMethod", label: "RCA method" },
  { key: "rootCause", label: "Root cause" },
];

function normalizeForDiff(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (key === "targetDate") {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return String(value);
}

export async function updateFinding(id: string, input: z.input<typeof UpdateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
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
    const before = await prisma.finding.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });
    if (!before) return { success: false, error: "Finding not found" };

    const { reason, ...updates } = parsed.data;

    const finding = await prisma.finding.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...updates,
        ...(updates.targetDate ? { targetDate: new Date(updates.targetDate) } : {}),
      },
    });

    // Build the field-level diff for the append-only edit trail.
    const changes = DIFF_FIELDS.flatMap(({ key, label }) => {
      if (!(key in updates) || updates[key] === undefined) return [];
      const oldValue = normalizeForDiff(key, (before as Record<string, unknown>)[key]);
      const newValue = normalizeForDiff(key, (updates as Record<string, unknown>)[key]);
      if (oldValue === newValue) return [];
      return [{ field: label, oldValue, newValue }];
    });

    if (changes.length > 0) {
      await prisma.findingEdit.create({
        data: {
          findingId: id,
          tenantId: session.user.tenantId,
          editedBy: session.user.id,
          editedByName: session.user.name,
          reason: reason?.trim() || null,
          changes: JSON.stringify(changes),
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Gap Assessment",
        action: "FINDING_UPDATED",
        recordId: id,
        recordTitle: before.reference ?? undefined,
        newValue: changes.length > 0 ? JSON.stringify(changes) : undefined,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] updateFinding failed:", err);
    return { success: false, error: "Failed to update finding" };
  }
}

// Gap Step 1 — ASSIGN a finding to ONE person who will work it. Mirrors
// assignDeviationTask (deviation-tasks.ts): QA-gated dispatch, active-staff-only
// assignee, owner kept as a String userId (no FK migration), audit + edit-trail
// + notify. Worklist/docs/rework/CAPA-carryover are later steps.
const AssignFindingSchema = z.object({
  assigneeId: z.string().min(1, "Assignee is required"),
});

export async function assignFinding(
  findingId: string,
  input: z.input<typeof AssignFindingSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AssignFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Assignment is a QA dispatch — the same role set deviations use to assign
  // (qa_head + super_admin). Not a GxP authorship event, so no requireGxPAuthor.
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can assign findings." };
  }

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, requirement: true, owner: true, status: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (finding.status === "Closed") {
    return { success: false, error: "This finding is closed and can no longer be reassigned." };
  }

  // Assignee pool = any active tenant user, operational staff only (exclude
  // platform/admin + viewer). Mirrors assignDeviationTask + the useComplianceUsers
  // UI pool.
  const assignee = await prisma.user.findFirst({
    where: { id: parsed.data.assigneeId, tenantId: session.user.tenantId, isActive: true },
    select: { id: true, name: true, role: true },
  });
  if (!assignee) return { success: false, error: "Assignee must be an active user in your organisation." };
  if (["super_admin", "customer_admin", "viewer"].includes(assignee.role)) {
    return { success: false, error: "Findings can only be assigned to operational staff, not platform or admin roles." };
  }
  if (finding.owner === assignee.id) {
    return { success: false, error: "This finding is already assigned to that user." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const updated = await prisma.finding.update({
      where: { id: findingId, tenantId: session.user.tenantId },
      // Assigning a still-Open finding moves it into the work loop (In Progress) —
      // the disposition uses this as the "assigned" signal to show the assignee
      // read-only + hide the dropdown (mirrors a deviation gaining an activeTask).
      // A finding already past Open (In Progress/Submitted/Rework) keeps its status
      // on reassignment.
      data: { owner: assignee.id, ...(finding.status === "Open" ? { status: "In Progress" } : {}) },
    });

    // Append-only edit trail (same as updateFinding tracks an owner change) so
    // the reassignment shows in the finding's own history, not just auditLog.
    await prisma.findingEdit.create({
      data: {
        findingId,
        tenantId: session.user.tenantId,
        editedBy: session.user.id,
        editedByName: session.user.name,
        reason: "Assigned to a different owner",
        changes: JSON.stringify([{ field: "Owner", oldValue: finding.owner, newValue: assignee.id }]),
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Gap Assessment",
        action: "FINDING_ASSIGNED",
        recordId: findingId,
        recordTitle: (finding.reference ?? finding.requirement).slice(0, 80),
        newValue: JSON.stringify({ assigneeId: assignee.id, previousOwner: finding.owner }),
      },
    });

    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: assignee.id,
      actorUserId: actor.userId,
      type: "ACTION_ASSIGNED",
      title: `A gap finding was assigned to you (${finding.reference ?? findingId.slice(0, 8)})`,
      body: finding.requirement.slice(0, 200),
      linkPath: "/gap-assessment",
      entityType: "Finding",
      entityId: findingId,
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] assignFinding failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to assign finding") };
  }
}

export async function deleteFinding(id: string, reason?: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Rung 3J.1 — destructive delete is admin-tier (mirrors SYSTEM_DELETE_ROLES),
  // narrower than the COMPLIANCE_AUTHOR_ROLES that gate create/update/close.
  if (!ADMIN_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an administrator can delete a finding." };
  }

  try {
    const existing = await prisma.finding.findFirst({
      where: { id, tenantId: session.user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return { success: false, error: "Finding not found" };
    // Soft-delete (Part 11 retention) — row retained; list queries filter deletedAt.
    await prisma.finding.update({
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
        module: "Gap Assessment",
        action: "FINDING_DELETED",
        recordId: id,
        newValue: reason ? reason.slice(0, 200) : null,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteFinding failed:", err);
    return { success: false, error: "Failed to delete finding" };
  }
}

export async function restoreFinding(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!ADMIN_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an administrator can restore a finding." };
  }
  try {
    const existing = await prisma.finding.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true, deletedAt: true },
    });
    if (!existing) return { success: false, error: "Finding not found" };
    if (!existing.deletedAt) return { success: false, error: "Finding is not deleted." };
    await prisma.finding.update({
      where: { id, tenantId: session.user.tenantId },
      data: { deletedAt: null, deletedById: null, deletedByName: null, deletionReason: null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Gap Assessment",
        action: "FINDING_RESTORED",
        recordId: id,
      },
    });
    revalidatePath("/gap-assessment");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] restoreFinding failed:", err);
    return { success: false, error: "Failed to restore finding" };
  }
}

export async function closeFinding(id: string): Promise<ActionResult> {
  const session = await requireAuth();
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
    const finding = await prisma.finding.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "Closed" }, // RUNG 3H — canonical Title Case
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Gap Assessment",
        action: "FINDING_CLOSED",
        recordId: id,
      },
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] closeFinding failed:", err);
    return { success: false, error: "Failed to close finding" };
  }
}

// ── Evidence document upload ──

const EVIDENCE_MAX_FILE_MB = Number(process.env.EVIDENCE_MAX_FILE_MB ?? "10");
const EVIDENCE_MAX_BYTES = EVIDENCE_MAX_FILE_MB * 1024 * 1024;
const EVIDENCE_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

/**
 * Upload a document as evidence for a finding. Stores the bytes via the file
 * storage abstraction, records a Document row linked to the finding, and sets
 * the finding's evidenceLink to the stored file name so the Evidence Index
 * reflects it. Mirrors addEvidenceFile in actions/evidence.ts.
 */
export async function uploadFindingEvidence(
  findingId: string,
  formData: FormData,
  // Gap Step 3 — optional GxP category (one of EVIDENCE_CATEGORIES). Stored on
  // Document.category so the finding's docs group like deviation task docs and
  // map 1:1 to a CAPA evidence category on a future carryover. Invalid/absent
  // leaves category null (Uncategorized). Mirrors attachDeviationTaskDocument.
  category?: string,
): Promise<ActionResult<{ fileName: string }>> {
  const session = await requireAuth();

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "No file provided" };
  if (file.size === 0) return { success: false, error: "File is empty" };
  if (file.size > EVIDENCE_MAX_BYTES) {
    return { success: false, error: `File exceeds ${EVIDENCE_MAX_FILE_MB} MB limit` };
  }
  if (!EVIDENCE_ALLOWED_MIME.has(file.type)) {
    return { success: false, error: "File type not allowed" };
  }

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId },
    select: { id: true, reference: true, requirement: true, owner: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };

  // Authorization: an author role OR the finding's assignee (owner == userId).
  // Mirrors addEvidenceFile / attachDeviationTaskDocument. requireGxPAuthor
  // blocks the platform super_admin; the viewer hard-stop is in isAssignedToTask.
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: finding.owner });
  if (!isAuthorRole && !isAssignee) {
    return { success: false, error: "Your role does not permit this action." };
  }
  const cat = category && (EVIDENCE_CATEGORIES as readonly string[]).includes(category) ? category : null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const sanitized = sanitizeFilename(file.name);
    const storageKey = `findings/${findingId}/${contentHash}-${sanitized}`;
    await fileStorage.save(storageKey, buffer, file.type);

    const sizeKb = Math.max(1, Math.round(file.size / 1024));

    await prisma.$transaction(async (tx) => {
      await tx.document.create({
        data: {
          tenantId: session.user.tenantId,
          fileName: sanitized,
          fileType: file.type,
          fileSize: `${sizeKb} KB`,
          version: "v1.0",
          status: "draft",
          uploadedBy: session.user.name,
          description: `Evidence for ${finding.reference ?? findingId}`,
          linkedModule: "Gap Assessment",
          linkedRecordId: findingId,
          // Gap Step 3 — GxP category (validated above; null = Uncategorized).
          category: cat,
          // Persist the retrieval metadata so the Evidence Index can serve
          // the bytes back via GET /api/findings/[id]/evidence. Without
          // storageKey the uploaded file was written to disk but orphaned —
          // there was no way to read it back.
          sourceModule: "gap-assessment",
          sourceId: findingId,
          storageKey,
          sha256: contentHash,
          originalFileName: file.name,
          fileExtension: sanitized.includes(".") ? sanitized.slice(sanitized.lastIndexOf(".") + 1).toLowerCase() : null,
        },
      });
      await tx.finding.update({
        where: { id: findingId, tenantId: session.user.tenantId },
        data: { evidenceLink: sanitized },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userName: session.user.name,
          userRole: session.user.role,
          module: "Gap Assessment",
          action: "FINDING_EVIDENCE_UPLOADED",
          recordId: findingId,
          recordTitle: finding.reference ?? undefined,
          newValue: JSON.stringify({ fileName: sanitized, fileSize: file.size, contentHash }),
        },
      });
    });

    revalidatePath("/gap-assessment");
    revalidatePath("/evidence");
    return { success: true, data: { fileName: sanitized } };
  } catch (err) {
    console.error("[action] uploadFindingEvidence failed:", err);
    return { success: false, error: "Failed to upload evidence file" };
  }
}

/** Soft-delete a finding's evidence document before it's submitted to QA — lets
 *  the assignee remove a wrong upload (mirrors removeDeviationTaskDocument). Auth:
 *  an author role OR the finding's assignee (owner), same as the upload. Only a
 *  Gap Assessment doc linked to THIS finding can be removed (never a doc from
 *  elsewhere). Soft-delete preserves the Part 11 trail. */
export async function removeFindingEvidence(
  findingId: string,
  documentId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, owner: true, status: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: finding.owner });
  if (!isAuthorRole && !isAssignee) {
    return { success: false, error: "Your role does not permit this action." };
  }
  if (finding.status === "Closed") {
    return { success: false, error: "This finding is closed; its documents can no longer be changed." };
  }
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId, tenantId: session.user.tenantId, deletedAt: null,
      linkedModule: "Gap Assessment", linkedRecordId: findingId,
    },
    select: { id: true, fileName: true },
  });
  if (!doc) return { success: false, error: "Document not found on this finding." };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.document.update({
      where: { id: documentId, tenantId: session.user.tenantId },
      data: { deletedAt: new Date(), deletedBy: session.user.name, deletionReason: "Removed from gap finding" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId, userName: actor.displayName, userRole: actor.role,
        module: "Gap Assessment", action: "FINDING_EVIDENCE_REMOVED",
        recordId: findingId, recordTitle: doc.fileName,
        newValue: JSON.stringify({ findingId, documentId }),
      },
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    revalidatePath("/evidence");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] removeFindingEvidence failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to remove document") };
  }
}

// Gap Step 3 — the assignee's work/completion notes (mirrors the deviation task's
// completionNotes). Author OR the finding's assignee (owner) may set it.
const SaveFindingNotesSchema = z.object({
  notes: z.string().max(5000),
});

export async function saveFindingWorkNotes(
  findingId: string,
  input: z.input<typeof SaveFindingNotesSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SaveFindingNotesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, owner: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: finding.owner });
  if (!isAuthorRole && !isAssignee) {
    return { success: false, error: "Your role does not permit this action." };
  }

  try {
    await prisma.finding.update({
      where: { id: findingId, tenantId: session.user.tenantId },
      data: { completionNotes: parsed.data.notes.trim() || null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Gap Assessment",
        action: "FINDING_NOTES_SAVED",
        recordId: findingId,
        recordTitle: finding.reference ?? undefined,
      },
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] saveFindingWorkNotes failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to save notes") };
  }
}

// ── Gap Step 4 — submit → QA review → rework loop (clones the deviation task) ──

const SubmitFindingSchema = z.object({
  completionNotes: z.string().min(5, "Completion notes are required (min 5 chars)"),
});
const ReworkFindingSchema = z.object({
  reason: z.string().min(5, "Rework reason is required (min 5 chars)"),
});
const FindingMessageSchema = z.object({
  body: z.string().min(1, "Message cannot be empty").max(2000, "Message too long (2000 char max)"),
});

/** SUBMIT — the assignee (owner) submits the finding for QA review. */
export async function submitFinding(
  findingId: string,
  input: z.input<typeof SubmitFindingSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SubmitFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, owner: true, status: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (!isAssignedToTask(session, { ownerId: finding.owner })) {
    return { success: false, error: "Only the assigned user can submit this finding." };
  }
  if (finding.status !== "Open" && finding.status !== "In Progress" && finding.status !== "Rework") {
    return { success: false, error: "This finding can no longer be submitted." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const updated = await prisma.finding.update({
      where: { id: findingId, tenantId: session.user.tenantId },
      data: {
        status: "Submitted",
        completionNotes: parsed.data.completionNotes,
        submittedAt: new Date(),
        submittedById: actor.userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId, userName: actor.displayName, userRole: actor.role,
        module: "Gap Assessment", action: "FINDING_SUBMITTED",
        recordId: findingId, recordTitle: finding.reference ?? undefined,
      },
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] submitFinding failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to submit finding") };
  }
}

/** REVIEW → COMPLETE — QA accepts a submitted finding (→ Closed). QA-gated + SoD
 *  (the reviewer must NOT be the assignee/owner). */
export async function reviewFinding(findingId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can review findings." };
  }
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, owner: true, status: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (finding.status !== "Submitted") {
    return { success: false, error: "Only a submitted finding can be reviewed." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  if (finding.owner && finding.owner === actor.userId) {
    return { success: false, error: "Separation of duties: you cannot review a finding assigned to you. A different QA Head must review it." };
  }
  try {
    const updated = await prisma.finding.update({
      where: { id: findingId, tenantId: session.user.tenantId },
      data: { status: "Closed" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId, userName: actor.displayName, userRole: actor.role,
        module: "Gap Assessment", action: "FINDING_REVIEW_CLOSED",
        recordId: findingId, recordTitle: finding.reference ?? undefined,
      },
    });
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: finding.owner,
      actorUserId: actor.userId,
      type: "ACTION_ASSIGNED",
      title: `Your gap finding was accepted and closed (${finding.reference ?? findingId.slice(0, 8)})`,
      body: "Accepted and closed by QA.",
      linkPath: "/gap-assessment",
      entityType: "Finding",
      entityId: findingId,
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] reviewFinding failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to review finding") };
  }
}

/** REVIEW → REWORK — QA returns a submitted finding to the assignee. QA-gated +
 *  SoD. Auto-posts the rework reason as a FindingMessage (durable history), so
 *  it survives the assignee's resubmit — exactly like reworkDeviationTask. */
export async function reworkFinding(
  findingId: string,
  input: z.input<typeof ReworkFindingSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ReworkFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can review findings." };
  }
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, owner: true, status: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (finding.status !== "Submitted") {
    return { success: false, error: "Only a submitted finding can be sent back for rework." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  if (finding.owner && finding.owner === actor.userId) {
    return { success: false, error: "Separation of duties: you cannot review a finding assigned to you. A different QA Head must review it." };
  }
  try {
    const updated = await prisma.finding.update({
      where: { id: findingId, tenantId: session.user.tenantId },
      data: {
        status: "Rework",
        reworkReason: parsed.data.reason,
        reworkAt: new Date(),
        reworkById: actor.userId,
      },
    });
    await prisma.findingMessage.create({
      data: {
        tenantId: session.user.tenantId,
        findingId,
        authorId: actor.userId,
        authorName: actor.displayName,
        authorRole: actor.role,
        body: parsed.data.reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId, userName: actor.displayName, userRole: actor.role,
        module: "Gap Assessment", action: "FINDING_REWORK",
        recordId: findingId, recordTitle: finding.reference ?? undefined,
        newValue: JSON.stringify({ reason: parsed.data.reason.slice(0, 200) }),
      },
    });
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: finding.owner,
      actorUserId: actor.userId,
      type: "REWORK_ASSIGNED",
      title: `Gap finding returned for rework (${finding.reference ?? findingId.slice(0, 8)})`,
      body: parsed.data.reason.slice(0, 200),
      linkPath: "/worklist",
      entityType: "Finding",
      entityId: findingId,
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] reworkFinding failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to send finding for rework") };
  }
}

/** POST MESSAGE — the flat QA↔assignee conversation (append-only). QA OR the
 *  assignee (owner). Read-only once the finding is Closed. */
export async function postFindingMessage(
  findingId: string,
  input: z.input<typeof FindingMessageSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = FindingMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, owner: true, status: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  const isQA = DEVIATION_QA_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: finding.owner });
  if (!isQA && !isAssignee) {
    return { success: false, error: "Only QA or the assigned user can post on this finding." };
  }
  if (finding.status === "Closed") {
    return { success: false, error: "This finding is closed; the conversation is read-only." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const created = await prisma.findingMessage.create({
      data: {
        tenantId: session.user.tenantId,
        findingId,
        authorId: actor.userId,
        authorName: actor.displayName,
        authorRole: actor.role,
        body: parsed.data.body.trim(),
      },
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    return { success: true, data: created };
  } catch (err) {
    console.error("[action] postFindingMessage failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to post message") };
  }
}

/** Read a finding's review payload (for the QA-side gap view, which doesn't get
 *  it from the worklist payload): the assignee's completion notes, QA's current
 *  rework ask, and the conversation. Tenant-scoped; messages oldest first. */
export async function loadFindingReview(findingId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId },
    select: { id: true, status: true, completionNotes: true, reworkReason: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  const messages = await prisma.findingMessage.findMany({
    where: { findingId, tenantId: session.user.tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, authorId: true, authorName: true, authorRole: true, body: true, createdAt: true },
  });
  return {
    success: true,
    data: {
      status: finding.status,
      completionNotes: finding.completionNotes,
      reworkReason: finding.reworkReason,
      messages: messages.map((m) => ({
        id: m.id, authorId: m.authorId, authorName: m.authorName, authorRole: m.authorRole,
        body: m.body, createdAt: m.createdAt.toISOString(),
      })),
    },
  };
}
