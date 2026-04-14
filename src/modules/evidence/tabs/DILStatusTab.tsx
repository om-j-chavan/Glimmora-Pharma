import clsx from "clsx";
import {
  Info, ClipboardList, CheckCircle2, AlertCircle, ClipboardCheck,
  GitBranch, FileText, ArrowRight,
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

export interface DILStatusTabProps {
  allDocs: EvidenceDocument[];
  currentCount: number;
  missingCount: number;
  findings: Finding[];
  isDark: boolean;
}

export function DILStatusTab({
  allDocs, currentCount, missingCount, findings, isDark,
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
            <div key={area}>
              <div className="flex items-center justify-between mb-1"><span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{area}</span><div className="flex items-center gap-2"><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{curr}/{total}</span><span className="text-[12px] font-semibold" style={{ color: pct === 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444" }}>{pct}%</span></div></div>
              <div className={clsx("h-2 rounded-full", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${area} fulfillment`}><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444" }} /></div>
            </div>
          );
        })}
        {allDocs.length === 0 && <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No documents in scope yet. Add documents or log findings to populate the DIL board.</p>}
      </div></div>

      {/* Record lineage */}
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><GitBranch className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Record lineage</span></div><span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>How documents connect across modules</span></div><div className="card-body">
        {findings.filter((f) => f.evidenceLink?.trim()).length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No cross-module document links yet. Links appear when findings, CAPAs, or 483 events have evidence documents attached.</p>
        ) : (
          <div className="space-y-0">
            {findings.filter((f) => f.evidenceLink?.trim()).map((f) => (
              <div key={f.id} className="flex items-start gap-3 py-3 border-b last:border-0" style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}>
                <div className="flex flex-col items-center gap-1 pt-1"><div className="w-2 h-2 rounded-full bg-[#0ea5e9]" /><div className="w-0.5 flex-1 min-h-[20px]" style={{ background: isDark ? "#1e3a5a" : "#e2e8f0" }} /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap"><Badge variant="blue">{f.id}</Badge><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Gap Assessment &middot; {f.area}</span></div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap"><FileText className="w-3.5 h-3.5 text-[#10b981]" aria-hidden="true" /><span className="font-mono text-[11px] text-[#10b981]">{f.evidenceLink}</span>
                    {f.capaId && <><ArrowRight className="w-3 h-3" style={{ color: "#64748b" }} aria-hidden="true" /><Badge variant="amber">{f.capaId}</Badge><span className="text-[10px]" style={{ color: "var(--text-muted)" }}>CAPA Tracker</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div></div>
    </>
  );
}
