"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { FilterX, LayoutDashboard, RefreshCw } from "lucide-react";
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


  const anyFilterActive = timeFilter !== "30" || !!siteFilter || !!sevFilter;
  const clearAllFilters = useCallback(() => {
    setTimeFilter("30");
    setSiteFilter("");
    setSevFilter("");
  }, []);

  
  const [isRefreshing, startRefresh] = useTransition();
  const handleRefresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

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
    () => [{ label: "Ask AI", variant: "ai", onClick: () => setAskAiOpen(true) }],
    [],
  );

  // The site picker is only meaningful for a role that spans sites — a site-bound
  // user has exactly one accessible site (selectedSiteId is pinned at login).
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const showSitePicker = !selectedSiteId && sites.length > 1;

 
  const activeFilterChips = useMemo<{ key: string; label: string; clear: () => void }[]>(
    () => [
      ...(timeFilter !== "30"
        ? [{ key: "time", label: timeFilter === "all" ? "Raised: all time" : `Raised: last ${timeFilter} days`, clear: () => setTimeFilter("30") }]
        : []),
      ...(showSitePicker && siteFilter
        ? [{ key: "site", label: sites.find((s) => s.id === siteFilter)?.name ?? "Selected site", clear: () => setSiteFilter("") }]
        : []),
      ...(sevFilter ? [{ key: "sev", label: sevFilter, clear: () => setSevFilter("") }] : []),
    ],
    [timeFilter, siteFilter, sevFilter, showSitePicker, sites],
  );

  const widgetProps = { data, dashboard, access, canOpen };

  
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
      description={dashboard.description}
      actions={headerActions}
      headerRight={
        <div className="flex items-center gap-2 flex-wrap">
         
          <Dropdown
            value={timeFilter}
            onChange={setTimeFilter}
            width="w-44"
            ariaLabel="Trend period — scopes the raised-volume charts only"
            options={[
              { value: "7", label: "Raised: last 7 days" },
              { value: "30", label: "Raised: last 30 days" },
              { value: "60", label: "Raised: last 60 days" },
              { value: "90", label: "Raised: last 90 days" },
              { value: "all", label: "Raised: all time" },
            ]}
          />
        
          {showSitePicker && (
            <Dropdown
              placeholder="All sites"
              value={siteFilter}
              onChange={setSiteFilter}
              width="w-36"
              ariaLabel="Filter dashboard by site"
              options={[{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))]}
            />
          )}
          <Dropdown
            placeholder="All severities"
            value={sevFilter}
            onChange={setSevFilter}
            width="w-32"
            ariaLabel="Filter findings and deviations by severity"
            options={[
              { value: "", label: "All severities" },
              { value: "Critical", label: "Critical" },
              { value: "High", label: "High" },
              { value: "Medium", label: "Medium" },
              { value: "Low", label: "Low" },
            ]}
          />
         
    
          {activeFilterChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              aria-label={`Remove ${c.label} filter`}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border-none cursor-pointer"
              style={{ backgroundColor: "var(--bg-border)", color: "var(--text-secondary)" }}
            >
              {c.label}
              <span aria-hidden="true" className="text-[13px] leading-none">×</span>
            </button>
          ))}
          {anyFilterActive && (
            <Button
              variant="ghost"
              size="sm"
              icon={FilterX}
              onClick={clearAllFilters}
              aria-label="Clear filters"
            />
          )}
   
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            loading={isRefreshing}
            onClick={handleRefresh}
            aria-label={isRefreshing ? "Refreshing" : "Refresh"}
          />
        </div>
      }
    >
      <div className="space-y-4 lg:space-y-6">
        <KpiGrid {...widgetProps} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 items-stretch [grid-auto-flow:row_dense]">
          {widgets.map(({ key, wide }) => (
            <div
              key={key}
              className={clsx("min-w-0 h-full [&>*]:h-full", wide && "md:col-span-2")}
            >
              <DashboardWidget widget={key} {...widgetProps} />
            </div>
          ))}
        </div>
      </div>     
      <Drawer open={askAiOpen} onClose={() => setAskAiOpen(false)} title="Ask AI · Record Search" width="lg">
        <SmartRecordSearch title="Search" defaultScope="all" sources={searchSources} />
      </Drawer>
    </PageLayout>
  );
}
