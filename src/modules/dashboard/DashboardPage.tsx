"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Sparkles } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useTenantData } from "@/hooks/useTenantData";
import { setFindings } from "@/store/findings.slice";
import { setCAPAs } from "@/store/capa.slice";
import { setDeviations } from "@/store/deviation.slice";
import { setSystems } from "@/store/systems.slice";
import { adaptFinding, type FindingWithEdits } from "@/modules/gap-assessment/GapPage.adapter";
import { mapCAPAFromPrisma } from "@/lib/mappers/capaMapper";
import { adaptDeviation, type PrismaDeviationWithCapa } from "@/modules/deviation/DeviationPage.adapter";
import { adaptPrismaSystem } from "@/types/csv-csa";
import { roleLabel } from "@/lib/labels/roles";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Drawer } from "@/components/ui/Drawer";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import { SmartRecordSearch } from "@/components/search/SmartRecordSearch";
import { buildCapaSource, buildDeviationSource, buildFindingSource } from "@/lib/searchSources";
import type {
  KPIChangeControl, KPIDeviation, KPIInspectionReadiness, RegulatoryFDA483,
} from "@/lib/kpi";
import { dashboardConfigForRole, resolveDashboard } from "./config";
import type { DashboardWidgetKey } from "./config";
import type { CanOpen, LinkModule, WorklistLike } from "./config/derive";
import { useDashboardAccess } from "./hooks/useDashboardAccess";
import { useDashboardData, type DashboardFilters } from "./hooks/useDashboardData";
import { KpiGrid } from "./widgets/KpiGrid";
import { DashboardWidget } from "./widgets/registry";

/**
 * ROLE-BASED DASHBOARD — the orchestrator.
 *
 * This component no longer knows what a QA Head or a Regulatory Affairs lead should
 * see. It does exactly four things:
 *
 *   1. seeds Redux from the visibility-scoped server rows (unchanged),
 *   2. resolves the viewer's role config against LIVE RBAC (`useDashboardAccess` →
 *      `resolveDashboard`),
 *   3. assembles the one dataset (`useDashboardData`), and
 *   4. renders the resolved widget keys through the registry.
 *
 * Everything role-specific lives in `./config/*` (declaration) and `./widgets/*`
 * (presentation). The previous version branched on role exactly twice in 525 lines and
 * showed all ten roles the identical five KPI cards.
 *
 * SCOPE RULE (unchanged, and now enforced in one place — `config/dataset.ts`):
 *   aggregate COUNTS  → tenant-wide  (`all*` props)
 *   record CONTENT    → visibility-scoped (`findings` / `deviations` / `systems` /
 *                       `capas` props, which also seed Redux)
 */

/* ══════════════════════════════════════ */

export interface DashboardPageProps {
  /** Lowest readiness % across active inspections — server-computed. */
  readinessScore?: number;
  /**
   * VISIBILITY-SCOPED server rows. Two jobs:
   *  1. They SEED the Redux slices, so every downstream Redux reader — GapPage,
   *     DeviationPage, GovernancePage's exports — sees only visible records.
   *  2. They feed this page's record-CONTENT surfaces: the 90-day action plan, the
   *     alert list and the cross-module search.
   * `capas` is [] unless the viewer holds a CAPA-module role.
   */
  findings?: FindingWithEdits[];
  capas?: Parameters<typeof mapCAPAFromPrisma>[0][];
  deviations?: PrismaDeviationWithCapa[];
  systems?: Parameters<typeof adaptPrismaSystem>[0][];
  /**
   * TENANT-WIDE server rows — aggregates only. Never rendered as rows, never
   * dispatched into Redux. Site-filtered client-side by `useTenantSitePredicate`.
   */
  allFindings?: FindingWithEdits[];
  allCAPAs?: Parameters<typeof mapCAPAFromPrisma>[0][];
  allSystems?: Parameters<typeof adaptPrismaSystem>[0][];
  /** Tenant-wide deviations — the deviation KPIs every quality role now leads with. */
  allDeviations?: KPIDeviation[];
  /** Tenant-wide 483 events (+observations/commitments) — the regulatory KPIs. */
  allFDA483?: RegulatoryFDA483[];
  /** Per-inspection readiness + training records — readiness & training KPIs. */
  inspections?: KPIInspectionReadiness[];
  /** Change controls. [] while `CHANGE_CONTROL_ENABLED` is false. */
  changeControls?: KPIChangeControl[];
  /** The signed-in user's own worklist — powers "My pending tasks". */
  worklist?: WorklistLike | null;
  /** Viewer holds a CAPA-module role → CAPA rows may appear as content. */
  canViewCAPAs?: boolean;
}

/** Stable empty literals so absent props don't create a new array each render. */
const NO_FINDINGS: FindingWithEdits[] = [];
const NO_CAPAS: Parameters<typeof mapCAPAFromPrisma>[0][] = [];
const NO_SYSTEMS: Parameters<typeof adaptPrismaSystem>[0][] = [];
const NO_DEVIATIONS: KPIDeviation[] = [];
const NO_FDA483: RegulatoryFDA483[] = [];
const NO_INSPECTIONS: KPIInspectionReadiness[] = [];
const NO_CHANGE_CONTROLS: KPIChangeControl[] = [];

