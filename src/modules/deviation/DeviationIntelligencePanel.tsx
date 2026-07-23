"use client";

/**
 * Deviation Intelligence — AGI feature embedded in Deviation Management.
 *
 * Surfaces recurring deviation patterns the agent clusters from the tenant's
 * own deviation history (by area). CAN DO (AI-assisted): cluster similar
 * deviations, surface recurring patterns, suggest potential root causes, flag
 * high-frequency areas. CANNOT DO (human only): close deviations, approve
 * investigations, make risk decisions — so this is read-only analysis; every
 * action (investigate / close) stays in the existing deviation flow.
 *
 * Run model: ON DEMAND. The agent does NOT auto-run. Until the user clicks
 * "Run Deviation Intelligence AI" (a button in the page header) there is NO
 * panel on the page — the results card mounts only once analysis is running or
 * complete. This keeps the page clean and puts the human in control of when the
 * model is invoked.
 *
 * Shape: a single hook (useDeviationIntelligence) owns the state; the header
 * trigger (DeviationIntelligenceRunButton) and the results card
 * (DeviationIntelligencePanel) both read it, so they stay in sync without the
 * page threading props between them.
 *
 * Data flows through the AI gateway getDeviationIntelligence() (real backend,
 * with a deterministic mock fallback on error — identical return shape either
 * way, so this UI needs no changes when the data source changes).
 */

import { useState, useCallback } from "react";
import {
  Bot,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  Layers,
  ShieldAlert,
} from "lucide-react";
import {
  getDeviationIntelligence,
  type DeviationClusterInput,
  type DeviationIntelligenceResult,
} from "@/lib/ai";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AIButton, AIBadge } from "@/components/ai";

/** Overall risk level surfaced from the analysis (Low / Medium / High). */
type RiskLevel = "Low" | "Medium" | "High";

/**
 * Shared state for the Deviation Intelligence feature. Produced by
 * {@link useDeviationIntelligence} and consumed by both the header run button
 * and the results panel.
 */
export interface DeviationIntelligenceState {
  /** Agent is on AND there is at least one deviation to analyse. */
  available: boolean;
  result: DeviationIntelligenceResult | null;
  loading: boolean;
  error: string | null;
  /** A run has completed at least once (a result is held). */
  hasRun: boolean;
  /** Trigger an analysis run (idempotent while one is in flight). */
  run: () => void;
}

/**
 * Derive a single advisory risk level from the clustered result. High when the
 * agent flags a high-frequency area or any critical deviation in a cluster;
 * Medium when a recurring pattern or a major deviation is present; Low
 * otherwise. Advisory only — QA makes the actual risk determination.
 */
function deriveRiskLevel(result: DeviationIntelligenceResult): RiskLevel {
  const clusters = result.clusters;
  const hasCritical = clusters.some((c) => c.severityMix.critical > 0);
  const hasHighFrequency = clusters.some((c) => c.isHighFrequency);
  if (hasCritical || hasHighFrequency) return "High";
  const hasMajor = clusters.some((c) => c.severityMix.major > 0);
  if (hasMajor || result.patternCount > 0) return "Medium";
  return "Low";
}

const RISK_BADGE: Record<RiskLevel, "red" | "amber" | "green"> = {
  High: "red",
  Medium: "amber",
  Low: "green",
};

/**
 * Owns the on-demand Deviation Intelligence run state. Reads the AGI policy
 * (agent must be enabled + not in manual mode) and exposes a `run()` trigger.
 */
