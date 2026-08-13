"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { DateRangePicker } from "@/components/ui/DatePicker";
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
  // Custom-range bounds, "YYYY-MM-DD". Read by the hook ONLY when timeFilter is
  // "custom"; kept (not cleared) when switching to a preset so toggling back
  // restores the range the user picked.
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [askAiOpen, setAskAiOpen] = useState(false);

  const isCustomRange = timeFilter === "custom";

  /**
   * ONE reset for every header filter — see the single "Clear filters" button
   * below. Resets period to the "30" default AND drops the custom range, so no
   * invisible date window can survive a clear.
   */
  const anyFilterActive = timeFilter !== "30" || !!siteFilter || !!sevFilter;
  const clearAllFilters = useCallback(() => {
    setTimeFilter("30");
    setCustomFrom("");
    setCustomTo("");
    setSiteFilter("");
    setSevFilter("");
  }, []);

  /**
   * Refresh is `router.refresh()` — it re-runs the server component and streams
   * fresh props in, but returns void, so there is nothing to await. Wrapping it
   * in a transition is the App Router's own way to observe it: `isRefreshing`
   * stays true until the re-rendered payload has been applied, which is exactly
   * the interval the spinner should cover.
   */
  const [isRefreshing, startRefresh] = useTransition();
  const handleRefresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const filters = useMemo<DashboardFilters>(
    () => ({ siteId: siteFilter, severity: sevFilter, period: timeFilter, from: customFrom, to: customTo }),
    [siteFilter, sevFilter, timeFilter, customFrom, customTo],
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

  /*
   * GP-CA-011's per-filter chips were REMOVED in favour of the single "Clear
   * filters" button below.
   *
   * Each chip restated a value its own control was already displaying — the
   * period dropdown shows the period, the site dropdown the site, the severity
   * dropdown the severity, and the range picker's trigger shows the chosen
   * range. So the chip row carried no information the row above it lacked, and
   * it put a second, differently-shaped clear affordance (a ✕) beside the
   * existing "Clear filters" button. One reset, one place.
   *
   * Nothing about FILTERING changed: the same five setters and the same default
   * values, invoked from one handler instead of three.
   */

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
          {/* The role pill (role label · focus area) was removed from the header.
              Display only — `access.role` still drives resolveDashboard, every
              permission gate and the focus-area scoping exactly as before. */}
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
              { value: "custom", label: "Custom range" },
            ]}
          />
          {/*
            Custom range — ONE calendar, replacing the two separate Start/End
            `DatePicker` fields.

            `DateRangePicker` is the existing sibling export in the same module,
            built on the same `CalendarPopover` grid as `DatePicker`, so it needs
            no new component and no new dependency: first click sets the start,
            second sets the end, and the days between are tinted `--brand-muted`
            (DatePicker.tsx:640 `isInRange`).

            from <= to is enforced STRUCTURALLY rather than validated: a click
            before the current start restarts the range there instead of
            producing an inverted one (DatePicker.tsx:574-586), so an invalid
            range is unreachable through the UI.

            It emits the same "YYYY-MM-DD" pair into the same two state slots, so
            `useDashboardData` is untouched — and a start-only selection still
            yields `to: ""`, which the hook already treats as no filter.
          */}
          {isCustomRange && (
            <DateRangePicker
              id="dash-period-range"
              value={{ start: customFrom, end: customTo }}
              onChange={(r) => { setCustomFrom(r.start); setCustomTo(r.end); }}
              placeholder="Pick a date range"
              className="w-56"
            />
          )}
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
          {/*
            The ONE reset. Previously the period had to be cleared from its chip
            while this button cleared only site + severity — two affordances that
            each reset a different subset. It now resets ALL FIVE pieces of
            filter state, and appears only when something is actually non-default
            (the app's convention, matching every other filter row).
          */}
          {/*
            Both trailing controls are ICON-ONLY — no text, no hover tooltip.
            Passing no children makes `Button` square (`isIconOnly` →
            ICON_ONLY_SIZES, Button.tsx:75/94), so at size="sm" they are two 32px
            squares sitting flush with the dropdowns beside them.

            `aria-label` is the one thing that stays: it renders nothing and shows
            no tooltip, but without it these buttons would have no accessible name
            at all once the text is gone. Same pattern as the other icon-only
            buttons (e.g. ActionPlanTable.tsx:191).
          */}
          {anyFilterActive && (
            <Button
              variant="ghost"
              size="sm"
              icon={FilterX}
              onClick={clearAllFilters}
              aria-label="Clear filters"
            />
          )}
          {/* GP-CA-016 — the "Updated <time>" label was removed from the header.
              Refresh still reloads the server props exactly as before; only the
              timestamp readout is gone. `loading` swaps the icon for Button's own
              spinner and disables the control, so a refresh cannot be re-fired
              while one is in flight. */}
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
      {/* One vertical rhythm for the whole page: the gap between the KPI row and
          the widget grid is the SAME token as the gap between two widgets. */}
      <div className="space-y-4 lg:space-y-6">
        {/* KPI row — the role's cards, already permission-resolved */}
        <KpiGrid {...widgetProps} />

        {/* The widget grid. One column on phones, two on tablets, three from `lg`.
            `items-stretch` + `h-full` on each item AND its card make every card in a
            row share that row's height, so tops AND bottoms line up and no short panel
            leaves a blank band beside (or under) a taller neighbour — the dead space
            the old `items-start` left. A card's `.card-body` is capped
            (`max-h-[26rem]`) and scrolls internally (`overflow-y-auto`) while its
            header stays fixed, so a long list (AI insights, risk signals, action plan)
            scrolls in place instead of stretching the page; the fixed-height charts sit
            under the cap and never scroll or clip. `min-w-0` keeps a wide child (a
            chart's ResponsiveContainer, the action-plan table) measuring against its
            track. `gap-4 lg:gap-6` is the same rhythm token as the KPI row above. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 items-stretch [grid-auto-flow:row_dense]">
          {widgets.map(({ key, wide }) => (
            <div
              key={key}
              // NOTE the space before `${`. Tailwind scans raw source text for class
              // candidates, so a class glued to a template interpolation is read as
              // one token (`…overflow-y-auto${wide`) and NEVER generated. That is
              // exactly what happened here: `max-h-[26rem]` compiled (it had a
              // trailing space) but `overflow-y-auto` did not, so every card-body was
              // capped at 26rem with `overflow: visible` and the surplus was clipped
              // by `.card { overflow: hidden }` (index.css) instead of scrolling.
              // Keep a separator before any interpolation in a className template.
              className={`min-w-0 h-full [&>*]:h-full [&_.card-body]:max-h-[26rem] [&_.card-body]:overflow-y-auto ${wide ? "md:col-span-2" : ""}`}
            >
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