export function DashboardPage({
  readinessScore: readinessScoreProp,
  findings: serverFindings,
  capas: serverCAPAs,
  deviations: serverDeviations,
  systems: serverSystems,
  allFindings: serverAllFindings = NO_FINDINGS,
  allCAPAs: serverAllCAPAs = NO_CAPAS,
  allSystems: serverAllSystems = NO_SYSTEMS,
  allDeviations = NO_DEVIATIONS,
  allFDA483 = NO_FDA483,
  inspections = NO_INSPECTIONS,
  changeControls = NO_CHANGE_CONTROLS,
  worklist = null,
  canViewCAPAs = false,
}: DashboardPageProps = {}) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  /* ── Seed Redux from the VISIBILITY-SCOPED rows (unchanged behaviour) ───────
     The store is shared with GapPage / DeviationPage / Governance, so seeding it
     tenant-wide would leak hidden records into their lists and exports. */
  useEffect(() => {
    if (serverFindings) dispatch(setFindings(serverFindings.map(adaptFinding)));
    if (serverCAPAs) dispatch(setCAPAs(serverCAPAs.map(mapCAPAFromPrisma)));
    if (serverDeviations) dispatch(setDeviations(serverDeviations.map(adaptDeviation)));
    if (serverSystems) dispatch(setSystems(serverSystems.map(adaptPrismaSystem)));
  }, [serverFindings, serverCAPAs, serverDeviations, serverSystems, dispatch]);

  /* ── Authorisation ─────────────────────────────────────────────────────────
     `access` mirrors the server gates; `resolveDashboard` then filters the role's
     declared dashboard down to exactly what this viewer may see. */
  const access = useDashboardAccess();

  /**
   * "May this viewer open that module?" — the last-mile link check, matching the
   * route guards: CAPA and Governance are role-set surfaces (not matrix entries), so
   * they are checked against their own sets exactly as `app/(app)/capa/page.tsx` and
   * `app/(app)/governance/page.tsx` do.
   */
  const canOpen = useCallback<CanOpen>(
    (module: LinkModule) => {
      if (module === "capa") return access.canViewCAPAModule && access.can("capa").canView;
      if (module === "governance") return access.canViewGovernance;
      if (module === "audit-trail") return access.canViewAuditTrail;
      return access.can(module).canView;
    },
    [access],
  );

  const dashboard = useMemo(
    () => resolveDashboard(dashboardConfigForRole(access.role), access),
    [access],
  );

  /* ── Header filters ────────────────────────────────────────────────────── */
  const [siteFilter, setSiteFilter] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("30");
  const [askAiOpen, setAskAiOpen] = useState(false);

  const filters = useMemo<DashboardFilters>(
    () => ({ siteId: siteFilter, severity: sevFilter, period: timeFilter }),
    [siteFilter, sevFilter, timeFilter],
  );

  /* ── Adapt the tenant-wide rows to the slice shape the KPI maths expects ── */
  const adaptedAllFindings = useMemo(() => serverAllFindings.map(adaptFinding), [serverAllFindings]);
  const adaptedAllCAPAs = useMemo(() => serverAllCAPAs.map(mapCAPAFromPrisma), [serverAllCAPAs]);
  const adaptedAllSystems = useMemo(() => serverAllSystems.map(adaptPrismaSystem), [serverAllSystems]);

  /* ── The one dataset ──────────────────────────────────────────────────── */
  const data = useDashboardData({
    allFindings: adaptedAllFindings,
    allCAPAs: adaptedAllCAPAs,
    allSystems: adaptedAllSystems,
    allDeviations,
    allFDA483,
    changeControls,
    inspections,
    readinessScore: readinessScoreProp ?? 0,
    worklist,
    filters,
    focusArea: dashboard.focusArea,
    canOpen,
  });

  /* ── Search drawer sources (visibility-scoped, unchanged) ─────────────── */
  const { findings, capas, deviations } = useTenantData();
  const { sites } = useTenantConfig();
  const searchSources = useMemo(
    () => [
      ...(canViewCAPAs
        ? [buildCapaSource(capas, sites, (id) => { router.push(`/capa/${id}`); setAskAiOpen(false); })]
        : []),
      buildDeviationSource(deviations, sites, () => { router.push("/deviation"); setAskAiOpen(false); }),
      buildFindingSource(findings, sites, () => { router.push("/gap-assessment"); setAskAiOpen(false); }),
    ],
    [canViewCAPAs, capas, deviations, findings, sites, router],
  );

  const headerActions: PageAction[] = useMemo(
    () => [{ label: "Ask AI", variant: "secondary", icon: Sparkles, onClick: () => setAskAiOpen(true) }],
    [],
  );

  // The site picker is only meaningful for a role that spans sites — a site-bound
  // user has exactly one accessible site (selectedSiteId is pinned at login).
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const showSitePicker = !selectedSiteId && sites.length > 1;

  const widgetProps = { data, dashboard, access, canOpen };

  /**
   * ONE ordered widget list, not two independent stacks.
   *
   * The dashboard used to render a 2/3 "main" column beside a 1/3 rail, each a
   * self-contained vertical stack. Because a role's rail carries five or six cards
   * while its main column carries two to four charts, the two stacks ended up
   * hundreds of pixels apart in height and the grid row — sized to the TALLER of
   * them — left a dead band the width of the main column under the shorter one
   * (measured: 641px for Regulatory Affairs, 776px for Operations Head at 1440px).
   * Nothing rendered there; it was structural, so no amount of padding or
   * `overflow` tuning could recover it.
   *
   * Widgets are now grid ITEMS in a single flow: a chart/table keeps its 2-column
   * width, a rail card takes one, and the browser packs them. The layout is
   * therefore driven by how much content a role actually has instead of assuming a
   * 2:1 split, and it re-balances by itself when a role gains or loses a widget.
   *
   * Interleaving wide/narrow here (rather than relying on `grid-auto-flow: dense`
   * to back-fill) means the DOM order IS the visual order, so the reading and tab
   * order still run left-to-right, top-to-bottom. `dense` stays on only to close
   * the one hole the 2-column (tablet) breakpoint can still open.
   */
  const widgets = useMemo(() => {
    const wide = dashboard.mainWidgets;
    const narrow = dashboard.railWidgets;
    const laidOut: { key: DashboardWidgetKey; wide: boolean }[] = [];
    for (let i = 0; i < Math.max(wide.length, narrow.length); i += 1) {
      if (i < wide.length) laidOut.push({ key: wide[i], wide: true });
      if (i < narrow.length) laidOut.push({ key: narrow[i], wide: false });
    }
    return laidOut;
  }, [dashboard.mainWidgets, dashboard.railWidgets]);

  return (
    <PageLayout
      title="Dashboard"
      titleIcon={LayoutDashboard}
      // The description states the ROLE'S remit, so the page announces whose view
      // this is — the single clearest signal that the dashboard is personalised.
      description={dashboard.description}
      actions={headerActions}
      headerRight={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] px-2 py-1 rounded-md" style={{ background: "var(--brand-muted)", color: "var(--brand)" }}>
            {roleLabel(access.role)}
            {dashboard.focusArea ? ` · ${dashboard.focusArea}` : ""}
          </span>
          <Dropdown
            value={timeFilter}
            onChange={setTimeFilter}
            width="w-36"
            options={[
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
              { value: "60", label: "Last 60 days" },
              { value: "90", label: "Last 90 days" },
              { value: "all", label: "All time" },
            ]}
          />
          {showSitePicker && (
            <Dropdown
              placeholder="All sites"
              value={siteFilter}
              onChange={setSiteFilter}
              width="w-36"
              options={[{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))]}
            />
          )}
          <Dropdown
            placeholder="All severities"
            value={sevFilter}
            onChange={setSevFilter}
            width="w-32"
            options={[
              { value: "", label: "All severities" },
              { value: "Critical", label: "Critical" },
              { value: "High", label: "High" },
              { value: "Medium", label: "Medium" },
              { value: "Low", label: "Low" },
            ]}
          />
          {(siteFilter || sevFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSiteFilter(""); setSevFilter(""); }}>
              Clear filters
            </Button>
          )}
        </div>
      }
    >
      {/* One vertical rhythm for the whole page: the gap between the KPI row and
          the widget grid is the SAME token as the gap between two widgets. */}
      <div className="space-y-4 lg:space-y-6">
        {/* KPI row — the role's cards, already permission-resolved */}
        <KpiGrid {...widgetProps} />

        {/* The widget grid. One column on phones, two on tablets, three from `lg`.
            `items-start` keeps every card at its natural height (a list card is not
            stretched to a chart's height), and every item carries `min-w-0` so a
            wide child — a chart's ResponsiveContainer, the action-plan table —
            measures against its track instead of forcing the track wider. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 items-start [grid-auto-flow:row_dense]">
          {widgets.map(({ key, wide }) => (
            <div key={key} className={wide ? "min-w-0 md:col-span-2" : "min-w-0"}>
              <DashboardWidget widget={key} {...widgetProps} />
            </div>
          ))}
        </div>
      </div>

      {/* Ask AI — the cross-module record search. Executes CLIENT-SIDE over the
          visibility-scoped Redux arrays, so a record the viewer can't open on its
          module page can never be matched; the CAPA source is omitted for
          non-CAPA-module roles. */}
      <Drawer open={askAiOpen} onClose={() => setAskAiOpen(false)} title="Ask AI · Record Search" width="lg">
        <SmartRecordSearch title="Search" defaultScope="all" sources={searchSources} />
      </Drawer>
    </PageLayout>
  );
}
