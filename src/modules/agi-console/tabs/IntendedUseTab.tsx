import {
  ClipboardCheck, Search, Database, FileWarning, FolderOpen, TrendingUp, Activity,
  CheckCircle2, X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

const AGENT_ICONS: Record<string, LucideIcon> = { capa: ClipboardCheck, gap: Search, csv: Database, fda483: FileWarning, evidence: FolderOpen, riskScore: TrendingUp, driftDetect: Activity };
const AGENT_COLORS: Record<string, string> = { capa: "#10b981", gap: "#0ea5e9", csv: "#6366f1", fda483: "#ef4444", evidence: "#f59e0b", riskScore: "#a78bfa", driftDetect: "#64748b" };

const AGI_FUNCTIONS = [
  { name: "CAPA Intelligence", agent: "capa", gxpCategory: "Quality Management", mode: "Assisted", allowed: "Summarise CAPA status, draft RCA suggestions, flag overdue items, recommend risk classification.", prohibited: "Cannot close CAPAs. Cannot approve corrective actions. Cannot sign on behalf of QA." },
  { name: "Gap Assessment", agent: "gap", gxpCategory: "Compliance Assessment", mode: "Assisted", allowed: "Classify findings by severity, suggest framework mapping, draft corrective recommendations.", prohibited: "Cannot log findings without human review. Cannot determine regulatory compliance status." },
  { name: "CSV/CSA Monitor", agent: "csv", gxpCategory: "Computerised System Validation", mode: "Autonomous", allowed: "Flag overdue validations, detect configuration drift, alert on Part 11/Annex 11 gaps.", prohibited: "Cannot approve validation protocols. Cannot modify system configuration." },
  { name: "FDA 483 Support", agent: "fda483", gxpCategory: "Regulatory Affairs", mode: "Assisted", allowed: "Draft response text from observations, suggest CAPA linkages, summarise commitments.", prohibited: "Cannot submit responses to FDA. Cannot make regulatory commitments." },
  { name: "Evidence Organizer", agent: "evidence", gxpCategory: "Data Integrity", mode: "Assisted", allowed: "Index evidence documents, flag missing evidence, suggest document-finding links.", prohibited: "Cannot create or modify GxP records. Cannot generate audit trail entries." },
  { name: "Risk Scoring", agent: "riskScore", gxpCategory: "Quality Risk Management", mode: "Autonomous", allowed: "Compute ICH Q9 risk scores, reprioritise queues, flag patient safety signals.", prohibited: "Cannot override human risk decisions. Cannot release batches based on risk score." },
  { name: "Drift Detection", agent: "driftDetect", gxpCategory: "CSV/Validation Lifecycle", mode: "Autonomous", allowed: "Detect audit trail anomalies, access creep, configuration changes, validation signals.", prohibited: "Cannot take corrective action autonomously. All findings require human review." },
];

export interface IntendedUseTabProps {
  isManualMode: boolean;
  agiAgents: Record<string, boolean>;
  confidence: number;
  onNavigateSettings: () => void;
}

export function IntendedUseTab({
  isManualMode, agiAgents, confidence, onNavigateSettings,
}: IntendedUseTabProps) {
  return (
    <>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>This table defines the intended use and operational boundaries of each AGI agent in Pharma Glimmora, aligned with 21 CFR Part 11 and emerging AI governance expectations for GxP environments.</p>
      <div className="card overflow-hidden mb-4"><div className="overflow-x-auto">
        <table className="data-table" aria-label="AGI intended use and boundaries">
          <caption className="sr-only">AGI agent functions with allowed and prohibited actions</caption>
          <thead><tr><th scope="col">Agent</th><th scope="col">GxP category</th><th scope="col">Mode</th><th scope="col">Active</th><th scope="col">Allowed actions</th><th scope="col">Prohibited scope</th></tr></thead>
          <tbody>
            {AGI_FUNCTIONS.map((fn) => {
              const AgIcon = AGENT_ICONS[fn.agent]; const color = AGENT_COLORS[fn.agent]; const isOn = !isManualMode && agiAgents[fn.agent as keyof typeof agiAgents];
              return (
                <tr key={fn.agent}>
                  <th scope="row"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center" style={{ background: color + "18" }}>{AgIcon && <AgIcon className="w-3.5 h-3.5" style={{ color }} aria-hidden="true" />}</div><span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{fn.name}</span></div></th>
                  <td><Badge variant="gray">{fn.gxpCategory}</Badge></td>
                  <td><Badge variant={fn.mode === "Autonomous" ? "purple" : "blue"}>{fn.mode}</Badge></td>
                  <td>{isOn ? <CheckCircle2 className="w-4 h-4 text-[#10b981]" aria-label="Active" /> : <X className="w-4 h-4 text-[#64748b]" aria-label="Inactive" />}</td>
                  <td><p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: 280 }}>{fn.allowed}</p></td>
                  <td><p className="text-[11px] leading-relaxed text-[#ef4444]" style={{ maxWidth: 240 }}>{fn.prohibited}</p></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div></div>
      <div className="card p-4"><div className="flex items-center justify-between"><div><p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Confidence threshold</p><p className="text-[11px]" style={{ color: "var(--text-muted)" }}>AGI outputs below this threshold are flagged for human review</p></div><div className="text-right"><p className="text-[24px] font-bold text-[#6366f1]">{confidence}%</p><button onClick={onNavigateSettings} className="text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer">Change in Settings &rarr;</button></div></div></div>
    </>
  );
}
