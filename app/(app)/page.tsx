import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import {
  getOverallReadiness,
  getReadinessStats,
  getFindings,
  getCAPAs,
  getDeviations,
  getSystems,
  getFDA483Events,
  getChangeControls,
  getWorklist,
  findingVisibilityWhere,
  deviationVisibilityWhere,
  systemVisibilityWhere,
} from "@/lib/queries";
import { CAPA_MODULE_VIEW_ROLES } from "@/lib/permissions/roleSets";
import { CHANGE_CONTROL_ENABLED } from "@/lib/change-control-constants";

export const metadata = {
  title: "Dashboard — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  // Phase 6 record-visibility — the dashboard is the one page that needs BOTH
  // scopes of the same records, so it fetches both (decision #5):
  //
  //   aggregate COUNTS  → tenant-wide. Managers must see real totals ("24 open
  //     deviations"), so the KPI cards, trend charts, area heatmap and AI insight
  //     counts read the `all*` props. No visibility fragment.
  //   record CONTENT    → scoped. The 90-day action plan, the alert list and the
  //     cross-module search render actual rows (requirement text, CAPA descriptions,
  //     system names) and link to each record, so they must not surface a record the
  //     viewer can't open on its module page. These pass the owning module's
  //     *VisibilityWhere fragment.
  //
  // The scoped rows are ALSO what seeds Redux (findings / deviation / systems / capa
  // slices). That matters beyond this page: GapPage, DeviationPage and GovernancePage
  // all RENDER from those slices rather than from their own props, so seeding them
  // tenant-wide here would leak hidden records into the module lists (first paint,
  // before their own effect re-seeds) and into the Governance monthly/RAID exports.
  // Scoped-in means scoped everywhere.
  //
  // CAPA has no record-level fragment by design — the whole module is role-gated
  // (CAPA_MODULE_VIEW_ROLES; see app/(app)/capa/page.tsx). We reuse that gate rather
  // than invent visibility logic: the tenant-wide CAPA rows still drive the CAPA count
  // KPIs for everyone, but only a CAPA-module role gets CAPA rows as *content*.
  //
  // ROLE-BASED DASHBOARD ADDITIONS — all via EXISTING cached query functions; no new
  // API route, no server action, no schema change:
  //   • getDeviations (tenant-wide)  → the deviation KPIs QA/QC-Lab/Operations lead
  //                                    with (previously the page fetched only the
  //                                    scoped rows, so no deviation count existed).
  //   • getFDA483Events              → Regulatory Affairs: events, observations,
  //                                    commitments and response deadlines.
  //   • getReadinessStats            → inspection readiness, overdue readiness
  //                                    actions, and the TrainingRecord rows behind
  //                                    the training-compliance KPI.
  //   • getWorklist                  → the signed-in user's own pending tasks. Its
  //                                    query is pinned to this userId, so it is the
  //                                    safest surface on the page.
  //   • getChangeControls            → Operations change control. SKIPPED entirely
  //                                    while CHANGE_CONTROL_ENABLED is false, so we
  //                                    never pay for a query whose module redirects.
  const canViewCAPAs = CAPA_MODULE_VIEW_ROLES.includes(session.user.role);

  const [
    readinessScore,
    readinessStats,
    allFindings,
    allCAPAs,
    allSystems,
    allDeviations,
    allFDA483,
    changeControls,
    worklist,
    visibleFindings,
    visibleDeviations,
    visibleSystems,
  ] = await Promise.all([
    getOverallReadiness(session.user.tenantId),
    getReadinessStats(session.user.tenantId),
    // Tenant-wide — aggregates only, never rendered as rows.
    getFindings(session.user.tenantId),
    getCAPAs(session.user.tenantId),
    getSystems(session.user.tenantId),
    getDeviations(session.user.tenantId),
    getFDA483Events(session.user.tenantId),
    CHANGE_CONTROL_ENABLED ? getChangeControls(session.user.tenantId) : Promise.resolve([]),
    getWorklist(session.user.id, session.user.tenantId),
    // Visibility-scoped — record content + the Redux seed.
    getFindings(session.user.tenantId, findingVisibilityWhere(session)),
    getDeviations(session.user.tenantId, deviationVisibilityWhere(session)),
    getSystems(session.user.tenantId, systemVisibilityWhere(session)),
  ]);

  return (
    <ErrorBoundary moduleName="Dashboard">
      <DashboardPage
        readinessScore={readinessScore}
        inspections={readinessStats.inspectionsWithReadiness}
        allFindings={allFindings}
        allCAPAs={allCAPAs}
        allSystems={allSystems}
        allDeviations={allDeviations}
        allFDA483={allFDA483}
        changeControls={changeControls}
        worklist={worklist}
        findings={visibleFindings}
        deviations={visibleDeviations}
        systems={visibleSystems}
        capas={canViewCAPAs ? allCAPAs : []}
        canViewCAPAs={canViewCAPAs}
      />
    </ErrorBoundary>
  );
}
