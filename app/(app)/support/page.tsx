import { requireAuth } from "@/lib/auth";
import { getTickets } from "@/lib/queries";
import { TicketQueue } from "@/modules/support/TicketQueue";
import { ErrorBoundary } from "@/components/errors";

export const metadata = { title: "Support — Pharma Glimmora" };

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAuth();
  const sp = (await searchParams) ?? {};
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const result = await getTickets(session, {
    page,
    pageSize: 25,
    filters: {
      status: one(sp.status),
      priority: one(sp.priority),
      category: one(sp.category),
      dateFrom: one(sp.dateFrom),
      dateTo: one(sp.dateTo),
      search: one(sp.search),
    },
  });

  return (
    <ErrorBoundary moduleName="Support">
      <TicketQueue result={result} admin={false} />
    </ErrorBoundary>
  );
}
