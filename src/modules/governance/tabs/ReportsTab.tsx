import { BarChart3, AlertTriangle, Shield, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface ReportsTabProps {
  raidItemsCount: number;
  openRaidCount: number;
  readinessScore: number;
  sitesCount: number;
  noData: boolean;
  exportMonthly: () => void;
  exportRAID: () => void;
  exportReadiness: () => void;
}

export function ReportsTab({
  raidItemsCount, openRaidCount, readinessScore, sitesCount, noData,
  exportMonthly, exportRAID, exportReadiness,
}: ReportsTabProps) {
  return (
    <>
      <p className="text-[13px] leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>Generate governance reports for management review, regulatory submissions and internal audits.</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: "Monthly Quality KPI Report", desc: "KPI summary, CAPA status, readiness score.", icon: BarChart3, color: "#0ea5e9", onClick: exportMonthly },
          { title: "RAID Log Export", desc: `${raidItemsCount} items \u00b7 ${openRaidCount} open.`, icon: AlertTriangle, color: "#6366f1", onClick: exportRAID },
          { title: "Inspection Readiness Pack", desc: `${sitesCount} sites \u00b7 Score: ${noData ? "\u2014" : `${readinessScore}%`}.`, icon: Shield, color: "#10b981", onClick: exportReadiness },
        ].map((rpt) => (
          <div key={rpt.title} className="card"><div className="card-body flex items-start gap-3"><div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: rpt.color + "18" }}><rpt.icon className="w-5 h-5" style={{ color: rpt.color }} aria-hidden="true" /></div><div className="flex-1"><p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>{rpt.title}</p><p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{rpt.desc}</p><Button variant="ghost" size="sm" icon={Download} className="mt-2" onClick={rpt.onClick}>Generate &amp; export</Button></div></div></div>
        ))}
      </div>
    </>
  );
}
