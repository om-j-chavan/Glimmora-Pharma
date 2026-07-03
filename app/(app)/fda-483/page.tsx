import { FDA483Page } from "@/modules/fda-483/FDA483Page";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import {
  getFDA483Events,
  getFDA483Stats,
  getFDA483EventAuditLogs,
  getCAPAs,
} from "@/lib/queries";

export const metadata = {
  title: "Inspections & Regulatory — Pharma Glimmora",
};

interface PageProps {
  // Next 16 App Router exposes searchParams as a Promise. The detail-view
  // event id arrives as ?event=<id>; when present we eagerly fetch the
  // module-scoped audit trail so the AuditTab can render server-side.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAuth();
  const params = (await searchParams) ?? {};
  const rawEventId = params.event;
  const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;

  const [events, stats, auditLogs, capas] = await Promise.all([
    getFDA483Events(session.user.tenantId),
    getFDA483Stats(session.user.tenantId),
    eventId
      ? getFDA483EventAuditLogs(session.user.tenantId, eventId, 50)
      : Promise.resolve([]),
    // Hydrate the CAPA slice so the Investigation tab can resolve each
    // observation's linked CAPA (reference + status/owner/due). The slice is
    // otherwise only seeded by visiting the CAPA module, so a direct FDA 483
    // visit would fall back to the raw cuid.
    getCAPAs(session.user.tenantId),
  ]);

  const auditRows = auditLogs.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    userName: row.userName,
    userRole: row.userRole,
    action: row.action,
    recordTitle: row.recordTitle,
    oldValue: row.oldValue,
    newValue: row.newValue,
  }));

  return (
    <ErrorBoundary moduleName="FDA 483">
      <FDA483Page
        events={events}
        stats={stats}
        activeEventAuditRows={auditRows}
        capas={capas}
      />
    </ErrorBoundary>
  );
}
