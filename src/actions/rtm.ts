"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateRTMSchema = z.object({
  systemId: z.string().min(1),
  ursId: z.string().min(1),
  ursRequirement: z.string().min(10),
  ursRegulation: z.string().optional(),
  ursPriority: z.enum(["critical", "high", "medium"]).default("high"),
  fsReference: z.string().optional(),
  dsReference: z.string().optional(),
  iqTestId: z.string().optional(),
  oqTestId: z.string().optional(),
  pqTestId: z.string().optional(),
});

const UpdateRTMSchema = z.object({
  iqResult: z.enum(["pass", "fail", "pending", "na"]).optional(),
  oqResult: z.enum(["pass", "fail", "pending", "na"]).optional(),
  pqResult: z.enum(["pass", "fail", "pending", "na"]).optional(),
  evidenceStatus: z.enum(["complete", "partial", "missing"]).optional(),
  traceabilityStatus: z.enum(["complete", "partial", "broken"]).optional(),
});

export async function createRTMEntry(
  input: z.input<typeof CreateRTMSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateRTMSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const entry = await prisma.rTMEntry.create({
      data: {
        ...parsed.data,
        fsStatus: parsed.data.fsReference ? "linked" : "missing",
        dsStatus: parsed.data.dsReference ? "linked" : "na",
        evidenceStatus: "missing",
        traceabilityStatus: "broken",
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "RTM_ENTRY_CREATED",
        recordId: entry.id,
        recordTitle: parsed.data.ursId,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: entry };
  } catch (err) {
    console.error("[action] createRTMEntry failed:", err);
    return { success: false, error: "Failed to create RTM entry" };
  }
}

export async function updateRTMEntry(
  id: string,
  input: z.input<typeof UpdateRTMSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateRTMSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.rTMEntry.findFirst({
      where: { id, system: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const entry = await prisma.rTMEntry.update({
      where: { id },
      data: parsed.data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CSV/CSA",
        action: "RTM_ENTRY_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: entry };
  } catch (err) {
    console.error("[action] updateRTMEntry failed:", err);
    return { success: false, error: "Failed to update RTM entry" };
  }
}
