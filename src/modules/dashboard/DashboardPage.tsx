"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ShieldCheck, AlertTriangle, Clock, Database, GraduationCap, TrendingUp,
  Grid3x3, Calendar, Bot, Activity, ChevronRight, Info,
  CheckCircle2, Search, ClipboardCheck, FileWarning, BarChart3, ClipboardList,
  MapPin,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import dayjs from "@/lib/dayjs";
import { chartDefaults } from "@/lib/chartColors";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { StatCard, CardSection, SetupChecklist } from "@/components/shared";

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
}

export function DashboardPage({ readinessScore: readinessScoreProp }: DashboardPageProps = {}) {
  const router = useRouter();
  const { findings, capas, systems, roadmap, fda483Events, tenantId } = useTenantData();
  const { org, sites, users } = useTenantConfig();
  const agiSettings = useAppSelector((s) => s.settings.agi);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const companyName = org.companyName;
  const tenants = useAppSelector((s) => s.auth.tenants);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { role } = useRole();
  const isAdmin = role === "super_admin" || role === "customer_admin";

  // When a specific site is selected (at login), restrict heatmap to that site only.
  // Admins (customer_admin / super_admin) have selectedSiteId = null → show all sites.
  const visibleSites = selectedSiteId
    ? sites.filter((s) => s.id === selectedSiteId)
    : sites;

  const currentTenant = tenants.find((t) => t.id === tenantId);
  function ownerName(id: string) { return users.find((u) => u.id === id)?.name ?? id; }

  /* ── State ── */
  const [siteFilter, setSiteFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("30");
  const [sevFilter, setSevFilter] = useState("");

  const cutoff = timeFilter === "all" ? null : dayjs().subtract(parseInt(timeFilter), "day");

  // Apply ALL filters to findings
  const filteredFindings = findings.filter((f) => {
    if (siteFilter && f.siteId !== siteFilter) return false;
    if (sevFilter && f.severity !== sevFilter) return false;
    if (cutoff && f.createdAt && dayjs.utc(f.createdAt).isBefore(cutoff)) return false;
    return true;
  });

  // Apply site + date filters to CAPAs
  const filteredCAPAs = capas.filter((c) => {
    if (siteFilter && c.siteId !== siteFilter) return false;
    if (cutoff && c.createdAt && dayjs.utc(c.createdAt).isBefore(cutoff)) return false;
    return true;
  });

  // Apply site filter to systems
  const filteredSystems = systems.filter((s) => {
    if (siteFilter && s.siteId !== siteFilter) return false;
    return true;
  });

  /* ── KPIs — all derived from filtered data ── */
  const openCAPAs = filteredCAPAs.filter((c) => c.status !== "Closed");
  const overdueCAPAs = openCAPAs.filter((c) => dayjs.utc(c.dueDate).isBefore(dayjs()));
  const criticalCount = filteredFindings.filter((f) => f.severity === "Critical" && f.status !== "Closed").length;
  const capaOverdueRate = openCAPAs.length === 0 ? null : Math.round((overdueCAPAs.length / openCAPAs.length) * 100);
  // CSV high risk = HIGH risk systems that are not yet validated (consistent with heatmap + action plan)
  const csvHighRisk = filteredSystems.filter((s) => s.riskLevel === "HIGH" && s.validationStatus !== "Validated").length;
  const trainingCompliance = users.length === 0 ? null : Math.round((users.filter((u) => u.status === "Active").length / users.length) * 100);

  // Prefer server-computed score (Prisma actions completion %); fall back to
  // the legacy Redux card-based score for backward-compat during migration.
  const reduxReadinessScore = useAppSelector((s) => s.readiness.score);
  const readinessScore = readinessScoreProp ?? reduxReadinessScore;

  function getReadinessLabel(score: number | null, overdueCapaCount: number): { label: string; color: string } {
    if (score === null) return { label: "Log findings to calculate", color: "#64748b" };
    if (overdueCapaCount >= 2) return { label: "Not ready", color: "#ef4444" };
    if (overdueCapaCount >= 1) return { label: "Needs attention", color: "#f59e0b" };
    if (score >= 95) return { label: "Inspection ready \u2713", color: "#10b981" };
    if (score >= 80) return { label: "Nearing ready", color: "#f59e0b" };
    if (score >= 60) return { label: "Needs attention", color: "#f59e0b" };
    return { label: "Not ready", color: "#ef4444" };
  }
  const rl = getReadinessLabel(readinessScore, overdueCAPAs.length);

  /* ── Chart data — uses filtered findings so site/severity/date filters apply ── */
  const trendData = (() => { const m = []; for (let i = 5; i >= 0; i--) { const mo = dayjs().subtract(i, "month"); const mf = filteredFindings.filter((f) => f.createdAt && dayjs.utc(f.createdAt).format("MMM YYYY") === mo.format("MMM YYYY")); m.push({ month: mo.format("MMM"), Critical: mf.filter((f) => f.severity === "Critical").length, High: mf.filter((f) => f.severity === "High").length, Low: mf.filter((f) => f.severity === "Low").length }); } return m; })();
  const trendEmpty = trendData.every((d) => d.Critical + d.High + d.Low === 0);

  /* ── Heatmap — factors in findings, CAPAs, and systems ── */
  const AREAS = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT"];
  function getAreaScore(area: string, siteId?: string) {
    const af = filteredFindings.filter((f) => f.area === area && (!siteId || f.siteId === siteId) && f.status !== "Closed");
    const cr = af.filter((f) => f.severity === "Critical").length;
    const mj = af.filter((f) => f.severity === "High").length;
    // Overdue CAPAs linked to findings in this area+site
    const areaCapaOverdue = overdueCAPAs.filter((c) => {
      if (siteId && c.siteId !== siteId) return false;
      const lf = findings.find((f) => f.id === c.findingId);
      return lf ? lf.area === area : false;
    }).length;
    // High-risk systems in this site (for CSV/IT area)
    const sysRisk = area === "CSV/IT" ? filteredSystems.filter((s) => (!siteId || s.siteId === siteId) && (s.riskLevel === "HIGH" && s.validationStatus !== "Validated")).length : 0;
    // "Has data" = something has actually been logged for this area+site.
    // Without this, an untouched site shows as 100% green everywhere, which
    // reads as "fully compliant" when it really means "never assessed".
    const totalFindingsForArea = findings.filter((f) => f.area === area && (!siteId || f.siteId === siteId)).length;
    const totalCapasForArea = capas.filter((c) => {
      if (siteId && c.siteId !== siteId) return false;
      const lf = findings.find((f) => f.id === c.findingId);
      return lf ? lf.area === area : false;
    }).length;
    const totalSystemsForArea = area === "CSV/IT" ? systems.filter((s) => !siteId || s.siteId === siteId).length : 0;
    const hasData = totalFindingsForArea + totalCapasForArea + totalSystemsForArea > 0;
    const score = Math.max(0, 100 - cr * 30 - mj * 15 - areaCapaOverdue * 20 - sysRisk * 25);
    return { score, open: af.length, critical: cr, hasData };
  }
  const displayedSites = siteFilter ? visibleSites.filter((s) => s.id === siteFilter) : visibleSites;

  /* ── Action plan ── */
  const actionPlan = (() => {
    const items: { id: string; priority: "Critical" | "High" | "Low"; area: string; action: string; owner: string; dueDate: string; status: string; module: string; refId: string; agiRisk: "High" | "Medium" | "Low" }[] = [];
    filteredFindings.filter((f) => f.status !== "Closed" && (f.severity === "Critical" || f.severity === "High")).forEach((f) => items.push({ id: f.id, priority: f.severity, area: f.area, action: f.requirement.length > 60 ? f.requirement.slice(0, 60) + "..." : f.requirement, owner: f.owner, dueDate: f.targetDate ?? "", status: f.status, module: "gap-assessment", refId: f.id, agiRisk: f.severity === "Critical" ? "High" : "Medium" }));
    overdueCAPAs.slice(0, 5).forEach((c) => {
      const linkedFinding = findings.find((f) => f.id === c.findingId);
      const area = linkedFinding?.area ?? (c.source === "483" ? "Regulatory" : c.source === "Deviation" ? "Manufacturing" : "QMS");
      items.push({ id: c.id, priority: c.risk, area, action: c.description.length > 60 ? c.description.slice(0, 60) + "..." : c.description, owner: c.owner, dueDate: c.dueDate, status: c.status, module: "capa", refId: c.id, agiRisk: c.risk === "Critical" ? "High" : "Medium" });
    });
    filteredSystems.filter((s) => s.riskLevel === "HIGH" && s.validationStatus !== "Validated").slice(0, 3).forEach((s) => items.push({ id: s.id, priority: "High", area: "CSV/IT", action: `Validate ${s.name} \u2014 ${s.validationStatus}`, owner: s.owner, dueDate: s.nextReview ?? "", status: s.validationStatus, module: "csv-csa", refId: s.id, agiRisk: "High" }));
    // CSV roadmap activities (non-complete, within 90 days)
    roadmap.filter((a) => a.status !== "Complete" && dayjs.utc(a.endDate).diff(dayjs(), "day") <= 90).forEach((a) => {
      const sys = systems.find((s) => s.id === a.systemId);
      items.push({ id: a.id, priority: "High", area: "CSV/IT", action: `${a.title}${sys ? ` \u2014 ${sys.name}` : ""}`, owner: a.owner, dueDate: a.endDate, status: a.status, module: "csv-csa", refId: a.systemId ?? a.id, agiRisk: "High" });
    });
    const p: Record<string, number> = { Critical: 0, High: 1, Low: 2 };
    return items.sort((a, b) => (p[a.priority] ?? 2) - (p[b.priority] ?? 2) || (!a.dueDate ? 1 : !b.dueDate ? -1 : dayjs(a.dueDate).diff(dayjs(b.dueDate))));
  })();

  /* ── AGI insights — all use filtered data ── */
  const insights: { type: "warning" | "info" | "success"; text: string; action?: string; link?: string }[] = [];
  if (agiSettings.mode !== "manual" && (filteredFindings.length > 0 || filteredCAPAs.length > 0)) {
    if (criticalCount > 0) insights.push({ type: "warning", text: `${criticalCount} critical finding${criticalCount > 1 ? "s" : ""} open \u2014 immediate attention required.`, action: "View findings", link: "/gap-assessment" });
    if (overdueCAPAs.length > 0) insights.push({ type: "warning", text: `${overdueCAPAs.length} CAPA${overdueCAPAs.length > 1 ? "s" : ""} past due. Risk of inspection finding.`, action: "View CAPAs", link: "/capa" });
    const diOpen = filteredCAPAs.filter((c) => c.diGate && c.status !== "Closed").length;
    if (diOpen > 0) insights.push({ type: "warning", text: `${diOpen} open DI gate CAPA${diOpen > 1 ? "s" : ""}. Data integrity unresolved.`, action: "View DI issues", link: "/capa" });
    if (csvHighRisk > 0) insights.push({ type: "warning", text: `${csvHighRisk} HIGH-risk system${csvHighRisk > 1 ? "s" : ""} not yet validated \u2014 FDA inspection exposure.`, action: "View systems", link: "/csv-csa" });
    const overdueVal = filteredSystems.filter((s) => s.validationStatus === "Overdue").length;
    if (overdueVal > 0) insights.push({ type: "warning", text: `${overdueVal} system${overdueVal > 1 ? "s" : ""} with overdue validation.`, action: "View systems", link: "/csv-csa" });
    const reviewOverdue = filteredSystems.filter((s) => s.nextReview && dayjs.utc(s.nextReview).isBefore(dayjs())).length;
    if (reviewOverdue > 0) insights.push({ type: "warning", text: `${reviewOverdue} system${reviewOverdue > 1 ? "s" : ""} with periodic review overdue.`, action: "View systems", link: "/csv-csa" });
    const pending = filteredCAPAs.filter((c) => c.status === "Pending QA Review").length;
    if (pending > 0) insights.push({ type: "info", text: `${pending} CAPA${pending > 1 ? "s" : ""} awaiting QA sign-off.`, action: "Review", link: "/capa" });
    if (criticalCount === 0 && overdueCAPAs.length === 0) insights.push({ type: "success", text: "No critical findings or overdue CAPAs. Maintain current trajectory." });
  }


  const rsCol = rl.color;

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="Executive overview dashboard" className="w-full space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Executive Dashboard</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="page-subtitle">{currentTenant?.name || companyName || "Pharma Glimmora"} &middot; {dayjs().format("MMMM YYYY")}</p>
            {currentTenant?.plan && <Badge variant={currentTenant.plan === "enterprise" ? "green" : currentTenant.plan === "professional" ? "blue" : "gray"}>{currentTenant.plan}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Dropdown value={timeFilter} onChange={setTimeFilter} width="w-36" options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "60", label: "Last 60 days" }, { value: "90", label: "Last 90 days" }, { value: "all", label: "All time" }]} />
          {isAdmin && <Dropdown placeholder="All sites" value={siteFilter} onChange={setSiteFilter} width="w-36" options={[{ value: "", label: "All sites" }, ...visibleSites.map((s) => ({ value: s.id, label: s.name }))]} />}
          <Dropdown placeholder="All severities" value={sevFilter} onChange={setSevFilter} width="w-32" options={[{ value: "", label: "All severities" }, { value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Low", label: "Low" }]} />
          {(siteFilter || sevFilter) && <Button variant="ghost" size="sm" onClick={() => { setSiteFilter(""); setSevFilter(""); }}>Clear</Button>}
        </div>
      </header>

      {/* Setup checklist */}
      <SetupChecklist />

      {/* KPI cards */}
      <section aria-label="Key performance indicators" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard icon={ShieldCheck} color={rsCol} label="Overall readiness" value={`${readinessScore}%`} sub={rl.label} />
        <StatCard icon={AlertTriangle} color={criticalCount > 0 ? "#ef4444" : "#10b981"} label="Critical findings" value={String(criticalCount)} sub={filteredFindings.length === 0 ? "No findings logged yet" : `${filteredFindings.filter((f) => f.status !== "Closed").length} total open`} />
        <StatCard icon={Clock} color={capaOverdueRate === null ? "#64748b" : capaOverdueRate === 0 ? "#10b981" : capaOverdueRate <= 20 ? "#f59e0b" : "#ef4444"} label="CAPA overdue" value={capaOverdueRate === null ? "\u2014" : `${capaOverdueRate}%`} sub={openCAPAs.length === 0 ? "No open CAPAs" : `${overdueCAPAs.length} of ${openCAPAs.length} past due`} />
        <StatCard icon={Database} color={csvHighRisk > 0 ? "#f59e0b" : "#10b981"} label="CSV high risk" value={String(csvHighRisk)} sub={filteredSystems.length === 0 ? "No systems registered" : "HIGH risk, not yet validated"} />
        <StatCard icon={GraduationCap} color={trainingCompliance === null ? "#64748b" : trainingCompliance >= 90 ? "#10b981" : trainingCompliance >= 70 ? "#f59e0b" : "#ef4444"} label="Training compliance" value={trainingCompliance === null ? "\u2014" : `${trainingCompliance}%`} sub={users.length === 0 ? "No users configured" : `${users.filter((u) => u.status === "Active").length} active users`} />
      </section>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
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
                          const { score, open, critical, hasData } = getAreaScore(area, site.id);
                          if (!hasData) {
                            const neutral = "#64748b";
                            return <td key={site.id} className="py-1 px-1 text-center"><button type="button" title={`${area} \u2014 ${site.name}\nNot assessed yet \u2014 no findings, CAPAs or systems logged for this area.`} onClick={() => router.push("/gap-assessment")} className="w-full py-2 px-1 rounded-lg text-[10px] font-bold border-none cursor-pointer transition-opacity hover:opacity-80" style={{ background: neutral + "1a", color: neutral, border: `1px dashed ${neutral}55` }} aria-label={`${area} ${site.name}: not assessed yet`}>\u2014</button></td>;
                          }
                          const bg = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
                          return <td key={site.id} className="py-1 px-1 text-center"><button type="button" title={`${area} \u2014 ${site.name}\nScore: ${score}%\nOpen: ${open}\nCritical: ${critical}`} onClick={() => router.push("/gap-assessment")} className="w-full py-2 px-1 rounded-lg text-[10px] font-bold border-none cursor-pointer transition-opacity hover:opacity-80" style={{ background: bg + "22", color: bg, border: `1px solid ${bg}44` }} aria-label={`${area} ${site.name}: ${score}%`}>{open === 0 ? "\u2713" : `${score}%`}</button></td>;
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
              <div className="flex flex-col items-center py-8"><BarChart3 className="w-8 h-8 text-[#334155] mb-2" aria-hidden="true" /><p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No findings logged yet</p></div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData} barSize={14} barGap={2}><CartesianGrid {...chartDefaults.cartesianGrid} /><XAxis dataKey="month" {...chartDefaults.xAxis} /><YAxis {...chartDefaults.yAxis} allowDecimals={false} /><Tooltip {...chartDefaults.tooltip} /><Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{v}</span>} /><Bar dataKey="Critical" name="Critical" fill="#ef4444" stackId="a" radius={[0, 0, 0, 0]} /><Bar dataKey="High" name="High" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} /><Bar dataKey="Low" name="Low" fill="#10b981" stackId="a" radius={[3, 3, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            )}
          </CardSection>

          {/* ③ Action plan */}
          <CardSection icon={Calendar} iconColor="#f59e0b" title="90-day action plan" badge={actionPlan.length > 0 ? <Badge variant="amber">{actionPlan.length}</Badge> : undefined}>
            {actionPlan.length === 0 ? (
              <div className="flex flex-col items-center py-8"><ClipboardList className="w-10 h-10 text-[#334155] mb-2" aria-hidden="true" /><p className="text-[12px] mb-2" style={{ color: "var(--text-muted)" }}>No open actions</p><Button variant="ghost" size="sm" onClick={() => router.push("/gap-assessment")}>Log a finding</Button></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table" aria-label="90 day action plan"><caption className="sr-only">Priority actions due within 90 days</caption>
                  <thead><tr><th scope="col">Priority</th><th scope="col">Area</th><th scope="col">Action</th><th scope="col">Owner</th><th scope="col">Due date</th><th scope="col">Status</th><th scope="col">AGI risk</th><th scope="col"><span className="sr-only">Nav</span></th></tr></thead>
                  <tbody>{actionPlan.slice(0, 10).map((item) => (
                    <tr key={item.id} className="cursor-pointer" onClick={() => { if (item.module === "gap-assessment") router.push("/gap-assessment"); else if (item.module === "capa") router.push("/capa"); else if (item.module === "csv-csa") router.push("/csv-csa"); }}>
                      <td><Badge variant={item.priority === "Critical" ? "red" : item.priority === "High" ? "amber" : "green"}>{item.priority}</Badge></td>
                      <td><Badge variant="gray">{item.area}</Badge></td>
                      <td><p className="text-[12px]" style={{ color: "var(--text-primary)", maxWidth: 200 }}>{item.action}</p></td>
                      <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(item.owner)}</td>
                      <td>{item.dueDate ? (<><div className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(item.dueDate).tz(timezone).format(dateFormat)}</div>{dayjs.utc(item.dueDate).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444]">Overdue</div>}</>) : <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>&mdash;</span>}</td>
                      <td><Badge variant={item.status === "Closed" ? "green" : item.status === "In Progress" ? "amber" : item.status === "Pending QA Review" ? "purple" : "blue"}>{item.status}</Badge></td>
                      <td><Badge variant={item.agiRisk === "High" ? "red" : item.agiRisk === "Medium" ? "amber" : "green"}>{item.agiRisk}</Badge></td>
                      <td><Button variant="ghost" size="xs" icon={ChevronRight} aria-label={`View ${item.refId}`} onClick={() => { if (item.module === "gap-assessment") router.push("/gap-assessment"); else if (item.module === "capa") router.push("/capa"); else if (item.module === "csv-csa") router.push("/csv-csa"); }} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                {actionPlan.length > 10 && <p className="text-[11px] text-center mt-2" style={{ color: "var(--text-muted)" }}>Showing 10 of {actionPlan.length} items</p>}
              </div>
            )}
          </CardSection>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          {/* ④ AGI insights */}
          <aside aria-label="AGI insights" className="card">
            <div className="card-header"><div className="flex items-center gap-2"><Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">AGI Insights</span></div>{(() => { const activeAgents = Object.values(agiSettings.agents).filter(Boolean).length; const totalAgents = Object.values(agiSettings.agents).length; if (agiSettings.mode === "manual" || activeAgents === 0) return <Badge variant="gray">inactive</Badge>; if (activeAgents === totalAgents) return <Badge variant="green">autonomous</Badge>; return <Badge variant="amber">{activeAgents}/{totalAgents} active</Badge>; })()}</div>
            <div className="card-body space-y-2">
              {agiSettings.mode === "manual" ? (
                <><p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>AGI is in manual mode. Enable agents in Settings &rarr; AGI Policy.</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => router.push("/settings")}>Configure &rarr;</Button></>
              ) : filteredFindings.length === 0 && filteredCAPAs.length === 0 ? (
                <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No findings match current filters. Adjust filters to see insights.</p>
              ) : insights.slice(0, 5).map((ins, i) => (
                <div key={i} className={clsx("flex items-start gap-2 p-2.5 rounded-lg", ins.type === "warning" ? isDark ? "bg-(--warning-bg) border border-(--warning)" : "bg-[#fffbeb] border border-[#fde68a]" : ins.type === "success" ? isDark ? "bg-(--success-bg) border border-(--success)" : "bg-[#f0fdf4] border border-[#a7f3d0]" : "bg-(--bg-surface) border border-(--bg-border)")}>
                  {ins.type === "warning" ? <AlertTriangle className="w-3.5 h-3.5 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" /> : ins.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <Info className="w-3.5 h-3.5 text-[#0ea5e9] flex-shrink-0 mt-0.5" aria-hidden="true" />}
                  <div className="flex-1 min-w-0"><p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{ins.text}</p>{ins.action && ins.link && <button onClick={() => router.push(ins.link!)} className="text-[10px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer mt-1">{ins.action} &rarr;</button>}</div>
                </div>
              ))}
            </div>
          </aside>

          {/* ⑤ Risk signals */}
          <CardSection icon={Activity} iconColor="#ef4444" title="Risk signals">
            {/* By severity */}
            {(["Critical", "High", "Low"] as const).map((sev) => { const cnt = filteredFindings.filter((f) => f.severity === sev && f.status !== "Closed").length; const dot = sev === "Critical" ? "#ef4444" : sev === "High" ? "#f59e0b" : "#10b981"; const valCol = cnt === 0 ? "#64748b" : cnt <= 2 ? "#f59e0b" : "#ef4444"; return (
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
              { label: "CSV / CSA", path: "/csv-csa", Icon: Database, badge: csvHighRisk, color: "#f59e0b" },
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
    </main>
  );
}