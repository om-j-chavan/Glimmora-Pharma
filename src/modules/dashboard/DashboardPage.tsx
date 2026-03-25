import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Bot,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  ChevronRight,
  Download,
  Shield,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import dayjs from "@/lib/dayjs";
import { chartDefaults, CHART_COLORS } from "@/lib/chartColors";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/Button";

/* ── Mock data ── */

const trendData = [
  { month: "Oct", critical: 4, major: 8, minor: 12 },
  { month: "Nov", critical: 6, major: 10, minor: 9 },
  { month: "Dec", critical: 3, major: 7, minor: 11 },
  { month: "Jan", critical: 5, major: 9, minor: 8 },
  { month: "Feb", critical: 2, major: 6, minor: 10 },
  { month: "Mar", critical: 3, major: 5, minor: 7 },
];

const AREAS = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT"];
const MOCK_SITE_NAMES = ["Mumbai API", "Pune Plant", "Hyd QC Lab", "Chennai Pkg"];
const MOCK_SCORES: Record<string, Record<string, string>> = {
  "Mumbai API": { Manufacturing: "HIGH", "QC Lab": "HIGH", Warehouse: "MED", Utilities: "MED", QMS: "HIGH", "CSV/IT": "MED" },
  "Pune Plant": { Manufacturing: "MED", "QC Lab": "LOW", Warehouse: "LOW", Utilities: "LOW", QMS: "MED", "CSV/IT": "LOW" },
  "Hyd QC Lab": { Manufacturing: "LOW", "QC Lab": "MED", Warehouse: "LOW", Utilities: "LOW", QMS: "MED", "CSV/IT": "MED" },
  "Chennai Pkg": { Manufacturing: "LOW", "QC Lab": "LOW", Warehouse: "LOW", Utilities: "LOW", QMS: "LOW", "CSV/IT": "LOW" },
};

const ACTION_ROWS = [
  { priority: "Critical", priorityCls: "badge-red", area: "QMS", action: "Close CAPA-0042 — LIMS audit trail remediation", owner: "Dr. Priya Sharma", due: "20 Mar 2026", status: "In Progress", statusCls: "badge-amber", risk: "HIGH", riskCls: "badge-red", module: "QMS / CAPA", path: "/capa" },
  { priority: "Critical", priorityCls: "badge-red", area: "CSV/IT", action: "Complete IQ/OQ for new HPLC system", owner: "Anita Patel", due: "25 Mar 2026", status: "Overdue", statusCls: "badge-red", risk: "HIGH", riskCls: "badge-red", module: "CSV", path: "/csv-csa" },
  { priority: "Major", priorityCls: "badge-amber", area: "Training", action: "GMP refresher — Mumbai site (32 staff)", owner: "Suresh Kumar", due: "31 Mar 2026", status: "Open", statusCls: "badge-blue", risk: "MED", riskCls: "badge-amber", module: "Readiness", path: "/inspection" },
  { priority: "Major", priorityCls: "badge-amber", area: "QC Lab", action: "OOS investigation SOP update — align to USP <1010>", owner: "Dr. Nisha Rao", due: "05 Apr 2026", status: "Open", statusCls: "badge-blue", risk: "MED", riskCls: "badge-amber", module: "Readiness", path: "/gap-assessment" },
  { priority: "Major", priorityCls: "badge-amber", area: "Warehouse", action: "Batch record template revision — electronic format", owner: "Rahul Mehta", due: "10 Apr 2026", status: "Open", statusCls: "badge-blue", risk: "MED", riskCls: "badge-amber", module: "QMS / CAPA", path: "/capa" },
  { priority: "Minor", priorityCls: "badge-gray", area: "Utilities", action: "Environmental monitoring SOP periodic review", owner: "Suresh Kumar", due: "15 Apr 2026", status: "Open", statusCls: "badge-blue", risk: "LOW", riskCls: "badge-gray", module: "Readiness", path: "/inspection" },
  { priority: "Minor", priorityCls: "badge-gray", area: "Manufacturing", action: "Annual supplier qualification review — API vendors", owner: "Dr. Priya Sharma", due: "30 Apr 2026", status: "Open", statusCls: "badge-blue", risk: "LOW", riskCls: "badge-gray", module: "Readiness", path: "/governance" },
];

function cellColor(score: string) {
  if (score === "HIGH") return { bg: "rgba(239,68,68,0.12)", text: "#ef4444", label: "HIGH" };
  if (score === "MED") return { bg: "rgba(245,158,11,0.12)", text: "#f59e0b", label: "MED" };
  return { bg: "rgba(16,185,129,0.12)", text: "#10b981", label: "LOW" };
}

