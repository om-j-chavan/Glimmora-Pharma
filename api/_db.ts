import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = neon(process.env.DATABASE_URL);

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
