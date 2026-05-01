import { requireAuth } from "@/lib/auth";
import { getTenant } from "@/lib/queries/tenants";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  // Fetch the user's own tenant so AppShell can seed Redux. Without this,
  // useTenantConfig() finds no tenant in state, treats the missing
  // subscriptionPlans as expired, and the AppShell gate fires "No active
  // subscription" even when the DB row is healthy.
  const initialTenant = session.user.tenantId
    ? await getTenant(session.user.tenantId)
    : null;
  return <AppShell initialTenant={initialTenant}>{children}</AppShell>;
}
