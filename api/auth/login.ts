import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSql, rowToTenant, type DbTenantRow } from "../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sql = getSql();
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
