"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Settings, Zap, ChevronDown, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { loadAgiPolicy, updateAgiPolicy } from "@/actions/agi-policy";
import {
  AGI_AGENT_KEYS,
  DEFAULT_AGI_AGENTS,
  DEFAULT_AGI_CONFIDENCE,
  computeAgiMode,
  type AgiAgentKey,
  type AgiAgents,
} from "@/lib/permissions/agiPolicy";

interface AgentEntry {
  key: AgiAgentKey;
  name: string;
  desc: string;
  canDo: string[];
  cannotDo: string[];
  triggers: string;
  showsIn: string;
}

const AGENTS: AgentEntry[] = [
  { key: "capa", name: "CAPA Effectiveness Monitor", desc: "Detects weak RCA, flags overdue effectiveness checks",
    canDo: ["Detect incomplete RCA (empty Whys)", "Flag effectiveness checks overdue", "Suggest similar past CAPAs", "Highlight weak root cause patterns", "Summarise a CAPA for approvers (read-only brief)", "Coach the author on unmet submission-readiness items"],
    cannotDo: ["Close or approve CAPAs", "Make compliance decisions", "Override QA Head", "Change CAPA status automatically"],
    triggers: "When CAPA is created or updated", showsIn: "CAPA Tracker detail panel" },
  { key: "deviation", name: "Deviation Intelligence", desc: "Clusters and surfaces recurring deviation patterns",
    canDo: ["Cluster similar deviations", "Surface recurring patterns", "Suggest potential root causes", "Flag high-frequency areas"],
    cannotDo: ["Close deviations", "Approve investigation reports", "Make risk decisions"],
    triggers: "When deviation is reported", showsIn: "Deviation Management" },
  { key: "fda483", name: "FDA 483 Draft Response", desc: "Suggests response text for regulatory observations",
    canDo: ["Generate draft response text", "Pull linked CAPAs and RCA data", "Suggest commitment dates", "Structure formal response format"],
    cannotDo: ["Sign or submit response to FDA", "Commit to regulatory timelines", "Make compliance statements", "Replace QA Head sign-off"],
    triggers: "When draft requested", showsIn: "FDA 483 Response tab" },
  { key: "drift", name: "Drift Detection", desc: "Monitors configuration changes and access creep",
    canDo: ["Monitor configuration changes", "Detect access control changes", "Flag audit trail coverage drops", "Alert on system changes"],
    cannotDo: ["Change system configurations", "Restore access controls", "Make IT security decisions"],
    triggers: "Continuous monitoring", showsIn: "Dashboard + CSV/CSA" },
  { key: "regulatory", name: "Regulatory Intelligence", desc: "FDA/EMA guidance monitoring and change alerts",
    canDo: ["Monitor FDA/EMA guidance updates", "Flag new regulatory requirements", "Suggest compliance alignment", "Alert on regulatory changes"],
    cannotDo: ["Interpret regulatory requirements", "Make compliance determinations", "Replace regulatory affairs expertise"],
    triggers: "When guidance published", showsIn: "Dashboard alerts" },
  { key: "supplier", name: "Supplier Quality Agent", desc: "Vendor qualification and risk scoring",
    canDo: ["Score supplier risk", "Flag vendors needing review", "Suggest qualification priority", "Identify audit overdue suppliers"],
    cannotDo: ["Approve or reject suppliers", "Make qualification decisions", "Replace procurement authority"],
    triggers: "When vendor data changes", showsIn: "Supplier management" },
];

const modeColor: Record<string, string> = {
  autonomous: "text-(--success)",
  assisted: "text-(--warning)",
  manual: "text-(--card-muted)",
};


