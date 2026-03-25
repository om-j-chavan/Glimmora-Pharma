import { useState } from "react";
import { Search, Download, Shield, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRole } from "@/hooks/useRole";

const SYSTEMS = [
  { id: "SYS-001", name: "LIMS (LabWare v7)", type: "LIMS", gxpRelevance: "Direct", part11: "Gap", riskLevel: "High", validationStatus: "Requires Remediation", owner: "Dr. Nisha Rao", lastReview: "Jan 2025", notes: "Audit trail configuration error post v3.1 upgrade. Remediation in progress via CAPA-0042." },
  { id: "SYS-002", name: "QMS (MasterControl)", type: "QMS", gxpRelevance: "Direct", part11: "Compliant", riskLevel: "Medium", validationStatus: "Validated", owner: "Dr. Priya Sharma", lastReview: "Mar 2026", notes: "Validated. Periodic review due Q3 2026." },
  { id: "SYS-003", name: "ERP (SAP S/4HANA)", type: "ERP", gxpRelevance: "Indirect", part11: "Partial", riskLevel: "Medium", validationStatus: "Partial Validation", owner: "Anita Patel", lastReview: "Jun 2025", notes: "GMP-relevant modules (batch management, WM) not fully validated." },
  { id: "SYS-004", name: "HPLC Data Station (Empower 3)", type: "CDS", gxpRelevance: "Direct", part11: "Gap", riskLevel: "High", validationStatus: "Not Started", owner: "Dr. Nisha Rao", lastReview: "Never", notes: "New system commissioned 45 days ago. IQ/OQ not completed. CAPA-0041 open." },
  { id: "SYS-005", name: "LMS (SuccessFactors)", type: "LMS", gxpRelevance: "Indirect", part11: "Compliant", riskLevel: "Low", validationStatus: "Validated", owner: "Suresh Kumar", lastReview: "Nov 2025", notes: "Training records validated. Periodic review on schedule." },
  { id: "SYS-006", name: "eDMS (Documentum)", type: "eDMS", gxpRelevance: "Direct", part11: "Compliant", riskLevel: "Medium", validationStatus: "Validated", owner: "Dr. Priya Sharma", lastReview: "Dec 2025", notes: "Controlled document system. Annual review completed." },
  { id: "SYS-007", name: "MES (Rockwell PharmaSuite)", type: "MES", gxpRelevance: "Direct", part11: "Partial", riskLevel: "High", validationStatus: "Partial Validation", owner: "Rahul Mehta", lastReview: "Aug 2025", notes: "eBR module not validated. Process control validated." },
  { id: "SYS-008", name: "CMMS (Maximo)", type: "CMMS", gxpRelevance: "Indirect", part11: "Not Applicable", riskLevel: "Low", validationStatus: "Qualified", owner: "Anita Patel", lastReview: "Oct 2025", notes: "Equipment maintenance and calibration tracking." },
];

const ROADMAP = [
  { system: "HPLC (Empower 3)", activity: "IQ/OQ Protocol Execution", start: "Mar 2026", end: "Apr 2026", priority: "Critical" },
  { system: "LIMS (LabWare v7)", activity: "Audit Trail Remediation & Re-validation", start: "Mar 2026", end: "May 2026", priority: "Critical" },
  { system: "ERP (SAP)", activity: "GMP Module Validation (Batch & WM)", start: "Apr 2026", end: "Jul 2026", priority: "Major" },
  { system: "MES (PharmaSuite)", activity: "eBR Module IQ/OQ/PQ", start: "May 2026", end: "Aug 2026", priority: "Major" },
  { system: "LIMS (LabWare v7)", activity: "Periodic Review", start: "Sep 2026", end: "Sep 2026", priority: "Minor" },
  { system: "eDMS (Documentum)", activity: "Upgrade Validation (v16.7)", start: "Oct 2026", end: "Nov 2026", priority: "Minor" },
];

const RISK_COLOR: Record<string, string> = { High: "badge-red", Medium: "badge-amber", Low: "badge-green" };
const PART11_COLOR: Record<string, string> = { Compliant: "badge-green", Gap: "badge-red", Partial: "badge-amber", "Not Applicable": "badge-gray" };
const VAL_COLOR: Record<string, string> = { "Validated": "badge-green", "Qualified": "badge-green", "Partial Validation": "badge-amber", "Not Started": "badge-red", "Requires Remediation": "badge-red" };
const PRI_COLOR: Record<string, string> = { Critical: "badge-red", Major: "badge-amber", Minor: "badge-gray" };

