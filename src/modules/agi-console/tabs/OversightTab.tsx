import { Shield, CheckCircle2, Bot, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface CAPA {
  id: string;
  description: string;
  status: string;
  source: string;
  closedBy?: string;
}

export interface OversightTabProps {
  pendingReviewCount: number;
  approvedCount: number;
  agiAssistedCount: number;
  closedCAPAs: CAPA[];
  ownerName: (id: string) => string;
}

export function OversightTab({
  pendingReviewCount, approvedCount, agiAssistedCount, closedCAPAs, ownerName,
}: OversightTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>Human-in-the-loop (HITL) oversight ensures that AGI outputs are reviewed and approved by qualified personnel before any GxP action is taken. This tab tracks human approvals across all modules.</p>

      {/* HITL summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="stat-card" role="region" aria-label="Pending review"><div className="flex items-center gap-2 mb-2"><Shield className="w-5 h-5 text-[#f59e0b]" aria-hidden="true" /><span className="stat-label mb-0">Pending review</span></div><div className="stat-value text-[#f59e0b]">{pendingReviewCount}</div><div className="stat-sub">CAPAs awaiting QA sign-off</div></div>
        <div className="stat-card" role="region" aria-label="Approved"><div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-5 h-5 text-[#10b981]" aria-hidden="true" /><span className="stat-label mb-0">Approved</span></div><div className="stat-value text-[#10b981]">{approvedCount}</div><div className="stat-sub">CAPAs signed and closed</div></div>
        <div className="stat-card" role="region" aria-label="AGI-assisted"><div className="flex items-center gap-2 mb-2"><Bot className="w-5 h-5 text-[#6366f1]" aria-hidden="true" /><span className="stat-label mb-0">AGI-assisted</span></div><div className="stat-value text-[#6366f1]">{agiAssistedCount}</div><div className="stat-sub">CAPAs raised via AGI suggestion</div></div>
      </div>

      {/* Recent approvals */}
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#10b981]" aria-hidden="true" /><span className="card-title">Recent human approvals</span></div></div><div className="card-body">
        {closedCAPAs.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No CAPAs closed yet. Human approvals will appear here after QA Head signs and closes CAPAs.</p>
        ) : (
          <div className="space-y-0">{closedCAPAs.slice(0, 5).map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2.5 border-b last:border-0" style={{ borderColor: "var(--bg-border)" }}>
              <div className="flex items-center gap-2"><span className="font-mono text-[11px] font-semibold text-[#0ea5e9]">{c.id}</span><span className="text-[11px] truncate" style={{ color: "var(--text-secondary)", maxWidth: 300 }}>{c.description}</span></div>
              <div className="flex items-center gap-2"><span className="text-[10px]" style={{ color: "var(--text-muted)" }}>by {ownerName(c.closedBy ?? "")}</span><Badge variant="green">Closed</Badge></div>
            </div>
          ))}</div>
        )}
      </div></div>
    </div>
  );
}