export function useDeviationIntelligence(
  deviations: DeviationClusterInput[],
): DeviationIntelligenceState {
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.deviation);
  const agentActive = agiMode !== "manual" && agiAgent;

  const [result, setResult] = useState<DeviationIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getDeviationIntelligence(deviations);
      setResult(next);
    } catch (err) {
      // Non-blocking: surface the failure inline, keep any prior result, and
      // let the user retry. The gateway already falls back to mock on backend
      // errors, so reaching here means an unexpected client-side failure.
      console.error("[deviation-intelligence] analysis failed", err);
      setError("Couldn't analyse deviations right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [deviations]);

  return {
    available: Boolean(agentActive) && deviations.length > 0,
    result,
    loading,
    error,
    hasRun: result !== null,
    run,
  };
}

/**
 * Primary trigger that lives in the page header/toolbar. It PERSISTS across the
 * feature's lifecycle so the user always has one clear, consistent control:
 *   • pristine → "Run Deviation Intelligence AI"
 *   • running  → spinner + "Analyzing deviation…" (disabled)
 *   • complete → "Re-run Deviation Intelligence AI"
 * The results card never carries its own run control, so there's a single
 * source of truth and no duplicated buttons.
 */
export function DeviationIntelligenceRunButton({
  state,
}: {
  state: DeviationIntelligenceState;
}) {
  const { available, hasRun, loading, run } = state;
  if (!available) return null;

  // aria-label stays on the run/re-run wording even while loading, so the
  // accessible name (and the e2e selector) is stable across states.
  const label = hasRun
    ? "Re-run Deviation Intelligence AI"
    : "Run Deviation Intelligence AI";

  return (
    <AIButton onClick={run} loading={loading} aria-label={label}>
      {label}
    </AIButton>
  );
}

/**
 * Results card. Renders nothing until analysis is running, complete, or
 * errored — so the page shows no empty placeholder before the user runs it.
 */
export function DeviationIntelligencePanel({
  state,
  onOpenDeviation,
}: {
  state: DeviationIntelligenceState;
  /** Open a deviation's detail modal (member-ref click-through). */
  onOpenDeviation: (id: string) => void;
}) {
  const { available, result, loading, error, hasRun, run } = state;
  const [collapsed, setCollapsed] = useState(false);

  // Nothing to show yet (or agent off) — keep the page clean.
  if (!available || (!loading && !hasRun && !error)) return null;

  const clusters = result?.clusters ?? [];
  const patternCount = result?.patternCount ?? 0;
  const riskLevel = result ? deriveRiskLevel(result) : null;

  return (
    <div className="card">
      <div className="card-header">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 flex-1 text-left"
          aria-expanded={!collapsed}
          aria-controls="deviation-intel-body"
        >
          <Bot className="w-4 h-4" style={{ color: "var(--ai-accent)" }} aria-hidden="true" />
          <span className="card-title">Deviation Intelligence AI</span>
          {hasRun && !loading && (
            <Badge variant={patternCount > 0 ? "amber" : "green"}>
              {patternCount > 0
                ? `${patternCount} pattern${patternCount > 1 ? "s" : ""}`
                : "no patterns"}
            </Badge>
          )}
          {/* Provenance — the gateway silently falls back to the deterministic
              mock when the backend errors, so without this the user cannot tell
              AI output from demo data. */}
          {hasRun && !loading && result && <AIBadge source={result.source} />}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
        </button>
        {/* Run / re-run is the single persistent control in the page header
            (see DeviationIntelligenceRunButton) — no duplicate here. */}
      </div>

      {!collapsed && (
        <div id="deviation-intel-body" className="card-body space-y-3">
          {/* Advisory — assistive, QA decides. */}
          {hasRun && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              AI-clustered patterns across {result?.analyzedCount ?? 0}{" "}
              deviations. Suggestions are advisory — the agent does not close
              deviations, approve investigations, or make risk decisions.
            </p>
          )}

          {/* Partial-coverage disclosure. The backend caps how many deviations
              enter one prompt; when it bites, saying "no patterns" without this
              would imply a full-register scan that never happened. */}
          {hasRun &&
            result?.suppliedCount != null &&
            result.suppliedCount > result.analyzedCount && (
              <div
                className="flex items-start gap-2 p-2.5 rounded-lg"
                style={{ background: "var(--warning-bg)" }}
                role="note"
              >
                <AlertTriangle
                  className="w-3.5 h-3.5 mt-0.5 shrink-0"
                  style={{ color: "var(--warning)" }}
                  aria-hidden="true"
                />
                <p className="text-[11px]" style={{ color: "var(--warning)" }}>
                  Partial coverage — analysed the {result.analyzedCount}{" "}
                  highest-severity of {result.suppliedCount} deviations. Lower-severity
                  deviations were not included in this run.
                </p>
              </div>
            )}

          {/* Non-blocking error — never hides existing results, always retryable. */}
          {error && (
            <div
              className="flex items-center justify-between gap-3 p-2.5 rounded-lg flex-wrap"
              style={{ background: "var(--danger-bg)" }}
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: "var(--danger)" }}
                  aria-hidden="true"
                />
                <p className="text-[12px]" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              </div>
              {!loading && (
                <Button variant="secondary" size="sm" icon={RefreshCw} onClick={run}>
                  Try again
                </Button>
              )}
            </div>
          )}

          {/* Loading state: spinner + "Analyzing deviation…" */}
          {loading && !hasRun && (
            <div
              className="flex flex-col items-center justify-center py-8 gap-3"
              role="status"
              aria-live="polite"
            >
              <div
                className="w-7 h-7 rounded-full border-2 animate-spin"
                style={{ borderColor: "var(--ai-accent)", borderTopColor: "transparent" }}
                aria-hidden="true"
              />
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Analyzing deviation…
              </p>
            </div>
          )}

          {/* Result state */}
          {hasRun && (
            <>
              {/* Overall risk level — a single advisory read across all clusters. */}
              {riskLevel && (
                <div
                  className="flex items-center gap-2 p-2.5 rounded-lg"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <ShieldAlert
                    className="w-4 h-4 shrink-0"
                    style={{ color: "var(--ai-accent)" }}
                    aria-hidden="true"
                  />
                  <span
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Advisory risk flag
                  </span>
                  <Badge variant={RISK_BADGE[riskLevel]}>{riskLevel}</Badge>
                </div>
              )}

              {clusters.length === 0 ? (
                <div className="flex items-start gap-2 py-2">
                  <Layers
                    className="w-4 h-4 mt-0.5 shrink-0"
                    style={{ color: "var(--text-muted)" }}
                    aria-hidden="true"
                  />
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    No recurring patterns detected. Patterns surface once 2+
                    deviations share an area.
                  </p>
                </div>
              ) : (
                <ul className="list-none p-0 m-0 space-y-3">
                  {clusters.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-2xl border p-3"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {c.isHighFrequency ? (
                            <AlertTriangle className="w-4 h-4 text-[#ef4444]" aria-hidden="true" />
                          ) : (
                            <TrendingUp className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" />
                          )}
                          <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                            {c.theme}
                          </span>
                          <Badge variant="blue">{c.count} deviations</Badge>
                          {c.isHighFrequency && <Badge variant="red">High frequency</Badge>}
                        </div>
                        {/* Derived from cluster SIZE, not model certainty — labelled
                            "pattern strength" so it is never read as an AI
                            confidence score (see DeviationCluster.confidence). */}
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {c.confidence}% pattern strength
                        </span>
                      </div>

                      {/* Severity mix + categories */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {c.severityMix.critical > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                            {c.severityMix.critical} critical
                          </span>
                        )}
                        {c.severityMix.major > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                            {c.severityMix.major} major
                          </span>
                        )}
                        {c.severityMix.minor > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                            {c.severityMix.minor} minor
                          </span>
                        )}
                        {c.categoryChips.map((cat) => (
                          <span key={cat.label} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                            {cat.label}{cat.count > 1 ? ` ×${cat.count}` : ""}
                          </span>
                        ))}
                      </div>

                      {/* Suggested root cause */}
                      <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--ai-accent)" }} aria-hidden="true" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>
                            Suggested root cause
                          </p>
                          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {c.suggestedRootCause}
                          </p>
                        </div>
                      </div>

                      {/* Member refs — click to open (similar past deviations). */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>In this cluster:</span>
                        {c.members.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => onOpenDeviation(m.id)}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border-none cursor-pointer hover:underline"
                            style={{ background: "var(--brand-muted)", color: "var(--brand)" }}
                          >
                            {m.reference}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
