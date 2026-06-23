import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getTickets, getSupportTenantOptions, getSupportAssigneeOptions } from "@/lib/queries";
import { TicketQueue } from "@/modules/support/TicketQueue";

export const metadata = { title: "Support Management — Pharma Glimmora" };

const ALLOWED_ROLES = new Set(["super_admin"]);

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, { module: "support", recordTitle: "/admin/support", extra: { path: "/admin/support" } });

  const sp = (await searchParams) ?? {};
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const [result, tenantOptions, assigneeOptions] = await Promise.all([
    getTickets(session, {
      page,
      pageSize: 25,
      filters: {
        status: one(sp.status),
        priority: one(sp.priority),
        category: one(sp.category),
        assigneeId: one(sp.assigneeId),
        tenantId: one(sp.tenantId),
        dateFrom: one(sp.dateFrom),
        dateTo: one(sp.dateTo),
        search: one(sp.search),
      },
    }),
    getSupportTenantOptions(session),
    getSupportAssigneeOptions(session),
  ]);

  return <TicketQueue result={result} admin tenantOptions={tenantOptions} assigneeOptions={assigneeOptions} />;
}
