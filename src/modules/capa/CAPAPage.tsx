import { useState } from "react";
import { useNavigate } from "react-router";
import { Search, Plus, Download, AlertCircle, Clock, CheckCircle, TrendingUp, Bot } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRole } from "@/hooks/useRole";
import { useAppSelector } from "@/hooks/useAppSelector";

const CAPAS = [
  { id: "CAPA-0042", source: "FDA 483", risk: "Critical", owner: "Dr. Priya Sharma", dueDate: "20 Mar 2026", status: "Overdue", effectivenessCheck: "30 Jun 2026", rcaMethod: "5-Why", diGate: true, desc: "LIMS audit trail remediation — 21 CFR Part 11 §11.10(e) compliance" },
  { id: "CAPA-0041", source: "Internal Audit", risk: "Major", owner: "Anita Patel", dueDate: "25 Mar 2026", status: "In Progress", effectivenessCheck: "25 Jun 2026", rcaMethod: "Fishbone", diGate: false, desc: "HPLC validation package completion — IQ/OQ protocols" },
  { id: "CAPA-0040", source: "Deviation", risk: "Major", owner: "Suresh Kumar", dueDate: "31 Mar 2026", status: "Open", effectivenessCheck: "01 Jul 2026", rcaMethod: "5-Why", diGate: false, desc: "GMP refresher training — Mumbai site 32 staff overdue" },
  { id: "CAPA-0039", source: "OOS", risk: "Major", owner: "Dr. Nisha Rao", dueDate: "05 Apr 2026", status: "Open", effectivenessCheck: "05 Jul 2026", rcaMethod: "Fishbone", diGate: true, desc: "OOS investigation SOP update — USP <1010> alignment" },
  { id: "CAPA-0038", source: "Management Review", risk: "Minor", owner: "Rahul Mehta", dueDate: "10 Apr 2026", status: "Open", effectivenessCheck: "10 Jul 2026", rcaMethod: "5-Why", diGate: false, desc: "Batch record template revision to electronic format" },
  { id: "CAPA-0037", source: "Supplier Audit", risk: "Minor", owner: "Dr. Priya Sharma", dueDate: "15 Apr 2026", status: "In Progress", effectivenessCheck: "15 Jul 2026", rcaMethod: "Barrier Analysis", diGate: false, desc: "API vendor qualification record update — 3 vendors expired" },
  { id: "CAPA-0036", source: "Internal Audit", risk: "Major", owner: "Anita Patel", dueDate: "01 Mar 2026", status: "Closed", effectivenessCheck: "01 Jun 2026", rcaMethod: "Fishbone", diGate: true, desc: "Environmental monitoring SOP periodic review completion" },
  { id: "CAPA-0035", source: "FDA 483", risk: "Critical", owner: "Dr. Nisha Rao", dueDate: "15 Feb 2026", status: "Closed", effectivenessCheck: "15 May 2026", rcaMethod: "5-Why + Fault Tree", diGate: true, desc: "CAPA recurrence monitoring process implementation" },
];

const STATUS_COLOR: Record<string, string> = {
  Open: "badge-blue",
  "In Progress": "badge-amber",
  Overdue: "badge-red",
  Closed: "badge-green",
};
const RISK_COLOR: Record<string, string> = {
  Critical: "badge-red",
  Major: "badge-amber",
  Minor: "badge-gray",
};