export function AGIPolicyTab({ readOnly = false }: { readOnly?: boolean }) {
  const router = useRouter();

  // Tenant-scoped SERVER state. This used to be a Redux slice persisted to the
  // browser's localStorage: per-browser rather than per-organisation, editable
  // by anyone, unaudited, and — the part that mattered — never read by any
  // server, so switching an agent off switched nothing off. The policy now
  // lives in TenantAgiPolicy, is edited only by customer_admin / qa_head, is
  // audited on every change, and is ENFORCED in the AI proxy.
  const [agents, setAgents] = useState<AgiAgents>({ ...DEFAULT_AGI_AGENTS });
  const [confidence, setConfidence] = useState(DEFAULT_AGI_CONFIDENCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const policy = await loadAgiPolicy();
        if (cancelled) return;
        setAgents(policy.agents);
        setConfidence(policy.confidence);
      } catch (e) {
        if (!cancelled) {
          console.error("[agi-policy] load failed", e);
          setError("Couldn't load the AI agent policy.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Optimistic, then reconciled against what the server actually stored — a
  // rejected change (wrong role) must not leave the switch looking flipped.
  const persist = useCallback(
    async (patch: { agents?: Partial<AgiAgents>; confidence?: number }) => {
      setSaving(true);
      setError(null);
      try {
        const res = await updateAgiPolicy(patch);
        if (!res.success) {
          setError(res.error);
          const current = await loadAgiPolicy();
          setAgents(current.agents);
          setConfidence(current.confidence);
          return;
        }
        setAgents(res.data.agents);
        setConfidence(res.data.confidence);
      } catch (e) {
        console.error("[agi-policy] save failed", e);
        setError("Couldn't save the AI agent policy.");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const activeAgentCount = AGI_AGENT_KEYS.filter((k) => agents[k]).length;
  const computedMode = computeAgiMode(agents);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const disabled = readOnly || loading || saving;
  const isDark = useAppSelector((s) => s.theme.mode === "dark");

  return (
    <section aria-labelledby="agi-heading" className="flex flex-col h-full min-h-0">
      <h2 id="agi-heading" className="sr-only">AGI Policy</h2>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}
        >
          {error}
        </div>
      )}
      {/* AI Usage Policy banner */}
      <div className={clsx("rounded-2xl border p-5", isDark ? "bg-[rgba(99,102,241,0.06)] border-[rgba(99,102,241,0.2)]" : "bg-[#eef2ff] border-[#c7d2fe]")}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-[#6366f1]" aria-hidden="true" />
          <div className="flex-1 space-y-3">
            <p className="text-[13px] font-semibold text-[#6366f1]">AI Usage Policy — Glimmora Platform</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px]">
              <div>
                <p className="font-semibold mb-1" style={{ color: "#10b981" }}>AI-ASSISTED (allowed)</p>
                <ul className="list-none p-0 m-0 space-y-0.5">
                  {["Draft suggestions (user reviews)", "Risk scoring (user decides)", "Pattern detection (user verifies)", "Document drafting (QA approves)"].map((t) => (
                    <li key={t} className="flex items-start gap-1.5"><span className="text-[#10b981] shrink-0">✅</span><span style={{ color: "var(--text-secondary)" }}>{t}</span></li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-1" style={{ color: "#ef4444" }}>HUMAN ONLY (AI cannot)</p>
                <ul className="list-none p-0 m-0 space-y-0.5">
                  {["Sign or close CAPAs", "Submit FDA 483 responses", "Approve validation stages", "Make compliance decisions", "Override QA Head authority"].map((t) => (
                    <li key={t} className="flex items-start gap-1.5"><span className="text-[#ef4444] shrink-0">❌</span><span style={{ color: "var(--text-secondary)" }}>{t}</span></li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: isDark ? "rgba(99,102,241,0.2)" : "#c7d2fe" }}>
              <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>All AI suggestions require human review before any action is taken.</p>
              <button type="button" onClick={() => router.push("/ai-policy")} className="text-[11px] font-medium text-[#6366f1] hover:underline border-none bg-transparent cursor-pointer">View full policy</button>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-(--card-bg) border border-(--bg-border) rounded-2xl p-5">
          <p className="text-[11px] font-medium text-(--card-muted) mb-2">Operating Mode</p>
          <p className={`text-2xl font-bold capitalize ${modeColor[computedMode]}`}>
            {computedMode}
          </p>
          <p className="text-[10px] text-(--text-muted) mt-1">Auto-calculated from agent toggles</p>
        </div>
        <div className="bg-(--card-bg) border border-(--bg-border) rounded-2xl p-5">
          <p className="text-[11px] font-medium text-(--card-muted) mb-2">Confidence Threshold</p>
          <p className="text-2xl font-bold text-(--text-primary)">
            {confidence}%
          </p>
        </div>
        <div className="bg-(--card-bg) border border-(--bg-border) rounded-2xl p-5">
          <p className="text-[11px] font-medium text-(--card-muted) mb-2">Active Agents</p>
          <p className="text-2xl font-bold text-(--success)">
            {activeAgentCount} / {AGI_AGENT_KEYS.length}
          </p>
        </div>
      </div>

      {/* Mode + Confidence card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-(--bg-border)">
          <Settings className="w-4 h-4 text-(--brand)" aria-hidden="true" />
          <span className="text-[13px] font-semibold text-(--text-primary)">AGI operating mode</span>
        </div>

        <div className="p-5 space-y-6">
          {/* Mode display — auto-calculated */}
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
              Operating Mode
            </p>
            <p className="text-[11px] text-(--text-muted) mb-2">
              Auto-calculated from active agents below
            </p>
            <div className="flex items-center gap-3 rounded-lg px-4 py-2.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
              <span className={`text-[14px] font-bold capitalize ${modeColor[computedMode]}`}>
                {computedMode}
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {computedMode === "autonomous" && "— All agents active, live alerts everywhere"}
                {computedMode === "assisted" && "— Some agents active, review queue enabled"}
                {computedMode === "manual" && "— No agents active, silent monitoring"}
              </span>
            </div>
          </div>

          {/* Confidence slider */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="agi-confidence" className="text-[11px] font-medium text-(--text-secondary)">
                Confidence Threshold
              </label>
              <Badge variant="blue">{confidence}%</Badge>
            </div>
            <p id="agi-conf-hint" className="text-[11px] text-(--text-muted) mb-3">
              Higher = fewer suggestions, higher reliability. Lower = catches more weak signals.
            </p>
            <input
              id="agi-confidence"
              type="range"
              min={50}
              max={95}
              step={1}
              value={confidence}
              aria-describedby="agi-conf-hint"
              aria-valuemin={50}
              aria-valuemax={95}
              aria-valuenow={confidence}
              aria-valuetext={`${confidence} percent confidence`}
              disabled={disabled}
              onChange={(e) => setConfidence(Number(e.target.value))}
              onPointerUp={(e) => {
                // Persist on release, not on every pixel of drag — a range input
                // fires onChange continuously and each one is a DB write + audit row.
                if (!disabled) void persist({ confidence: Number(e.currentTarget.value) });
              }}
              onBlur={(e) => { if (!disabled) void persist({ confidence: Number(e.currentTarget.value) }); }}
              className={`w-full accent-(--brand) ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            />
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-(--text-muted)">50% — more alerts</span>
              <span className="text-[10px] text-(--text-muted)">95% — fewer alerts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Agents card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--bg-border)">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-(--brand)" aria-hidden="true" />
            <span className="text-[13px] font-semibold text-(--text-primary)">Per-module agents</span>
          </div>
          <Badge variant="green">{activeAgentCount} active</Badge>
        </div>

        <fieldset className="border-none p-0 m-0">
          <legend className="sr-only">AGI agent toggles</legend>
          <ul role="list" aria-label="AGI agent toggles" className="divide-y divide-(--bg-border)">
            {AGENTS.map((agent) => {
              const isExpanded = expandedAgent === agent.key;
              return (
                <li key={agent.key} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-(--text-primary)">{agent.name}</span>
                        <button type="button" onClick={() => setExpandedAgent(isExpanded ? null : agent.key)} className="flex items-center gap-0.5 text-[10px] font-medium text-[#6366f1] hover:underline border-none bg-transparent cursor-pointer">
                          <ChevronDown className={clsx("w-3 h-3 transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                      </div>
                      <p className="text-[11px] text-(--card-muted) mt-0.5">{agent.desc}</p>
                    </div>
                    <Toggle id={`agent-${agent.key}`} checked={agents[agent.key]} onChange={() => { if (!disabled) void persist({ agents: { [agent.key]: !agents[agent.key] } }); }} label={agent.name} description={agent.desc} disabled={disabled} hideLabel />
                  </div>
                  {isExpanded && (
                    <div className={clsx("mt-3 rounded-lg p-3 text-[11px] space-y-2", "bg-(--bg-elevated) border border-(--bg-border)")}>
                      <div>
                        <p className="font-semibold mb-1" style={{ color: "#10b981" }}>CAN DO (AI-assisted)</p>
                        <ul className="list-none p-0 m-0 space-y-0.5">{agent.canDo.map((t) => <li key={t} className="flex items-start gap-1.5"><span className="text-[#10b981] shrink-0">✅</span><span style={{ color: "var(--text-secondary)" }}>{t}</span></li>)}</ul>
                      </div>
                      <div>
                        <p className="font-semibold mb-1" style={{ color: "#ef4444" }}>CANNOT DO (Human only)</p>
                        <ul className="list-none p-0 m-0 space-y-0.5">{agent.cannotDo.map((t) => <li key={t} className="flex items-start gap-1.5"><span className="text-[#ef4444] shrink-0">❌</span><span style={{ color: "var(--text-secondary)" }}>{t}</span></li>)}</ul>
                      </div>
                      <div className="flex gap-4 pt-1" style={{ color: "var(--text-muted)" }}>
                        <span><strong>Triggers:</strong> {agent.triggers}</span>
                        <span><strong>Shows in:</strong> {agent.showsIn}</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>

      </div>
    </section>
  );
}