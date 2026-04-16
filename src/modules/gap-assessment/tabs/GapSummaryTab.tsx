import type { ReactNode } from "react";
import {
  BarChart3, ClipboardList, AlertCircle, AlertTriangle, Info, Clock, Filter, CheckCircle2,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import clsx from "clsx";
import { chartDefaults } from "@/lib/chartColors";

interface GapSummaryTabProps {
  findingsTotal: number;
  baseCount: number;
  criticalCount: number;
  highCount: number;
  lowCount: number;
  openCount: number;
  closedCount: number;
  overdueCount: number;
  topDrivers: { name: string; count: number; critical: number; high: number }[];
  severityData: { name: string; value: number; fill: string }[];
  isDark: boolean;
  renderFilters: (compact?: boolean) => ReactNode;
  lastClosedFinding?: { id: string; closedAt?: string } | null;
}

export function GapSummaryTab({
  findingsTotal, baseCount, criticalCount, highCount, lowCount,
  openCount, closedCount, overdueCount, topDrivers, severityData, isDark, renderFilters, lastClosedFinding,
}: GapSummaryTabProps) {
  return (
    <div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary" tabIndex={0}>
      {/* Filters */}
      <section aria-label="Finding filters" className="flex items-center gap-3 flex-wrap mb-6 p-4 rounded-xl border"
        style={{ background: isDark ? "#0a1f38" : "#f8fafc", borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
        <Filter className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>
        {renderFilters()}
      </section>

      {/* Tiles */}
      <section aria-label="Finding statistics" className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { icon: ClipboardList, iconCls: "text-[#0ea5e9]", label: "Total findings", value: baseCount, color: "", sub: findingsTotal === 0 ? "Log your first finding to get started" : `${openCount} open \u00b7 ${closedCount} closed` },
          { icon: AlertCircle, iconCls: "text-[#ef4444]", label: "Critical", value: criticalCount, color: "text-[#ef4444]", sub: criticalCount > 0 ? "Immediate action required" : "None" },
          { icon: AlertTriangle, iconCls: "text-[#f59e0b]", label: "High", value: highCount, color: "text-[#f59e0b]", sub: "Prompt attention needed" },
          { icon: Info, iconCls: "text-[#10b981]", label: "Low", value: lowCount, color: "text-[#10b981]", sub: "Low inspection risk" },
          { icon: Clock, iconCls: overdueCount > 0 ? "text-[#ef4444]" : "text-[#10b981]", label: "Overdue", value: overdueCount, color: overdueCount > 0 ? "text-[#ef4444]" : "text-[#10b981]", sub: overdueCount > 0 ? "Past target date" : "All on track" },
        ].map((tile) => (
          <div key={tile.label} className="stat-card" role="region" aria-label={tile.label}>
            <div className="flex items-center gap-2 mb-2">
              <tile.icon className={clsx("w-5 h-5", tile.iconCls)} aria-hidden="true" />
              <span className="stat-label mb-0">{tile.label}</span>
            </div>
            <div className={clsx("stat-value", tile.color)}>{tile.value}</div>
            <div className="stat-sub">{tile.sub}</div>
          </div>
        ))}
      </section>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <section aria-labelledby="drivers-title" className="card lg:col-span-2">
          <div className="card-header"><h2 id="drivers-title" className="card-title">Top 5 risk drivers</h2></div>
          <div className="card-body">
            {topDrivers.length === 0 ? (
              baseCount > 0 && openCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                  <CheckCircle2 className="w-10 h-10 text-[#10b981]" aria-hidden="true" />
                  <p className="text-[13px] font-semibold" style={{ color: "#10b981" }}>All findings resolved</p>
                  {lastClosedFinding && (
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Last closed: {lastClosedFinding.id}
                      {lastClosedFinding.closedAt ? ` \u00b7 ${lastClosedFinding.closedAt}` : ""}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <BarChart3 className="w-8 h-8 text-[#334155]" aria-hidden="true" />
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No open findings yet</p>
                </div>
              )
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topDrivers} layout="vertical" barSize={10}>
                  <CartesianGrid {...chartDefaults.cartesianGrid} horizontal={false} />
                  <XAxis type="number" {...chartDefaults.xAxis} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...chartDefaults.tooltip} />
                  <Bar dataKey="critical" name="Critical" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="high" name="High" stackId="a" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section aria-labelledby="donut-title" className="card">
          <div className="card-header"><h2 id="donut-title" className="card-title">Severity breakdown</h2></div>
          <div className="card-body">
            {severityData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <ClipboardList className="w-8 h-8 text-[#334155]" aria-hidden="true" />
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No findings yet</p>
              </div>
            ) : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={severityData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                      {severityData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip {...chartDefaults.tooltip} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{baseCount}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>findings</span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
