import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSql, rowToTenant, type DbTenantRow } from "./_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const sql = getSql();
    if (req.method === "GET") {
      const rows = (await sql`
        select id, name, plan, admin_email, active, created_at, config, subscription_plans
        from tenants
        order by created_at asc
      `) as DbTenantRow[];
      return res.status(200).json({ tenants: rows.map(rowToTenant) });
    }

    if (req.method === "POST") {
      const body = req.body as {
        id: string;
        name: string;
        plan: "trial" | "professional" | "enterprise";
        adminEmail: string;
        active: boolean;
        config: unknown;
        subscriptionPlans?: unknown;
      };

      if (!body?.id || !body?.name || !body?.adminEmail) {
        return res.status(400).json({ error: "id, name and adminEmail are required" });
      }

      await sql`
        insert into tenants (id, name, plan, admin_email, active, config, subscription_plans)
        values (
          ${body.id},
          ${body.name},
          ${body.plan ?? "trial"},
          ${body.adminEmail},
          ${body.active ?? true},
          ${JSON.stringify(body.config ?? {})}::jsonb,
          ${JSON.stringify(body.subscriptionPlans ?? [])}::jsonb
        )
      `;

      return res.status(201).json({ ok: true });
    }

    if (req.method === "PATCH") {
      const body = req.body as {
        id: string;
        name?: string;
        plan?: "trial" | "professional" | "enterprise";
        adminEmail?: string;
        active?: boolean;
        config?: unknown;
        subscriptionPlans?: unknown;
      };

      if (!body?.id) {
        return res.status(400).json({ error: "id is required" });
      }

      // Fetch existing row to merge JSONB fields safely
      const existingRows = (await sql`
        select id, name, plan, admin_email, active, created_at, config, subscription_plans
        from tenants where id = ${body.id}
      `) as DbTenantRow[];

      if (existingRows.length === 0) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const existing = existingRows[0];
      const nextName = body.name ?? existing.name;
      const nextPlan = body.plan ?? existing.plan;
      const nextEmail = body.adminEmail ?? existing.admin_email;
      const nextActive = body.active ?? existing.active;
      const nextConfig = body.config ?? existing.config;
      const nextSub = body.subscriptionPlans ?? existing.subscription_plans;

      await sql`
        update tenants set
          name = ${nextName},
          plan = ${nextPlan},
          admin_email = ${nextEmail},
          active = ${nextActive},
          config = ${JSON.stringify(nextConfig)}::jsonb,
          subscription_plans = ${JSON.stringify(nextSub)}::jsonb
        where id = ${body.id}
      `;

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[api/tenants] error", err);
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}
