import type { NextApiRequest, NextApiResponse } from "next";
import { neon } from "@neondatabase/serverless";
import { isTenantEffectivelyActive, getInactiveReason } from "@/lib/tenantStatus";

/**
 * Legacy login endpoint — used by the existing React Router SPA login
 * flow (src/lib/tenantApi.ts → loginApi). Left in place as a fallback
 * while next-auth credentials provider is the primary auth path.
 *
 * Not session-protected — it IS the login.
 *
 * NOTE: This endpoint bypasses next-auth entirely. Callers that want a
 * real signed JWT session cookie should use signIn("credentials") from
 * next-auth/react — see src/lib/authClient.ts.
 */

interface DbTenantRow {
  id: string;
  name: string;
  plan: "trial" | "professional" | "enterprise";
  admin_email: string;
  active: boolean;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscription_plans: any;
}

function rowToTenant(row: DbTenantRow) {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan,
    adminEmail: row.admin_email,
    active: row.active,
    createdAt: row.created_at,
    config: row.config ?? { org: {}, sites: [], users: [] },
    subscriptionPlans: row.subscription_plans ?? [],
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const url = process.env.DATABASE_URL;
    if (!url) {
      return res
        .status(500)
        .json({ error: "DATABASE_URL is not set on this deployment" });
    }
    const sql = neon(url);

    const { username, password } = (req.body ?? {}) as {
      username: string;
      password: string;
    };
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "username and password are required" });
    }

    const key = username.toLowerCase().trim();
    const rows = (await sql`
      select id, name, plan, admin_email, active, created_at, config, subscription_plans
      from tenants
    `) as DbTenantRow[];

    for (const row of rows) {
      const tenant = rowToTenant(row);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const users: any[] = tenant.config?.users ?? [];
      const match = users.find(
        (u) =>
          (u.username && u.username.toLowerCase() === key) ||
          (u.email && u.email.toLowerCase() === key) ||
          (u.name && u.name.toLowerCase() === key),
      );
      if (match && (!match.password || match.password === password)) {
        // User-level gate — credentials matched but the user record is
        // Inactive. Return a clear message so the UI can show it.
        if (match.status !== "Active") {
          return res.status(403).json({
            error:
              "Your account is inactive. Please contact your administrator to reactivate it.",
            reason: "USER_INACTIVE",
          });
        }
        // Subscription gate — block login when the tenant has no active or
        // non-expired subscription plan. Customer admins and super admins
        // are exempt because they are the ones who renew the subscription.
        const isAdmin = match.role === "customer_admin" || match.role === "super_admin";
        if (!isAdmin && !isTenantEffectivelyActive(tenant)) {
          return res.status(403).json({
            error: getInactiveReason(tenant) ?? "Account is inactive.",
            reason: "SUBSCRIPTION_INACTIVE",
          });
        }
        return res.status(200).json({
          ok: true,
          user: {
            id: match.id,
            name: match.name,
            email: match.email,
            role: match.role,
            gxpSignatory: !!match.gxpSignatory,
            orgId: tenant.id,
            tenantId: tenant.id,
          },
          tenant,
        });
      }
    }

    return res.status(401).json({ error: "Invalid username or password" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("[api/auth/login] error", err);
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}
