import { FDA483Page } from "@/modules/fda-483/FDA483Page";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { FDA483_VIEW_ROLES } from "@/lib/permissions/roleSets";
import {
  getFDA483Events,
  getFDA483Stats,
  getFDA483EventAuditLogs,
  fda483VisibilityWhere,
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

// Inspections & Regulatory is restricted to regulatory_affairs (owns regulator
// communication) + qa_head + customer_admin. Route-level gate before any fetch.
const ALLOWED_ROLES = new Set<string>(FDA483_VIEW_ROLES);

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "fda483",
    redirectTo: "/",
    extra: { path: "/fda-483" },
  });
  const params = (await searchParams) ?? {};
  const rawEventId = params.event;
  const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;

  const [events, stats, auditLogs, capas] = await Promise.all([
    // Phase 5.5 record-visibility: a non-see-all user sees only FDA483 events
    // they created OR internally own. Stats stay tenant-wide (Phase 6).
    getFDA483Events(session.user.tenantId, fda483VisibilityWhere(session)),
    getFDA483Stats(session.user.tenantId),
    eventId
      ? getFDA483EventAuditLogs(session, eventId, 50)
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
