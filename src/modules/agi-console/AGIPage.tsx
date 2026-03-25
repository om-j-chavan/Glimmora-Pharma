import { useState } from "react";
import { Bot, Shield, Activity, AlertTriangle, CheckCircle, Settings } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useAppSelector } from "@/hooks/useAppSelector";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { chartDefaults, CHART_COLORS } from "@/lib/chartColors";

const CAPABILITIES = [
  { name: "Compliance Monitoring", mode: "Autonomous", desc: "CAPA aging, overdue actions, training delinquency, DI exception patterns, validation drift indicators.", icon: Activity, enabled: true },
  { name: "Risk Reasoning & Prioritization", mode: "Autonomous", desc: "ICH Q9-aligned scoring and queue reprioritization based on patient safety, product quality, DI impact.", icon: Shield, enabled: true },
  { name: "Inspection Readiness Orchestration", mode: "Assisted", desc: "Evidence kit completeness checks, DIL drill simulation prompts, SME readiness mapping.", icon: CheckCircle, enabled: true },
  { name: "Drift Detection", mode: "Autonomous", desc: "Signals that changes may require validation reassessment — config changes, access creep, audit trail anomalies.", icon: AlertTriangle, enabled: false },
];

const INTENDED_USE = [
  { fn: "CAPA Overdue Monitoring", category: "QMS", mode: "Autonomous", allowed: "Flag overdue items, escalate alerts, reprioritize queue", prohibited: "Close CAPAs, modify records" },
  { fn: "Evidence Kit Completeness", category: "Inspection", mode: "Assisted", allowed: "Summarize gaps, generate checklist", prohibited: "Submit evidence to regulators" },
  { fn: "Risk Score Calculation", category: "Cross-module", mode: "Autonomous", allowed: "Score and rank risks using ICH Q9 logic", prohibited: "Override human risk acceptance decisions" },
  { fn: "Deviation Pattern Detection", category: "QMS", mode: "Assisted", allowed: "Cluster patterns, suggest root cause categories", prohibited: "Close deviations, update quality records" },
  { fn: "Validation Drift Signal", category: "CSV/CSA", mode: "Autonomous", allowed: "Alert on drift indicators, flag config changes", prohibited: "Approve changes, modify validation records" },
  { fn: "Regulatory Guidance Monitoring", category: "Regulatory", mode: "Assisted", allowed: "Summarize guidance changes, map to SOPs", prohibited: "Submit regulatory commitments" },
];

const DRIFT_DATA = [
  { week: "W1", confidence: 94, drift: 2 },
  { week: "W2", confidence: 92, drift: 3 },
  { week: "W3", confidence: 95, drift: 1 },
  { week: "W4", confidence: 91, drift: 4 },
  { week: "W5", confidence: 88, drift: 6 },
  { week: "W6", confidence: 90, drift: 5 },
];

const DRIFT_ALERTS = [
  { date: "18 Mar 2026", event: "Confidence drop below 90% threshold for CAPA Risk Agent", action: "Manual review triggered", owner: "IT/CDO", status: "Resolved" },
  { date: "10 Mar 2026", event: "Prompt version mismatch detected — CAPA Agent v1.2 vs registry v1.3", action: "Prompt updated to v1.3", owner: "IT/CDO", status: "Resolved" },
  { date: "01 Mar 2026", event: "Access creep detected: 2 users with elevated LIMS roles", action: "Escalated to IT/CDO", owner: "IT/CDO", status: "Open" },
];

const MODE_COLOR: Record<string, string> = { Autonomous: "badge-purple", Assisted: "badge-blue" };
const STATUS_COLOR: Record<string, string> = { Resolved: "badge-green", Open: "badge-amber" };

