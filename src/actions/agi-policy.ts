"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { sanitizeServerError } from "@/lib/errors";
import {
  AGI_AGENT_KEYS,
  DEFAULT_AGI_AGENTS,
  DEFAULT_AGI_CONFIDENCE,
  canEditAgiPolicy,
  computeAgiMode,
  type AgiAgentKey,
  type AgiAgents,
  type AgiPolicy,
} from "@/lib/permissions/agiPolicy";

/**
 * Read and write the tenant's AI agent policy.
 *
 * This replaces a browser-local Redux slice that no server ever read — so
 * "disabling" an agent disabled nothing, every user had a private copy in
 * localStorage, and no change was recorded anywhere. The policy is now one row
 * per tenant, editable only by customer_admin / qa_head, audited on every
 * change, and enforced in app/api/ai-proxy/[...path]/route.ts.
 */

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Column name for each agent key. Kept explicit rather than derived so a
 *  renamed key fails to compile instead of silently reading the wrong column. */
const AGENT_COLUMNS: Record<AgiAgentKey, keyof AgiPolicyRow> = {
  capa: "capaEnabled",
  deviation: "deviationEnabled",
  fda483: "fda483Enabled",
  drift: "driftEnabled",
  regulatory: "regulatoryEnabled",
  supplier: "supplierEnabled",
};

interface AgiPolicyRow {
  capaEnabled: boolean;
  deviationEnabled: boolean;
  fda483Enabled: boolean;
  driftEnabled: boolean;
  regulatoryEnabled: boolean;
  supplierEnabled: boolean;
  confidence: number;
}

function rowToAgents(row: AgiPolicyRow): AgiAgents {
  return AGI_AGENT_KEYS.reduce((acc, key) => {
    acc[key] = row[AGENT_COLUMNS[key]] as boolean;
    return acc;
  }, {} as AgiAgents);
}

const UpdateSchema = z.object({
  agents: z
    .object({
      capa: z.boolean(),
      deviation: z.boolean(),
      fda483: z.boolean(),
      drift: z.boolean(),
      regulatory: z.boolean(),
      supplier: z.boolean(),
    })
    .partial()
    .optional(),
  confidence: z.number().int().min(0).max(100).optional(),
});

/**
 * The effective policy for a tenant, creating no row.
 *
 * Server-side callers (the proxy, page loaders) use this. A tenant with no row
 * gets the defaults, which match the column defaults exactly — so first write
 * changes nothing that was not explicitly changed.
 */
export async function getAgiPolicyForTenant(tenantId: string): Promise<AgiPolicy> {
  try {
    const row = await prisma.tenantAgiPolicy.findUnique({
      where: { tenantId },
      select: {
        capaEnabled: true,
        deviationEnabled: true,
        fda483Enabled: true,
        driftEnabled: true,
        regulatoryEnabled: true,
        supplierEnabled: true,
        confidence: true,
      },
    });
    const agents = row ? rowToAgents(row) : { ...DEFAULT_AGI_AGENTS };
    return {
      agents,
      confidence: row?.confidence ?? DEFAULT_AGI_CONFIDENCE,
      mode: computeAgiMode(agents),
    };
  } catch (err) {
    // Fail OPEN to the defaults. A policy read failure must not take AI down
    // for a tenant who never configured one; the audit trail still records
    // every call that runs.
    console.error("[agi-policy] read failed; falling back to defaults", err);
    const agents = { ...DEFAULT_AGI_AGENTS };
    return { agents, confidence: DEFAULT_AGI_CONFIDENCE, mode: computeAgiMode(agents) };
  }
}

/** The signed-in caller's own policy. */
export async function loadAgiPolicy(): Promise<AgiPolicy> {
  const session = await requireAuth();
  return getAgiPolicyForTenant(session.user.tenantId);
}

/**
 * Update the policy. customer_admin / qa_head only; every change audited with
 * the previous and new values so a change of AI governance is reconstructable.
 */
export async function updateAgiPolicy(
  input: z.input<typeof UpdateSchema>,
): Promise<ActionResult<AgiPolicy>> {
  const session = await requireAuth();

  if (!canEditAgiPolicy(session.user.role)) {
    return {
      success: false,
      error: "Your role is not permitted to change the AI agent policy.",
    };
  }

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid AI policy update." };
  }

  const actor = await resolveUserFk(
    session.user.id,
    session.user.tenantId,
    session.user.role,
  );

  try {
    const before = await getAgiPolicyForTenant(session.user.tenantId);

    const data: Record<string, boolean | number | string> = {};
    for (const key of AGI_AGENT_KEYS) {
      const next = parsed.data.agents?.[key];
      if (typeof next === "boolean") data[AGENT_COLUMNS[key] as string] = next;
    }
    if (typeof parsed.data.confidence === "number") {
      data.confidence = parsed.data.confidence;
    }
    if (Object.keys(data).length === 0) {
      return { success: true, data: before };
    }
    data.updatedById = actor.userId ?? "";

    const row = await prisma.tenantAgiPolicy.upsert({
      where: { tenantId: session.user.tenantId },
      create: { tenantId: session.user.tenantId, ...data },
      update: data,
      select: {
        capaEnabled: true,
        deviationEnabled: true,
        fda483Enabled: true,
        driftEnabled: true,
        regulatoryEnabled: true,
        supplierEnabled: true,
        confidence: true,
      },
    });

    const agents = rowToAgents(row);
    const after: AgiPolicy = {
      agents,
      confidence: row.confidence,
      mode: computeAgiMode(agents),
    };

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: "AGI_POLICY_UPDATED",
        recordTitle: "AI agent policy",
        // Both sides recorded: which agents were on before, which are on now.
        oldValue: JSON.stringify({
          agents: before.agents,
          confidence: before.confidence,
          mode: before.mode,
        }),
        newValue: JSON.stringify({
          agents: after.agents,
          confidence: after.confidence,
          mode: after.mode,
        }),
      },
    });

    revalidatePath("/settings");
    return { success: true, data: after };
  } catch (err) {
    return { success: false, error: sanitizeServerError(err, "Could not update the AI agent policy.") };
  }
}
