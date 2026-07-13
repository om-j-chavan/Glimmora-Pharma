"use server";

/**
 * Server Actions for the Risk Register (Governance Phase 1).
 *
 * Replaces the retired src/actions/raid.ts. Follows the createFinding reference
 * pattern: requireAuth → Zod → resolveUserFk → role gate → Prisma mutate + audit
 * in ONE transaction → revalidate → return (never throw).
 *
 * PERMISSION MODEL (the single GOVERNANCE_MANAGE_ROLES set — the old private
 * RAID_MANAGE_ROLES is gone):
 *   • createRisk  — any non-viewer (`canCreateRisk`). Seat roles CAN raise a risk.
 *   • updateRisk  — manage role, OR the risk's own creator/owner (`canEditRisk`).
 *   • archiveRisk — manage role ONLY (`canManageGovernance`), for any risk.
 *   • documents   — upload/remove follow `canEditRisk` (whoever may edit the risk).
 * Governance is NON-GxP, so `requireGxPAuthor` does not apply: super_admin is a
 * legitimate manager here.
 *
 * VISIBILITY: every action re-reads the target risk through
 * `riskVisibilityWhere(session)`, so a seat user cannot mutate — or even confirm
 * the existence of — a risk they may not see. Not-visible and not-found are
 * indistinguishable to the caller (no id-probing oracle).
 */

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { canCreateRisk, canEditRisk, canManageGovernance } from "@/lib/permissions/roleSets";
import { riskVisibilityWhere } from "@/lib/queries/risks";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import { buildReferencePrefix, generateReference, isReferenceConflict } from "@/lib/reference";
import {
  RISK_CATEGORIES,
  RISK_SEVERITIES,
  RISK_LIKELIHOODS,
  RISK_STATUSES,
  RISK_DOC_CATEGORIES,
  RISK_SOURCE_MODULE,
  RISK_LINKED_MODULE,
  isLegalRiskTransition,
  type RiskStatus,
} from "@/constants/risk";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/** Shared, generic denial — never reveals whether the id exists. */
const NOT_FOUND = "Risk not found." as const;

/* ── Validation ──────────────────────────────────────────────────────────── */

const CreateRiskSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters"),
  description: z.string().trim().min(5, "Description must be at least 5 characters"),
  category: z.enum(RISK_CATEGORIES),
  severity: z.enum(RISK_SEVERITIES),
  likelihood: z.enum(RISK_LIKELIHOODS),
  ownerId: z.string().min(1, "Owner is required"),
  siteId: z.string().optional().nullable(),
  targetDate: z.string().optional().nullable(),
  mitigationPlan: z.string().optional().nullable(),
});

/**
 * Update accepts the same fields plus `status`. It deliberately does NOT accept
 * `convertedToType` / `convertedToId` — those are Phase 2 and stay unwritten.
 */
const UpdateRiskSchema = CreateRiskSchema.partial().extend({
  status: z.enum(RISK_STATUSES).optional(),
  reason: z.string().optional(),
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Owner must be a real, active, non-viewer user in the CALLER's tenant. */
async function assertOwnerInTenant(ownerId: string, tenantId: string): Promise<boolean> {
  const u = await prisma.user.findFirst({
    where: { id: ownerId, tenantId, isActive: true, role: { not: "viewer" } },
    select: { id: true },
  });
  return !!u;
}

/** Site (when supplied) must belong to the caller's tenant. */
async function resolveSiteCode(siteId: string | null | undefined, tenantId: string) {
  if (!siteId) return { ok: true as const, code: null as string | null };
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { code: true } });
  if (!site) return { ok: false as const, code: null };
  return { ok: true as const, code: site.code ?? null };
}

/* ── CREATE ──────────────────────────────────────────────────────────────── */

