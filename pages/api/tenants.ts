import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { neon } from "@neondatabase/serverless";
import { authOptions } from "./auth/[...nextauth]";

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

/**
 * Tenants API — session-protected via next-auth.
 * GET   — any authenticated user
 * POST/PATCH/DELETE — super_admin and customer_admin only
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // ── Auth gate ───────────────────────────────────────────────────────
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const role = (session.user as Record<string, unknown>).role as
    | string
    | undefined;
  if (req.method !== "GET") {
    if (role !== "super_admin" && role !== "customer_admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
  }

  // ── Database ────────────────────────────────────────────────────────
  const url = process.env.DATABASE_URL;
  if (!url) {
    return res
      .status(500)
      .json({ error: "DATABASE_URL is not set on this deployment" });
  }
  const sql = neon(url);

  try {
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
        return res
          .status(400)
          .json({ error: "id, name and adminEmail are required" });
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

    if (req.method === "DELETE") {
      const id =
        (req.query?.id as string | undefined) ??
        (req.body as { id?: string } | undefined)?.id;
      if (!id) {
        return res.status(400).json({ error: "id is required" });
      }
      await sql`delete from tenants where id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("[api/tenants] error", err);
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}
