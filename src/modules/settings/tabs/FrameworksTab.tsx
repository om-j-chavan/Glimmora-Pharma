"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { toggleFramework } from "@/store/settings.slice";
import type { FrameworkSettings } from "@/store/settings.slice";
import { Info, Sparkles } from "lucide-react";
import { Popup } from "@/components/ui/Popup";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RegulatoryAIAssistant } from "@/modules/regulatory-intelligence/RegulatoryAIAssistant";

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
  // Memoised so the Object.values + .filter pass doesn't re-run (and
  // re-allocate the intermediate array) on every render. Recomputed only
  // when the frameworks slice reference changes.
  const activeCount = useMemo(
    () => Object.values(frameworks).filter(Boolean).length,
    [frameworks],
  );
  const [warnPopup, setWarnPopup] = useState(false);
  const [pendingKey, setPendingKey] = useState<keyof FrameworkSettings | null>(null);
  // Regulatory AI Assistant overlay — opened from the header button or the
  // Ctrl/Cmd + Shift + R shortcut. Closed by default so the AI never
  // auto-triggers (the user must explicitly ask for it).
  const [aiOpen, setAiOpen] = useState(false);

  // Keyboard shortcut: Ctrl/Cmd + Shift + R opens the assistant. Guarded so it
  // only fires while this tab is mounted (Frameworks is in view).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        setAiOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      {/* Header row — title + active count on the left, the Regulatory AI
          launcher on the right. The button sits clear of the framework
          toggles below so it never disturbs the existing actions. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 id="frameworks-heading" className="text-[15px] font-semibold text-(--text-primary)">
            Regulatory frameworks
          </h2>
          <Badge variant="blue">{activeCount} of 9 active</Badge>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={Sparkles}
          onClick={() => setAiOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={aiOpen}
          title="Ask Regulatory AI about your frameworks, region, and the latest FDA/EMA guidance (Ctrl + Shift + R)"
        >
          Ask Regulatory AI
        </Button>
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

      {/* Regulatory AI Assistant — focus-mode overlay. Renders nothing until
          opened; when open it docks right over a blurred backdrop so the
          sidebar and page recede. */}
      <RegulatoryAIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
    </section>
  );
}