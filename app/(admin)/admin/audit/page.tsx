import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getPlatformAuditLogs, getPlatformAuditActions } from "@/lib/queries";
import { getTenants } from "@/lib/queries/tenants";
import { PlatformAuditPage } from "@/modules/admin/platform-audit";

// Platform-level screen — super_admin only.
const ALLOWED_ROLES = new Set(["super_admin"]);

export const metadata = {
  title: "Platform Audit — Pharma Glimmora",
};

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "admin",
    recordId: "platform-audit",
    recordTitle: "/admin/audit",
    extra: { path: "/admin/audit" },
  });

  const sp = (await searchParams) ?? {};
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  // Server-side pagination + filtering. Scope is the super_admin's own tenant
  // (where platform TENANT_*/PLAN_*/MFA_* events are logged) — preserved by the
  // query; the affected-account resolution spans tenants for display only.
  const result = await getPlatformAuditLogs(session.user.tenantId, {
    page,
    pageSize: 25,
    filters: {
      action: one(sp.action),
      username: one(sp.username),
      accountId: one(sp.accountId),
      dateFrom: one(sp.dateFrom),
      dateTo: one(sp.dateTo),
      search: one(sp.search),
    },
  });

  // Filter option sources: distinct actions (this feed) + tenant list for the
  // Account Name filter. Only id→name crosses to the client — no roster.
  const [actions, tenants] = await Promise.all([
    getPlatformAuditActions(session.user.tenantId),
    getTenants(),
  ]);
  const tenantOptions = tenants.map((t) => ({ id: t.id, name: t.name }));

  return (
    <PlatformAuditPage
      result={result}
      actionOptions={actions}
      tenantOptions={tenantOptions}
    />
  );
}
