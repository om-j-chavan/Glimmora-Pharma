import { neon } from "@neondatabase/serverless";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

console.log("→ Creating tenants table…");
await sql`
  create table if not exists tenants (
    id              text primary key,
    name            text not null,
    plan            text not null check (plan in ('trial', 'professional', 'enterprise')),
    admin_email     text not null,
    active          boolean not null default true,
    created_at      timestamptz not null default now(),
    config          jsonb not null default '{}'::jsonb,
    subscription_plans jsonb not null default '[]'::jsonb
  )
`;

console.log("→ Creating index on admin_email…");
await sql`
  create index if not exists tenants_admin_email_idx on tenants (lower(admin_email))
`;

const rows = await sql`select count(*)::int as n from tenants`;
console.log(`\n✓ tenants table exists. Row count: ${rows[0].n}`);
console.log("Schema applied successfully.");
