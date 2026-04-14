-- Glimmora Pharma — Tenant storage schema
-- Run this once in the Neon SQL editor.

create table if not exists tenants (
  id              text primary key,
  name            text not null,
  plan            text not null check (plan in ('trial', 'professional', 'enterprise')),
  admin_email     text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  config          jsonb not null default '{}'::jsonb,
  subscription_plans jsonb not null default '[]'::jsonb
);

create index if not exists tenants_admin_email_idx on tenants (lower(admin_email));