export function CAPAPage() {
  const navigate = useNavigate();
  const { isViewOnly } = useRole();
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiCapa = useAppSelector((s) => s.settings.agi.agents.capa);

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const filtered = CAPAS.filter((c) => {
    const matchSearch = c.id.toLowerCase().includes(search.toLowerCase()) || c.desc.toLowerCase().includes(search.toLowerCase()) || c.owner.toLowerCase().includes(search.toLowerCase());
    const matchRisk = !riskFilter || c.risk === riskFilter;
    const matchStatus = !statusFilter || c.status === statusFilter;
    const matchSource = !sourceFilter || c.source === sourceFilter;
    return matchSearch && matchRisk && matchStatus && matchSource;
  });

  const overdue = CAPAS.filter((c) => c.status === "Overdue").length;
  const open = CAPAS.filter((c) => c.status === "Open" || c.status === "In Progress" || c.status === "Overdue").length;
  const closed = CAPAS.filter((c) => c.status === "Closed").length;
  const critical = CAPAS.filter((c) => c.risk === "Critical" && c.status !== "Closed").length;

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">QMS &amp; CAPA Tracker</h1>
          <p className="page-subtitle mt-1">Corrective and preventive action management with effectiveness monitoring</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={Download}>Export</Button>
          {!isViewOnly && <Button size="sm" icon={Plus}>New CAPA</Button>}
        </div>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><AlertCircle className="w-3 h-3 text-(--danger)" />Overdue</div>
          <div className="stat-value text-(--danger)">{overdue}</div>
          <div className="stat-sub">Require immediate action</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><Clock className="w-3 h-3 text-(--warning)" />Open</div>
          <div className="stat-value text-(--warning)">{open}</div>
          <div className="stat-sub">{critical} critical risk</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><CheckCircle className="w-3 h-3 text-(--success)" />Closed</div>
          <div className="stat-value text-(--success)">{closed}</div>
          <div className="stat-sub">This quarter</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><TrendingUp className="w-3 h-3 text-(--brand)" />On-time rate</div>
          <div className="stat-value text-(--brand)">{Math.round((closed / CAPAS.length) * 100)}%</div>
          <div className="stat-sub">Target: 90%</div>
        </div>
      </section>

      {/* AGI CAPA insights */}
      {agiMode !== "manual" && agiCapa && (
        <div className="agi-panel">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-4 h-4 text-(--info)" />
            <span className="text-sm font-semibold">AGI CAPA Intelligence</span>
            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${agiMode === "autonomous" ? "bg-(--success-bg) text-(--success)" : "bg-(--warning-bg) text-(--warning)"}`}>
              {agiMode === "autonomous" ? "AUTONOMOUS" : "ASSISTED"}
            </span>
          </div>
          <div className="space-y-2 text-xs text-(--text-secondary)">
            <p>⚠ CAPA-0042 is 3 days past deadline. FDA inspection window in 14 days. Escalate to QA Head immediately.</p>
            <p>📊 Pattern detected: 3 of 4 open Critical CAPAs share root cause "inadequate SOP documentation controls" — cluster review recommended.</p>
            <p>✅ CAPA-0035 effectiveness check due in 52 days. Pre-verification checklist auto-generated and assigned.</p>
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <section className="card">
        <div className="card-header flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-(--text-muted) shrink-0" />
            <input className="input text-sm py-1.5" placeholder="Search CAPA ID, description, owner…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select className="select text-sm py-1.5 w-auto" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
              <option value="">All risks</option>
              <option>Critical</option><option>Major</option><option>Minor</option>
            </select>
            <select className="select text-sm py-1.5 w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option>Open</option><option>In Progress</option><option>Overdue</option><option>Closed</option>
            </select>
            <select className="select text-sm py-1.5 w-auto" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">All sources</option>
              <option>FDA 483</option><option>Internal Audit</option><option>Deviation</option>
              <option>OOS</option><option>Management Review</option><option>Supplier Audit</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>CAPA ID</th><th>Source</th><th>Description</th><th>Risk</th>
                <th>Owner</th><th>Due date</th><th>Status</th>
                <th>Effectiveness check</th><th>RCA method</th><th>DI gate</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs text-(--brand) whitespace-nowrap">{c.id}</td>
                  <td className="whitespace-nowrap text-xs">{c.source}</td>
                  <td className="max-w-[220px]">
                    <p className="text-sm truncate" title={c.desc}>{c.desc}</p>
                  </td>
                  <td><span className={`badge ${RISK_COLOR[c.risk]}`}>{c.risk}</span></td>
                  <td className="whitespace-nowrap text-sm">{c.owner}</td>
                  <td className="whitespace-nowrap text-xs">{c.dueDate}</td>
                  <td><span className={`badge ${STATUS_COLOR[c.status]}`}>{c.status}</span></td>
                  <td className="whitespace-nowrap text-xs text-(--text-muted)">{c.effectivenessCheck}</td>
                  <td className="text-xs text-(--text-secondary)">{c.rcaMethod}</td>
                  <td>
                    {c.diGate && <span className="badge badge-purple text-[10px]">DI</span>}
                  </td>
                  <td>
                    <button
                      onClick={() => navigate(`/capa/${c.id.toLowerCase().replace("-", "")}`)}
                      className="btn-ghost text-xs py-1 px-2"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-(--text-muted) text-sm">No CAPAs match your filters.</div>
          )}
        </div>
      </section>

      {/* Management review metrics */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Management review metrics</h2>
          <span className="text-xs text-(--text-muted)">Q1 2026</span>
        </div>
        <div className="card-body grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "On-time CAPA closure", value: "74%", target: "≥ 90%", ok: false },
            { label: "Repeat observation rate", value: "12%", target: "≤ 5%", ok: false },
            { label: "DI exception coverage", value: "88%", target: "100%", ok: false },
            { label: "Effectiveness checks current", value: "96%", target: "≥ 95%", ok: true },
          ].map((m) => (
            <div key={m.label}>
              <div className="text-xs text-(--text-muted) mb-1">{m.label}</div>
              <div className={`text-2xl font-bold ${m.ok ? "text-(--success)" : "text-(--warning)"}`}>{m.value}</div>
              <div className="text-xs text-(--text-muted) mt-0.5">Target: {m.target}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
