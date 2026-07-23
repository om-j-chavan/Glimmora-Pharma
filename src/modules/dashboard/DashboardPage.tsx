"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ShieldCheck, AlertTriangle, Clock, Database, GraduationCap, TrendingUp,
  Grid3x3, Calendar, Bot, Activity, Info,
  CheckCircle2, Search, ClipboardCheck, FileWarning, BarChart3, ClipboardList,
  MapPin, LayoutDashboard,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import dayjs from "@/lib/dayjs";
import { chartDefaults } from "@/lib/chartColors";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData, useTenantSitePredicate } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
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
import { Badge } from "@/components/ui/Badge";
import { StatCard, CardSection, SetupChecklist } from "@/components/shared";
import { PageLayout } from "@/components/layout/PageLayout";
import { isOverdue } from "@/types/capa";
import {
  computeDashboardKPIs, computeAreaScore, KPI_AREAS,
  severityTrend, isSeverityTrendEmpty, headlineReadinessLabel,
  isDIException, isValidationDrift,
} from "@/lib/kpi";
import { displayUserName } from "@/lib/identity-display";
import { regulatoryAlertSummary } from "@/lib/ai";
import { ActionPlanTable } from "./ActionPlanTable";
import { SmartRecordSearch } from "@/components/search/SmartRecordSearch";
import { buildCapaSource, buildDeviationSource, buildFindingSource } from "@/lib/searchSources";

/* ══════════════════════════════════════ */

export interface DashboardServerStats {
  complianceScore: number;
  criticalFindings: number;
  openFindings: number;
  overdueCAPAs: number;
  openCAPAs: number;
  openDeviations: number;
  criticalDeviations: number;
  overdueEvents: number;
  lowestReadiness: number;
  recentFindings: unknown[];
  recentCAPAs: unknown[];
  recentLogs: unknown[];
  totalFindings: number;
  totalCAPAs: number;
  totalDeviations: number;
  totalEvents: number;
}

export interface DashboardPageProps {
  /** Lowest readiness % across active inspections — server-computed. */
  readinessScore?: number;
  /**
   * Server-computed dashboard stats (counts + recent items).
   * Currently accepted but not consumed: the page still derives KPIs from
   * `useTenantData()` (now empty Redux). Wiring `stats` into the existing
   * KPI cards / heatmap / activity widgets is its own focused turn — the
   * component is ~840 lines of inline computation deeply integrated with
   * the slice-shaped data.
   */
  stats?: DashboardServerStats;
  /**
   * VISIBILITY-SCOPED server rows (Phase 6). Two jobs:
   *  1. They SEED the Redux slices, so every downstream Redux reader — GapPage,
   *     DeviationPage, GovernancePage's exports — sees only visible records.
   *  2. They feed this page's record-CONTENT surfaces: the 90-day action plan
   *     and the cross-module search.
   * `capas` is [] unless the viewer holds a CAPA-module role (CAPA has no
   * record-level fragment; the module itself is the gate). roadmap /
   * fda483Events still have no slices post server-first migration — useTenantData
   * returns [] for them — so they can't be seeded here.
   */
  findings?: FindingWithEdits[];
  capas?: Parameters<typeof mapCAPAFromPrisma>[0][];
  deviations?: PrismaDeviationWithCapa[];
  systems?: Parameters<typeof adaptPrismaSystem>[0][];
  /**
   * TENANT-WIDE server rows (Phase 6, decision #5) — aggregates only. Never
   * rendered as rows, never dispatched into Redux. They back the KPI cards, the
   * 6-month trend chart, the area×site heatmap and the AGI insight counts, so a
   * seat user and a QA head read the SAME totals. Site-filtered client-side by
   * useTenantSitePredicate (the store's own filter can't reach them).
   */
  allFindings?: FindingWithEdits[];
  allCAPAs?: Parameters<typeof mapCAPAFromPrisma>[0][];
  allSystems?: Parameters<typeof adaptPrismaSystem>[0][];
  /** Viewer holds a CAPA-module role → CAPA rows may appear as content. */
  canViewCAPAs?: boolean;
}