export async function createRisk(input: z.input<typeof CreateRiskSchema>): Promise<ActionResult> {
  const session = await requireAuth();

  const parsed = CreateRiskSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // CREATE gate: any non-viewer. A seat/functional role may raise a risk.
  if (!canCreateRisk(session.user.role)) {
    return { success: false, error: "Your role cannot raise a risk." };
  }

  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);

  if (!(await assertOwnerInTenant(parsed.data.ownerId, tenantId))) {
    return { success: false, error: "Selected owner is not an active user in your organization." };
  }
  const site = await resolveSiteCode(parsed.data.siteId, tenantId);
  if (!site.ok) return { success: false, error: "Selected site is not in your organization." };

  // Site-scoped reference: RISK-<SITE>-<YEAR>-<NNN>, falling back to
  // RISK-<YEAR>-<NNN> when the risk is tenant-level or the site has no code.
  const referencePrefix = buildReferencePrefix("RISK", site.code);

  const MAX_REF_RETRIES = 5;
  let created: { id: string; reference: string | null } | null = null;
  let lastRefErr: unknown = null;

  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    try {
      created = await prisma.$transaction(async (tx) => {
        const reference = await generateReference(referencePrefix, new Date(), async (prefix, year) => {
          const row = await tx.risk.findFirst({
            where: { reference: { startsWith: `${prefix}-${year}-` } },
            orderBy: { reference: "desc" },
            select: { reference: true },
          });
          return row?.reference ?? null;
        });

        const risk = await tx.risk.create({
          data: {
            reference,
            tenantId,
            siteId: parsed.data.siteId || null,
            title: parsed.data.title,
            description: parsed.data.description,
            category: parsed.data.category,
            severity: parsed.data.severity,
            likelihood: parsed.data.likelihood,
            status: "Open",
            ownerId: parsed.data.ownerId,
            // Record-visibility dual-write: the id FK is authoritative, the
            // name string is for display. Stamped from the SESSION, never the
            // client payload, so a creator can't be spoofed.
            createdById: actor.userId,
            createdBy: session.user.name,
            targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
            mitigationPlan: parsed.data.mitigationPlan || null,
            // convertedToType / convertedToId intentionally UNSET — Phase 2 owns them.
          },
          select: { id: true, reference: true },
        });

        // Audit inside the SAME transaction (ALCOA+): a risk can never exist
        // without its RISK_CREATED row. A reference retry rolls both back.
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "Governance",
            action: "RISK_CREATED",
            recordId: risk.id,
            recordTitle: `${risk.reference} — ${parsed.data.title}`,
            newValue: `${parsed.data.category} / ${parsed.data.severity}`,
          },
        });
        return risk;
      });
      break;
    } catch (err) {
      lastRefErr = err;
      if (isReferenceConflict(err)) continue; // another tx took our number — retry
      console.error("[action] createRisk failed:", err);
      return { success: false, error: "Failed to create risk." };
    }
  }

  if (!created) {
    console.error("[action] createRisk exhausted reference retries:", lastRefErr);
    return { success: false, error: "Failed to allocate a risk reference. Please retry." };
  }

  revalidatePath("/governance");
  return { success: true, data: created };
}

/* ── UPDATE ──────────────────────────────────────────────────────────────── */

