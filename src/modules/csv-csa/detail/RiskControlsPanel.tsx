import { useState } from "react";
import clsx from "clsx";
import { ShieldAlert, AlertTriangle, CheckCircle2, Info, Pencil, X, Save } from "lucide-react";
import type { GxPSystem, RiskLevel } from "@/types/csv-csa";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

import type { ComplianceStatus, GAMP5Category } from "@/types/csv-csa";

function complianceBadge(s: ComplianceStatus) {
  const m: Record<ComplianceStatus, "green" | "red" | "amber" | "gray"> = { Compliant: "green", "Non-Compliant": "red", "In Progress": "amber", "N/A": "gray" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function gampBadge(c: GAMP5Category) {
  return <Badge variant="blue">Cat {c}</Badge>;
}

/* ── Props ── */

export interface RiskClassificationPatch {
  patientSafetyRisk: RiskLevel;
  productQualityImpact: RiskLevel;
  regulatoryExposure: RiskLevel;
  diImpact: RiskLevel;
}

export interface RiskControlsPanelProps {
  system: GxPSystem;  role: string;
  showPart11: boolean;
  showAnnex11: boolean;
  showGAMP5: boolean;
  onNavigateSettings: () => void;
  onSaveRiskFactors: (text: string) => void;
  onSaveRiskClassification: (patch: RiskClassificationPatch) => void;
}

export function RiskControlsPanel({
  system, role, showPart11, showAnnex11, showGAMP5,
  onNavigateSettings, onSaveRiskFactors, onSaveRiskClassification,
}: RiskControlsPanelProps) {
  // Default fallback based on GxP relevance for systems that don't yet have risk fields set
  const defaultLevel: RiskLevel = system.gxpRelevance === "Critical" ? "HIGH"
    : system.gxpRelevance === "Major" ? "MEDIUM" : "LOW";

  /* Local editing state */
  const [editingRiskFactors, setEditingRiskFactors] = useState(false);
  const [riskFactorsText, setRiskFactorsText] = useState(system.riskFactors ?? "");
  const [editingRiskClass, setEditingRiskClass] = useState(false);
  const [riskForm, setRiskForm] = useState<RiskClassificationPatch>({
    patientSafetyRisk: system.patientSafetyRisk ?? defaultLevel,
    productQualityImpact: system.productQualityImpact ?? defaultLevel,
    regulatoryExposure: system.regulatoryExposure ?? defaultLevel,
    diImpact: system.diImpact ?? defaultLevel,
  });

  /* Reset local state when system changes */
  const [prevId, setPrevId] = useState(system.id);
  if (system.id !== prevId) {
    setPrevId(system.id);
    setRiskFactorsText(system.riskFactors ?? "");
    setEditingRiskFactors(false);
    setEditingRiskClass(false);
    setRiskForm({
      patientSafetyRisk: system.patientSafetyRisk ?? defaultLevel,
      productQualityImpact: system.productQualityImpact ?? defaultLevel,
      regulatoryExposure: system.regulatoryExposure ?? defaultLevel,
      diImpact: system.diImpact ?? defaultLevel,
    });
  }

  const classificationRows: { key: keyof RiskClassificationPatch; label: string; level: RiskLevel }[] = [
    { key: "patientSafetyRisk",     label: "Patient safety risk",     level: system.patientSafetyRisk ?? defaultLevel },
    { key: "productQualityImpact",  label: "Product quality impact", level: system.productQualityImpact ?? defaultLevel },
    { key: "regulatoryExposure",    label: "Regulatory exposure",    level: system.regulatoryExposure ?? defaultLevel },
    { key: "diImpact",              label: "Data integrity impact", level: system.diImpact ?? defaultLevel },
  ];

  const handleSaveRiskClass = () => {
    onSaveRiskClassification(riskForm);
    setEditingRiskClass(false);
  };

  const handleCancelRiskClass = () => {
    setRiskForm({
      patientSafetyRisk: system.patientSafetyRisk ?? defaultLevel,
      productQualityImpact: system.productQualityImpact ?? defaultLevel,
      regulatoryExposure: system.regulatoryExposure ?? defaultLevel,
      diImpact: system.diImpact ?? defaultLevel,
    });
    setEditingRiskClass(false);
  };

  return (
    <div className="space-y-4">
      <section aria-labelledby="rbc-sys-heading" className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#ef4444]" aria-hidden="true" />
            <h3 id="rbc-sys-heading" className="card-title">Risk-based classification</h3>
          </div>
          {role !== "viewer" && (
            <button
              type="button"
              onClick={() => {
                if (editingRiskClass) handleCancelRiskClass();
                else setEditingRiskClass(true);
              }}
              aria-label={editingRiskClass ? "Cancel editing risk classification" : "Edit risk classification"}
              className={clsx("ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer", editingRiskClass ? "text-[#64748b]" : "text-[#0ea5e9] hover:opacity-80")}
            >
              {editingRiskClass ? <X className="w-3.5 h-3.5" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{editingRiskClass ? "Cancel" : "Edit"}</span>
            </button>
          )}
        </div>
        <div className="card-body space-y-0">
          {classificationRows.map((r, i, arr) => (
            <div key={r.key} className={clsx("flex justify-between items-center py-3", i < arr.length - 1 && "border-b")} style={{ borderColor: "var(--bg-border)" }}>
              <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{r.label}</span>
              {editingRiskClass ? (
                <select
                  value={riskForm[r.key]}
                  onChange={(e) => setRiskForm((prev) => ({ ...prev, [r.key]: e.target.value as RiskLevel }))}
                  className="select text-[11px]"
                  style={{ minWidth: "7rem" }}
                  aria-label={r.label}
                >
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              ) : (
                <Badge variant={r.level === "HIGH" ? "red" : r.level === "MEDIUM" ? "amber" : "green"}>{r.level}</Badge>
              )}
            </div>
          ))}
          {editingRiskClass && (
            <div className="flex items-center justify-end gap-2 pt-3">
              <Button variant="ghost" size="sm" type="button" onClick={handleCancelRiskClass}>Cancel</Button>
              <Button variant="primary" size="sm" icon={Save} type="button" onClick={handleSaveRiskClass}>Save</Button>
            </div>
          )}
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
            <div className="flex items-start gap-2 p-3 rounded-lg bg-(--warning-bg) border border-(--warning)">
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
              <div className={clsx("rounded-lg p-3 border", "bg-(--bg-surface) border-(--bg-border)")}>
                <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>21 CFR Part 11</span>
                {complianceBadge(system.part11Status)}
                <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>{system.part11Status === "Compliant" ? "Audit trail and e-sig validated" : system.part11Status === "Non-Compliant" ? "Remediation required \u2014 raise CAPA" : system.part11Status === "In Progress" ? "Remediation in progress" : "Not applicable for this system"}</p>
              </div>
            )}
            {showAnnex11 && (
              <div className={clsx("rounded-lg p-3 border", "bg-(--bg-surface) border-(--bg-border)")}>
                <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>EU GMP Annex 11</span>
                {complianceBadge(system.annex11Status)}
                <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>{system.annex11Status === "Compliant" ? "Computerised system validated" : system.annex11Status === "Non-Compliant" ? "Lifecycle validation required" : system.annex11Status === "In Progress" ? "Validation in progress" : "Not applicable"}</p>
              </div>
            )}
            {showGAMP5 && (
              <div className={clsx("rounded-lg p-3 border", "bg-(--bg-surface) border-(--bg-border)")}>
                <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>GAMP 5 Category</span>
                {gampBadge(system.gamp5Category)}
                <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>{system.gamp5Category === "5" ? "Custom software \u2014 full IQ/OQ/PQ required" : system.gamp5Category === "4" ? "Configured software \u2014 configured items tested" : system.gamp5Category === "3" ? "Non-configured \u2014 standard testing applies" : "Infrastructure \u2014 minimal testing required"}</p>
              </div>
            )}
          </div>
        </div></div>
      ) : (
        <div className={clsx("flex items-start gap-2 p-3 rounded-xl border", "bg-(--warning-bg) border-(--warning)")}>
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
