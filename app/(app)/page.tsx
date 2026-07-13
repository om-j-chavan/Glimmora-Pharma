import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import {
  getDashboardStats,
  getOverallReadiness,
  getFindings,
  getCAPAs,
  getDeviations,
  getSystems,
  findingVisibilityWhere,
  deviationVisibilityWhere,
  systemVisibilityWhere,
} from "@/lib/queries";
import { CAPA_MODULE_VIEW_ROLES } from "@/lib/permissions/roleSets";

export const metadata = {
  title: "Dashboard — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  // Phase 6 record-visibility — the dashboard is the one page that needs BOTH
  // scopes of the same records, so it fetches both (decision #5):
  //
  //   aggregate COUNTS  → tenant-wide. Managers must see real totals ("24 open
  //     deviations"), so the KPI cards, trend chart, area heatmap and AGI
  //     insight counts read the `all*` props. No visibility fragment.
  //   record CONTENT    → scoped. The 90-day action plan and the cross-module
  //     search render actual rows (requirement text, CAPA descriptions, system
  //     names) and link to each record, so they must not surface a record the
  //     viewer can't open on its module page. These pass the owning module's
  //     *VisibilityWhere fragment.
  //
  // The scoped rows are ALSO what seeds Redux (findings / deviation / systems /
  // capa slices). That matters beyond this page: GapPage, DeviationPage and
  // GovernancePage all RENDER from those slices rather than from their own
  // props, so seeding them tenant-wide here would leak hidden records into the
  // module lists (first paint, before their own effect re-seeds) and into the
  // Governance monthly/RAID exports. Scoped-in means scoped everywhere.
  //
  // CAPA has no record-level fragment by design — the whole module is role-gated
  // (CAPA_MODULE_VIEW_ROLES; see app/(app)/capa/page.tsx). We reuse that gate
  // rather than invent visibility logic: the tenant-wide CAPA rows still drive
  // the CAPA count KPIs for everyone, but only a CAPA-module role gets CAPA
  // rows as *content* (Redux seed → action plan, search, Governance export).
  const [
    stats,
    readinessScore,
    allFindings,
    allCAPAs,
    allSystems,
    visibleFindings,
    visibleDeviations,
    visibleSystems,
  ] = await Promise.all([
    getDashboardStats(session.user.tenantId),
    getOverallReadiness(session.user.tenantId),
    // Tenant-wide — aggregates only, never rendered as rows.
    getFindings(session.user.tenantId),
    getCAPAs(session.user.tenantId),
    getSystems(session.user.tenantId),
    // Visibility-scoped — record content + the Redux seed.
    getFindings(session.user.tenantId, findingVisibilityWhere(session)),
    getDeviations(session.user.tenantId, deviationVisibilityWhere(session)),
    getSystems(session.user.tenantId, systemVisibilityWhere(session)),
  ]);

  const canViewCAPAs = CAPA_MODULE_VIEW_ROLES.includes(session.user.role);

  return (
    <ErrorBoundary moduleName="Dashboard">
      <DashboardPage
        stats={stats}
        readinessScore={readinessScore}
        allFindings={allFindings}
        allCAPAs={allCAPAs}
        allSystems={allSystems}
        findings={visibleFindings}
        deviations={visibleDeviations}
        systems={visibleSystems}
        capas={canViewCAPAs ? allCAPAs : []}
        canViewCAPAs={canViewCAPAs}
      />
    </ErrorBoundary>
  );
}
