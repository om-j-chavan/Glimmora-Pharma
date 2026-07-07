import { requireAuth } from "@/lib/auth";
import { getTickets, getTicketStats, toQueueRow } from "@/lib/queries/support";
import { SupportQueue } from "@/modules/support/SupportQueue";
import { ErrorBoundary } from "@/components/errors";

export const metadata = { title: "Support — Pharma Glimmora" };

export default async function Page() {
  const session = await requireAuth();

  // Tenant-side queue. A customer_admin is the tenant's first-line HANDLER; every
  // other tenant role is a requester. (super_admin uses /admin/support.) Scoping
  // is enforced inside getTickets — a CA sees their whole tenant; a requester
  // only their own tickets. The <DataTable> re-queries the server for filters /
  // search / show-more; here we seed the unfiltered first page.
  const view = session.user.role === "customer_admin" ? "ca" : "requester";
  const [page1, stats] = await Promise.all([
    getTickets(session, { page: 1, pageSize: 15 }),
    getTicketStats(session),
  ]);
  const initialData = { rows: page1.rows.map(toQueueRow), total: page1.total };

  return (
    <ErrorBoundary moduleName="Support">
      <SupportQueue view={view} initialData={initialData} stats={stats} />
    </ErrorBoundary>
  );
}