export async function updateRisk(
  id: string,
  input: z.input<typeof UpdateRiskSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();

  const parsed = UpdateRiskSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);

  // Visibility-scoped read: a risk the caller cannot SEE is "not found" — no
  // existence oracle, and no mutation path around the read gate.
  const existing = await prisma.risk.findFirst({
    where: { id, tenantId, deletedAt: null, ...riskVisibilityWhere(session) },
    select: { id: true, reference: true, status: true, createdById: true, ownerId: true },
  });
  if (!existing) return { success: false, error: NOT_FOUND };

  // EDIT gate: manage role, or the creator/owner of THIS risk.
  if (!canEditRisk(session.user.role, actor.userId, existing)) {
    return { success: false, error: "You do not have permission to edit this risk." };
  }

  // A Converted risk is terminal and immutable in Phase 1.
  if (existing.status === "Converted") {
    return { success: false, error: "A converted risk can no longer be edited." };
  }

  if (parsed.data.status && !isLegalRiskTransition(existing.status as RiskStatus, parsed.data.status)) {
    return {
      success: false,
      error: `Cannot move a risk from ${existing.status} to ${parsed.data.status}.`,
    };
  }
  // Phase 1 never sets Converted — only Phase 2's convert action may.
  if (parsed.data.status === "Converted") {
    return { success: false, error: "Conversion is not available yet." };
  }

  if (parsed.data.ownerId && !(await assertOwnerInTenant(parsed.data.ownerId, tenantId))) {
    return { success: false, error: "Selected owner is not an active user in your organization." };
  }
  if (parsed.data.siteId !== undefined) {
    const site = await resolveSiteCode(parsed.data.siteId, tenantId);
    if (!site.ok) return { success: false, error: "Selected site is not in your organization." };
  }

  const { targetDate, reason, ...rest } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.risk.update({
        where: { id, tenantId },
        data: {
          ...rest,
          ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: parsed.data.status && parsed.data.status !== existing.status ? "RISK_STATUS_CHANGED" : "RISK_UPDATED",
          recordId: id,
          recordTitle: existing.reference ?? id,
          oldValue: existing.status,
          newValue: [parsed.data.status ?? existing.status, reason?.trim()].filter(Boolean).join(" — ").slice(0, 200),
        },
      });
    });
  } catch (err) {
    console.error("[action] updateRisk failed:", err);
    return { success: false, error: "Failed to update risk." };
  }

  revalidatePath("/governance");
  revalidatePath(`/governance/risks/${id}`);
  return { success: true, data: { id } };
}

/* ── ARCHIVE (soft delete) ───────────────────────────────────────────────── */

/**
 * MANAGE-ONLY, for ANY risk. A seat role that created or owns the risk may edit
 * it but may NOT archive it — archiving is the irreversible-looking action, so
 * it stays with GOVERNANCE_MANAGE_ROLES. Soft delete: the row is retained
 * (ALCOA+) and simply drops out of every read via `deletedAt: null`.
 */
export async function archiveRisk(id: string, reason?: string): Promise<ActionResult> {
  const session = await requireAuth();
  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);

  // ARCHIVE gate FIRST — a non-manage caller is rejected before any lookup, so
  // the action cannot be used to probe which ids exist.
  if (!canManageGovernance(session.user.role)) {
    return { success: false, error: "You do not have permission to archive risks." };
  }

  const existing = await prisma.risk.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: { id: true, reference: true, title: true },
  });
  if (!existing) return { success: false, error: NOT_FOUND };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.risk.update({
        where: { id, tenantId },
        data: {
          deletedAt: new Date(),
          deletedBy: session.user.name,
          deletionReason: reason?.trim() || null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: "RISK_ARCHIVED",
          recordId: id,
          recordTitle: `${existing.reference ?? id} — ${existing.title}`,
          newValue: reason?.trim()?.slice(0, 200) ?? null,
        },
      });
    });
  } catch (err) {
    console.error("[action] archiveRisk failed:", err);
    return { success: false, error: "Failed to archive risk." };
  }

  revalidatePath("/governance");
  return { success: true, data: null };
}

/* ── DOCUMENTS ───────────────────────────────────────────────────────────── */

