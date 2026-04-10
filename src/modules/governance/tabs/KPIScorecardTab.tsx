import clsx from "clsx";
import {
  Clock, AlertTriangle, RotateCw, ShieldAlert, Shield, Activity,
  BarChart3, Database, MapPin, CheckCircle2,
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { chartDefaults } from "@/lib/chartColors";
import { Button } from "@/components/ui/Button";

interface Site {
  id: string;
  name: string;
  risk: string;
}

interface SiteReadiness {
  site: Site;
  findingsCount: number;
  capasCount: number;
  criticalCount: number;
  score: number;
}

export interface KPIScorecardTabProps {
  companyName: string;
  readinessScore: number;
  noData: boolean;
  capaTimeliness: number;
  closedCAPAsCount: number;
  overdueCommitments: number;
  repeatObservationRisk: number;
  diExceptions: number;
  auditTrailCoverage: number;
  csvDrift: number;
  systemsCount: number;
  capaTrend: { month: string; onTime: number; late: number }[];
  capaTrendEmpty: boolean;
  valBreakdown: { name: string; value: number; color: string }[];
  diByArea: { area: string; value: number }[];
  siteReadiness: SiteReadiness[];
  sites: Site[];
  isDark: boolean;
  currentMonth: string;
  onNavigateSettings: () => void;
}

export function KPIScorecardTab({
  companyName, readinessScore, noData, capaTimeliness, closedCAPAsCount,
  overdueCommitments, repeatObservationRisk, diExceptions, auditTrailCoverage,
  csvDrift, systemsCount, capaTrend, capaTrendEmpty, valBreakdown, diByArea,
  siteReadiness, sites, isDark, currentMonth, onNavigateSettings,
}: KPIScorecardTabProps) {
  return (
    <>
      {/* Scorecard header */}
      <div className={clsx("flex items-center justify-between p-5 rounded-xl mb-6 border flex-wrap gap-4", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
        <div><p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Overall readiness score</p><p className="text-[36px] font-bold leading-none mt-1" style={{ color: noData ? "var(--text-muted)" : readinessScore >= 80 ? "#10b981" : readinessScore >= 60 ? "#f59e0b" : "#ef4444" }}>{noData ? "\u2014" : `${readinessScore}%`}</p><p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{companyName || "Your organisation"} &middot; {currentMonth}</p></div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">{([["CAPA timeliness", closedCAPAsCount === 0 ? "\u2014" : `${capaTimeliness}%`], ["Audit trail", systemsCount === 0 ? "\u2014" : `${auditTrailCoverage}%`], ["DI exceptions", String(diExceptions)], ["CSV drift", String(csvDrift)]] as const).map(([l, v]) => (<div key={l} className="flex items-center gap-2"><span style={{ color: "var(--text-muted)" }}>{l}:</span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{v}</span></div>))}</div>
      </div>

      {/* KPI grid */}
      <section aria-label="Key performance indicators" className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { icon: Clock, color: closedCAPAsCount === 0 ? "#64748b" : capaTimeliness >= 90 ? "#10b981" : capaTimeliness >= 70 ? "#f59e0b" : "#ef4444", label: "CAPA timeliness", value: closedCAPAsCount === 0 ? "\u2014" : `${capaTimeliness}%`, sub: `${closedCAPAsCount} CAPAs closed` },
          { icon: AlertTriangle, color: overdueCommitments > 0 ? "#ef4444" : "#10b981", label: "Overdue commitments", value: String(overdueCommitments), sub: "483/WL commitments past due" },
          { icon: RotateCw, color: repeatObservationRisk > 0 ? "#f59e0b" : "#10b981", label: "Repeat observation risk", value: String(repeatObservationRisk), sub: "Open 483 observations" },
          { icon: ShieldAlert, color: diExceptions > 0 ? "#ef4444" : "#10b981", label: "DI exceptions", value: String(diExceptions), sub: "Open DI gate CAPAs" },
          { icon: Shield, color: systemsCount === 0 ? "#64748b" : auditTrailCoverage >= 80 ? "#10b981" : auditTrailCoverage >= 60 ? "#f59e0b" : "#ef4444", label: "Audit trail coverage", value: systemsCount === 0 ? "\u2014" : `${auditTrailCoverage}%`, sub: "Part 11 compliant systems" },
          { icon: Activity, color: csvDrift > 0 ? "#f59e0b" : "#10b981", label: "Validation drift", value: String(csvDrift), sub: "Overdue or non-compliant" },
        ].map((kpi) => (<div key={kpi.label} className="stat-card" role="region" aria-label={kpi.label}><div className="flex items-center gap-2 mb-2"><kpi.icon className="w-5 h-5" style={{ color: kpi.color }} aria-hidden="true" /><span className="stat-label mb-0">{kpi.label}</span></div><div className="stat-value" style={{ color: kpi.color }}>{kpi.value}</div><div className="stat-sub">{kpi.sub}</div></div>))}
      </section>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-[#10b981]" aria-hidden="true" /><span className="card-title">CAPA timeliness trend</span></div></div><div className="card-body">
          {capaTrendEmpty ? <div className="flex flex-col items-center py-10"><BarChart3 className="w-8 h-8 text-[#334155] mb-2" aria-hidden="true" /><p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No closed CAPAs yet</p></div> : (
            <ResponsiveContainer width="100%" height={220}><BarChart data={capaTrend} barSize={16}><CartesianGrid {...chartDefaults.cartesianGrid} /><XAxis dataKey="month" {...chartDefaults.xAxis} /><YAxis {...chartDefaults.yAxis} allowDecimals={false} /><Tooltip {...chartDefaults.tooltip} /><Legend iconType="circle" iconSize={8} /><Bar dataKey="onTime" name="On time" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} /><Bar dataKey="late" name="Late" fill="#ef4444" stackId="a" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
          )}
        </div></div>
        <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Activity className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" /><span className="card-title">Validation &amp; CSV drift</span></div></div><div className="card-body">
          {systemsCount === 0 ? <div className="flex flex-col items-center py-10"><Database className="w-8 h-8 text-[#334155] mb-2" aria-hidden="true" /><p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No systems registered</p></div> : valBreakdown.length === 0 ? <p className="text-center py-10 text-[12px]" style={{ color: "var(--text-muted)" }}>No data</p> : (
            <div className="flex items-center gap-6"><PieChart width={160} height={160}><Pie data={valBreakdown} cx={75} cy={75} innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>{valBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip formatter={(v: any, n: any) => [v, n]} /></PieChart><div className="flex-1 space-y-2">{valBreakdown.map((d) => (<div key={d.name} className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} /><span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{d.name}</span></div><span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{d.value}</span></div>))}</div></div>
          )}
        </div></div>
      </div>

      {/* DI exceptions */}
      <div className="card mb-6"><div className="card-header"><div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-[#ef4444]" aria-hidden="true" /><span className="card-title">DI exceptions by area</span></div></div><div className="card-body">
        {diByArea.length === 0 ? <div className="flex items-center gap-2 justify-center py-6"><CheckCircle2 className="w-4 h-4 text-[#10b981]" aria-hidden="true" /><span className="text-[12px]" style={{ color: "#10b981" }}>No DI exceptions &mdash; all areas clear</span></div> : (
          <ResponsiveContainer width="100%" height={200}><BarChart data={diByArea} layout="vertical" barSize={14}><CartesianGrid horizontal={false} {...chartDefaults.cartesianGrid} /><XAxis type="number" {...chartDefaults.xAxis} allowDecimals={false} /><YAxis type="category" dataKey="area" width={80} {...chartDefaults.yAxis} /><Tooltip {...chartDefaults.tooltip} /><Bar dataKey="value" name="DI exceptions" fill="#ef4444" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer>
        )}
      </div></div>

      {/* Site heatmap */}
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">Site readiness heatmap</span></div></div><div className="card-body">
        {sites.length === 0 ? <div className="flex flex-col items-center py-10"><MapPin className="w-8 h-8 text-[#334155] mb-2" aria-hidden="true" /><p className="text-[12px] mb-2" style={{ color: "var(--text-muted)" }}>No sites configured</p><Button variant="ghost" size="sm" onClick={onNavigateSettings}>Go to Settings</Button></div> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{siteReadiness.map((sr) => { const col = sr.score >= 80 ? "#10b981" : sr.score >= 60 ? "#f59e0b" : "#ef4444"; return (<div key={sr.site.id} className="rounded-xl p-4 border" style={{ background: col + (isDark ? "12" : "0A"), borderColor: col + "40" }}><div className="flex items-center justify-between mb-2"><div><p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{sr.site.name}</p><p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{sr.site.risk} risk</p></div><p className="text-[22px] font-bold" style={{ color: col }}>{sr.score}%</p></div><div className={clsx("h-1.5 rounded-full", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")}><div className="h-full rounded-full" style={{ width: `${sr.score}%`, background: col }} /></div><div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}><span>{sr.findingsCount} findings</span><span>{sr.capasCount} CAPAs</span></div></div>); })}</div>
        )}
      </div></div>
    </>
  );
}
