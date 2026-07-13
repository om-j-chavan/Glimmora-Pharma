import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getTenant } from "@/lib/queries/tenants";
import { effectiveFrameworksForTenant } from "@/lib/queries/frameworks";
import { getActiveRegions, getRegionLabelMap } from "@/lib/queries/regions";
import { AppShell } from "@/components/layout/AppShell";
import type { AuthUser, UserRole } from "@/store/auth.slice";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  // ── Bright line ──────────────────────────────────────────────────────────
  // super_admin's entire world is the admin console (Customer Accounts /
  // Platform Settings / Audit). The compliance/customer modules belong to the
  // customer, not super_admin. This shared (app) layout wraps EVERY customer
  // route (/, /capa, /deviation, /gap-assessment, /csv-csa, /fda-483,
  // /evidence, /readiness, /governance, /settings, …), so denying super_admin
  // here walls it out of all of them in one place — the inverse of how /admin
  // denies non-admin roles. (proxy.ts enforces the same at the edge; this is
  // defense-in-depth and the canonical server gate.)
  if (session.user.role === "super_admin") {
    redirect("/admin");
  }
  // Fetch the user's own tenant so AppShell can seed Redux. Without this,
  // useTenantConfig() finds no tenant in state, treats the missing
  // subscriptionPlans as expired, and the AppShell gate fires "No active
  // subscription" even when the DB row is healthy.
  const initialTenant = session.user.tenantId
    ? await getTenant(session.user.tenantId)
    : null;
  // Forward the resolved session user so AppShell can self-heal Redux's
  // auth.user/currentTenant when localStorage is stale (e.g. the
  // persistMiddleware's 500ms debounce missed the post-login dispatch
  // before window.location.assign navigated). Without currentTenant set,
  // useTenantConfig() can't locate the tenant we just dispatched into
  // tenants[] and the subscription gate fires against a healthy DB row.
  const initialUser: AuthUser | null = session.user.tenantId
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role as UserRole,
        gxpSignatory: session.user.gxpSignatory ?? false,
        orgId: session.user.tenantId,
        tenantId: session.user.tenantId,
      }
    : null;
  // Server-resolved effective frameworks for THIS tenant — seeds the (non-
  // persisted) frameworks slice on the first client render, exactly like
  // initialTenant/initialUser. This guarantees framework-dependent UI (the Gap
  // "Report Gap" dropdown, CSV columns, …) is populated immediately instead of
  // depending on an async client round-trip. Re-runs per request (per login),
  // so tenant switches can never carry state — no cross-tenant leak.
  let initialFrameworks: { key: string; name: string }[] = [];
  if (session.user.tenantId) {
    try {
      initialFrameworks = (await effectiveFrameworksForTenant(session.user.tenantId)).map((f) => ({ key: f.key, name: f.name }));
    } catch (err) {
      // Never let a framework-resolver failure white-screen EVERY (app) page via
      // error.tsx — this shared layout wraps all customer routes. Degrade to an
      // empty list and log loudly. The common dev cause is a `next dev` server
      // that cached a Prisma client from BEFORE the Framework schema was added
      // (globalThis singleton in src/lib/prisma.ts) — RESTART the dev server.
      console.error(
        "[app/layout] effectiveFrameworksForTenant failed. If the Framework schema was just added, STOP and restart `next dev` (stale Prisma client). Error:",
        err,
      );
    }
  }
  // DB-backed regulatory regions (Item #3, Stage 2) — active options + a value→
  // label map (incl. archived) to seed the regions slice. Both queries fall back
  // to the REGULATORY_REGIONS constant internally, so a failure degrades to the
  // exact prior behaviour rather than emptying the region dropdowns/labels.
  let initialRegions: { active: { value: string; label: string }[]; labelMap: Record<string, string> } | undefined;
  try {
    const [active, labelMap] = await Promise.all([getActiveRegions(), getRegionLabelMap()]);
    initialRegions = { active, labelMap };
  } catch (err) {
    console.error("[app/layout] region seed failed — client keeps the constant fallback:", err);
  }

  return (
    <AppShell initialTenant={initialTenant} initialUser={initialUser} initialFrameworks={initialFrameworks} initialRegions={initialRegions}>
      {children}
    </AppShell>
  );
}