const RISK_DOC_MAX_MB = Number(process.env.EVIDENCE_MAX_FILE_MB ?? "10");
const RISK_DOC_MAX_BYTES = RISK_DOC_MAX_MB * 1024 * 1024;
const RISK_DOC_ALLOWED_MIME = new Set([
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
 * Attach one supporting document to a risk. Whoever may EDIT the risk may
 * attach to it (`canEditRisk`), which keeps the doc gate in lockstep with the
 * record gate. The visibility-scoped read means an invisible risk is untouchable.
 */
export async function uploadRiskDocument(
  riskId: string,
  formData: FormData,
  category?: string,
): Promise<ActionResult<{ fileName: string }>> {
  const session = await requireAuth();
  const tenantId = session.user.tenantId;

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "No file provided." };
  if (file.size === 0) return { success: false, error: "File is empty." };
  if (file.size > RISK_DOC_MAX_BYTES) {
    return { success: false, error: `File exceeds the ${RISK_DOC_MAX_MB} MB limit.` };
  }
  if (!RISK_DOC_ALLOWED_MIME.has(file.type)) {
    return { success: false, error: "File type not allowed." };
  }

  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);
  const risk = await prisma.risk.findFirst({
    where: { id: riskId, tenantId, deletedAt: null, ...riskVisibilityWhere(session) },
    select: { id: true, reference: true, siteId: true, createdById: true, ownerId: true, status: true },
  });
  if (!risk) return { success: false, error: NOT_FOUND };

  if (!canEditRisk(session.user.role, actor.userId, risk)) {
    return { success: false, error: "You do not have permission to add documents to this risk." };
  }
  if (risk.status === "Converted") {
    return { success: false, error: "A converted risk can no longer be modified." };
  }

  const cat = category && (RISK_DOC_CATEGORIES as readonly string[]).includes(category) ? category : null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const sanitized = sanitizeFilename(file.name);
    const storageKey = `risks/${riskId}/${contentHash}-${sanitized}`;
    await fileStorage.save(storageKey, buffer, file.type);

    const sizeKb = Math.max(1, Math.round(file.size / 1024));

    await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId,
          fileName: sanitized,
          fileType: file.type,
          fileSize: `${sizeKb} KB`,
          version: "v1.0",
          status: "draft",
          uploadedBy: session.user.name,
          uploadedById: actor.userId,
          uploadedAt: new Date(),
          description: `Supporting document for ${risk.reference ?? riskId}`,
          // Dual-write BOTH pointer pairs (legacy + new), exactly as Gap does.
          linkedModule: RISK_LINKED_MODULE,
          linkedRecordId: riskId,
          sourceModule: RISK_SOURCE_MODULE,
          sourceId: riskId,
          siteId: risk.siteId,
          category: cat,
          storageKey,
          sha256: contentHash,
          originalFileName: file.name,
          fileExtension: sanitized.includes(".") ? sanitized.split(".").pop() ?? null : null,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: "RISK_DOCUMENT_ADDED",
          recordId: riskId,
          recordTitle: risk.reference ?? riskId,
          newValue: `${sanitized}${cat ? ` (${cat})` : ""}`,
        },
      });
      return doc;
    });
  } catch (err) {
    console.error("[action] uploadRiskDocument failed:", err);
    return { success: false, error: "Failed to upload document." };
  }

  revalidatePath(`/governance/risks/${riskId}`);
  return { success: true, data: { fileName: file.name } };
}

/** Remove (soft-delete) one of a risk's supporting documents. Same gate as upload. */
export async function removeRiskDocument(riskId: string, docId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);

  const risk = await prisma.risk.findFirst({
    where: { id: riskId, tenantId, deletedAt: null, ...riskVisibilityWhere(session) },
    select: { id: true, reference: true, createdById: true, ownerId: true },
  });
  if (!risk) return { success: false, error: NOT_FOUND };

  if (!canEditRisk(session.user.role, actor.userId, risk)) {
    return { success: false, error: "You do not have permission to remove this document." };
  }

  // Scope the doc to THIS risk — a valid doc id from another record is rejected.
  const doc = await prisma.document.findFirst({
    where: { id: docId, tenantId, sourceModule: RISK_SOURCE_MODULE, sourceId: riskId, deletedAt: null },
    select: { id: true, fileName: true },
  });
  if (!doc) return { success: false, error: "Document not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: docId },
        data: { deletedAt: new Date(), deletedBy: session.user.name },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: "RISK_DOCUMENT_REMOVED",
          recordId: riskId,
          recordTitle: risk.reference ?? riskId,
          oldValue: doc.fileName,
        },
      });
    });
  } catch (err) {
    console.error("[action] removeRiskDocument failed:", err);
    return { success: false, error: "Failed to remove document." };
  }

  revalidatePath(`/governance/risks/${riskId}`);
  return { success: true, data: null };
}
