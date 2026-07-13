"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, ArrowRight, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAppSelector } from "@/hooks/useAppSelector";
import {
  getReadinessGuidance,
  type ReadinessGuidanceResult,
} from "@/lib/ai";
import type { CAPA } from "@/store/capa.slice";
import type { CAPAReadiness } from "@/lib/capa-readiness";
import { READINESS_TAB, type DetailSubTab } from "../helpers/getNextStep";

/* ── Feature K — CAPA Readiness Pre-flight Copilot ──
 *
 * Plain-language AI coaching for a CAPA that's still being authored
 * (open / in_progress). Reads the SAME computed readiness conditions the
 * SubmissionChecklist renders, and for each unmet one explains why it matters
 * and how to fix it — with a jump to the relevant tab.
 *
 * ADVISORY ONLY: it never submits, approves, or marks anything met. Only real
 * user actions flip the readiness flags, and submitForReview re-enforces
 * getCAPAReadiness() server-side. Self-gates on AGI mode/agent + the presence
 * of unmet conditions; renders null otherwise.
 */

const TAB_LABEL: Record<DetailSubTab, string> = {
  overview: "Overview",
  evidence: "Evidence",
  rca: "RCA",
  actions: "Action Plans",
  criteria: "Criteria",
};

export function ReadinessCopilotPanel({
  capa,
  readiness,
  onChangeTab,
}: {
  capa: CAPA;
  readiness: CAPAReadiness;
  onChangeTab: (tab: DetailSubTab) => void;
}) {
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.capa);
  const agentActive = agiMode !== "manual" && agiAgent;

  const [guidance, setGuidance] = useState<ReadinessGuidanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The computed unmet conditions — the grounded input the copilot coaches on.
  const unmet = useMemo(
    () => readiness.conditions.filter((c) => !c.met),
    [readiness.conditions],
  );
  // Label + detail lookup so we can title each guidance item from the same
  // condition the checklist shows.
  const labelByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of readiness.conditions) m[c.key] = c.label;
    return m;
  }, [readiness.conditions]);

  // A stable signature of the unmet set so we refetch when the blockers change
  // (e.g. the user resolves one) and don't show stale coaching.
  const unmetSig = unmet.map((u) => u.key).join(",");

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getReadinessGuidance({
        title: capa.title,
        risk: capa.risk,
        rootCause: capa.rca ?? "",
        unmet: unmet.map((u) => ({
          key: u.key,
          label: u.label,
          detail: u.detail ?? "",
        })),
      });
      setGuidance(result);
    } catch {
      // getReadinessGuidance falls back to the mock internally, so a throw here
      // is unexpected — surface a soft error and let the user retry.
      setError("Could not prepare guidance. Try again.");
    } finally {
      setLoading(false);
    }
  }, [capa.title, capa.risk, capa.rca, unmet]);

  // Autonomous: prepare guidance automatically (and refresh when blockers
  // change). Assisted: wait for the click.
  useEffect(() => {
    if (!agentActive) return;
    if (unmet.length === 0) return;
    if (agiMode === "autonomous") {
      void generate();
    } else {
      // Drop stale guidance when the unmet set changes in assisted mode.
      setGuidance(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentActive, agiMode, unmetSig]);

  // Hidden when the agent is off or there's nothing left to fix.
  if (!agentActive || unmet.length === 0) return null;

  // Order the guidance items by the copilot's priorityOrder, falling back to
  // the order they arrived in.
  const orderedItems = guidance
    ? [...guidance.items].sort(
        (a, b) =>
          guidance.priorityOrder.indexOf(a.key) -
          guidance.priorityOrder.indexOf(b.key),
      )
    : [];

  return (
    <aside
      className="rounded-lg border p-3"
      style={{ background: "var(--info-bg)", borderColor: "var(--brand-border)" }}
      aria-label="AI readiness copilot"
    >
      <div className="flex items-center justify-between mb-1">
        <p
          className="text-[12px] font-semibold flex items-center gap-1.5"
          style={{ color: "var(--brand)" }}
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          Get this ready (AI)
        </p>
        {guidance && (
          <Badge variant={guidance.source === "backend" ? "green" : "gray"}>
            {guidance.source === "backend" ? "AI" : "Demo data"}
          </Badge>
        )}
      </div>

      {!guidance && !loading && (
        <>
          <p
            className="text-[11px] mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Get a plain-language explanation of what&apos;s left and how to fix
            each item. Advisory only — it never submits or approves.
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={Sparkles}
            onClick={() => void generate()}
          >
            Help me get this ready
          </Button>
        </>
      )}

      {loading && (
        <p
          role="status"
          aria-live="polite"
          className="text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          Reviewing your CAPA…
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => void generate()}
            className="text-[10px] underline border-none bg-transparent cursor-pointer inline-flex items-center gap-1"
            style={{ color: "var(--text-secondary)" }}
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {guidance && !loading && (
        <div className="space-y-2">
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {guidance.summary}
          </p>
          <ol className="space-y-2 list-none p-0 m-0">
            {orderedItems.map((item, i) => {
              const tab = READINESS_TAB[item.key as keyof typeof READINESS_TAB];
              return (
                <li
                  key={item.key}
                  className="rounded-md p-2"
                  style={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  <p
                    className="text-[12px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {i + 1}. {labelByKey[item.key] ?? item.key}
                  </p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>Why: </span>
                    {item.why}
                  </p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>How: </span>
                    {item.how}
                  </p>
                  {tab && (
                    <button
                      type="button"
                      onClick={() => onChangeTab(tab)}
                      className="text-[11px] mt-1 underline border-none bg-transparent cursor-pointer inline-flex items-center gap-1 p-0"
                      style={{ color: "var(--brand)" }}
                    >
                      Go to {TAB_LABEL[tab]} tab
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={() => void generate()}
            className="text-[10px] underline border-none bg-transparent cursor-pointer inline-flex items-center gap-1"
            style={{ color: "var(--text-muted)" }}
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            Regenerate
          </button>
        </div>
      )}
    </aside>
  );
}
