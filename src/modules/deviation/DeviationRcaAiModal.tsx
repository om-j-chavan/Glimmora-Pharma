"use client";

/**
 * Deviation RCA Intelligence — the AI assist panel for ONE deviation's
 * investigation, opened from the RCA section of the deviation detail view.
 *
 * Not to be confused with DeviationIntelligencePanel (Feature F), which
 * clusters the whole register looking for recurring patterns. This reads a
 * SINGLE deviation in depth — description, immediate action, severity, area,
 * attached document names, whatever RCA text is already written — plus a slice
 * of the tenant's own similar past deviations, and returns:
 *
 *   • probable root causes (ranked, with the evidence behind each)
 *   • contributing factors, bucketed Fishbone-style
 *   • recommended next investigative steps
 *   • candidate corrective / preventive actions
 *   • information & evidence the investigation is still MISSING
 *   • a method-shaped RCA draft the investigator can edit and apply
 *
 * ── Two rules this UI exists to enforce ──────────────────────────────
 * 1. AI output is visibly AI. Every generated block sits on the AI accent with
 *    an <AIBadge>; the "Demo data" variant renders grey when the gateway fell
 *    back to the deterministic mock, so fixture content can never be mistaken
 *    for a real analysis in a GxP record.
 * 2. Nothing is applied silently. The draft lands in EDITABLE fields; the
 *    investigator changes what they disagree with and clicks Apply. Apply hands
 *    the (edited) draft to the parent, which writes it into the RCA form —
 *    still unsaved, still requiring the investigator's own Save RCA. Existing
 *    RCA content is never overwritten without the parent's confirm step.
 *
 * Data flows through the AI gateway getDeviationRcaAnalysis() → the FastAPI
 * agent (POST /api/v1/deviation-rca/analyze), with the deterministic mock as
 * the crash-safety fallback (identical shape either way).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ClipboardCopy,
  FileSearch,
  Lightbulb,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import {
  getDeviationRcaAnalysis,
  type DeviationRcaAnalysis,
  type DeviationRcaHistoryItem,
  type DeviationRcaInput,
  type DeviationRcaLikelihood,
  type RcaSuggestion,
} from "@/lib/ai";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AIBadge, AIButton } from "@/components/ai";
import { normalizeSeverityForDisplay } from "@/lib/severity";
import type { Deviation, DeviationRCAMethod } from "@/store/deviation.slice";

/** How many past deviations are offered to the agent for comparison. Ordered
 *  most-similar-first below, so the cap keeps the strongest matches. */
const HISTORY_LIMIT = 25;

const FISHBONE_FACTOR_KEYS = [
  ["People", "people"],
  ["Process", "process"],
  ["Equipment", "equipment"],
  ["Materials", "materials"],
  ["Environment", "environment"],
  ["Management", "management"],
] as const;

const LIKELIHOOD_VARIANT: Record<DeviationRcaLikelihood, "red" | "amber" | "green"> = {
  High: "red",
  Medium: "amber",
  Low: "green",
};

/* ── Similar-deviation selection ──────────────────────────────────────
 * Deterministic, cheap, and computed CLIENT-side so the prompt carries only
 * the most relevant history rather than the whole register. Same area is the
 * strongest signal, then same category, then a completed investigation (a
 * recorded root cause is what makes a past deviation genuinely useful here). */
function similarityScore(candidate: Deviation, subject: Deviation): number {
  let score = 0;
  if (candidate.area && candidate.area === subject.area) score += 4;
  if (candidate.category && candidate.category === subject.category) score += 3;
  if (candidate.rootCause?.trim()) score += 2;
  if (candidate.severity === subject.severity) score += 1;
  return score;
}

/* ── Clipboard ────────────────────────────────────────────────────────── */

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
    } catch {
      // Clipboard is permission-gated (and absent on insecure origins). Failing
      // silently is right here: the text is on screen and selectable anyway.
    }
  }, []);
  return { copiedKey, copy };
}

