"use client";

import { useState } from "react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { toggleFramework } from "@/store/settings.slice";
import type { FrameworkSettings } from "@/store/settings.slice";
import { Info } from "lucide-react";
import { Popup } from "@/components/ui/Popup";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";

interface FrameworkEntry {
  key: keyof FrameworkSettings;
  name: string;
  desc: string;
  effect: string;
}

const FRAMEWORKS: FrameworkEntry[] = [
  { key: "p210", name: "FDA 21 CFR 210/211", desc: "Manufacturing controls — cGMP for finished pharma", effect: "Gap tag · AGI manufacturing rules" },
  { key: "p11", name: "FDA 21 CFR Part 11", desc: "Electronic records & e-signatures", effect: "Gap tag · CSV Part 11 Status column · AGI audit trail" },
  { key: "annex11", name: "EU GMP Annex 11", desc: "Computerised systems — lifecycle validation", effect: "Gap tag · CSV Annex 11 Status column · AGI clauses" },
  { key: "annex15", name: "EU GMP Annex 15", desc: "Qualification & validation — IQ/OQ/PQ, VMP", effect: "Gap tag · CSV roadmap steps · AGI qualification checks" },
  { key: "ichq9", name: "ICH Q9", desc: "Quality risk management — ICH Q9 scoring", effect: "Gap tag · Dashboard heatmap weighting · AGI risk scoring" },
  { key: "ichq10", name: "ICH Q10", desc: "Pharmaceutical quality system — management review", effect: "Gap tag · Governance KPI cards · AGI PQS checks" },
  { key: "gamp5", name: "GAMP 5 (2nd Ed.)", desc: "Risk-based CSV — categories 1/3/4/5", effect: "Gap tag · CSV GAMP Category column · AGI validation depth" },
  { key: "who", name: "WHO GMP", desc: "International GMP guidance", effect: "Gap tag · AGI WHO clause patterns" },
  { key: "mhra", name: "MHRA Guidelines", desc: "UK post-Brexit data integrity guidance", effect: "Gap tag · AGI MHRA DI focus rules" },
];

export function FrameworksTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const frameworks = useAppSelector((s) => s.settings.frameworks);
  const activeCount = Object.values(frameworks).filter(Boolean).length;
  const [warnPopup, setWarnPopup] = useState(false);
  const [pendingKey, setPendingKey] = useState<keyof FrameworkSettings | null>(null);

  const handleToggle = (key: keyof FrameworkSettings) => {
    if (readOnly) return;
    if (frameworks[key]) {
      setPendingKey(key);
      setWarnPopup(true);
    } else {
      dispatch(toggleFramework(key));
    }
  };

  return (
    <section aria-labelledby="frameworks-heading" className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 id="frameworks-heading" className="text-[15px] font-semibold text-(--text-primary)">
          Regulatory frameworks
        </h2>
        <Badge variant="blue">{activeCount} of 9 active</Badge>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg px-4 py-3 bg-(--brand-muted) border border-(--brand-border)">
        <Info className="w-4 h-4 text-(--brand) shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[12px] text-(--brand)">
          Each toggle activates 3 things: regulation tag in Gap Assessment · column in CSV/CSA · AGI detection rules
        </p>
      </div>

      {/* Frameworks card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
        <ul role="list" aria-label="Regulatory framework toggles" className="divide-y divide-(--bg-border)">
          {FRAMEWORKS.map((fw) => (
            <li key={fw.key} className="flex items-center justify-between px-5 py-4">
              <div className="flex-1 pr-4">
                <p className="text-[13px] font-semibold text-(--text-primary) mb-0.5">
                  {fw.name}
                </p>
                <p className="text-[11px] text-(--card-muted)">
                  {fw.desc}
                </p>
                <p className="text-[11px] text-(--brand) mt-1">
                  &rarr; {fw.effect}
                </p>
              </div>
              <Toggle
                id={`fw-${fw.key}`}
                checked={frameworks[fw.key]}
                onChange={() => handleToggle(fw.key)}
                label={fw.name}
                description={fw.desc}
                disabled={readOnly}
                hideLabel
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Popups */}
      <Popup
        isOpen={warnPopup}
        variant="warning"
        title="Disable this framework?"
        description="The regulation tag will be removed from Gap Assessment dropdowns and the AGI ruleset will be unloaded. Existing findings tagged to this framework are NOT deleted."
        onDismiss={() => { setWarnPopup(false); setPendingKey(null); }}
        actions={[
          {
            label: "Cancel",
            style: "ghost",
            onClick: () => { setWarnPopup(false); setPendingKey(null); },
          },
          {
            label: "Yes, disable",
            style: "primary",
            onClick: () => {
              if (pendingKey) dispatch(toggleFramework(pendingKey));
              setWarnPopup(false);
              setPendingKey(null);
            },
          },
        ]}
      />
    </section>
  );
}