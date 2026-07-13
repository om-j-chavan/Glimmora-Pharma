"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import { DOCUMENT_APPROVE_ROLES, COMPLIANCE_AUTHOR_ROLES, ADMIN_DELETE_ROLES } from "@/lib/permissions/roleSets";
import { EVIDENCE_ORIGIN, canEditDocument, isHereOrigin } from "@/lib/permissions/documents";
import {
  canonicalizeDocumentApprovalContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import { readSigningProvenance } from "@/actions/capas/_shared";
import { SIGNING_AUDIT_MODULE } from "@/actions/capas/_types";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const ApproveDocumentSchema = z.object({
  password: z.string().min(1, "Password is required to sign"),
});

const CreateDocumentSchema = z.object({
  fileName: z.string().min(1),
  description: z.string().optional(),
  // Simplified Add-Document form maps its single "Type" select to `category`.
  category: z.string().optional(),
  linkedModule: z.string().optional(),
  linkedRecordId: z.string().optional(),
});

// File upload limits — mirrors src/actions/evidence.ts so the standalone
// document upload uses the SAME allowlist, size cap, and retention as CAPA
// evidence (those consts can't be exported from a "use server" module).
const DOC_MAX_FILE_MB = Number(process.env.EVIDENCE_MAX_FILE_MB ?? "10");
const DOC_MAX_FILE_BYTES = DOC_MAX_FILE_MB * 1024 * 1024;
const DOC_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
]);
const DOC_RETENTION_YEARS = 7;
function nowPlusYears(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/**
 * Create a Document. Accepts FormData so an optional file can be uploaded via
 * the SAME storage pipeline as CAPA evidence: bytes → fileStorage.save() →
 * Document.{storageKey,sha256,fileSize,fileType,…,retainUntil}. Metadata-only
 * (or URL-linked) documents are still allowed — the file is optional.
 *
 * FormData fields: fileName, description, linkedModule, linkedRecordId, file?.
 */
export async function createDocument(
  formData: FormData,
  opts?: { bypassAuthorGate?: boolean; sourceModule?: string },
): Promise<ActionResult> {
  const session = await requireAuth();
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const parsed = CreateDocumentSchema.safeParse({
    fileName: get("fileName") ?? "",
    description: get("description"),
    category: get("category"),
    linkedModule: get("linkedModule"),
    linkedRecordId: get("linkedRecordId"),
  });
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Phase 6 cleanup FIX 3 — createDocument was requireAuth-only (any
  // authenticated user, incl. viewer, could create). Gate on the documents/
  // evidence author set the UI already assumes (usePermissions("evidence")
  // .canCreate = has(COMPLIANCE_AUTHOR_ROLES)). Viewer is excluded.
  // Stage 4 (deviation redesign) — trusted server callers (e.g.
  // attachDeviationTaskDocument) that have ALREADY authorized the actor via a
  // task-assignment predicate (isAssignedToTask) may pass bypassAuthorGate so a
  // non-author ASSIGNEE (e.g. operations_head) can upload task evidence. The
  // super_admin bright-line (requireGxPAuthor) and the viewer stop below still
  // apply. Server-only — no client passes this option.
  if (!opts?.bypassAuthorGate && !COMPLIANCE_AUTHOR_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit creating documents." };
  }
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot create documents." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never authors GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // ── FILE-OR-LINK: a direct Evidence & Documents upload must provide EITHER a
  // file OR a document link (URL) — at least one, not both required. A link-only
  // doc is valid (no file). Trusted server callers (bypassAuthorGate) manage
  // their own inputs. ──
  const rawLink = get("linkUrl");
  let linkUrl: string | null = null;
  if (rawLink) {
    let ok = false;
    try {
      const u = new URL(rawLink.trim());
      ok = u.protocol === "http:" || u.protocol === "https:";
    } catch { /* not a URL */ }
    if (!ok) {
      return { success: false, error: "Enter a valid http(s) link.", fieldErrors: { linkUrl: ["Must be a valid http(s) URL."] } };
    }
    linkUrl = rawLink.trim();
  }

  let fileFields: Record<string, unknown> = {};
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !linkUrl && !opts?.bypassAuthorGate) {
    return { success: false, error: "Provide a file or a document link.", fieldErrors: { file: ["Attach a file or provide a document link."] } };
  }
  if (hasFile && file instanceof File) {
    if (file.size > DOC_MAX_FILE_BYTES) {
      return { success: false, error: `File exceeds ${DOC_MAX_FILE_MB} MB limit` };
    }
    if (!DOC_ALLOWED_MIME_TYPES.has(file.type)) {
      return { success: false, error: "FILE_TYPE_NOT_ALLOWED" };
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const sanitized = sanitizeFilename(file.name);
      const dot = sanitized.lastIndexOf(".");
      const ext = dot > 0 ? sanitized.slice(dot).toLowerCase() : "";
      // Hash-prefixed key — idempotent on duplicate uploads of the same bytes.
      const storageKey = `documents/${session.user.tenantId}/${sha256}-${sanitized}`;
      const { url } = await fileStorage.save(storageKey, buffer, file.type);
      fileFields = {
        fileType: file.type,
        fileSize: String(file.size),
        sha256,
        storageKey: url,
        originalFileName: sanitized,
        fileExtension: ext,
        retainUntil: nowPlusYears(DOC_RETENTION_YEARS),
        uploadedAt: new Date(),
      };
    } catch (err) {
      console.error("[action] createDocument file save failed:", err);
      return { success: false, error: "Failed to store the uploaded file" };
    }
  }

  // Origin stamp: a direct upload here is "evidence" (editable/deletable);
  // trusted server callers default to their linked module (locked mirror).
  const sourceModule = opts?.sourceModule ?? (opts?.bypassAuthorGate ? (parsed.data.linkedModule ?? "linked") : EVIDENCE_ORIGIN);
  try {
    const doc = await prisma.document.create({
      data: {
        ...parsed.data,
        ...fileFields,
        tenantId: session.user.tenantId,
        version: "v1.0",
        status: "draft",
        uploadedBy: session.user.name,
        // Authoritative uploader identity (never trusted from the client) +
        // origin marker — the two server-enforced permission boundaries.
        uploadedById: actor.userId,
        sourceModule,
        // File-OR-link: persist the external link (null when file-only).
        linkUrl,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_UPLOADED",
        recordId: doc.id,
        recordTitle: parsed.data.fileName,
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: doc };
  } catch (err) {
    console.error("[action] createDocument failed:", err);
    return { success: false, error: "Failed to upload document" };
  }
}

export async function approveDocument(
  id: string,
  input: z.input<typeof ApproveDocumentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ApproveDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (!DOCUMENT_APPROVE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can approve documents" };
  }

  const existing = await prisma.document.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, fileName: true, version: true },
  });
  if (!existing) return { success: false, error: "Document not found" };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never signs GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // §11.200(a)(1)(ii) — re-authenticate at the moment of signing.
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
        recordTitle: existing.fileName,
        newValue: JSON.stringify({
          recordType: "DOCUMENT_APPROVAL",
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
    const approvedAt = new Date();
    const canonicalContent = canonicalizeDocumentApprovalContent({
      docId: existing.id,
      title: existing.fileName,
      version: existing.version,
      approvedAt,
      approverId: session.user.id,
      approverRole: session.user.role,
    });
    const contentHash = computeContentHash(canonicalContent);
    const contentSummary = `Document ${existing.fileName} v${existing.version} approved by ${session.user.name} (${session.user.role})`;
    const provenance = await readSigningProvenance();

    const { doc, signedRecord } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "DOCUMENT_APPROVAL",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: "Approved",
          contentHash,
          contentSummary,
          passwordVerifiedAt: approvedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      const updated = await tx.document.update({
        where: { id, tenantId: session.user.tenantId },
        data: {
          status: "approved",
          approvedBy: session.user.name,
          approvedAt,
          approvalSignatureId: sig.id,
        },
      });
      return { doc: updated, signedRecord: sig };
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_APPROVED",
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
        action: "DOCUMENT_APPROVAL_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.fileName,
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: "Approved",
          docId: existing.id,
          version: existing.version,
        }),
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: doc };
  } catch (err) {
    console.error("[action] approveDocument failed:", err);
    return { success: false, error: "Failed to approve document" };
  }
}

