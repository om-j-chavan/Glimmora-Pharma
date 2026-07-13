"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { AGI_MANAGE_ROLES } from "@/lib/permissions/roleSets";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

// Shared role-set so the client UI mirrors the same gate (one definition).
function isAdmin(role: string): boolean {
  return AGI_MANAGE_ROLES.includes(role);
}

export async function toggleAGIAgent(
  agentName: string,
  enabled: boolean,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isAdmin(session.user.role)) {
    return { success: false, error: "Only Admin can toggle AGI agents" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
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
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const log = await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
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
