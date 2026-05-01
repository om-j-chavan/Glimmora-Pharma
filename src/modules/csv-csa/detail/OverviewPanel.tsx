import { Target, Shield, Zap, Server } from "lucide-react";
import type { GxPSystem } from "@/types/csv-csa";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";

/* ── Props ── */

export interface OverviewPanelProps {
  system: GxPSystem;
  sites: SiteConfig[];
  users: UserConfig[];}

function ownerName(uid: string, users: UserConfig[]) {
  return users.find((u) => u.id === uid)?.name ?? uid;
}

export function OverviewPanel({ system, sites, users }: OverviewPanelProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card col-span-full"><div className="card-header"><div className="flex items-center gap-2"><Target className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">Intended use</span></div></div><div className="card-body"><p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{system.intendedUse || <span className="italic" style={{ color: "var(--text-muted)" }}>Not documented</span>}</p></div></div>
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Shield className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">GxP scope</span></div></div><div className="card-body"><p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{system.gxpScope || <span className="italic" style={{ color: "var(--text-muted)" }}>Not documented</span>}</p></div></div>
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Zap className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" /><span className="card-title">Critical GxP functions</span></div></div><div className="card-body"><p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{system.criticalFunctions || <span className="italic" style={{ color: "var(--text-muted)" }}>Not documented</span>}</p></div></div>
      <div className="card col-span-full"><div className="card-header"><div className="flex items-center gap-2"><Server className="w-4 h-4" style={{ color: "#64748b" }} aria-hidden="true" /><span className="card-title">System information</span></div></div><div className="card-body">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-6 text-[12px]">
          {([
            ["Vendor", system.vendor], ["Version", system.version],
            ["Owner", ownerName(system.owner, users)],
            ["Site", sites.find((s) => s.id === system.siteId)?.name ?? "\u2014"],
            ["GAMP Cat", `Category ${system.gamp5Category}`],
            ["GxP relevance", system.gxpRelevance],
            ["Risk level", system.riskLevel],
            ["System type", system.type],
          ] as const).map(([l, v]) => (
            <div key={l} className="border-b pb-2" style={{ borderColor: "var(--bg-border)" }}><span className="text-[10px] uppercase tracking-wider font-semibold block mb-0.5" style={{ color: "var(--text-muted)" }}>{l}</span><span className="font-medium" style={{ color: "var(--text-primary)" }}>{v}</span></div>
          ))}
        </div>
      </div></div>
    </div>
  );
}