export async function rejectDocument(id: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!DOCUMENT_APPROVE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can reject documents" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never acts on GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    // Schema has no rejectedBy/rejectionReason — store reason in description
    // and flip status; full audit trail captures the rejection event.
    const doc = await prisma.document.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "rejected" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_REJECTED",
        recordId: id,
        newValue: reason.slice(0, 200),
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: doc };
  } catch (err) {
    console.error("[action] rejectDocument failed:", err);
    return { success: false, error: "Failed to reject document" };
  }
}

export async function deleteDocument(id: string, reason?: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never deletes GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // Delete restricted to qa_head + customer_admin (app-wide GxP delete policy,
  // mirrors FDA483_DELETE_ROLES). Viewer and other roles blocked server-side.
  if (
    !DOCUMENT_APPROVE_ROLES.includes(session.user.role) &&
    !ADMIN_DELETE_ROLES.includes(session.user.role)
  ) {
    return { success: false, error: "Only a QA Head or an administrator can delete documents." };
  }
  const existing = await prisma.document.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, fileName: true, sourceModule: true },
  });
  if (!existing) return { success: false, error: "Document not found" };
  // ORIGIN boundary — a mirror of an other-module document must never be
  // deleted here (it would corrupt the source module). Server-rejected
  // regardless of the UI.
  if (!isHereOrigin(existing.sourceModule)) {
    return { success: false, error: "This document originates in another module and is read-only here." };
  }
  try {
    // Soft-delete (Part 11 retention) — set the existing deletedAt/deletedBy/
    // deletionReason columns instead of destroying the row. List queries filter
    // deletedAt IS NULL, so it disappears from views but stays retained.
    await prisma.document.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        deletedAt: new Date(),
        deletedBy: session.user.name,
        deletionReason: reason ? reason.slice(0, 200) : null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_DELETED",
        recordId: id,
        recordTitle: existing.fileName,
        newValue: reason ? reason.slice(0, 200) : null,
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteDocument failed:", err);
    return { success: false, error: "Failed to delete document" };
  }
}

