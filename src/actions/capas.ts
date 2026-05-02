"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// ── Schemas ──

const CreateCAPASchema = z.object({
  description: z.string().min(10, "Description must be at least 10 characters"),
  source: z.enum([
    "Gap Assessment",
    "Deviation",
    "FDA 483",
    "Internal Audit",
    "External Audit",
    "Customer Complaint",
    "Other",
  ]),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  owner: z.string().min(1, "Owner is required"),
  dueDate: z.string().min(1, "Due date is required"),
  siteId: z.string().optional(),
  linkedFindingId: z.string().optional(),
  linkedDeviationId: z.string().optional(),
  diGateRequired: z.boolean().optional(),
});

const UpdateCAPASchema = z.object({
  description: z.string().min(10).optional(),
  source: z.string().optional(),
  risk: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.string().optional(),
  rca: z.string().optional(),
  rcaMethod: z.string().optional(),
  correctiveActions: z.string().optional(),
});

const ClearDIGateSchema = z.object({
  notes: z.string().optional(),
});

const RejectSchema = z.object({
  reason: z.string().min(5, "Rejection reason must be at least 5 characters"),
});

// ── Result type ──

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// ── Actions ──

// Build a per-tenant per-year reference like "CAPA-2026-014" by counting
// existing rows in (tenantId, year) and incrementing. Caller MUST run this
// inside the same transaction that inserts the new row, otherwise two
// concurrent creators can read the same count and collide on the unique
// index. The caller-side retry below handles the residual race where the
// transaction itself loses to a concurrent commit.
async function nextCapaReference(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  tenantId: string,
  now: Date,
): Promise<string> {
  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const count = await tx.cAPA.count({
    where: {
      tenantId,
      createdAt: { gte: yearStart, lt: yearEnd },
    },
  });
  return `CAPA-${year}-${String(count + 1).padStart(3, "0")}`;
}

export async function createCAPA(
  input: z.input<typeof CreateCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const {
      linkedFindingId,
      linkedDeviationId,
      diGateRequired,
      dueDate,
      ...rest
    } = parsed.data;

    // Race-safe sequence allocation. Two server actions creating CAPAs at
    // the same instant can both read count=N inside their respective
    // transactions, both compute reference=N+1, and the second commit
    // hits CAPA_reference_key uniqueness. Retry on that specific
    // collision; bubble any other error.
    const MAX_RETRIES = 5;
    let capa: Awaited<ReturnType<typeof prisma.cAPA.create>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        capa = await prisma.$transaction(async (tx) => {
          const reference = await nextCapaReference(tx, session.user.tenantId, new Date());
          return tx.cAPA.create({
            data: {
              ...rest,
              reference,
              tenantId: session.user.tenantId,
              status: "Open",
              createdBy: session.user.name,
              dueDate: new Date(dueDate),
              findingId: linkedFindingId ?? null,
              diGate: diGateRequired ?? false,
              diGateStatus: diGateRequired ? "pending" : null,
            },
          });
        });
        break;
      } catch (err) {
        lastErr = err;
        // P2002 = Prisma unique-constraint violation. Anything else is a
        // real failure — surface immediately rather than silently retry.
        const code = (err as { code?: string } | null)?.code;
        if (code !== "P2002") throw err;
      }
    }
    if (!capa) {
      console.error("[action] createCAPA exhausted reference retries:", lastErr);
      return { success: false, error: "Failed to allocate CAPA reference" };
    }

    if (linkedFindingId) {
      await prisma.finding.update({
        where: { id: linkedFindingId, tenantId: session.user.tenantId },
        data: { status: "In Progress", linkedCAPAId: capa.id },
      });
    }

    if (linkedDeviationId) {
      await prisma.deviation.update({
        where: { id: linkedDeviationId, tenantId: session.user.tenantId },
        data: { linkedCAPAId: capa.id },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_CREATED",
        recordId: capa.id,
        recordTitle: capa.reference
          ? `${capa.reference} — ${parsed.data.description.slice(0, 60)}`
          : parsed.data.description.slice(0, 80),
        newValue: parsed.data.risk,
      },
    });

    revalidatePath("/capa");
    revalidatePath("/gap-assessment");
    revalidatePath("/deviation");
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] createCAPA failed:", err);
    return { success: false, error: "Failed to create CAPA" };
  }
}

export async function updateCAPA(
  id: string,
  input: z.input<typeof UpdateCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...parsed.data,
        ...(parsed.data.dueDate ? { dueDate: new Date(parsed.data.dueDate) } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_UPDATED",
        recordId: id,
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] updateCAPA failed:", err);
    return { success: false, error: "Failed to update CAPA" };
  }
}

export async function clearDIGate(
  id: string,
  input: z.input<typeof ClearDIGateSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();

  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can clear the Data Integrity gate" };
  }

  const parsed = ClearDIGateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }

  try {
    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        diGateStatus: "cleared",
        diGateReviewedBy: session.user.name,
        diGateReviewDate: new Date(),
        diGateNotes: parsed.data.notes ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_DI_GATE_CLEARED",
        recordId: id,
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] clearDIGate failed:", err);
    return { success: false, error: "Failed to clear DI gate" };
  }
}

export async function submitForReview(id: string): Promise<ActionResult> {
  const session = await requireAuth();

  try {
    const existing = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });

    if (!existing) {
      return { success: false, error: "CAPA not found" };
    }

    if (existing.diGate && existing.diGateStatus !== "cleared") {
      return {
        success: false,
        error: "Data Integrity gate must be cleared before submitting for review",
      };
    }

    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "pending_qa_review" },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_SUBMITTED_FOR_REVIEW",
        recordId: id,
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] submitForReview failed:", err);
    return { success: false, error: "Failed to submit for review" };
  }
}

export async function signAndCloseCAPA(id: string): Promise<ActionResult> {
  const session = await requireAuth();

  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can sign and close CAPAs" };
  }

  if (!session.user.gxpSignatory) {
    return { success: false, error: "GxP signatory authority is required to sign and close" };
  }

  try {
    const now = new Date();
    const effectivenessDue = new Date(now);
    effectivenessDue.setDate(effectivenessDue.getDate() + 90);

    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "Closed",
        closedBy: session.user.name,
        closedAt: now,
        effectivenessCheck: true,
        effectivenessDate: effectivenessDue,
      },
    });

    if (capa.findingId) {
      await prisma.finding.update({
        where: { id: capa.findingId, tenantId: session.user.tenantId },
        data: { status: "Closed" },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_CLOSED",
        recordId: id,
        recordTitle: capa.description.slice(0, 80),
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    revalidatePath("/gap-assessment");
    revalidatePath("/");
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] signAndCloseCAPA failed:", err);
    return { success: false, error: "Failed to close CAPA" };
  }
}

export async function rejectCAPA(
  id: string,
  input: z.input<typeof RejectSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();

  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can reject CAPAs" };
  }

  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "rejected",
        diGateNotes: parsed.data.reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_REJECTED",
        recordId: id,
        newValue: parsed.data.reason.slice(0, 200),
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] rejectCAPA failed:", err);
    return { success: false, error: "Failed to reject CAPA" };
  }
}

export async function deleteCAPA(id: string): Promise<ActionResult> {
  const session = await requireAuth();

  try {
    const existing = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });
    if (!existing) {
      return { success: false, error: "CAPA not found" };
    }

    await prisma.cAPA.delete({
      where: { id, tenantId: session.user.tenantId },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_DELETED",
        recordId: id,
      },
    });

    revalidatePath("/capa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteCAPA failed:", err);
    return { success: false, error: "Failed to delete CAPA" };
  }
}
