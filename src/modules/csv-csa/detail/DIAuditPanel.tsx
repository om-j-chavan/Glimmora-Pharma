import clsx from "clsx";
import { ShieldAlert, AlertCircle, CheckCircle2, Search, ClipboardCheck } from "lucide-react";
import type { GxPSystem } from "@/store/systems.slice";
import { Badge } from "@/components/ui/Badge";

/* ── Types ── */

interface Finding {
  id: string;
  requirement: string;
  severity: string;
  status: string;
  area: string;
  framework: string;
}

interface CAPA {
  id: string;
  description: string;
  status: string;
  findingId: string;
  diGate?: boolean;
}

/* ── Props ── */

export interface DIAuditPanelProps {
  system: GxPSystem;
  findings: Finding[];
  capas: CAPA[];
  isDark: boolean;
  onNavigateGap: (findingId: string) => void;
  onNavigateCapa: (capaId: string) => void;
}

export function DIAuditPanel({ system, findings, capas, isDark, onNavigateGap, onNavigateCapa }: DIAuditPanelProps) {
  const p11 = system.part11Status;
  const a11 = system.annex11Status;
  const isBad = p11 === "Non-Compliant" || a11 === "Non-Compliant";
  const isAmber = !isBad && (p11 === "In Progress" || a11 === "In Progress");
  const isGood = !isBad && !isAmber && (p11 === "Compliant" || a11 === "Compliant");
  const linkedFindings = findings.filter((f) => f.area === "CSV/IT" && (f.framework === "p11" || f.framework === "annex11"));
  const linkedCAPAs = capas.filter((c) => linkedFindings.some((f) => f.id === c.findingId));
  const openDIGateCAPAs = linkedCAPAs.filter((c) => c.diGate && c.status !== "Closed");

  function statusPanel(isBadS: boolean, isAmberS: boolean, icon: React.ReactNode, label: string, desc: string) {
    const bg = isBadS ? "rgba(239,68,68,0.08)" : isAmberS ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)";
    const border = isBadS ? "rgba(239,68,68,0.2)" : isAmberS ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)";
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg text-[12px]" style={{ background: bg, border: `1px solid ${border}` }}>
        {icon}
        <div>
          <span className="font-semibold block" style={{ color: isBadS ? "#ef4444" : isAmberS ? "#f59e0b" : "#10b981" }}>{label}</span>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-[#ef4444]" aria-hidden="true" /><span className="card-title">Data integrity status</span></div></div><div className="card-body space-y-2">
        {statusPanel(isBad, isAmber,
          isBad ? <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" aria-hidden="true" /> : isAmber ? <AlertCircle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" />,
          isBad ? "Audit trail non-compliant" : isAmber ? "Audit trail remediation in progress" : isGood ? "Audit trail compliant" : "Audit trail status not applicable",
          isBad ? "Part 11 / Annex 11 gap \u2014 CAPA required" : isAmber ? "Linked CAPA in progress" : isGood ? "Audit trail controls verified and validated" : "Not applicable for this system"
        )}
        {statusPanel(isBad, isAmber,
          isBad ? <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" aria-hidden="true" /> : isAmber ? <AlertCircle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" />,
          isBad ? "E-signature non-compliant" : isAmber ? "E-signature remediation in progress" : isGood ? "E-signature compliant" : "E-signature status not applicable",
          isBad ? "E-sig not cryptographically bound to records" : isAmber ? "E-sig binding remediation in progress" : isGood ? "E-sig binding validated under Part 11 / Annex 11" : "Not applicable"
        )}
        {statusPanel(openDIGateCAPAs.length > 0, false,
          openDIGateCAPAs.length > 0 ? <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" />,
          openDIGateCAPAs.length > 0 ? `DI gate open \u2014 ${openDIGateCAPAs.length} CAPA(s) pending` : "DI gate cleared",
          openDIGateCAPAs.length > 0 ? "Data integrity review must complete before closure" : "No open data integrity issues for this system"
        )}
      </div></div>

      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Search className="w-4 h-4 text-[#a78bfa]" aria-hidden="true" /><span className="card-title">Linked findings</span>{linkedFindings.length > 0 && <Badge variant={linkedFindings.some((f) => f.severity === "Critical") ? "red" : "amber"}>{linkedFindings.length}</Badge>}</div></div><div className="card-body">
        {linkedFindings.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No Part 11 or Annex 11 findings logged yet. Log findings in Gap Assessment with area &ldquo;CSV/IT&rdquo; to see them here.</p>
        ) : (
          <div className="space-y-2">{linkedFindings.map((f) => (
            <div key={f.id} onClick={() => onNavigateGap(f.id)} role="button" aria-label={`Open finding ${f.id} in Gap Assessment`}
              className={clsx("flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:border-[#0ea5e9]", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-mono text-[11px] font-semibold text-[#0ea5e9] flex-shrink-0">{f.id}</span>
                <span className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{f.requirement}</span>
              </div>
              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                <Badge variant={f.severity === "Critical" ? "red" : f.severity === "Major" ? "amber" : "gray"}>{f.severity}</Badge>
                <Badge variant={f.status === "Closed" ? "green" : f.status === "In Progress" ? "amber" : "blue"}>{f.status}</Badge>
              </div>
            </div>
          ))}</div>
        )}
      </div></div>

      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">Linked CAPAs</span>{linkedCAPAs.length > 0 && <Badge variant={linkedCAPAs.some((c) => c.status !== "Closed" && c.diGate) ? "red" : "blue"}>{linkedCAPAs.length}</Badge>}</div></div><div className="card-body">
        {linkedCAPAs.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No CAPAs linked to CSV/IT findings yet. Raise a CAPA from a Gap Assessment finding to see it tracked here.</p>
        ) : (
          <div className="space-y-2">{linkedCAPAs.map((c) => (
            <div key={c.id} onClick={() => onNavigateCapa(c.id)} role="button" aria-label={`Open ${c.id} in CAPA Tracker`}
              className={clsx("flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:border-[#0ea5e9]", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-mono text-[11px] font-semibold text-[#0ea5e9] flex-shrink-0">{c.id}</span>
                <span className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{c.description}</span>
              </div>
              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                {c.diGate && c.status !== "Closed" && <Badge variant="red">DI gate</Badge>}
                <Badge variant={c.status === "Closed" ? "green" : c.status === "Pending QA Review" ? "purple" : c.status === "In Progress" ? "amber" : "blue"}>{c.status}</Badge>
              </div>
            </div>
          ))}</div>
        )}
      </div></div>
    </div>
  );
}