export function DashboardPage({
  readinessScore: readinessScoreProp,
  findings: serverFindings,
  capas: serverCAPAs,
  deviations: serverDeviations,
  systems: serverSystems,
  allFindings: serverAllFindings,
  allCAPAs: serverAllCAPAs,
  allSystems: serverAllSystems,
  canViewCAPAs = false,
}: DashboardPageProps = {}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  // Seed Redux from the server-fetched rows on mount / when props change. The
  // tenant/site filtering happens on READ in useTenantData (by currentTenant,
  // seeded by AppShell), so this dispatch is unconditional — identical to how
  // every module page hydrates its own slice. These props are the VISIBILITY-
  // SCOPED rows: the store is shared with GapPage / DeviationPage / Governance,
  // so seeding it tenant-wide would leak hidden records into their lists and
  // exports.
  useEffect(() => {
    if (serverFindings) dispatch(setFindings(serverFindings.map(adaptFinding)));
    if (serverCAPAs) dispatch(setCAPAs(serverCAPAs.map(mapCAPAFromPrisma)));
    if (serverDeviations) dispatch(setDeviations(serverDeviations.map(adaptDeviation)));
    if (serverSystems) dispatch(setSystems(serverSystems.map(adaptPrismaSystem)));
  }, [serverFindings, serverCAPAs, serverDeviations, serverSystems, dispatch]);
  // Visibility-SCOPED (Redux). Everything rendered as a record row comes from here.
  const { findings, capas, deviations, systems, roadmap, fda483Events } = useTenantData();

  // Tenant-WIDE (props, never dispatched). Everything counted comes from here.
  // Adapted to the slice shape so the aggregate maths below is identical
  // whichever array it runs over, then narrowed by the same tenant/site rule
  // useTenantData applies to the store.
  const sitePredicate = useTenantSitePredicate();
  const allFindings = useMemo(
    () => (serverAllFindings ?? []).map(adaptFinding).filter(sitePredicate),
    [serverAllFindings, sitePredicate],
  );
  const allCAPAs = useMemo(
    () => (serverAllCAPAs ?? []).map(mapCAPAFromPrisma).filter(sitePredicate),
    [serverAllCAPAs, sitePredicate],
  );
  const allSystems = useMemo(
    () => (serverAllSystems ?? []).map(adaptPrismaSystem).filter(sitePredicate),
    [serverAllSystems, sitePredicate],
  );
  const { org, sites, users } = useTenantConfig();
  const agiSettings = useAppSelector((s) => s.settings.agi);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { role } = useRole();
  const isAdmin = role === "super_admin" || role === "customer_admin";

  // When a specific site is selected (at login), restrict heatmap to that site only.
  // Admins (customer_admin / super_admin) have selectedSiteId = null → show all sites.
  const visibleSites = selectedSiteId
    ? sites.filter((s) => s.id === selectedSiteId)
    : sites;

  function ownerName(id: string) { return displayUserName(id, users); }

  /* ── State ── */
  const [siteFilter, setSiteFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("30");
  const [sevFilter, setSevFilter] = useState("");

  const cutoff = useMemo(
    () => (timeFilter === "all" ? null : dayjs().subtract(parseInt(timeFilter), "day")),
    [timeFilter],
  );

  /* ── Filter predicates — ONE definition each, applied to both the tenant-wide
     aggregate arrays and the visibility-scoped content arrays, so the site /
     severity / time dropdowns act identically on counts and on rows.
     Memoised (Phase 7) so the derived arrays below can memoise on them. ── */
  const matchesFindingFilters = useCallback(
    (f: { siteId?: string | null; severity: string; createdAt?: string | null }) => {
      if (siteFilter && f.siteId !== siteFilter) return false;
      if (sevFilter && f.severity !== sevFilter) return false;
      if (cutoff && f.createdAt && dayjs.utc(f.createdAt).isBefore(cutoff)) return false;
      return true;
    },
    [siteFilter, sevFilter, cutoff],
  );
  const matchesCAPAFilters = useCallback(
    (c: { siteId?: string | null; createdAt?: string | null }) => {
      if (siteFilter && c.siteId !== siteFilter) return false;
      if (cutoff && c.createdAt && dayjs.utc(c.createdAt).isBefore(cutoff)) return false;
      return true;
    },
    [siteFilter, cutoff],
  );
  const matchesSystemFilters = useCallback(
    (s: { siteId?: string | null }) => !siteFilter || s.siteId === siteFilter,
    [siteFilter],
  );

  /* ── Aggregate inputs — TENANT-WIDE (decision #5). Feed the KPI cards, the
     trend chart, the heatmap and the AGI insight counts. ── */
  const filteredFindings = useMemo(() => allFindings.filter(matchesFindingFilters), [allFindings, matchesFindingFilters]);
  const filteredCAPAs = useMemo(() => allCAPAs.filter(matchesCAPAFilters), [allCAPAs, matchesCAPAFilters]);
  const filteredSystems = useMemo(() => allSystems.filter(matchesSystemFilters), [allSystems, matchesSystemFilters]);

  /* ── Content inputs — VISIBILITY-SCOPED. Feed the 90-day action plan, which
     renders requirement text / CAPA descriptions / system names and links to
     each record. Never used for a count. ── */
  const visibleFindings = useMemo(() => findings.filter(matchesFindingFilters), [findings, matchesFindingFilters]);
  const visibleCAPAs = useMemo(() => capas.filter(matchesCAPAFilters), [capas, matchesCAPAFilters]);
  const visibleSystems = useMemo(() => systems.filter(matchesSystemFilters), [systems, matchesSystemFilters]);

  /* ── KPIs — all derived from filtered data ── */
  const kpis = useMemo(
    () => computeDashboardKPIs({
      findings: filteredFindings, capas: filteredCAPAs, systems: filteredSystems,
    }),
    [filteredFindings, filteredCAPAs, filteredSystems],
  );
  const { openCAPAs, overdueCAPAs, criticalCount, capaOverdueRate, csvHighRisk, trainingCompliance } = kpis;
  // Content twin of `overdueCAPAs` — only the overdue CAPAs this viewer may see.
  const visibleOverdueCAPAs = visibleCAPAs.filter(isOverdue);

  // Prefer server-computed score (Prisma actions completion %); fall back to
  // the legacy Redux card-based score for backward-compat during migration.
  const reduxReadinessScore = useAppSelector((s) => s.readiness.score);
  const readinessScore = readinessScoreProp ?? reduxReadinessScore;
  const rl = headlineReadinessLabel(readinessScore, overdueCAPAs.length);

  /* ── Chart data — uses filtered findings so site/severity/date filters apply ── */
  const trendData = useMemo(() => severityTrend(filteredFindings), [filteredFindings]);
  const trendEmpty = isSeverityTrendEmpty(trendData);

  /* ── Heatmap — factors in findings, CAPAs, and systems ── */
  const AREAS = KPI_AREAS;
  // Area a CAPA belongs to: its linked Finding's area, or — for an unlinked
  // CAPA (no findingId, e.g. sourced from a Deviation or 483) — a source-based
  // fallback, the SAME mapping the Action Plan uses below. Without this, a site
  // whose only records are unlinked CAPAs never registers on the heatmap and
  // shows "—" despite having real records (Bug 17). Site stays exact (CAPA
  // carries its own siteId); only the area is inferred.
  // Aggregate helper — resolves against the tenant-wide findings so a CAPA's
  // area is stable regardless of who is looking (the heatmap is a count surface).
  // Per-area readiness via the shared KPI library — the SAME calculateReadiness
  // model Governance uses for whole-site readiness. Scored over the filter-
  // narrowed tenant-wide arrays so the site / severity / time dropdowns apply
  // consistently to both the score and the "has data" state.
  const getAreaScore = useCallback(
    (area: string, siteId?: string) =>
      computeAreaScore(area, siteId, {
        findings: filteredFindings, capas: filteredCAPAs, systems: filteredSystems,
      }),
    [filteredFindings, filteredCAPAs, filteredSystems],
  );
  const displayedSites = siteFilter ? visibleSites.filter((s) => s.id === siteFilter) : visibleSites;

  /* ── Action plan — record CONTENT, so every row is drawn from a visibility-
     scoped array. Each row renders requirement text / a CAPA description / a
     system name and deep-links by refId, so a row here is precisely a record the
     viewer is allowed to open on its module page. ── */
  const actionPlan = (() => {
    const items: { id: string; priority: "Critical" | "High" | "Medium" | "Low"; area: string; action: string; owner: string; dueDate: string; status: string; module: string; refId: string; agiRisk: "High" | "Medium" | "Low" }[] = [];
    visibleFindings.filter((f) => f.status !== "Closed" && (f.severity === "Critical" || f.severity === "High")).forEach((f) => items.push({ id: f.id, priority: f.severity, area: f.area, action: f.requirement.length > 60 ? f.requirement.slice(0, 60) + "..." : f.requirement, owner: f.owner, dueDate: f.targetDate ?? "", status: f.status, module: "gap-assessment", refId: f.id, agiRisk: f.severity === "Critical" ? "High" : "Medium" }));
    // CAPA rows only for a CAPA-module role. Everyone else is redirected off
    // /capa, so a CAPA row must not appear here either. (`capas` is already []
    // for them — the guard states the intent at the point it matters.)
    if (canViewCAPAs) visibleOverdueCAPAs.slice(0, 5).forEach((c) => {
      const linkedFinding = findings.find((f) => f.id === c.findingId);
      const area = linkedFinding?.area ?? (c.source === "483" ? "Regulatory" : c.source === "Deviation" ? "Manufacturing" : "QMS");
      items.push({ id: c.id, priority: c.risk, area, action: c.description.length > 60 ? c.description.slice(0, 60) + "..." : c.description, owner: c.owner, dueDate: c.dueDate, status: c.status, module: "capa", refId: c.id, agiRisk: c.risk === "Critical" ? "High" : "Medium" });
    });
    visibleSystems.filter((s) => s.riskLevel === "HIGH" && s.validationStatus !== "Validated").slice(0, 3).forEach((s) => items.push({ id: s.id, priority: "High", area: "CSV/IT", action: `Validate ${s.name} \u2014 ${s.validationStatus}`, owner: s.owner, dueDate: s.nextReview ?? "", status: s.validationStatus, module: "csv-csa", refId: s.id, agiRisk: "High" }));
    // CSV roadmap activities (non-complete, within 90 days)
    roadmap.filter((a) => a.status !== "Complete" && dayjs.utc(a.endDate).diff(dayjs(), "day") <= 90).forEach((a) => {
      const sys = systems.find((s) => s.id === a.systemId);
      items.push({ id: a.id, priority: "High", area: "CSV/IT", action: `${a.title}${sys ? ` \u2014 ${sys.name}` : ""}`, owner: a.owner, dueDate: a.endDate, status: a.status, module: "csv-csa", refId: a.systemId ?? a.id, agiRisk: "High" });
    });
    const p: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return items.sort((a, b) => (p[a.priority] ?? 4) - (p[b.priority] ?? 4) || (!a.dueDate ? 1 : !b.dueDate ? -1 : dayjs(a.dueDate).diff(dayjs(b.dueDate))));
  })();

  /* ── AGI insights — all use filtered data ── */
  // `id` is a stable semantic slug per insight kind (NOT derived from `text`,
  // which changes with the count). Used as the React key in the render loop;
  // a count flipping from 3 to 5 keeps the same id so the insight card
  // doesn't unmount/remount on every re-render.
  // Gap-detection source values — also feed AGI Insights below. Computed once
  // (ungated, so the Gap Detection panel works even in AGI manual mode) and
  // shared with AGI Insights so the two panels can never drift.
  const diOpen = filteredCAPAs.filter(isDIException).length;
  const overdueVal = filteredSystems.filter((s) => s.validationStatus === "Overdue").length;
  const reviewOverdue = filteredSystems.filter((s) => s.nextReview && dayjs.utc(s.nextReview).isBefore(dayjs())).length;
  const pending = filteredCAPAs.filter((c) => c.status === "pending_qa_review").length;

  const insights: { id: string; type: "warning" | "info" | "success"; text: string; action?: string; link?: string }[] = [];
  if (agiSettings.mode !== "manual") {
    // Regulatory Intelligence agent \u2014 FDA/EMA guidance change alerts. This is
    // EXTERNAL guidance, independent of tenant findings, so it surfaces even on
    // a fresh dashboard where the findings/CAPA Redux slices aren't yet
    // hydrated (those only load after visiting Gap/CAPA). Pushed first so it
    // stays within the insights.slice(0, 5) the rail renders. Deterministic
    // sync summary (no await) \u2014 the module page runs the full async scan.
    if (agiSettings.agents.regulatory) {
      const reg = regulatoryAlertSummary();
      if (reg.newRequirements > 0) insights.push({ id: "regulatory-new-requirements", type: "warning", text: `${reg.newRequirements} new FDA/EMA regulatory requirement${reg.newRequirements > 1 ? "s" : ""} flagged \u2014 review compliance alignment.`, action: "Review guidance", link: "/regulatory-intelligence" });
      else if (reg.total > 0) insights.push({ id: "regulatory-updates", type: "info", text: `${reg.total} FDA/EMA guidance update${reg.total > 1 ? "s" : ""} monitored this period.`, action: "Review guidance", link: "/regulatory-intelligence" });
    }
    // Drift Detection agent \u2014 validated-system drift. The rail renders
    // synchronously, so this reports the drift the tenant's OWN system records
    // actually evidence, via the canonical isValidationDrift predicate (overdue
    // revalidation / Part 11 / Annex 11) \u2014 the same source as the Validation-drift
    // KPI, so the two can never disagree. The full AI config/access/audit-trail
    // scan is an async LLM call and runs on the CSV/CSA page, which this links to.
    if (agiSettings.agents.drift) {
      const validationDrift = filteredSystems.filter(isValidationDrift).length;
      if (validationDrift > 0) insights.push({ id: "drift-open", type: "warning", text: `${validationDrift} validated system${validationDrift > 1 ? "s" : ""} showing validation drift \u2014 overdue revalidation or Part 11 / Annex 11 non-compliance.`, action: "Review drift", link: "/csv-csa" });
    }
  }
  // Finding/CAPA-derived insights require the Redux slices to be loaded.
  if (agiSettings.mode !== "manual" && (filteredFindings.length > 0 || filteredCAPAs.length > 0)) {
    if (criticalCount > 0) insights.push({ id: "critical-findings", type: "warning", text: `${criticalCount} critical finding${criticalCount > 1 ? "s" : ""} open \u2014 immediate attention required.`, action: "View findings", link: "/gap-assessment" });
    if (overdueCAPAs.length > 0) insights.push({ id: "overdue-capas", type: "warning", text: `${overdueCAPAs.length} CAPA${overdueCAPAs.length > 1 ? "s" : ""} past due. Risk of inspection finding.`, action: "View CAPAs", link: "/capa" });
    if (diOpen > 0) insights.push({ id: "di-gate-open", type: "warning", text: `${diOpen} open DI gate CAPA${diOpen > 1 ? "s" : ""}. Data integrity unresolved.`, action: "View DI issues", link: "/capa" });
    if (csvHighRisk > 0) insights.push({ id: "csv-high-risk-unvalidated", type: "warning", text: `${csvHighRisk} HIGH-risk system${csvHighRisk > 1 ? "s" : ""} not yet validated \u2014 FDA inspection exposure.`, action: "View systems", link: "/csv-csa" });
    if (overdueVal > 0) insights.push({ id: "validation-overdue", type: "warning", text: `${overdueVal} system${overdueVal > 1 ? "s" : ""} with overdue validation.`, action: "View systems", link: "/csv-csa" });
    if (reviewOverdue > 0) insights.push({ id: "periodic-review-overdue", type: "warning", text: `${reviewOverdue} system${reviewOverdue > 1 ? "s" : ""} with periodic review overdue.`, action: "View systems", link: "/csv-csa" });
    if (pending > 0) insights.push({ id: "capa-pending-qa", type: "info", text: `${pending} CAPA${pending > 1 ? "s" : ""} awaiting QA sign-off.`, action: "Review", link: "/capa" });
    if (criticalCount === 0 && overdueCAPAs.length === 0) insights.push({ id: "all-clear", type: "success", text: "No critical findings or overdue CAPAs. Maintain current trajectory." });
  }


  const rsCol = rl.color;

  /* ══════════════════════════════════════ */

  // Root is a <section>, not a second <main> — AppShell already renders the
  // page's <main id="main-content"> landmark; a nested duplicate id is an a11y
  // bug. (Recovered from commit 6c46a07, which Rung 3J accidentally reverted.)
  return (
      <PageLayout
        title="Dashboard"
        titleIcon={LayoutDashboard}
        description="Compliance KPIs, risk signals, and your 90-day action plan across every site."
        headerRight={
          <div className="flex items-center gap-2 flex-wrap">
            <Dropdown value={timeFilter} onChange={setTimeFilter} width="w-36" options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "60", label: "Last 60 days" }, { value: "90", label: "Last 90 days" }, { value: "all", label: "All time" }]} />
            {isAdmin && <Dropdown placeholder="All sites" value={siteFilter} onChange={setSiteFilter} width="w-36" options={[{ value: "", label: "All sites" }, ...visibleSites.map((s) => ({ value: s.id, label: s.name }))]} />}
            <Dropdown placeholder="All severities" value={sevFilter} onChange={setSevFilter} width="w-32" options={[{ value: "", label: "All severities" }, { value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }]} />
            {(siteFilter || sevFilter) && <Button variant="ghost" size="sm" onClick={() => { setSiteFilter(""); setSevFilter(""); }}>Clear filters</Button>}
          </div>
        }
      >
        <div className="space-y-5">

      {/* Setup checklist */}
      <SetupChecklist />

      {/* Feature 2 — Plain-English Record Search (cross-module).
          Phase 6: search executes CLIENT-SIDE over the records handed to it
          (the server only translates the sentence into a filter spec), so the
          sources ARE the scope. Each is built from the visibility-scoped Redux
          array — a record the viewer can't open on its module page can never be
          matched here. The CAPA source is omitted entirely for non-CAPA-module
          roles rather than handed an empty array, so the module chip doesn't
          advertise a scope they have no access to. */}
      <SmartRecordSearch
        title="Search"
        defaultScope="all"
        sources={[
          ...(canViewCAPAs ? [buildCapaSource(capas, sites, (id) => router.push(`/capa/${id}`))] : []),
          buildDeviationSource(deviations, sites, () => router.push("/deviation")),
          buildFindingSource(findings, sites, () => router.push("/gap-assessment")),
        ]}
      />

      {/* KPI cards */}
      <section aria-label="Key performance indicators" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Deep links (Phase 8): each KPI jumps to its Governance scorecard
            section \u2014 readiness \u2192 site readiness, criticals \u2192 repeat-observation
            risk, CAPA overdue \u2192 CAPA timeliness, CSV \u2192 validation drift. */}
        <StatCard icon={ShieldCheck} color={rsCol} label="Overall readiness" value={`${readinessScore}%`} sub={rl.label} href="/governance?tab=kpis#kpi-site-readiness" />
        <StatCard icon={AlertTriangle} color={criticalCount > 0 ? "#ef4444" : "#10b981"} label="Critical findings" value={String(criticalCount)} sub={filteredFindings.length === 0 ? "No findings logged yet" : `${filteredFindings.filter((f) => f.status !== "Closed").length} total open`} href="/governance?tab=kpis#kpi-repeat-observation" />
        <StatCard icon={Clock} color={capaOverdueRate === null ? "#64748b" : capaOverdueRate === 0 ? "#10b981" : capaOverdueRate <= 20 ? "#f59e0b" : "#ef4444"} label="CAPA overdue" value={capaOverdueRate === null ? "\u2014" : `${capaOverdueRate}%`} sub={openCAPAs.length === 0 ? "No open CAPAs" : `${overdueCAPAs.length} of ${openCAPAs.length} past due`} href="/governance?tab=kpis#kpi-capa-timeliness" />
        <StatCard icon={Database} color={csvHighRisk > 0 ? "#f59e0b" : "#10b981"} label="CSV high risk" value={String(csvHighRisk)} sub={filteredSystems.length === 0 ? "No systems registered" : "HIGH risk, not yet validated"} href="/governance?tab=kpis#kpi-validation-drift" />
        <StatCard icon={GraduationCap} color={trainingCompliance === null ? "#64748b" : trainingCompliance >= 90 ? "#10b981" : trainingCompliance >= 70 ? "#f59e0b" : "#ef4444"} label="Training compliance" value={trainingCompliance === null ? "\u2014" : `${trainingCompliance}%`} sub={trainingCompliance === null ? "Not yet tracked" : "of required training complete"} />
      </section>

      {/* Main grid */}
      {/* lg:items-start so the shorter right rail is NOT stretched to the tall
          left column's height (removes the empty bottom-right region with a tall
          90-day action plan). The rail is also sticky (see below). */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 lg:items-start">
        {/* Left + Center */}
        <div className="lg:col-span-2 space-y-4">
          {/* ① Heatmap */}
          <CardSection icon={Grid3x3} title="Area readiness heatmap">
            {visibleSites.length === 0 ? (
              <div className="text-center py-6">
                <MapPin className="w-8 h-8 mx-auto mb-2" style={{ color: "#334155" }} aria-hidden="true" />
                <p className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>No sites configured yet</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Go to Settings &rarr; Sites to add your sites.</p>
                <button type="button" onClick={() => router.push("/settings")} className="text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer mt-2">Add sites in Settings &rarr;</button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]" aria-label="Area readiness heatmap">
                    <thead><tr><th className="text-left py-2 pr-3 w-28 font-semibold" style={{ color: "var(--text-muted)" }}>Area</th>
                      {displayedSites.map((s) => <th key={s.id} className="text-center py-2 px-1 font-semibold whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{s.name}</th>)}
                    </tr></thead>
                    <tbody>{AREAS.map((area) => (
                      <tr key={area}><td className="py-1 pr-3 font-medium whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{area}</td>
                        {displayedSites.map((site) => {
                          const { open, critical, hasData, color, percentage } = getAreaScore(area, site.id);
                          if (!hasData) {
                            const neutral = "#64748b";
                            return <td key={site.id} className="py-1 px-1 text-center"><button type="button" title={`${area} \u2014 ${site.name}\nNot assessed yet \u2014 no findings, CAPAs or systems logged for this area.`} onClick={() => router.push("/gap-assessment")} className="w-full py-2 px-1 rounded-lg text-[10px] font-bold border-none cursor-pointer transition-opacity hover:opacity-80" style={{ background: neutral + "1a", color: neutral, border: `1px dashed ${neutral}55` }} aria-label={`${area} ${site.name}: not assessed yet`}>{"\u2014"}</button></td>;
                          }
                          const bg = color;
                          return <td key={site.id} className="py-1 px-1 text-center"><button type="button" title={`${area} \u2014 ${site.name}\nScore: ${percentage}\nOpen: ${open}\nCritical: ${critical}`} onClick={() => router.push("/gap-assessment")} className="w-full py-2 px-1 rounded-lg text-[10px] font-bold border-none cursor-pointer transition-opacity hover:opacity-80" style={{ background: bg + "22", color: bg, border: `1px solid ${bg}44` }} aria-label={`${area} ${site.name}: ${percentage}`}>{open === 0 ? "\u2713" : percentage}</button></td>;
                        })}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="flex gap-4 mt-3 text-[10px] flex-wrap" style={{ color: "var(--text-muted)" }}>{[["#10b981", "\u2265 80% ready"], ["#f59e0b", "60\u201379%"], ["#ef4444", "< 60%"], ["#64748b", "not assessed"]].map(([c, l]) => <div key={l} className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ background: c }} />{l}</div>)}</div>
                {visibleSites.length > displayedSites.length && !siteFilter && <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>Showing {displayedSites.length} of {visibleSites.length} sites. Use site filter to view a specific site.</p>}
              </>
            )}
          </CardSection>

          {/* ② Trend chart */}
          <CardSection icon={TrendingUp} iconColor="#6366f1" title="Observation volume &amp; severity">
            {trendEmpty ? (
              <div className="flex flex-col items-center py-5"><BarChart3 className="w-8 h-8 text-[#334155] mb-2" aria-hidden="true" /><p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No findings logged yet</p></div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData} barSize={14} barGap={2}><CartesianGrid {...chartDefaults.cartesianGrid} /><XAxis dataKey="month" {...chartDefaults.xAxis} /><YAxis {...chartDefaults.yAxis} allowDecimals={false} /><Tooltip {...chartDefaults.tooltip} /><Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{v}</span>} /><Bar dataKey="Critical" name="Critical" fill="#ef4444" stackId="a" radius={[0, 0, 0, 0]} /><Bar dataKey="High" name="High" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} /><Bar dataKey="Medium" name="Medium" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} /><Bar dataKey="Low" name="Low" fill="#10b981" stackId="a" radius={[3, 3, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            )}
          </CardSection>

          {/* ③ Action plan */}
          <CardSection icon={Calendar} iconColor="#f59e0b" title="90-day action plan" badge={actionPlan.length > 0 ? <Badge variant="amber">{actionPlan.length}</Badge> : undefined}>
            {actionPlan.length === 0 ? (
              <div className="flex flex-col items-center py-5"><ClipboardList className="w-10 h-10 text-[#334155] mb-2" aria-hidden="true" /><p className="text-[12px] mb-2" style={{ color: "var(--text-muted)" }}>No open actions</p><Button variant="ghost" size="sm" onClick={() => router.push("/gap-assessment")}>Log a finding</Button></div>
            ) : (
              <ActionPlanTable
                items={actionPlan}
                ownerName={ownerName}
                timezone={timezone}
                dateFormat={dateFormat}
                router={router}
              />
            )}
          </CardSection>
        </div>

        {/* Right rail. lg:self-start (content-height, not stretched) + lg:sticky
            lg:top-0 so the shorter rail follows the scroll instead of stranding
            empty space beside a tall left column. (Recovered from 6c46a07.) */}
        <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
          {/* ④ AGI insights */}
          <aside aria-label="AGI insights" className="card">
            <div className="card-header"><div className="flex items-center gap-2"><Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">AGI Insights</span></div>{(() => { const activeAgents = Object.values(agiSettings.agents).filter(Boolean).length; const totalAgents = Object.values(agiSettings.agents).length; if (agiSettings.mode === "manual" || activeAgents === 0) return <Badge variant="gray">inactive</Badge>; if (activeAgents === totalAgents) return <Badge variant="green">autonomous</Badge>; return <Badge variant="amber">{activeAgents}/{totalAgents} active</Badge>; })()}</div>
            <div className="card-body space-y-2">
              {agiSettings.mode === "manual" ? (
                <><p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>AGI is in manual mode. Enable agents in Settings &rarr; AGI Policy.</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => router.push("/settings")}>Configure &rarr;</Button></>
              ) : insights.length === 0 ? (
                <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No insights to show. Adjust filters or enable AGI agents in Settings.</p>
              ) : insights.slice(0, 5).map((ins) => (
                <div key={ins.id} className={clsx("flex items-start gap-2 p-2.5 rounded-lg", ins.type === "warning" ? isDark ? "bg-(--warning-bg) border border-(--warning)" : "bg-[#fffbeb] border border-[#fde68a]" : ins.type === "success" ? isDark ? "bg-(--success-bg) border border-(--success)" : "bg-[#f0fdf4] border border-[#a7f3d0]" : "bg-(--bg-surface) border border-(--bg-border)")}>
                  {ins.type === "warning" ? <AlertTriangle className="w-3.5 h-3.5 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" /> : ins.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <Info className="w-3.5 h-3.5 text-[#0ea5e9] flex-shrink-0 mt-0.5" aria-hidden="true" />}
                  <div className="flex-1 min-w-0"><p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{ins.text}</p>{ins.action && ins.link && <button onClick={() => router.push(ins.link!)} className="text-[10px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer mt-1">{ins.action} &rarr;</button>}</div>
                </div>
              ))}
            </div>
          </aside>

          {/* ⑤ Risk signals */}
          <CardSection icon={Activity} iconColor="#ef4444" title="Risk signals">
            {/* By severity */}
            {(["Critical", "High", "Medium", "Low"] as const).map((sev) => { const cnt = filteredFindings.filter((f) => f.severity === sev && f.status !== "Closed").length; const dot = sev === "Critical" ? "#ef4444" : sev === "High" || sev === "Medium" ? "#f59e0b" : "#10b981"; const valCol = cnt === 0 ? "#64748b" : cnt <= 2 ? "#f59e0b" : "#ef4444"; return (
              <div key={sev} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "var(--bg-border)" }}>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: dot }} /><span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{sev}</span></div>
                <span className="text-[14px] font-bold" style={{ color: valCol }}>{cnt}</span>
              </div>
            ); })}
            {/* By area */}
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 mt-3" style={{ color: "var(--text-muted)" }}>By area</p>
            {["Manufacturing", "QC Lab", "QMS", "CSV/IT"].map((area) => { const cnt = filteredFindings.filter((f) => f.area === area && f.status !== "Closed").length; const max = Math.max(...["Manufacturing", "QC Lab", "QMS", "CSV/IT"].map((a) => filteredFindings.filter((f) => f.area === a && f.status !== "Closed").length), 1); return (
              <div key={area} className="mb-2"><div className="flex justify-between mb-1"><span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{area}</span><span className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{cnt}</span></div><div className={clsx("h-1 rounded-full", "bg-(--bg-border)")}><div className="h-full rounded-full bg-[#0ea5e9]" style={{ width: `${Math.round((cnt / max) * 100)}%` }} /></div></div>
            ); })}
            {/* Quick links */}
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 mt-3" style={{ color: "var(--text-muted)" }}>Quick links</p>
            {[
              { label: "Gap Assessment", path: "/gap-assessment", Icon: Search, badge: filteredFindings.filter((f) => f.status !== "Closed").length, color: "#ef4444" },
              { label: "CAPA Tracker", path: "/capa", Icon: ClipboardCheck, badge: openCAPAs.length, color: overdueCAPAs.length > 0 ? "#ef4444" : "#f59e0b", tip: `${openCAPAs.length} open CAPAs` },
              { label: "CSV/CSA", path: "/csv-csa", Icon: Database, badge: csvHighRisk, color: "#f59e0b" },
              { label: "FDA 483", path: "/fda-483", Icon: FileWarning, badge: fda483Events.filter((e) => e.status !== "Closed").length, color: "#ef4444" },
            ].map((lk) => (
              <button key={lk.path} type="button" onClick={() => router.push(lk.path)} title={lk.tip} className="w-full flex items-center justify-between p-2 rounded-lg text-[12px] cursor-pointer border-none bg-transparent hover:bg-(--brand-muted) transition-colors text-left">
                <div className="flex items-center gap-2"><lk.Icon className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" /><span style={{ color: "var(--text-primary)" }}>{lk.label}</span></div>
                {lk.badge > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: lk.color }}>{lk.badge}</span>}
              </button>
            ))}
          </CardSection>
        </div>
      </div>
        </div>
      </PageLayout>
  );
}