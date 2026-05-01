"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateRAIDSchema = z.object({
  type: z.enum(["Risk", "Action", "Issue", "Decision"]),
  title: z.string().min(3),
  description: z.string().min(5),
  priority: z.enum(["Critical", "High", "Medium", "Low"]),
  owner: z.string().min(1),
  dueDate: z.string().optional(),
  impact: z.string().optional(),
  mitigation: z.string().optional(),
});

const UpdateRAIDSchema = CreateRAIDSchema.partial();

export async function createRAIDItem(
  input: z.input<typeof CreateRAIDSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateRAIDSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const item = await prisma.rAIDItem.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
        status: "Open",
        createdBy: session.user.name,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Governance",
        action: "RAID_ITEM_CREATED",
        recordId: item.id,
        recordTitle: parsed.data.title,
        newValue: parsed.data.priority,
      },
    });
    revalidatePath("/governance");
    return { success: true, data: item };
  } catch (err) {
    console.error("[action] createRAIDItem failed:", err);
    return { success: false, error: "Failed to create RAID item" };
  }
}

export async function updateRAIDItem(
  id: string,
  input: z.input<typeof UpdateRAIDSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateRAIDSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const { dueDate, ...rest } = parsed.data;
    const item = await prisma.rAIDItem.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...rest,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Governance",
        action: "RAID_ITEM_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/governance");
    return { success: true, data: item };
  } catch (err) {
    console.error("[action] updateRAIDItem failed:", err);
    return { success: false, error: "Failed to update RAID item" };
  }
}

export async function closeRAIDItem(id: string, resolutionNote: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    // Schema has no resolutionNote field — fold it into mitigation
    // and capture the original text in the audit log.
    const item = await prisma.rAIDItem.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "Closed",
        closedBy: session.user.name,
        closedAt: new Date(),
        mitigation: resolutionNote,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Governance",
        action: "RAID_ITEM_CLOSED",
        recordId: id,
        newValue: resolutionNote.slice(0, 200),
      },
    });
    revalidatePath("/governance");
    return { success: true, data: item };
  } catch (err) {
    console.error("[action] closeRAIDItem failed:", err);
    return { success: false, error: "Failed to close RAID item" };
  }
}

export async function reopenRAIDItem(id: string, reason: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const item = await prisma.rAIDItem.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "Open",
        reopenedBy: session.user.name,
        reopenedAt: new Date(),
        reopenReason: reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Governance",
        action: "RAID_ITEM_REOPENED",
        recordId: id,
        newValue: reason.slice(0, 200),
      },
    });
    revalidatePath("/governance");
    return { success: true, data: item };
  } catch (err) {
    console.error("[action] reopenRAIDItem failed:", err);
    return { success: false, error: "Failed to reopen RAID item" };
  }
}

export async function deleteRAIDItem(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    await prisma.rAIDItem.delete({
      where: { id, tenantId: session.user.tenantId },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "Governance",
        action: "RAID_ITEM_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/governance");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteRAIDItem failed:", err);
    return { success: false, error: "Failed to delete RAID item" };
  }
}
