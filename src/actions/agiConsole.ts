"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

function isAdmin(role: string): boolean {
  return role === "customer_admin" || role === "super_admin";
}

export async function toggleAGIAgent(
  agentName: string,
  enabled: boolean,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Only Admin can toggle AGI agents" };
  }
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "AGI Console",
        action: "AGI_AGENT_TOGGLED",
        recordTitle: agentName,
        newValue: enabled ? "enabled" : "disabled",
      },
    });
    revalidatePath("/agi-console");
    revalidatePath("/settings");
    return { success: true, data: { agentName, enabled } };
  } catch (err) {
    console.error("[action] toggleAGIAgent failed:", err);
    return { success: false, error: "Failed to toggle agent" };
  }
}

export async function logAGISuggestion(input: {
  module: string;
  agentName: string;
  suggestion: string;
  confidence: number;
  recordId?: string;
  accepted?: boolean;
}): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const log = await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: input.module,
        action: input.accepted ? "AI_SUGGESTION_ACCEPTED" : "AI_SUGGESTION_SHOWN",
        recordId: input.recordId ?? null,
        recordTitle: input.agentName,
        newValue: `${input.confidence}% — ${input.suggestion.slice(0, 100)}`,
      },
    });
    return { success: true, data: log };
  } catch (err) {
    console.error("[action] logAGISuggestion failed:", err);
    return { success: false, error: "Failed to log suggestion" };
  }
}
