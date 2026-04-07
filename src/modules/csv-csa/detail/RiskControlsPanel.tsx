import { useState } from "react";
import clsx from "clsx";
import { ShieldAlert, AlertTriangle, CheckCircle2, Info, Pencil, X, Save } from "lucide-react";
import type { GxPSystem } from "@/store/systems.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

import type { ComplianceStatus, GAMP5Category } from "@/store/systems.slice";

function complianceBadge(s: ComplianceStatus) {
  const m: Record<ComplianceStatus, "green" | "red" | "amber" | "gray"> = { Compliant: "green", "Non-Compliant": "red", "In Progress": "amber", "N/A": "gray" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function gampBadge(c: GAMP5Category) {
  return <Badge variant="blue">Cat {c}</Badge>;
}

/* ── Props ── */

export interface RiskControlsPanelProps {
  system: GxPSystem;
  isDark: boolean;
  role: string;
  showPart11: boolean;
  showAnnex11: boolean;
  showGAMP5: boolean;
  onNavigateSettings: () => void;
  onSaveRiskFactors: (text: string) => void;
}

export function RiskControlsPanel({
  system, isDark, role, showPart11, showAnnex11, showGAMP5,
  onNavigateSettings, onSaveRiskFactors,
}: RiskControlsPanelProps) {
  /* Local editing state */
  const [editingRiskFactors, setEditingRiskFactors] = useState(false);
  const [riskFactorsText, setRiskFactorsText] = useState(system.riskFactors ?? "");

  /* Reset local state when system changes */
  const [prevId, setPrevId] = useState(system.id);
  if (system.id !== prevId) {
    setPrevId(system.id);
    setRiskFactorsText(system.riskFactors ?? "");
    setEditingRiskFactors(false);
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="rbc-sys-heading" className="card">
        <div className="card-header"><div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-[#ef4444]" aria-hidden="true" /><h3 id="rbc-sys-heading" className="card-title">Risk-based classification</h3></div></div>
        <div className="card-body space-y-0">
          {[
            { label: "Patient safety risk", level: system.gxpRelevance === "Critical" ? "HIGH" : system.gxpRelevance === "Major" ? "MEDIUM" : "LOW" },
            { label: "Product quality impact", level: system.riskLevel },
            { label: "Regulatory exposure", level: (system.part11Status === "Non-Compliant" || system.annex11Status === "Non-Compliant") ? "HIGH" : (system.part11Status === "In Progress" || system.annex11Status === "In Progress") ? "MEDIUM" : "LOW" },
            { label: "DI impact", level: system.gamp5Category === "5" ? "HIGH" : system.gamp5Category === "4" ? "MEDIUM" : "LOW" },
          ].map((r, i, arr) => (
            <div key={r.label} className={clsx("flex justify-between items-center py-3", i < arr.length - 1 && "border-b")} style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}>
              <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{r.label}</span>
              <Badge variant={r.level === "HIGH" ? "red" : r.level === "MEDIUM" ? "amber" : "green"}>{r.level}</Badge>
            </div>
          ))}
        </div>
      </section>
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" /><span className="card-title">Risk factors</span></div>
          {role !== "viewer" && (
            <button type="button" onClick={() => { if (editingRiskFactors) setRiskFactorsText(system.riskFactors ?? ""); setEditingRiskFactors((v) => !v); }}
              aria-label={editingRiskFactors ? "Cancel editing risk factors" : "Edit risk factors"}
              className={clsx("ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer transition-opacity", editingRiskFactors ? "text-[#64748b] hover:text-[#94a3b8]" : "text-[#0ea5e9] hover:opacity-80")}>
              {editingRiskFactors ? <X className="w-3.5 h-3.5" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{editingRiskFactors ? "Cancel" : "Edit"}</span>
            </button>
          )}
        </div>
        <div className="card-body">
          {editingRiskFactors ? (
            <div className="space-y-3">
              <label htmlFor="risk-factors-input" className="text-[11px] block" style={{ color: "var(--text-muted)" }}>Describe patient safety, product quality and data integrity risk factors</label>
              <textarea id="risk-factors-input" rows={5} className="input resize-none w-full text-[12px]" value={riskFactorsText} onChange={(e) => setRiskFactorsText(e.target.value)}
                placeholder={"Patient safety: High/Medium/Low \u2014 reason\nProduct quality: High/Medium/Low \u2014 reason\nDI impact: High/Medium/Low \u2014 reason\nInspection exposure: describe risk"} aria-describedby="risk-factors-hint" />
              <p id="risk-factors-hint" className="text-[10px]" style={{ color: "var(--text-muted)" }}>Visible to inspectors in system detail view.</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{riskFactorsText.length} characters</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" type="button" onClick={() => { setRiskFactorsText(system.riskFactors ?? ""); setEditingRiskFactors(false); }}>Cancel</Button>
                  <Button variant="primary" size="sm" icon={Save} type="button" onClick={() => {
                    onSaveRiskFactors(riskFactorsText.trim());
                    setEditingRiskFactors(false);
                  }}>Save</Button>
                </div>
              </div>
            </div>
          ) : system.riskFactors?.trim() ? (
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{system.riskFactors}</p>
          ) : (
            <div className={clsx("flex items-start gap-2 p-3 rounded-lg", isDark ? "bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border border-[#fde68a]")}>
              <AlertTriangle className="w-4 h-4 text-[#f59e0b] flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="text-[12px] font-medium text-[#f59e0b]">Risk factors not documented</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Click Edit above to document patient safety, product quality and DI risk factors.</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {(showPart11 || showAnnex11 || showGAMP5) ? (
        <div className="card"><div className="card-header"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#10b981]" aria-hidden="true" /><span className="card-title">Compliance status</span></div></div><div className="card-body">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {showPart11 && (
              <div className={clsx("rounded-lg p-3 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>21 CFR Part 11</span>
                {complianceBadge(system.part11Status)}
                <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>{system.part11Status === "Compliant" ? "Audit trail and e-sig validated" : system.part11Status === "Non-Compliant" ? "Remediation required \u2014 raise CAPA" : system.part11Status === "In Progress" ? "Remediation in progress" : "Not applicable for this system"}</p>
              </div>
            )}
            {showAnnex11 && (
              <div className={clsx("rounded-lg p-3 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>EU GMP Annex 11</span>
                {complianceBadge(system.annex11Status)}
                <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>{system.annex11Status === "Compliant" ? "Computerised system validated" : system.annex11Status === "Non-Compliant" ? "Lifecycle validation required" : system.annex11Status === "In Progress" ? "Validation in progress" : "Not applicable"}</p>
              </div>
            )}
            {showGAMP5 && (
              <div className={clsx("rounded-lg p-3 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>GAMP 5 Category</span>
                {gampBadge(system.gamp5Category)}
                <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>{system.gamp5Category === "5" ? "Custom software \u2014 full IQ/OQ/PQ required" : system.gamp5Category === "4" ? "Configured software \u2014 configured items tested" : system.gamp5Category === "3" ? "Non-configured \u2014 standard testing applies" : "Infrastructure \u2014 minimal testing required"}</p>
              </div>
            )}
          </div>
        </div></div>
      ) : (
        <div className={clsx("flex items-start gap-2 p-3 rounded-xl border", isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border-[#fde68a]")}>
          <Info className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-[12px] font-medium text-[#f59e0b]">No compliance frameworks active</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Enable Part 11, Annex 11 or GAMP 5 in Settings &rarr; Frameworks to see compliance status.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onNavigateSettings}>Settings</Button>
        </div>
      )}
    </div>
  );
}
