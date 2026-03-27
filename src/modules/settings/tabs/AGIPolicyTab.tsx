import { useState } from "react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { updateAGI, toggleAgent } from "@/store/settings.slice";
import type { AGISettings } from "@/store/settings.slice";
import { Settings, Zap, Save } from "lucide-react";
import { Popup } from "@/components/ui/Popup";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { Dropdown } from "@/components/ui/Dropdown";

interface AgentEntry {
  key: keyof AGISettings["agents"];
  name: string;
  desc: string;
}

const AGENTS: AgentEntry[] = [
  { key: "capa", name: "CAPA Effectiveness Monitor", desc: "Detects weak RCA, flags overdue effectiveness checks" },
  { key: "deviation", name: "Deviation Intelligence", desc: "Clusters and surfaces recurring deviation patterns" },
  { key: "fda483", name: "FDA 483 Draft Response", desc: "Suggests response text for regulatory observations" },
  { key: "batch", name: "Batch Readiness Agent", desc: "Analyses batch record completeness before release" },
  { key: "drift", name: "Drift Detection", desc: "Monitors configuration changes and access creep" },
  { key: "regulatory", name: "Regulatory Intelligence", desc: "FDA/EMA guidance monitoring and change alerts" },
  { key: "supplier", name: "Supplier Quality Agent", desc: "Vendor qualification and risk scoring" },
];

const modeColor: Record<string, string> = {
  autonomous: "text-(--success)",
  assisted: "text-(--warning)",
  manual: "text-(--card-muted)",
};

const MODE_OPTIONS = [
  { value: "autonomous", label: "Autonomous", description: "Live alerts everywhere" },
  { value: "assisted", label: "Assisted", description: "Review queue, no live pop-ups" },
  { value: "manual", label: "Manual", description: "Silent monitoring, no alerts" },
];

export function AGIPolicyTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const agi = useAppSelector((s) => s.settings.agi);
  const activeAgentCount = Object.values(agi.agents).filter(Boolean).length;
  const [saved, setSaved] = useState(false);

  return (
    <section aria-labelledby="agi-heading" className="space-y-6">
      <h2 id="agi-heading" className="sr-only">AGI Policy</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl p-5">
          <p className="text-[11px] font-medium text-(--card-muted) mb-2">Operating Mode</p>
          <p className={`text-2xl font-bold capitalize ${modeColor[agi.mode]}`}>
            {agi.mode}
          </p>
        </div>
        <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl p-5">
          <p className="text-[11px] font-medium text-(--card-muted) mb-2">Confidence Threshold</p>
          <p className="text-2xl font-bold text-(--text-primary)">
            {agi.confidence}%
          </p>
        </div>
        <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl p-5">
          <p className="text-[11px] font-medium text-(--card-muted) mb-2">Active Agents</p>
          <p className="text-2xl font-bold text-(--success)">
            {activeAgentCount} / 7
          </p>
        </div>
      </div>

      {/* Mode + Confidence card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-(--bg-border)">
          <Settings className="w-4 h-4 text-(--brand)" aria-hidden="true" />
          <span className="text-[13px] font-semibold text-(--text-primary)">AGI operating mode</span>
        </div>

        <div className="p-5 space-y-6">
          {/* Mode select */}
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
              Operating Mode
            </p>
            <p className="text-[11px] text-(--text-muted) mb-2">
              Controls how and when AGI alerts appear across all screens
            </p>
            <Dropdown
              options={MODE_OPTIONS}
              value={agi.mode}
              onChange={(v) => !readOnly && dispatch(updateAGI({ mode: v as AGISettings["mode"] }))}
              disabled={readOnly}
              width="w-full"
            />
          </div>

          {/* Confidence slider */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="agi-confidence" className="text-[11px] font-medium text-(--text-secondary)">
                Confidence Threshold
              </label>
              <Badge variant="blue">{agi.confidence}%</Badge>
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
              value={agi.confidence}
              aria-describedby="agi-conf-hint"
              aria-valuemin={50}
              aria-valuemax={95}
              aria-valuenow={agi.confidence}
              aria-valuetext={`${agi.confidence} percent confidence`}
              disabled={readOnly}
              onChange={(e) =>
                !readOnly && dispatch(updateAGI({ confidence: Number(e.target.value) }))
              }
              className={`w-full accent-(--brand) ${readOnly ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            />
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-(--text-muted)">50% — more alerts</span>
              <span className="text-[10px] text-(--text-muted)">95% — fewer alerts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Agents card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
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
            {AGENTS.map((agent) => (
              <li key={agent.key} className="flex items-center justify-between px-5 py-4">
                <div className="flex-1 pr-4">
                  <span className="text-[13px] font-medium text-(--text-primary)">
                    {agent.name}
                  </span>
                  <p className="text-[11px] text-(--card-muted) mt-0.5">
                    {agent.desc}
                  </p>
                </div>
                <Toggle
                  id={`agent-${agent.key}`}
                  checked={agi.agents[agent.key]}
                  onChange={() => !readOnly && dispatch(toggleAgent(agent.key))}
                  label={agent.name}
                  description={agent.desc}
                  disabled={readOnly}
                  hideLabel
                />
              </li>
            ))}
          </ul>
        </fieldset>
      </div>

      {/* Save policy button */}
      {!readOnly && (
        <div className="flex justify-end">
          <Button icon={Save} onClick={() => setSaved(true)}>
            Save policy
          </Button>
        </div>
      )}

      {/* Popups */}
      <Popup
        isOpen={saved}
        variant="success"
        title="AGI policy saved"
        description="Mode, confidence threshold, and agent settings applied."
        onDismiss={() => setSaved(false)}
      />
    </section>
  );
}
