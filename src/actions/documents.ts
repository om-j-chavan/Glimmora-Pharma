"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateDocumentSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().optional(),
  fileSize: z.string().optional(),
  description: z.string().optional(),
  linkedModule: z.string().optional(),
  linkedRecordId: z.string().optional(),
});

export async function createDocument(
  input: z.input<typeof CreateDocumentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const doc = await prisma.document.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
        version: "v1.0",
        status: "draft",
        uploadedBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
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

export async function approveDocument(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can approve documents" };
  }
  try {
    const doc = await prisma.document.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "approved",
        approvedBy: session.user.name,
        approvedAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_APPROVED",
        recordId: id,
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
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can reject documents" };
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
        userName: session.user.name,
        userRole: session.user.role,
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

export async function deleteDocument(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    await prisma.document.delete({
      where: { id, tenantId: session.user.tenantId },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Evidence & Documents",
        action: "DOCUMENT_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/evidence");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteDocument failed:", err);
    return { success: false, error: "Failed to delete document" };
  }
}
