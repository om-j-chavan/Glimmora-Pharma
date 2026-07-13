"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAppSelector } from "@/hooks/useAppSelector";
import { getApprovalBrief, type ApprovalBriefResult } from "@/lib/ai";
import type { CAPA } from "@/store/capa.slice";

/* ── Feature J — CAPA Approval Brief (reviewer assist) ──
 *
 * Read-only AI summary shown to a reviewer who is about to approve a CAPA.
 * ADVISORY ONLY: it summarises the record and flags what to scrutinise — it
 * never states an approve/reject verdict and never mutates anything. The
 * e-signed decision stays with the human (see the AGI policy CANNOT-DO list).
 *
 * Gating mirrors the other AGI surfaces (DeviationIntelligencePanel, etc.):
 *   agentActive = settings.agi.mode !== "manual" && settings.agi.agents.capa
 * In "autonomous" mode the brief loads on mount; in "assisted" mode the
 * reviewer clicks to generate. Only rendered while the CAPA is awaiting
 * approvals (pending_qa_review).
 */

export function ApprovalBriefPanel({
  capa,
  approvalsCollected,
  approvalsRequired,
  unresolvedConcerns,
}: {
  capa: CAPA;
  approvalsCollected: number;
  approvalsRequired: number;
  unresolvedConcerns: number;
}) {
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.capa);
  const agentActive = agiMode !== "manual" && agiAgent;

  const [brief, setBrief] = useState<ApprovalBriefResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getApprovalBrief({
        reference: capa.reference ?? "",
        title: capa.title,
        description: capa.description,
        risk: capa.risk,
        rootCause: capa.rca ?? "",
        correctiveActions: capa.correctiveActions ?? "",
        rcaApproved: capa.rcaApproved === true,
        alignmentStatus: capa.alignmentStatus ?? "",
        approvalsCollected,
        approvalsRequired,
        unresolvedConcerns,
      });
      setBrief(result);
    } catch {
      // getApprovalBrief already falls back to the mock internally, so a
      // throw here is unexpected — surface a soft error and let the user retry.
      setError("Could not prepare the approval brief. Try again.");
    } finally {
      setLoading(false);
    }
  }, [
    capa.reference,
    capa.title,
    capa.description,
    capa.risk,
    capa.rca,
    capa.correctiveActions,
    capa.rcaApproved,
    capa.alignmentStatus,
    approvalsCollected,
    approvalsRequired,
    unresolvedConcerns,
  ]);

  // Autonomous mode: prepare the brief automatically. Assisted mode: wait for
  // the reviewer to click. Only while the CAPA is actually awaiting approvals.
  useEffect(() => {
    if (!agentActive) return;
    if (capa.status !== "pending_qa_review") return;
    if (agiMode === "autonomous" && !brief && !loading) {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentActive, agiMode, capa.status]);

  // Hidden entirely when the agent is off or the CAPA isn't at the approval gate.
  if (!agentActive || capa.status !== "pending_qa_review") return null;

  return (
    <section
      className="rounded-lg p-3 mb-2"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
      aria-labelledby="approval-brief-heading"
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          id="approval-brief-heading"
          className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          AI approval brief
        </h3>
        {brief && (
          <Badge variant={brief.source === "backend" ? "green" : "gray"}>
            {brief.source === "backend" ? "AI" : "Demo data"}
          </Badge>
        )}
      </div>

      <p className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>
        Advisory summary to support your review. It does not approve, reject, or
        recommend a verdict — your e-signed decision stands alone.
      </p>

      {!brief && !loading && (
        <Button
          variant="secondary"
          size="sm"
          icon={Sparkles}
          onClick={() => void generate()}
        >
          Generate AI brief
        </Button>
      )}

      {loading && (
        <p
          role="status"
          aria-live="polite"
          className="text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          Preparing brief…
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

      {brief && !loading && (
        <div className="space-y-2.5">
          <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>
            {brief.overview}
          </p>

          {brief.strengths.length > 0 && (
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--success)" }}
              >
                Looks solid
              </p>
              <ul role="list" className="space-y-0.5">
                {brief.strengths.map((s) => (
                  <li
                    key={s}
                    className="flex items-start gap-1.5 text-[11px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <CheckCircle2
                      className="w-3 h-3 shrink-0 mt-0.5"
                      style={{ color: "var(--success)" }}
                      aria-hidden="true"
                    />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {brief.watchOuts.length > 0 && (
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--warning)" }}
              >
                Verify before signing
              </p>
              <ul role="list" className="space-y-0.5">
                {brief.watchOuts.map((w) => (
                  <li
                    key={w}
                    className="flex items-start gap-1.5 text-[11px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <AlertTriangle
                      className="w-3 h-3 shrink-0 mt-0.5"
                      style={{ color: "var(--warning)" }}
                      aria-hidden="true"
                    />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
    </section>
  );
}
