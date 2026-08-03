import { notFound } from "next/navigation";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { CSV_MODULE_VIEW_ROLES } from "@/lib/permissions/roleSets";
import { getSystemByRef, getLinkableFindings, getSystemRecentActivity } from "@/lib/queries";
import { adaptPrismaSystem } from "@/types/csv-csa";
import { computeDefaultTab } from "@/modules/csv-csa/detail/workflow";
import { SystemDetailPage } from "@/modules/csv-csa/SystemDetailPage";

export const metadata = {
  title: "System detail — CSV/CSA — Pharma Glimmora",
};

interface PageProps {
  params: Promise<{ reference: string }>;
}

// Same gate as the CSV/CSA index — a detail URL must not be a way around it.
const ALLOWED_ROLES = new Set<string>(CSV_MODULE_VIEW_ROLES);

export default async function SystemDetailRoute({ params }: PageProps) {
  const { reference } = await params;
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "csv-csa",
    redirectTo: "/",
    extra: { path: "/csv-csa/systems/[reference]" },
  });
  const decoded = decodeURIComponent(reference);

  // Phase 4 — visibility enforced in getSystemByRef: a non-see-all/non-creator/
  // non-rework-assignee gets null → notFound() (no IDOR by reference/id). The
  // related reads below are only reached for a VISIBLE system (inherit the gate).
  const system = await getSystemByRef(decoded, session);
  if (!system) notFound();

  const [availableFindings, recentActivity] = await Promise.all([
    getLinkableFindings(session.user.tenantId),
    getSystemRecentActivity(system.id, session.user.tenantId),
  ]);

  // Land the user on the tab matching the system's lifecycle position.
  const defaultTab = computeDefaultTab(adaptPrismaSystem(system));

  return (
    <ErrorBoundary moduleName="CSV/CSA Validation">
      <SystemDetailPage
        system={system}
        availableFindings={availableFindings.map((f) => ({ id: f.id, reference: f.reference ?? undefined, requirement: f.requirement, status: f.status }))}
        recentActivity={recentActivity.map((a) => ({ id: a.id, action: a.action, userName: a.userName, createdAt: a.createdAt.toISOString(), newValue: a.newValue ?? undefined }))}
        defaultTab={defaultTab}
      />
    </ErrorBoundary>
  );
}
