import clsx from "clsx";
import {
  Sparkles, Zap, ShieldCheck, Activity,
  Ban, X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

const PROHIBITED = ["Batch disposition or QP release", "Final QA disposition decisions", "CAPA closure without QA approval", "External regulatory communications", "Unsupervised learning on production GxP data", "Modification of audit trail records"];

interface Capability {
  key: string;
  title: string;
  icon: LucideIcon;
  color: string;
  isOn: boolean;
  desc: string;
  live: number;
  liveLabel: string;
}

export interface AGIOverviewTabProps {
  isManualMode: boolean;
  isAutoMode: boolean;
  insightsGenerated: number;
  actionsTriggered: number;
  hitlApprovals: number;
  openAlertsCount: number;
  capabilities: Capability[];
  isDark: boolean;
  onNavigateSettings: () => void;
}

export function AGIOverviewTab({
  isManualMode, isAutoMode, insightsGenerated, actionsTriggered,
  hitlApprovals, openAlertsCount, capabilities, isDark, onNavigateSettings,
}: AGIOverviewTabProps) {
  return (
    <>
      {/* KPI cards */}
      <section aria-label="AGI statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Sparkles, color: "#6366f1", label: "AI Insights Generated", value: isManualMode ? "\u2014" : String(insightsGenerated), sub: isManualMode ? "AGI disabled" : "Findings + CAPAs + 483 events" },
          { icon: Zap, color: isAutoMode ? "#f59e0b" : "#64748b", label: "Actions Triggered", value: isAutoMode ? String(actionsTriggered) : "\u2014", sub: isAutoMode ? "Auto-raised from Gap Assessment" : "Autonomous mode not active" },
          { icon: ShieldCheck, color: "#10b981", label: "HITL Approvals", value: String(hitlApprovals), sub: "Human-approved actions" },
          { icon: Activity, color: openAlertsCount > 0 ? "#ef4444" : "#10b981", label: "Drift Alerts", value: String(openAlertsCount), sub: openAlertsCount > 0 ? "Open alerts requiring review" : "No active drift alerts" },
        ].map((kpi) => (
          <div key={kpi.label} className="stat-card" role="region" aria-label={kpi.label}>
            <div className="flex items-center gap-2 mb-2"><kpi.icon className="w-5 h-5" style={{ color: kpi.color }} aria-hidden="true" /><span className="stat-label mb-0">{kpi.label}</span></div>
            <div className="stat-value" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="stat-sub">{kpi.sub}</div>
          </div>
        ))}
      </section>

      {/* Capabilities */}
      <h2 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>AGI Capabilities</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {capabilities.map((cap) => (
          <div key={cap.key} className={clsx("card overflow-hidden", !cap.isOn && "opacity-60")}>
            <div className="card-body">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: (cap.isOn ? cap.color : "#334155") + "18" }}><cap.icon className="w-5 h-5" style={{ color: cap.isOn ? cap.color : "#334155" }} aria-hidden="true" /></div><span className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>{cap.title}</span></div>
                {cap.isOn ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Inactive</Badge>}
              </div>
              <p className="text-[12px] leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>{cap.desc}</p>
              <div className="flex items-center justify-between">
                <div><span className="text-[13px] font-bold" style={{ color: cap.isOn ? cap.color : "#64748b" }}>{cap.live}</span><span className="text-[11px] ml-1" style={{ color: "var(--text-muted)" }}>{cap.liveLabel}</span></div>
                {!cap.isOn && <button onClick={onNavigateSettings} className="text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer">Enable in Settings &rarr;</button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Prohibited */}
      <div className={clsx("card p-4", isDark ? "bg-[rgba(239,68,68,0.04)] border-[rgba(239,68,68,0.15)]" : "bg-[#fef2f2] border-[#fca5a5]")}>
        <div className="flex items-center gap-2 mb-3"><Ban className="w-4 h-4 text-[#ef4444]" aria-hidden="true" /><span className="text-[12px] font-semibold text-[#ef4444]">AGI will NEVER perform these actions &mdash; by design</span></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {PROHIBITED.map((item) => (<div key={item} className="flex items-center gap-2 text-[12px]"><X className="w-3.5 h-3.5 text-[#ef4444] flex-shrink-0" aria-hidden="true" /><span style={{ color: "var(--text-secondary)" }}>{item}</span></div>))}
        </div>
      </div>
    </>
  );
}
