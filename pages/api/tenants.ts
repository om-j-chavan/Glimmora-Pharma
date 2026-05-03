import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { mapTenantFromPrisma } from "@/lib/mappers/tenantMapper";

interface SubscriptionPlanInput {
  id?: string;
  startDate?: string;
  endDate?: string;
  expiryDate?: string;
  maxAccounts?: number;
  status?: string;
}

function parseDate(value: string | undefined): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function pickActivePlan(
  plans: SubscriptionPlanInput[] | undefined,
): SubscriptionPlanInput | null {
  if (!plans || plans.length === 0) return null;
  return plans.find((p) => (p.status ?? "Active") === "Active") ?? plans[0];
}

/**
 * Tenants API — session-protected via next-auth.
 *   GET     — any authenticated user (returns mapped legacy Tenant shape)
 *   POST/PATCH/DELETE — super_admin and customer_admin only
 *
 * Backed by Prisma (SQLite). Previously used @neondatabase/serverless, which
 * stopped working once DATABASE_URL switched to a sqlite `file:` URL.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const role = (session.user as Record<string, unknown>).role as string | undefined;
  if (req.method !== "GET") {
    if (role !== "super_admin" && role !== "customer_admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
  }

  try {
    if (req.method === "GET") {
      const rows = await prisma.tenant.findMany({
        include: { subscription: true, sites: true, users: true },
        orderBy: { createdAt: "asc" },
      });
      return res.status(200).json({ tenants: rows.map(mapTenantFromPrisma) });
    }

    if (req.method === "POST") {
      const body = req.body as {
        id: string;
        name: string;
        adminEmail: string;
        username?: string;
        passwordHash?: string;
        active?: boolean;
        subscriptionPlans?: SubscriptionPlanInput[];
      };
      if (!body?.id || !body?.name || !body?.adminEmail) {
        return res.status(400).json({ error: "id, name and adminEmail are required" });
      }
      await prisma.tenant.create({
        data: {
          id: body.id,
          customerCode: body.id,
          name: body.name,
          email: body.adminEmail,
          username: body.username ?? body.adminEmail.split("@")[0],
          passwordHash: body.passwordHash ?? "",
          role: "customer_admin",
          isActive: body.active ?? true,
        },
      });
      const plan = pickActivePlan(body.subscriptionPlans);
      if (plan) {
        await prisma.subscription.create({
          data: {
            tenantId: body.id,
            maxAccounts: plan.maxAccounts ?? 5,
            startDate: parseDate(plan.startDate),
            expiryDate: parseDate(plan.endDate ?? plan.expiryDate),
            status: plan.status ?? "Active",
          },
        });
      }
      return res.status(201).json({ ok: true });
    }

    if (req.method === "PATCH") {
      const body = req.body as {
        id: string;
        name?: string;
        adminEmail?: string;
        active?: boolean;
        subscriptionPlans?: SubscriptionPlanInput[];
      };
      if (!body?.id) return res.status(400).json({ error: "id is required" });
      const existing = await prisma.tenant.findUnique({ where: { id: body.id } });
      if (!existing) return res.status(404).json({ error: "Tenant not found" });
      await prisma.tenant.update({
        where: { id: body.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.adminEmail !== undefined ? { email: body.adminEmail } : {}),
          ...(body.active !== undefined ? { isActive: body.active } : {}),
        },
      });
      if (body.subscriptionPlans !== undefined) {
        const plan = pickActivePlan(body.subscriptionPlans);
        if (plan) {
          await prisma.subscription.upsert({
            where: { tenantId: body.id },
            update: {
              maxAccounts: plan.maxAccounts ?? 5,
              startDate: parseDate(plan.startDate),
              expiryDate: parseDate(plan.endDate ?? plan.expiryDate),
              status: plan.status ?? "Active",
            },
            create: {
              tenantId: body.id,
              maxAccounts: plan.maxAccounts ?? 5,
              startDate: parseDate(plan.startDate),
              expiryDate: parseDate(plan.endDate ?? plan.expiryDate),
              status: plan.status ?? "Active",
            },
          });
        } else {
          // Empty array → caller cleared the plan
          await prisma.subscription.deleteMany({ where: { tenantId: body.id } });
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id =
        (req.query?.id as string | undefined) ??
        (req.body as { id?: string } | undefined)?.id;
      if (!id) return res.status(400).json({ error: "id is required" });
      await prisma.tenant.delete({ where: { id } });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/tenants] error", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
}
