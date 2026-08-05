"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { aiSignup } from "@/lib/aiAccount.server";
import { AiAuthError } from "@/lib/aiAuth";
import type { ActionResult } from "@/actions/capas/_types";

/**
 * Provision the matching user on the AI service when an app user is created.
 *
 * This ran in the browser before: Settings → Users called `aiSignup()` from a
 * client component, so the new user's plaintext password was POSTed from the
 * page to a second service, and the bearer token that came back was written
 * into Redux (and thence into the persisted `glimmora-state` localStorage blob).
 *
 * Now the browser sends only the identity fields it already has on screen; the
 * password/token exchange happens here. The action returns `aiUserId` so the UI
 * can still record that provisioning succeeded — the ACCESS TOKEN is
 * deliberately not returned, because nothing in the browser needs it any more
 * (the /api/ai-proxy route mints its own per request).
 *
 * Best-effort by design: the app User row already exists and can sign in, so a
 * failure here is reported but never blocks user creation.
 */

const ProvisionSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  customerId: z.string().min(1),
  role: z.string().optional(),
});

export interface ProvisionAiAccountResult {
  /** Echoed back so the caller can set the "already provisioned" sentinel. */
  aiUserId: string;
}

export async function provisionAiAccount(
  input: z.input<typeof ProvisionSchema>,
): Promise<ActionResult<ProvisionAiAccountResult>> {
  const session = await requireAuth();
  // Same gate as createUser (src/actions/settings.ts) — provisioning is part of
  // user administration, so it cannot be reached by a non-admin session.
  const actorRole = session.user.role;
  if (actorRole !== "customer_admin" && actorRole !== "super_admin") {
    return { success: false, error: "Only Admin can provision AI accounts" };
  }
  const parsed = ProvisionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }
  const { userId, username, email, password, customerId, role } = parsed.data;

  try {
    await aiSignup({
      user_id: userId,
      username,
      email,
      password,
      customer_id: customerId,
      role,
    });
    return { success: true, data: { aiUserId: userId } };
  } catch (err) {
    const reason = err instanceof AiAuthError ? err.message : "unknown";
    console.error("[action] provisionAiAccount failed:", reason);
    return { success: false, error: reason };
  }
}
