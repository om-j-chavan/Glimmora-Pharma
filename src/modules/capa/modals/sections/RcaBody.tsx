"use client";

import { Badge } from "@/components/ui/Badge";
import type { CAPA } from "@/store/capa.slice";
import { RcaReviewSection } from "./RcaReviewSection";

/**
 * RCA tab body. Read-only display of the root cause analysis text +
 * methodology badge. Editing happens via the detail modal's Edit button
 * (which opens EditCAPAModal). When a method is selected but the
 * free-text root cause hasn't been filled in yet, we render a
 * method-specific scaffold (5 Why questions, Fishbone categories, Fault
 * Tree prompts) so the tab is usable as a thinking aid rather than just
 * a blank placeholder.
 */

/** Method-specific scaffold prompts. Rendered when the rca text is empty. */
const SCAFFOLDS: Record<string, { title: string; prompts: string[] }> = {
  "5 Why": {
    title: "5-Why scaffold",
    prompts: [
      "Why 1 — Why did the issue happen?",
      "Why 2 — Why did Why 1 happen?",
      "Why 3 — Why did Why 2 happen?",
      "Why 4 — Why did Why 3 happen?",
      "Why 5 — Why did Why 4 happen?  (root cause)",
    ],
  },
  // Older "5-Why" string (hyphen variant from earlier seed/AI flows) — keep
  // it mapped so historical records render the scaffold too.
  "5-Why": {
    title: "5-Why scaffold",
    prompts: [
      "Why 1 — Why did the issue happen?",
      "Why 2 — Why did Why 1 happen?",
      "Why 3 — Why did Why 2 happen?",
      "Why 4 — Why did Why 3 happen?",
      "Why 5 — Why did Why 4 happen?  (root cause)",
    ],
  },
  "Fishbone": {
    title: "Fishbone (Ishikawa) categories",
    prompts: [
      "People — who was involved, what training/role gaps contributed?",
      "Process — which SOP / step / hand-off failed?",
      "Equipment — what machine, instrument, or tool was implicated?",
      "Materials — were inputs, reagents, or components out of spec?",
      "Environment — temperature, humidity, contamination, layout?",
      "Measurement — calibration, sampling, test method variance?",
    ],
  },
  "Fault Tree": {
    title: "Fault Tree analysis",
    prompts: [
      "Top event — state the failure in one sentence.",
      "Immediate causes (AND/OR) — what conditions combine to produce the top event?",
      "Intermediate causes — drill each branch one level deeper.",
      "Basic events — atomic failures that need no further explanation.",
      "Identify which basic events are credible, single-point-of-failure, or detectable.",
    ],
  },
  "Other": {
    title: "Free-form analysis",
    prompts: [
      "Describe the failure mode in detail.",
      "List contributing factors (people, process, equipment, environment).",
      "Identify the most probable root cause.",
      "Note any contradicting evidence or alternative hypotheses.",
    ],
  },
};

export function RcaBody({ capa }: { capa: CAPA }) {
  const hasRca = (capa.rca?.trim().length ?? 0) > 0;
  const scaffold = capa.rcaMethod ? SCAFFOLDS[capa.rcaMethod] : null;

  return (
    <div role="tabpanel" id="subpanel-rca" aria-labelledby="subtab-rca" tabIndex={0} className="space-y-3">
      {capa.rcaMethod && (
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Method:</span>
          <Badge variant="purple">{capa.rcaMethod}</Badge>
        </div>
      )}
      {hasRca ? (
        <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{capa.rca}</p>
      ) : scaffold ? (
        <div className="rounded-lg p-3 bg-(--bg-elevated) border border-(--bg-border) space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {scaffold.title}
          </p>
          <ol className="space-y-1.5 list-none p-0 m-0">
            {scaffold.prompts.map((p, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <span className="w-5 shrink-0 font-semibold" style={{ color: "var(--brand)" }}>{i + 1}.</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] italic pt-1" style={{ color: "var(--text-muted)" }}>
            Use Edit to capture answers against each prompt before submitting for QA review.
          </p>
        </div>
      ) : (
        <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>
          No analysis yet. The assigned person writes it from their Worklist task — then you review it here.
        </p>
      )}
      {/* SME Section 1, Stage 3 (FULL) — RCA QA review section. Renders
          below the RCA content so reviewers can read first, then act. */}
      <RcaReviewSection capa={capa} />
    </div>
  );
}
