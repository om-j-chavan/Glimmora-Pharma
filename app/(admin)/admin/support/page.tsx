import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getTickets, getTicketStats, toQueueRow, getSupportTenantOptions } from "@/lib/queries/support";
import { SupportQueue } from "@/modules/support/SupportQueue";

export const metadata = { title: "Support Management — Pharma Glimmora" };

const ALLOWED_ROLES = new Set(["super_admin"]);

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, { module: "support", recordTitle: "/admin/support", extra: { path: "/admin/support" } });

  const [page1, tenantOptions, stats] = await Promise.all([
    getTickets(session, { page: 1, pageSize: 15 }),
    getSupportTenantOptions(session),
    getTicketStats(session),
  ]);
  const initialData = { rows: page1.rows.map(toQueueRow), total: page1.total };

  return <SupportQueue view="sa" initialData={initialData} stats={stats} tenantOptions={tenantOptions} />;
}
