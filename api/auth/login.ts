import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

interface DbTenantRow {
  id: string;
  name: string;
  plan: "trial" | "professional" | "enterprise";
  admin_email: string;
  active: boolean;
  created_at: string;
  config: any;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const url = process.env.DATABASE_URL;
    if (!url) {
      return res.status(500).json({ error: "DATABASE_URL is not set on this deployment" });
    }
    const sql = neon(url);

    const { username, password } = (req.body ?? {}) as {
      username: string;
      password: string;
    };

    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const key = username.toLowerCase().trim();

    const rows = (await sql`
      select id, name, plan, admin_email, active, created_at, config, subscription_plans
      from tenants
    `) as DbTenantRow[];

    for (const row of rows) {
      const tenant = rowToTenant(row);
      const users: any[] = tenant.config?.users ?? [];
      const match = users.find(
        (u) =>
          u.status === "Active" &&
          ((u.username && u.username.toLowerCase() === key) ||
            (u.email && u.email.toLowerCase() === key) ||
            (u.name && u.name.toLowerCase() === key)),
      );
      if (match && (!match.password || match.password === password)) {
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
  } catch (err: any) {
    console.error("[api/auth/login] error", err);
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}