function CopyButton({ label, text, copyKey, copiedKey, onCopy }: {
  label: string;
  text: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const copied = copiedKey === copyKey;
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      icon={copied ? Check : ClipboardCopy}
      onClick={() => onCopy(copyKey, text)}
      aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      title={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
      style={copied ? { color: "var(--success)" } : { color: "var(--text-muted)" }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/* ── Section shell ────────────────────────────────────────────────────── */

function AiSection({ icon: Icon, title, count, action, children }: {
  icon: typeof Lightbulb;
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border p-3" style={{ borderColor: "var(--bg-border)", background: "var(--bg-surface)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--ai-accent)" }} aria-hidden="true" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>
          {title}
        </h3>
        {typeof count === "number" && count > 0 && <Badge variant="gray">{count}</Badge>}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/* ── Props ────────────────────────────────────────────────────────────── */

export interface DeviationRcaAiModalProps {
  open: boolean;
  onClose: () => void;
  deviation: Deviation;
  /** Method picked in the RCA form. Null → the analysis defaults to 5 Why. */
  method: DeviationRCAMethod | null;
  /** False for viewers / the reporter (SoD) — the panel stays readable, only
   *  the Apply action is withheld. */
  canApply: boolean;
  /** Hands the reviewed + edited draft to the RCA form. The parent decides how
   *  to merge it (and confirms before replacing existing analysis). */
  onApply: (method: DeviationRCAMethod, suggestion: RcaSuggestion) => void;
}

export function DeviationRcaAiModal({
  open,
  onClose,
  deviation,
  method,
  canApply,
  onApply,
}: DeviationRcaAiModalProps) {
  const allDeviations = useAppSelector((s) => s.deviation.items);
  const { copiedKey, copy } = useCopy();

  const [result, setResult] = useState<DeviationRcaAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Editable mirrors of the AI draft — what Apply actually hands back.
  const [editWhys, setEditWhys] = useState<string[]>(["", "", "", "", ""]);
  const [editCats, setEditCats] = useState<Record<string, string>>({});
  const [editRoot, setEditRoot] = useState("");

  // The method the analysis is shaped for. Null (no method picked yet in the
  // RCA form) defaults to 5 Why — the most common investigation format.
  const analysisMethod: DeviationRCAMethod = method ?? "5 Why";

  /** Similar past deviations from the SAME tenant, most similar first. */
  const history: DeviationRcaHistoryItem[] = useMemo(
    () =>
      allDeviations
        .filter((d) => d.tenantId === deviation.tenantId && d.id !== deviation.id)
        .map((d) => ({ d, score: similarityScore(d, deviation) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || (a.d.reference ?? "").localeCompare(b.d.reference ?? ""))
        .slice(0, HISTORY_LIMIT)
        .map(({ d }) => ({
          reference: d.reference ?? d.id.slice(0, 8),
          title: d.title,
          area: d.area,
          category: d.category,
          severity: normalizeSeverityForDisplay(d.severity, "fda") ?? d.severity,
          rootCause: d.rootCause ?? "",
        })),
    [allDeviations, deviation],
  );

  const input: DeviationRcaInput = useMemo(
    () => ({
      method: analysisMethod,
      reference: deviation.reference ?? deviation.id.slice(0, 8),
      title: deviation.title,
      description: deviation.description,
      severity: normalizeSeverityForDisplay(deviation.severity, "fda") ?? deviation.severity,
      category: deviation.category,
      area: deviation.area,
      type: deviation.type,
      immediateAction: deviation.immediateAction,
      batchesAffected: deviation.batchesAffected ?? [],
      // Names only — document BYTES are never sent to the AI service.
      documentNames: (deviation.documents ?? []).map((d) => d.fileName),
      existingRootCause: deviation.rootCause ?? "",
      history,
    }),
    [analysisMethod, deviation, history],
  );

  /** Load the AI draft into the editable buffers. */
  const loadDraft = useCallback((draft: RcaSuggestion) => {
    if (draft.method === "5 Why") {
      setEditWhys([...draft.whys]);
      setEditRoot(draft.rootCause);
    } else if (draft.method === "Fishbone") {
      setEditCats({ ...draft.categories });
      setEditRoot(draft.rootCause);
    } else {
      setEditRoot(draft.rootCause);
    }
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getDeviationRcaAnalysis(input);
      setResult(next);
      loadDraft(next.draft);
    } catch (err) {
      // The backend degrades deterministically and stamps `source`, so
      // reaching here means an unexpected client-side fault. Non-blocking:
      // keep any prior result on screen and let the user retry.
      console.error("[deviation-rca] analysis failed", err);
      setError("Couldn't analyse this deviation right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [input, loadDraft]);

  // Analyse once per opening. Deliberately keyed on `open` alone: `input`
  // changes identity whenever the register re-renders, and depending on it here
  // would fire a fresh (billed) AI call on every such render.
  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviation.id, analysisMethod]);

  /** Rebuild the suggestion from the edited buffers. */
  function buildEdited(): RcaSuggestion | null {
    const draft = result?.draft;
    if (!draft) return null;
    if (draft.method === "5 Why") {
      return {
        ...draft,
        whys: [editWhys[0] ?? "", editWhys[1] ?? "", editWhys[2] ?? "", editWhys[3] ?? "", editWhys[4] ?? ""],
        // Why 5 IS the root cause in this method — keep the two in step.
        rootCause: editWhys[4] ?? "",
      };
    }
    if (draft.method === "Fishbone") {
      return {
        ...draft,
        categories: {
          people: editCats.people ?? "",
          process: editCats.process ?? "",
          equipment: editCats.equipment ?? "",
          materials: editCats.materials ?? "",
          environment: editCats.environment ?? "",
          management: editCats.management ?? "",
        },
        rootCause: editRoot,
      };
    }
    return { ...draft, rootCause: editRoot };
  }

  function handleApply() {
    const edited = buildEdited();
    if (!edited) return;
    onApply(analysisMethod, edited);
    onClose();
  }

  /** Push a candidate root cause into the draft's root-cause field. */
  function setDraftRootCause(text: string) {
    if (analysisMethod === "5 Why") {
      setEditWhys((prev) => { const next = [...prev]; next[4] = text; return next; });
    }
    setEditRoot(text);
  }

  /** Whole-analysis plain-text export for the Copy-all action. */
  function analysisAsText(r: DeviationRcaAnalysis): string {
    const lines: string[] = [
      `AI RCA analysis — ${input.reference} (${r.method}, ${r.confidence}% confidence)`,
      "",
      r.summary,
    ];
    if (r.probableRootCauses.length) {
      lines.push("", "Probable root causes:");
      r.probableRootCauses.forEach((c, i) => lines.push(`${i + 1}. [${c.likelihood}] ${c.title} — ${c.rationale}`));
    }
    if (r.contributingFactors.length) {
      lines.push("", "Contributing factors:");
      r.contributingFactors.forEach((f) => lines.push(`• ${f.category}: ${f.factor}`));
    }
    if (r.recommendations.length) {
      lines.push("", "Recommended next steps:");
      r.recommendations.forEach((s) => lines.push(`• ${s}`));
    }
    if (r.correctiveActions.length) {
      lines.push("", "Candidate corrective actions:");
      r.correctiveActions.forEach((s) => lines.push(`• ${s}`));
    }
    if (r.preventiveActions.length) {
      lines.push("", "Candidate preventive actions:");
      r.preventiveActions.forEach((s) => lines.push(`• ${s}`));
    }
    if (r.missingInformation.length) {
      lines.push("", "Missing information / evidence:");
      r.missingInformation.forEach((s) => lines.push(`• ${s}`));
    }
    lines.push("", "AI-generated — advisory only. Verify before recording the RCA.");
    return lines.join("\n");
  }

  const hasResult = !!result;
  const draftMethod = result?.draft.method;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Deviation RCA Intelligence"
      className="max-w-[820px]"
      header={
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--bg-border)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Bot className="w-4 h-4 shrink-0" style={{ color: "var(--ai-accent)" }} aria-hidden="true" />
              <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Deviation RCA Intelligence
              </span>
              {hasResult && <AIBadge source={result.source} />}
              <Badge variant="purple">{analysisMethod}</Badge>
              {hasResult && (
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {result.confidence}% confidence
                </span>
              )}
            </div>
            <p className="text-[11px] mt-1 truncate" style={{ color: "var(--text-muted)" }}>
              {input.reference} · {deviation.title}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasResult && !loading && (
              <CopyButton label="Full analysis" text={analysisAsText(result)} copyKey="all" copiedKey={copiedKey} onCopy={copy} />
            )}
            <AIButton variant="quiet" size="xs" icon={RefreshCw} loading={loading} onClick={run} aria-label="Regenerate analysis">
              Regenerate
            </AIButton>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              Close
            </Button>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] italic m-0" style={{ color: "var(--text-muted)" }}>
            AI-generated and advisory. The recorded RCA remains your professional judgment.
          </p>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            {hasResult && !loading && (
              <AIButton
                onClick={handleApply}
                disabled={!canApply}
                title={canApply ? undefined : "You don't have permission to edit this investigation."}
              >
                Apply to RCA
              </AIButton>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* ── LOADING ─────────────────────────────────────────────── */}
        {loading && !hasResult && (
          <div className="flex flex-col items-center justify-center py-10 gap-3" role="status" aria-live="polite">
            <div
              className="w-7 h-7 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--ai-accent)", borderTopColor: "transparent" }}
              aria-hidden="true"
            />
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Analysing this deviation{history.length > 0 ? ` and ${history.length} similar past deviation${history.length === 1 ? "" : "s"}` : ""}…
            </p>
          </div>
        )}

        {/* ── ERROR (never hides an existing result) ───────────────── */}
        {error && (
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg flex-wrap" style={{ background: "var(--danger-bg)" }} role="alert">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
              <p className="text-[12px] m-0" style={{ color: "var(--danger)" }}>{error}</p>
            </div>
            {!loading && (
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={run}>Try again</Button>
            )}
          </div>
        )}

        {hasResult && (
          <>
            {/* ── SUMMARY ───────────────────────────────────────────── */}
            {result.summary ? (
              <div className="agi-panel" role="status" aria-live="polite">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--ai-accent)" }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider font-semibold m-0 mb-1" style={{ color: "var(--text-muted)" }}>
                      AI read of this deviation
                    </p>
                    <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--text-secondary)" }}>{result.summary}</p>
                    <p className="text-[10px] mt-2 m-0" style={{ color: "var(--text-muted)" }}>
                      Based on this deviation&apos;s record{result.analyzedHistoryCount > 0 ? ` and ${result.analyzedHistoryCount} similar past deviation${result.analyzedHistoryCount === 1 ? "" : "s"}` : " (no comparable past deviations were available)"}
                      {input.documentNames.length > 0 ? ` · ${input.documentNames.length} attached document${input.documentNames.length === 1 ? "" : "s"} considered by name` : " · no documents attached"}.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── PROBABLE ROOT CAUSES ──────────────────────────────── */}
            <AiSection icon={Lightbulb} title="Probable root causes" count={result.probableRootCauses.length}>
              {result.probableRootCauses.length === 0 ? (
                <p className="text-[11px] m-0" style={{ color: "var(--text-muted)" }}>
                  The agent could not isolate a candidate root cause from the information recorded. Add detail to the description and attach supporting evidence, then re-run.
                </p>
              ) : (
                <ul className="list-none p-0 m-0 space-y-2">
                  {result.probableRootCauses.map((c, i) => (
                    <li key={`${c.title}-${i}`} className="rounded-lg border p-2.5" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="text-[12px] font-semibold m-0 min-w-0" style={{ color: "var(--text-primary)" }}>{c.title}</p>
                        <Badge variant={LIKELIHOOD_VARIANT[c.likelihood]}>{c.likelihood} likelihood</Badge>
                      </div>
                      {c.rationale && (
                        <p className="text-[11px] mt-1 m-0" style={{ color: "var(--text-secondary)" }}>{c.rationale}</p>
                      )}
                      {c.evidence.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c.evidence.map((e, j) => (
                            <span key={j} className="text-[10px] rounded-md px-2 py-1" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}>
                              {e}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-2">
                        <Button type="button" variant="secondary" size="xs" onClick={() => setDraftRootCause(c.title)}>
                          Use as root cause
                        </Button>
                        <CopyButton
                          label="Root cause"
                          text={c.rationale ? `${c.title} — ${c.rationale}` : c.title}
                          copyKey={`rc-${i}`}
                          copiedKey={copiedKey}
                          onCopy={copy}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </AiSection>

            {/* ── CONTRIBUTING FACTORS ──────────────────────────────── */}
            {result.contributingFactors.length > 0 && (
              <AiSection
                icon={Wrench}
                title="Contributing factors"
                count={result.contributingFactors.length}
                action={
                  <CopyButton
                    label="Contributing factors"
                    text={result.contributingFactors.map((f) => `• ${f.category}: ${f.factor}`).join("\n")}
                    copyKey="factors"
                    copiedKey={copiedKey}
                    onCopy={copy}
                  />
                }
              >
                <ul className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {result.contributingFactors.map((f, i) => (
                    <li key={`${f.category}-${i}`} className="rounded-lg px-2.5 py-2" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[10px] uppercase tracking-wider font-semibold m-0" style={{ color: "var(--text-muted)" }}>{f.category}</p>
                      <p className="text-[11px] mt-0.5 m-0" style={{ color: "var(--text-secondary)" }}>{f.factor}</p>
                    </li>
                  ))}
                </ul>
              </AiSection>
            )}

            {/* ── RECOMMENDED NEXT STEPS ────────────────────────────── */}
            {result.recommendations.length > 0 && (
              <AiSection
                icon={FileSearch}
                title="Recommended next steps"
                count={result.recommendations.length}
                action={
                  <CopyButton
                    label="Recommendations"
                    text={result.recommendations.map((s) => `• ${s}`).join("\n")}
                    copyKey="recs"
                    copiedKey={copiedKey}
                    onCopy={copy}
                  />
                }
              >
                <ul className="p-0 m-0 pl-4 space-y-1">
                  {result.recommendations.map((s, i) => (
                    <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{s}</li>
                  ))}
                </ul>
              </AiSection>
            )}

            {/* ── CANDIDATE CAPA ACTIONS ────────────────────────────── */}
            {(result.correctiveActions.length > 0 || result.preventiveActions.length > 0) && (
              <AiSection
                icon={Wrench}
                title="Candidate corrective & preventive actions"
                action={
                  <CopyButton
                    label="CAPA actions"
                    text={[
                      ...(result.correctiveActions.length ? ["Corrective:", ...result.correctiveActions.map((s) => `• ${s}`)] : []),
                      ...(result.preventiveActions.length ? ["Preventive:", ...result.preventiveActions.map((s) => `• ${s}`)] : []),
                    ].join("\n")}
                    copyKey="capa"
                    copiedKey={copiedKey}
                    onCopy={copy}
                  />
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.correctiveActions.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold m-0 mb-1" style={{ color: "var(--text-muted)" }}>Corrective</p>
                      <ul className="p-0 m-0 pl-4 space-y-1">
                        {result.correctiveActions.map((s, i) => (
                          <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.preventiveActions.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold m-0 mb-1" style={{ color: "var(--text-muted)" }}>Preventive</p>
                      <ul className="p-0 m-0 pl-4 space-y-1">
                        {result.preventiveActions.map((s, i) => (
                          <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <p className="text-[10px] mt-2 m-0" style={{ color: "var(--text-muted)" }}>
                  Suggestions only — whether a CAPA is required stays a QA decision, made after the investigation.
                </p>
              </AiSection>
            )}

            {/* ── MISSING INFORMATION (with a real empty state) ─────── */}
            <AiSection icon={AlertTriangle} title="Missing information & evidence" count={result.missingInformation.length}>
              {result.missingInformation.length === 0 ? (
                <p className="text-[11px] m-0" style={{ color: "var(--text-secondary)" }}>
                  Nothing flagged — the agent found no obvious gaps in the recorded information.
                </p>
              ) : (
                <ul className="list-none p-0 m-0 space-y-1.5">
                  {result.missingInformation.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: "var(--warning-bg)" }}>
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden="true" />
                      <span className="text-[11px]" style={{ color: "var(--warning)" }}>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </AiSection>

            {/* ── RELATED PAST DEVIATIONS ───────────────────────────── */}
            {result.relatedDeviations.length > 0 && (
              <AiSection icon={Bot} title="Related past deviations" count={result.relatedDeviations.length}>
                <ul className="list-none p-0 m-0 space-y-1">
                  {result.relatedDeviations.map((r) => (
                    <li key={r.reference} className="flex items-start gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--brand-muted)", color: "var(--brand)" }}>
                        {r.reference}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{r.reason}</span>
                    </li>
                  ))}
                </ul>
              </AiSection>
            )}

            {/* ── EDITABLE DRAFT ────────────────────────────────────────
                Visually separated from the read-only analysis above: this is
                the ONLY block that can reach the investigator's RCA fields, and
                only via Apply. */}
            <section
              className="rounded-xl border-2 p-3"
              style={{ borderColor: "var(--ai-border)", background: "var(--ai-muted)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider m-0" style={{ color: "var(--text-primary)" }}>
                  AI draft RCA — {analysisMethod}
                </h3>
                <AIBadge source={result.source} />
              </div>
              <p className="text-[10px] mb-2.5 m-0" style={{ color: "var(--text-muted)" }}>
                Review and edit these fields, then click <strong>Apply to RCA</strong>. Applying fills the RCA form only — your own <em>Save RCA</em> still records it.
              </p>

              {draftMethod === "5 Why" && (
                <div className="space-y-2">
                  {[0, 1, 2, 3, 4].map((n) => {
                    const isRoot = n === 4;
                    return (
                      <div key={n}>
                        <label
                          htmlFor={`ai-why-${n}`}
                          className={clsx("uppercase tracking-wider block mb-0.5", isRoot ? "text-[11px] font-bold" : "text-[10px] font-semibold")}
                          style={{ color: isRoot ? "var(--text-primary)" : "var(--text-muted)" }}
                        >
                          {isRoot ? "Why 5 — Root cause" : `Why ${n + 1}`}
                        </label>
                        <textarea
                          id={`ai-why-${n}`}
                          rows={2}
                          className="input w-full text-[12px] resize-none"
                          style={isRoot ? { background: "var(--brand-muted)", borderLeft: "2px solid var(--brand)" } : undefined}
                          value={editWhys[n] ?? ""}
                          onChange={(e) => setEditWhys((prev) => { const next = [...prev]; next[n] = e.target.value; return next; })}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {draftMethod === "Fishbone" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FISHBONE_FACTOR_KEYS.map(([label, key]) => (
                      <div key={key}>
                        <label htmlFor={`ai-cat-${key}`} className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: "var(--text-muted)" }}>
                          {label}
                        </label>
                        <textarea
                          id={`ai-cat-${key}`}
                          rows={2}
                          className="input w-full text-[12px] resize-none"
                          value={editCats[key] ?? ""}
                          onChange={(e) => setEditCats((m) => ({ ...m, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="ai-root" className="text-[11px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: "var(--text-primary)" }}>
                      Root cause summary
                    </label>
                    <textarea
                      id="ai-root"
                      rows={2}
                      className="input w-full text-[12px] resize-none"
                      style={{ background: "var(--brand-muted)", borderLeft: "2px solid var(--brand)" }}
                      value={editRoot}
                      onChange={(e) => setEditRoot(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {(draftMethod === "Fault Tree" || draftMethod === "Barrier Analysis") && (
                <div>
                  <label htmlFor="ai-root" className="text-[11px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: "var(--text-primary)" }}>
                    {draftMethod} analysis — Root cause
                  </label>
                  <textarea
                    id="ai-root"
                    rows={7}
                    className="input w-full text-[12px] resize-none"
                    style={{ background: "var(--brand-muted)", borderLeft: "2px solid var(--brand)" }}
                    value={editRoot}
                    onChange={(e) => setEditRoot(e.target.value)}
                  />
                </div>
              )}

              {!canApply && (
                <p role="note" className="text-[10px] mt-2 m-0" style={{ color: "var(--warning)" }}>
                  You can review and copy this analysis, but not apply it — the investigation must be recorded by someone other than the reporter.
                </p>
              )}
            </section>
          </>
        )}

        {/* ── EMPTY (a run finished with nothing to show) ──────────── */}
        {!loading && !hasResult && !error && (
          <p className="text-[12px] py-6 text-center m-0" style={{ color: "var(--text-muted)" }}>
            No analysis yet. Use Regenerate to run the agent on this deviation.
          </p>
        )}
      </div>
    </Modal>
  );
}