const UpdateDocumentSchema = z.object({
  fileName: z.string().min(1, "Title is required").optional(),
  description: z.string().optional(),
  category: z.string().optional(),
});

/**
 * Edit a here-uploaded document's metadata (title / type / description).
 * SERVER-ENFORCED permission boundary: requires a compliance-author role, the
 * super_admin GxP bright line, tenant scope, AND here-origin — a foreign-origin
 * mirror is rejected (editing it here would corrupt the source module).
 * Audit-first: DOCUMENT_UPDATED with before/after. The immutable key columns
 * (uploader, origin, storage) are never touched.
 */
export async function updateDocument(
  id: string,
  input: z.input<typeof UpdateDocumentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const existing = await prisma.document.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, fileName: true, description: true, category: true, sourceModule: true },
  });
  if (!existing) return { success: false, error: "Document not found" };
  // Role + origin gate — the single server authority (mirrors canEditDocument).
  if (!canEditDocument(session.user.role, existing.sourceModule)) {
    return {
      success: false,
      error: isHereOrigin(existing.sourceModule)
        ? "Your role does not permit editing documents."
        : "This document originates in another module and is read-only here.",
    };
  }
  const fileName = parsed.data.fileName?.trim() || existing.fileName;
  const description = parsed.data.description?.trim() ?? existing.description ?? null;
  const category = parsed.data.category?.trim() ?? existing.category ?? null;
  if (fileName === existing.fileName && description === (existing.description ?? null) && category === (existing.category ?? null)) {
    return { success: true, data: { id, unchanged: true } };
  }
  try {
    const doc = await prisma.document.update({
      where: { id, tenantId: session.user.tenantId },
      data: { fileName, description, category },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_UPDATED",
        recordId: id,
        recordTitle: fileName,
        oldValue: JSON.stringify({ fileName: existing.fileName, description: existing.description ?? "—", category: existing.category ?? "—" }),
        newValue: JSON.stringify({ fileName, description: description ?? "—", category: category ?? "—" }),
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: doc };
  } catch (err) {
    console.error("[action] updateDocument failed:", err);
    return { success: false, error: "Failed to update document" };
  }
}

export async function restoreDocument(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  // super_admin bright line — platform admin never acts on GxP records.
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (
    !DOCUMENT_APPROVE_ROLES.includes(session.user.role) &&
    !ADMIN_DELETE_ROLES.includes(session.user.role)
  ) {
    return { success: false, error: "Only a QA Head or an administrator can restore documents." };
  }
  const existing = await prisma.document.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, fileName: true, deletedAt: true },
  });
  if (!existing) return { success: false, error: "Document not found" };
  if (!existing.deletedAt) return { success: false, error: "Document is not deleted." };
  try {
    await prisma.document.update({
      where: { id, tenantId: session.user.tenantId },
      data: { deletedAt: null, deletedBy: null, deletionReason: null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_RESTORED",
        recordId: id,
        recordTitle: existing.fileName,
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] restoreDocument failed:", err);
    return { success: false, error: "Failed to restore document" };
  }
}