const selectCls =
  "bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) rounded-lg text-[12px] py-1.5 px-2.5 outline-none cursor-pointer focus:border-(--brand) transition-all duration-150 appearance-none";

export function DashboardPage() {
  const navigate = useNavigate();
  const activeSite = useActiveSite();
  const sites = useAppSelector((s) => s.settings.sites);
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiCapa = useAppSelector((s) => s.settings.agi.agents.capa);
  const ichq9On = useAppSelector((s) => s.settings.frameworks.ichq9);
  useRole();

  const [timeframe, setTimeframe] = useState("30");
  const [siteFilter, setSiteFilter] = useState("");
  const [severity, setSeverity] = useState("");

  const displayedSites = sites.length > 0 ? sites.map((s) => s.name) : MOCK_SITE_NAMES;

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      {/* 1. Hero */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Executive Overview</h1>
          <p className="page-subtitle mt-1">
            {activeSite?.name ?? "All sites"} · {dayjs().format("DD MMM YYYY")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select className={selectCls} value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">This year</option>
          </select>
          <select className={selectCls} value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className={selectCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All severities</option>
            <option value="critical">Critical only</option>
            <option value="major">Major &amp; above</option>
          </select>
        </div>
      </header>

      {/* 2. KPI Cards */}
      <section aria-label="Key performance indicators" className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="stat-card" aria-label="Overall inspection readiness score">
          <div className="stat-label">
            Readiness score
            {ichq9On && <span className="text-[10px] text-(--info) ml-1">(ICH Q9)</span>}
          </div>
          <div className="stat-value text-(--warning)">82%</div>
          <div className="stat-sub flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-(--success)" aria-hidden="true" />
            ↑ 6% this month
          </div>
        </div>
        <div className="stat-card" aria-label="Critical GxP open findings">
          <div className="stat-label">Critical findings</div>
          <div className="stat-value text-(--danger)">3</div>
          <div className="stat-sub flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-(--danger)" aria-hidden="true" />
            2 overdue · 1 due this week
          </div>
        </div>
        <div className="stat-card" aria-label="CAPA overdue percentage">
          <div className="stat-label">CAPA overdue</div>
          <div className="stat-value text-(--warning)">18%</div>
          <div className="stat-sub">3 of 17 open CAPAs</div>
        </div>
        <div className="stat-card" aria-label="CSV high risk systems with open actions">
          <div className="stat-label">CSV high-risk systems</div>
          <div className="stat-value text-(--danger)">4</div>
          <div className="stat-sub flex items-center gap-1">
            <Shield className="w-3 h-3" aria-hidden="true" />
            Open validation actions
          </div>
        </div>
        <div className="stat-card" aria-label="Training compliance percentage">
          <div className="stat-label">Training compliance</div>
          <div className="stat-value text-(--success)">91%</div>
          <div className="stat-sub flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-(--success)" aria-hidden="true" />
            ↑ 7% from last month
          </div>
        </div>
      </section>

      {/* 3. Heatmap + Trend chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Heatmap */}
        <section aria-labelledby="heatmap-title" className="card lg:col-span-3">
          <div className="card-header">
            <h2 id="heatmap-title" className="card-title">Area vs readiness heatmap</h2>
            <span className="text-[11px] text-(--text-secondary)">{displayedSites.length} sites</span>
          </div>
          <div className="overflow-x-auto">
            <table aria-label="Area vs readiness matrix" className="w-full text-[11px]">
              <caption className="sr-only">Heatmap showing compliance readiness by area for each site</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted) sticky left-0 bg-(--card-bg)" style={{ minWidth: 120 }}>Site</th>
                  {AREAS.map((area) => (
                    <th key={area} scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-(--text-muted) whitespace-nowrap">{area}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedSites.map((siteName, i) => (
                  <tr key={i} className="border-b border-(--bg-border)">
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-[12px] text-(--card-text) sticky left-0 bg-(--card-bg) whitespace-nowrap">{siteName}</th>
                    {AREAS.map((area) => {
                      const c = cellColor(MOCK_SCORES[siteName]?.[area] ?? "LOW");
                      return (
                        <td key={area} className="px-3 py-3 text-center">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c.bg, color: c.text }} title={`${siteName} · ${area}: ${c.label}`}>
                            {c.label}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-4 px-4 py-3 border-t border-(--bg-border) text-[11px] text-(--text-secondary)">
              <span className="font-medium">Legend:</span>
              {[
                { label: "HIGH", color: "#ef4444" },
                { label: "MED", color: "#f59e0b" },
                { label: "LOW", color: "#10b981" },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Trend chart */}
        <section aria-labelledby="trend-title" className="card lg:col-span-2">
          <div className="card-header">
            <h2 id="trend-title" className="card-title">Observation volume &amp; severity</h2>
            <span className="text-[11px] text-(--text-secondary)">by month</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} barSize={12} barGap={2}>
                <CartesianGrid {...chartDefaults.cartesianGrid} />
                <XAxis dataKey="month" {...chartDefaults.xAxis} />
                <YAxis {...chartDefaults.yAxis} />
                <Tooltip {...chartDefaults.tooltip} />
                <Legend iconType="circle" iconSize={8} />
                <Bar dataKey="critical" name="Critical" fill={CHART_COLORS.danger} radius={[3, 3, 0, 0]} stackId="a" />
                <Bar dataKey="major" name="Major" fill={CHART_COLORS.warning} radius={[3, 3, 0, 0]} stackId="a" />
                <Bar dataKey="minor" name="Minor" fill={CHART_COLORS.brand} radius={[3, 3, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* 4. AGI Insights */}
      {agiMode !== "manual" && agiCapa && (
        <section aria-label="AGI insights panel" aria-live="polite" className="agi-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-(--info)" aria-hidden="true" />
              <h2 className="text-[13px] font-semibold text-(--text-primary)">AGI Insights</h2>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${agiMode === "autonomous" ? "bg-(--success-bg) text-(--success)" : "bg-(--warning-bg) text-(--warning)"}`}>
              {agiMode === "autonomous" ? "LIVE" : "QUEUED"}
            </span>
          </div>
          <div className="space-y-2">
            {[
              { icon: AlertCircle, color: "#ef4444", text: "CAPA-0042 is 3 days past deadline. FDA inspection window opens in 14 days. Immediate action required.", module: "CAPA", path: "/capa" },
              { icon: AlertTriangle, color: "#f59e0b", text: "LIMS audit trail gap detected — 21 CFR Part 11 §11.10(e) non-compliance risk. Estimated remediation: 5 days.", module: "CSV/CSA", path: "/csv-csa" },
              { icon: TrendingUp, color: "#6366f1", text: "Readiness score improved +6% this week. Maintain CAPA closure momentum to reach 90% target.", module: "Gap Assessment", path: "/gap-assessment" },
            ].map((insight, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <insight.icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: insight.color }} aria-hidden="true" />
                <p className="flex-1 text-[12px] leading-relaxed text-(--text-secondary)">{insight.text}</p>
                <button
                  type="button"
                  onClick={() => navigate(insight.path)}
                  className="text-[10px] font-medium shrink-0 flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-(--brand-muted) text-(--brand) transition-colors hover:bg-(--brand-border)"
                >
                  {insight.module}
                  <ChevronRight className="w-2.5 h-2.5" strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. 90-Day Action Plan */}
      <section aria-labelledby="action-plan-title" className="card">
        <div className="card-header">
          <h2 id="action-plan-title" className="card-title">90-day action plan</h2>
          <Button variant="ghost" size="sm" icon={Download}>Export</Button>
        </div>
        <div className="card-body p-0 overflow-x-auto">
          <table className="data-table" aria-label="90-day compliance action plan">
            <caption className="sr-only">Priority actions with owners, due dates, status and AGI-suggested risk ratings</caption>
            <thead>
              <tr>
                <th scope="col">Priority</th>
                <th scope="col">Area</th>
                <th scope="col">Action</th>
                <th scope="col">Owner</th>
                <th scope="col">Due date</th>
                <th scope="col">Status</th>
                <th scope="col">AGI risk</th>
                <th scope="col"><span className="sr-only">Module link</span></th>
              </tr>
            </thead>
            <tbody>
              {ACTION_ROWS.map((row, i) => (
                <tr key={i}>
                  <td><span className={`badge ${row.priorityCls}`}>{row.priority}</span></td>
                  <td className="whitespace-nowrap">{row.area}</td>
                  <th scope="row" className="font-medium">{row.action}</th>
                  <td className="whitespace-nowrap">{row.owner}</td>
                  <td className="whitespace-nowrap">{row.due}</td>
                  <td><span className={`badge ${row.statusCls}`}>{row.status}</span></td>
                  <td><span className={`badge ${row.riskCls}`}>{row.risk}</span></td>
                  <td>
                    <button
                      type="button"
                      onClick={() => navigate(row.path)}
                      className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-(--brand-muted) text-(--brand) transition-colors hover:bg-(--brand-border)"
                    >
                      {row.module}
                      <ChevronRight className="w-2.5 h-2.5" strokeWidth={2.5} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
