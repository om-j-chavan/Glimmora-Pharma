import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it in Vercel → Project → Settings → Environment Variables and redeploy.",
    );
  }
  cached = neon(url);
  return cached;
}

export interface DbTenantRow {
  id: string;
  name: string;
  plan: "trial" | "professional" | "enterprise";
  admin_email: string;
  active: boolean;
  created_at: string;
  config: any;
  subscription_plans: any;
}

export function rowToTenant(row: DbTenantRow) {
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
