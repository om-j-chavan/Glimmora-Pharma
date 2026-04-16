import clsx from "clsx";
import {
  Info, ClipboardList, CheckCircle2, AlertCircle, ClipboardCheck,
  GitBranch, FileText, AlertTriangle,
} from "lucide-react";
import type { EvidenceDocument, DocArea } from "@/store/evidence.slice";
import { Badge } from "@/components/ui/Badge";

const DOC_AREAS: DocArea[] = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT", "Regulatory", "Training", "HR"];

interface Finding {
  id: string;
  area: string;
  evidenceLink?: string;
  capaId?: string;
}

interface CAPA {
  id: string;
  findingId?: string;
  status: string;
  diGate: boolean;
  diGateStatus?: string;
}

export interface DILStatusTabProps {
  allDocs: EvidenceDocument[];
  currentCount: number;
  missingCount: number;
  findings: Finding[];
  capas: CAPA[];
  isDark: boolean;
}

export function DILStatusTab({
  allDocs, currentCount, missingCount, findings, capas, isDark,
}: DILStatusTabProps) {
  return (
    <>
      {/* Info banner */}
      <div className={clsx("flex items-start gap-2 p-4 rounded-xl mb-6 border", isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border-[#fde68a]")}>
        <Info className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div><p className="text-[12px] font-medium text-[#f59e0b]">DIL &mdash; Document Information List</p><p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Inspectors submit a DIL &mdash; a list of documents they want to review. This board tracks which documents have been retrieved and are ready.</p></div>
      </div>

      {/* Tiles */}
      <section aria-label="DIL statistics" className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="stat-card" role="region" aria-label="Total requested"><div className="flex items-center gap-2 mb-2"><ClipboardList className="w-5 h-5 text-[#6366f1]" aria-hidden="true" /><span className="stat-label mb-0">Total requested</span></div><div className="stat-value">{allDocs.length}</div><div className="stat-sub">Documents in scope</div></div>
        <div className="stat-card" role="region" aria-label="Ready"><div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-5 h-5" style={{ color: currentCount > 0 ? "#10b981" : "#64748b" }} aria-hidden="true" /><span className="stat-label mb-0">Ready</span></div><div className="stat-value" style={{ color: currentCount > 0 ? "#10b981" : "#64748b" }}>{currentCount}</div><div className="stat-sub">Retrieved and ready</div></div>
        <div className="stat-card" role="region" aria-label="Missing"><div className="flex items-center gap-2 mb-2"><AlertCircle className="w-5 h-5" style={{ color: missingCount > 0 ? "#ef4444" : "#10b981" }} aria-hidden="true" /><span className="stat-label mb-0">Missing</span></div><div className="stat-value" style={{ color: missingCount > 0 ? "#ef4444" : "#10b981" }}>{missingCount}</div><div className="stat-sub">Not found or missing</div></div>
      </section>

      {/* Fulfillment by area */}
      <div className="card mb-4"><div className="card-header"><div className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">DIL fulfillment by area</span></div></div><div className="card-body space-y-3">
        {DOC_AREAS.map((area) => {
          const areaDocs = allDocs.filter((d) => d.area === area); const curr = areaDocs.filter((d) => d.status === "Current").length; const total = areaDocs.length; const pct = total === 0 ? 0 : Math.round((curr / total) * 100);
          if (total === 0) return null;
          return (
            <div key={area} className="p-2.5 rounded-lg" style={{ background: pct === 100 ? "rgba(16,185,129,0.06)" : pct === 0 ? "rgba(245,158,11,0.06)" : "transparent" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{area}</span>
                <div className="flex items-center gap-2">
                  {pct === 100 ? (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Ready
                    </span>
                  ) : pct === 0 ? (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
                      <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Action needed
                    </span>
                  ) : null}
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{curr}/{total}</span>
                  <span className="text-[12px] font-semibold" style={{ color: pct === 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444" }}>{pct}%</span>
                </div>
              </div>
              <div className={clsx("h-2 rounded-full", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${area} fulfillment`}><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444" }} /></div>
            </div>
          );
        })}
        {allDocs.length === 0 && <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No documents in scope yet. Add documents or log findings to populate the DIL board.</p>}
      </div></div>

      {/* Record lineage */}
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><GitBranch className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Record lineage</span></div><span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>How documents connect across modules</span></div><div className="card-body">
        {findings.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No cross-module document links yet. Links appear when findings, CAPAs, or 483 events have evidence documents attached.</p>
        ) : (
          <div className="space-y-3">
            {findings.map((f) => {
              const linkedCapa = capas.find((c) => c.id === f.capaId || c.findingId === f.id);
              const hasEvidence = !!f.evidenceLink?.trim();
              const hasDiGate = linkedCapa?.diGate ?? false;
              const diGateCleared = linkedCapa?.diGateStatus === "cleared";
              return (
                <div key={f.id} className="p-3 rounded-lg border" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
                  <div className="space-y-2">
                    {/* Step 1: Finding */}
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#0ea5e9] shrink-0" />
                      <Badge variant="blue">{f.id}</Badge>
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Gap Assessment &middot; {f.area}</span>
                    </div>
                    <div className="ml-3 pl-2" style={{ borderLeft: `2px solid ${isDark ? "#1e3a5a" : "#e2e8f0"}` }}>
                      {/* Step 2: CAPA */}
                      <div className="flex items-center gap-2 py-1.5">
                        <div className={clsx("w-2 h-2 rounded-full shrink-0", linkedCapa ? "bg-[#f59e0b]" : "bg-[#94a3b8]")} />
                        {linkedCapa ? (
                          <><Badge variant="amber">{linkedCapa.id}</Badge><span className="text-[10px]" style={{ color: "var(--text-muted)" }}>CAPA Tracker &middot; {linkedCapa.status}</span></>
                        ) : (
                          <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>CAPA &mdash; Not yet linked</span>
                        )}
                      </div>
                      {/* Step 3: Evidence */}
                      <div className="flex items-center gap-2 py-1.5">
                        <div className={clsx("w-2 h-2 rounded-full shrink-0", hasEvidence ? "bg-[#10b981]" : "bg-[#94a3b8]")} />
                        {hasEvidence ? (
                          <><FileText className="w-3.5 h-3.5 text-[#10b981]" aria-hidden="true" /><span className="font-mono text-[11px] text-[#10b981]">{f.evidenceLink}</span></>
                        ) : (
                          <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Evidence &mdash; Not yet linked</span>
                        )}
                      </div>
                      {/* Step 4: DI Gate (only for CSV/IT related) */}
                      {hasDiGate && (
                        <div className="flex items-center gap-2 py-1.5">
                          <div className={clsx("w-2 h-2 rounded-full shrink-0", diGateCleared ? "bg-[#10b981]" : "bg-[#ef4444]")} />
                          <span className="text-[11px] font-medium" style={{ color: diGateCleared ? "#10b981" : "#ef4444" }}>
                            DI Gate: {diGateCleared ? "Cleared" : "Pending"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div></div>
    </>
  );
}
