import {
  ClipboardCheck, AlertTriangle, AlertCircle, TrendingUp, Clock, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { chartDefaults } from "@/lib/chartColors";
import { Badge } from "@/components/ui/Badge";

interface CAPAMetricsTabProps {
  capasTotal: number;
  closedCount: number;
  onTimeRate: number;
  overdueRate: number;
  overdueCount: number;
  diExceptions: number;
  effectivenessCount: number;
  riskSignalData: { month: string; "483": number; "Internal Audit": number; Deviation: number; "Gap Assessment": number }[];
  hasTrendData: boolean;
  statusDonut: readonly { name: string; value: number; fill: string }[];
  sourceBreakdown: { source: string; count: number }[];
  maxSrcCount: number;
  isDark: boolean;
}

export function CAPAMetricsTab({
  capasTotal, closedCount, onTimeRate, overdueRate, overdueCount,
  diExceptions, effectivenessCount, riskSignalData, hasTrendData,
  statusDonut, sourceBreakdown, maxSrcCount, isDark,
}: CAPAMetricsTabProps) {
  return (
    <div role="tabpanel" id="panel-metrics" aria-labelledby="tab-metrics" tabIndex={0}>
      {/* KPIs */}
      <section aria-label="CAPA metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Clock, label: "On-time closure", value: capasTotal === 0 ? "\u2014" : closedCount === 0 ? "N/A" : `${onTimeRate}%`, color: capasTotal === 0 ? "var(--text-muted)" : closedCount === 0 ? "var(--text-muted)" : onTimeRate >= 90 ? "#10b981" : onTimeRate >= 70 ? "#f59e0b" : "#ef4444", sub: capasTotal === 0 ? "No CAPAs yet" : `${closedCount} CAPAs closed` },
          { icon: AlertTriangle, label: "Overdue rate", value: capasTotal === 0 ? "\u2014" : `${overdueRate}%`, color: capasTotal === 0 ? "var(--text-muted)" : overdueRate === 0 ? "#10b981" : "#ef4444", sub: capasTotal === 0 ? "No CAPAs yet" : `${overdueCount} past due date` },
          { icon: AlertCircle, label: "DI exceptions", value: String(diExceptions), color: diExceptions > 0 ? "#ef4444" : "#10b981", sub: "Open CAPAs with DI gate" },
          { icon: TrendingUp, label: "Effectiveness checks", value: String(effectivenessCount), color: "#6366f1", sub: "CAPAs with check planned" },
        ].map((kpi) => (
          <div key={kpi.label} className="stat-card" role="region" aria-label={kpi.label}>
            <div className="flex items-center gap-2 mb-2"><kpi.icon className="w-5 h-5" style={{ color: kpi.color }} aria-hidden="true" /><span className="stat-label mb-0">{kpi.label}</span></div>
            <div className="stat-value" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="stat-sub">{kpi.sub}</div>
          </div>
        ))}
      </section>

      {/* Trend chart */}
      <section aria-labelledby="trend-title" className="card mb-4">
        <div className="card-header"><h2 id="trend-title" className="card-title">Risk signals over time</h2><span className="text-[11px] text-(--text-secondary)">by source</span></div>
        <div className="card-body">
          {hasTrendData ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={riskSignalData} barSize={14} barGap={2}>
                <CartesianGrid {...chartDefaults.cartesianGrid} /><XAxis dataKey="month" {...chartDefaults.xAxis} /><YAxis {...chartDefaults.yAxis} allowDecimals={false} /><Tooltip {...chartDefaults.tooltip} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{v as string}</span>} />
                <Bar dataKey="483" name="483" fill="#ef4444" stackId="a" /><Bar dataKey="Internal Audit" name="Internal Audit" fill="#f59e0b" stackId="a" /><Bar dataKey="Deviation" name="Deviation" fill="#6366f1" stackId="a" /><Bar dataKey="Gap Assessment" name="Gap Assessment" fill="#0ea5e9" stackId="a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2"><BarChart3 className="w-8 h-8 text-[#334155]" aria-hidden="true" /><p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No CAPAs created yet</p></div>
          )}
        </div>
      </section>

      {/* Status donut + Source breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section aria-labelledby="status-donut-title" className="card">
          <div className="card-header"><h2 id="status-donut-title" className="card-title">CAPA status breakdown</h2></div>
          <div className="card-body">
            {statusDonut.length === 0 ? <div className="text-center py-10"><ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-[#334155]" /><p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No CAPAs yet</p></div> : (
              <>
                <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={statusDonut as { name: string; value: number; fill: string }[]} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">{(statusDonut as { name: string; value: number; fill: string }[]).map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie><Tooltip {...chartDefaults.tooltip} /></PieChart></ResponsiveContainer>
                <div className="flex flex-wrap gap-3 justify-center mt-2">{(statusDonut as { name: string; value: number; fill: string }[]).map((s) => <span key={s.name} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}><span className="w-2 h-2 rounded-full inline-block" style={{ background: s.fill }} />{s.value} {s.name}</span>)}</div>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby="source-title" className="card">
          <div className="card-header"><h2 id="source-title" className="card-title">CAPAs by source</h2></div>
          <div className="card-body p-0">
            {sourceBreakdown.length === 0 ? <div className="text-center py-10"><ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-[#334155]" /><p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No CAPAs yet</p></div> : (
              <table className="w-full text-[12px]"><tbody>{sourceBreakdown.map((s) => (
                <tr key={s.source} className="border-b" style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}>
                  <td className="py-3 px-4" style={{ color: "var(--text-secondary)" }}>{s.source}</td>
                  <td className="py-3 px-2"><Badge variant="gray">{s.count}</Badge></td>
                  <td className="py-3 px-4 w-32"><div className="h-1.5 rounded-full overflow-hidden" style={{ background: isDark ? "#1e3a5a" : "#e2e8f0" }}><div className="h-full bg-[#0ea5e9] rounded-full transition-all duration-300" style={{ width: `${(s.count / maxSrcCount) * 100}%` }} /></div></td>
                </tr>
              ))}</tbody></table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