export function CSVPage() {
  useRole();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"inventory" | "roadmap">("inventory");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = SYSTEMS.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.type.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || s.type === typeFilter;
    const matchRisk = !riskFilter || s.riskLevel === riskFilter;
    return matchSearch && matchType && matchRisk;
  });

  const selectedSys = SYSTEMS.find((s) => s.id === selected);
  const high = SYSTEMS.filter((s) => s.riskLevel === "High").length;
  const notVal = SYSTEMS.filter((s) => !["Validated", "Qualified"].includes(s.validationStatus)).length;
  const part11Gap = SYSTEMS.filter((s) => s.part11 === "Gap").length;

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">CSV / CSA &amp; Systems Risk</h1>
          <p className="page-subtitle mt-1">Computerized system validation register, risk ranking &amp; roadmap</p>
        </div>
        <Button variant="secondary" size="sm" icon={Download}>Export register</Button>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><Shield className="w-3 h-3 text-(--danger)" />High-risk systems</div>
          <div className="stat-value text-(--danger)">{high}</div>
          <div className="stat-sub">Open validation actions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-(--warning)" />Not fully validated</div>
          <div className="stat-value text-(--warning)">{notVal}</div>
          <div className="stat-sub">Of {SYSTEMS.length} systems</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Part 11 gaps</div>
          <div className="stat-value text-(--danger)">{part11Gap}</div>
          <div className="stat-sub">Require remediation</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><Clock className="w-3 h-3 text-(--brand)" />Roadmap items</div>
          <div className="stat-value text-(--brand)">{ROADMAP.length}</div>
          <div className="stat-sub">Mar – Nov 2026</div>
        </div>
      </section>

      <div className="flex gap-1 border-b border-(--bg-border)">
        {(["inventory", "roadmap"] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px ${activeTab === t ? "border-(--brand) text-(--brand)" : "border-transparent text-(--text-secondary) hover:text-(--text-primary)"}`}>
            {t === "inventory" ? "System Inventory & Risk Register" : "CSV/CSA Roadmap"}
          </button>
        ))}
      </div>

      {activeTab === "inventory" && (
        <section className="card">
          <div className="card-header flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-(--text-muted) shrink-0" />
              <input className="input text-sm py-1.5" placeholder="Search system name or type…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <select className="select text-sm py-1.5 w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {["LIMS", "QMS", "ERP", "CDS", "LMS", "eDMS", "MES", "CMMS"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <select className="select text-sm py-1.5 w-auto" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                <option value="">All risk levels</option>
                <option>High</option><option>Medium</option><option>Low</option>
              </select>
            </div>
          </div>
          <div className="flex">
            <div className={`overflow-x-auto ${selectedSys ? "flex-1" : "w-full"}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th><th>System</th><th>Type</th><th>GxP</th>
                    <th>Part 11</th><th>Risk</th><th>Validation</th>
                    <th>Owner</th><th>Last review</th><th><span className="sr-only">Detail</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className={selected === s.id ? "bg-(--brand-muted)" : ""}>
                      <td className="font-mono text-xs text-(--brand)">{s.id}</td>
                      <td className="font-medium text-sm whitespace-nowrap">{s.name}</td>
                      <td><span className="badge badge-gray">{s.type}</span></td>
                      <td className="text-sm">{s.gxpRelevance}</td>
                      <td><span className={`badge ${PART11_COLOR[s.part11]}`}>{s.part11}</span></td>
                      <td><span className={`badge ${RISK_COLOR[s.riskLevel]}`}>{s.riskLevel}</span></td>
                      <td><span className={`badge ${VAL_COLOR[s.validationStatus] ?? "badge-gray"}`}>{s.validationStatus}</span></td>
                      <td className="text-sm whitespace-nowrap">{s.owner}</td>
                      <td className="text-xs text-(--text-muted)">{s.lastReview}</td>
                      <td>
                        <button onClick={() => setSelected(selected === s.id ? null : s.id)} className="btn-ghost text-xs py-1 px-2">Detail</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedSys && (
              <aside className="w-72 border-l border-(--bg-border) p-5 space-y-4 shrink-0">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs text-(--brand)">{selectedSys.id}</span>
                  <button onClick={() => setSelected(null)} className="text-(--text-muted) text-lg leading-none">&times;</button>
                </div>
                <div className="text-sm font-semibold">{selectedSys.name}</div>
                <div className="flex gap-2 flex-wrap">
                  <span className={`badge ${RISK_COLOR[selectedSys.riskLevel]}`}>{selectedSys.riskLevel} risk</span>
                  <span className={`badge ${PART11_COLOR[selectedSys.part11]}`}>Part 11: {selectedSys.part11}</span>
                </div>
                {[
                  { label: "GxP relevance", value: selectedSys.gxpRelevance },
                  { label: "Validation status", value: selectedSys.validationStatus },
                  { label: "Owner", value: selectedSys.owner },
                  { label: "Last review", value: selectedSys.lastReview },
                ].map((d) => (
                  <div key={d.label}>
                    <div className="text-xs text-(--text-muted) mb-0.5">{d.label}</div>
                    <div className="text-sm">{d.value}</div>
                  </div>
                ))}
                <div>
                  <div className="text-xs text-(--text-muted) mb-1">Notes</div>
                  <p className="text-xs text-(--text-secondary) leading-relaxed">{selectedSys.notes}</p>
                </div>
              </aside>
            )}
          </div>
        </section>
      )}

      {activeTab === "roadmap" && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">CSV/CSA Validation Roadmap — 2026</h2>
            <span className="text-xs text-(--text-muted)">High-risk systems prioritised first</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>System</th><th>Validation activity</th><th>Start</th><th>End</th><th>Priority</th></tr></thead>
              <tbody>
                {ROADMAP.map((r, i) => (
                  <tr key={i}>
                    <td className="font-medium text-sm">{r.system}</td>
                    <td className="text-sm">{r.activity}</td>
                    <td className="text-xs text-(--text-muted)">{r.start}</td>
                    <td className="text-xs text-(--text-muted)">{r.end}</td>
                    <td><span className={`badge ${PRI_COLOR[r.priority]}`}>{r.priority}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