export function AGIPage() {
  const { canViewAGI } = useRole();
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const [activeTab, setActiveTab] = useState<"overview" | "intended" | "hitl" | "drift">("overview");

  if (!canViewAGI) {
    return (
      <div className="w-full max-w-[1440px] mx-auto py-20 text-center">
        <Bot className="w-8 h-8 text-(--text-muted) mx-auto mb-3" />
        <p className="text-(--text-muted) text-sm">You do not have access to the AGI & Autonomy Console.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Glimmora AGI &amp; Autonomy Console</h1>
          <p className="page-subtitle mt-1">Capability map, intended use, human oversight &amp; drift monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-(--text-muted)">AGI mode:</span>
          <span className={`badge ${agiMode === "autonomous" ? "badge-purple" : agiMode === "assisted" ? "badge-blue" : "badge-gray"}`}>
            {agiMode === "autonomous" ? "Autonomous" : agiMode === "assisted" ? "Assisted" : "Manual (off)"}
          </span>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "AI insights generated", value: "142", sub: "This month", color: "text-(--info)" },
          { label: "Autonomous actions", value: "38", sub: "Flagged & escalated", color: "text-(--brand)" },
          { label: "HITL approvals", value: "24", sub: "Human review completed", color: "text-(--success)" },
          { label: "Drift alerts", value: "3", sub: "2 resolved · 1 open", color: "text-(--warning)" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.color}`}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-(--bg-border)">
        {([
          { key: "overview", label: "AGI Overview" },
          { key: "intended", label: "Intended Use & Boundaries" },
          { key: "hitl", label: "Human Oversight Model" },
          { key: "drift", label: "Drift & Monitoring" },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px ${activeTab === t.key ? "border-(--brand) text-(--brand)" : "border-transparent text-(--text-secondary) hover:text-(--text-primary)"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {CAPABILITIES.map((cap) => (
            <div key={cap.name} className={`card p-5 ${!cap.enabled ? "opacity-50" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg" style={{ background: "var(--info-bg)" }}>
                  <cap.icon className="w-4 h-4 text-(--info)" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{cap.name}</span>
                    <span className={`badge ${MODE_COLOR[cap.mode]}`}>{cap.mode}</span>
                    {!cap.enabled && <span className="badge badge-gray text-[10px]">Disabled</span>}
                  </div>
                  <p className="text-xs text-(--text-muted) leading-relaxed">{cap.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "intended" && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Intended Use Statements &amp; GxP Boundaries</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>AGI Function</th><th>GxP Category</th><th>Mode</th>
                  <th>Allowed actions</th><th>Prohibited scope</th>
                </tr>
              </thead>
              <tbody>
                {INTENDED_USE.map((u) => (
                  <tr key={u.fn}>
                    <td className="font-medium text-sm whitespace-nowrap">{u.fn}</td>
                    <td><span className="badge badge-gray">{u.category}</span></td>
                    <td><span className={`badge ${MODE_COLOR[u.mode]}`}>{u.mode}</span></td>
                    <td className="text-xs text-(--success) max-w-[200px]">{u.allowed}</td>
                    <td className="text-xs text-(--danger) max-w-[180px]">{u.prohibited}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-5 border-t border-(--bg-border)">
            <div className="alert alert-danger text-xs">
              <strong>Explicitly prohibited for all AGI functions:</strong> Batch disposition / QP release · Final QA disposition · CAPA closure without QA approval · External regulator communications · Unsupervised learning on production GxP data.
            </div>
          </div>
        </section>
      )}

      {activeTab === "hitl" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="card">
            <div className="card-header"><h2 className="card-title">HITL gate points</h2></div>
            <div className="divide-y divide-(--bg-border)">
              {[
                { gate: "CAPA closure", role: "QA Head / Super Admin", trigger: "All CAPA closures", req: "E-signature (Part 11)" },
                { gate: "Batch release decision", role: "QA Head", trigger: "Any batch disposition", req: "E-signature + review" },
                { gate: "Regulatory commitment", role: "Regulatory Affairs + QA Head", trigger: "Any 483/WL response", req: "Dual approval" },
                { gate: "Model/prompt update", role: "IT/CDO + Super Admin", trigger: "Change control", req: "Change order + validation" },
                { gate: "High-confidence autonomous flag", role: "Assigned owner", trigger: "Score ≥ 85 risk items", req: "Acknowledgment" },
                { gate: "Access control change", role: "IT/CDO", trigger: "Role or permission change", req: "Logged + approved" },
              ].map((g) => (
                <div key={g.gate} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-(--text-primary)">{g.gate}</div>
                      <div className="text-xs text-(--text-muted) mt-0.5">Trigger: {g.trigger}</div>
                    </div>
                    <div className="text-right text-xs shrink-0">
                      <div className="font-medium text-(--text-secondary)">{g.role}</div>
                      <div className="text-(--brand) mt-0.5">{g.req}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><h2 className="card-title">Role → approval mapping</h2></div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Role</th><th>HITL responsibilities</th><th>Escalation to</th></tr></thead>
                <tbody>
                  {[
                    { role: "QA Head", resp: "CAPA closure, batch disposition, 483 response approval", esc: "Super Admin" },
                    { role: "IT/CDO", resp: "Model/prompt updates, access control changes, AGI policy", esc: "Super Admin" },
                    { role: "Regulatory Affairs", resp: "Regulatory commitment co-approval", esc: "QA Head" },
                    { role: "CSV/Val Lead", resp: "Validation impact assessment approval", esc: "QA Head" },
                    { role: "Super Admin", resp: "Final escalation, policy override, multi-role approvals", esc: "—" },
                  ].map((r) => (
                    <tr key={r.role}>
                      <td className="font-semibold text-sm whitespace-nowrap">{r.role}</td>
                      <td className="text-xs text-(--text-secondary)">{r.resp}</td>
                      <td className="text-xs whitespace-nowrap">{r.esc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "drift" && (
        <div className="space-y-6">
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Model confidence &amp; drift over time</h2>
              <span className="text-xs text-(--text-muted)">Last 6 weeks</span>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={DRIFT_DATA}>
                  <CartesianGrid {...chartDefaults.cartesianGrid} />
                  <XAxis dataKey="week" {...chartDefaults.xAxis} />
                  <YAxis {...chartDefaults.yAxis} />
                  <Tooltip {...chartDefaults.tooltip} />
                  <Legend iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="confidence" name="Confidence (%)" stroke={CHART_COLORS.success} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="drift" name="Drift score" stroke={CHART_COLORS.danger} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <div className="card-header"><h2 className="card-title">Drift alerts &amp; actions</h2></div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Event</th><th>Action taken</th><th>Owner</th><th>Status</th></tr></thead>
                <tbody>
                  {DRIFT_ALERTS.map((a, i) => (
                    <tr key={i}>
                      <td className="text-xs whitespace-nowrap">{a.date}</td>
                      <td className="text-sm max-w-[260px]">{a.event}</td>
                      <td className="text-sm max-w-[200px] text-(--text-secondary)">{a.action}</td>
                      <td className="text-sm whitespace-nowrap">{a.owner}</td>
                      <td><span className={`badge ${STATUS_COLOR[a.status]}`}>{a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="alert alert-warning text-xs">
            <Settings className="w-3.5 h-3.5 inline mr-1" />
            Any change to model logic, prompt versions, or confidence thresholds requires a Change Order and validation impact assessment per Section 9.4 of the SOW.
          </div>
        </div>
      )}
    </div>
  );
}
