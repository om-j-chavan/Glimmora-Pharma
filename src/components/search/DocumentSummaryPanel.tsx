"use client";

/**
 * Feature 3 — Document Summarizing.
 *
 * A reusable "Summarize" affordance for long-document detail screens
 * (deviation, FDA-483, gap finding, evidence viewer). Collapsed it's a single
 * Summarize button; expanded it shows the AI bullet summary with a
 * Short/Detailed length toggle, a lens menu (QA / Management / Risks-only),
 * the verify disclaimer, Copy, and thumbs feedback. Mirrors the spec states:
 * before, summarized, skipped (short record), error.
 *
 * Summarizing is read-only and grounded server-side; the human stays
 * accountable (the verify reminder).
 */

import { useState, type CSSProperties } from "react";
import { Sparkles, Copy, Check, ThumbsUp, ThumbsDown, AlertTriangle, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AIButton } from "@/components/ai";
import { Modal } from "@/components/ui/Modal";
import { useAppSelector } from "@/hooks/useAppSelector";
import { aiSummarizeSend, AiChatError, type SummaryResponse } from "@/lib/aiChat";
import { friendlyAiError } from "@/lib/friendlyError";

type Lens = "qa" | "management" | "risks";
type Length = "short" | "detailed";

// Human-readable audience labels for the summary-view (lens) selector. NOTE: the
// KEYS (qa/management/risks) are the lens param sent to the AI backend and are
// UNCHANGED — only these display labels are clarified.
const LENS_LABEL: Record<Lens, string> = {
  qa: "QA Review",
  management: "Management",
  risks: "Highlight Risks",
};

interface Props {
  /** The document text to summarize (host builds this from the record). */
  content: string;
  title?: string;
  recordId?: string;
  module?: string;
  /** Optional: render compact (button only until clicked). Default true. */
  className?: string;
  /** Collapsed-state button label. Defaults to "Summarize"; some hosts prefer
   *  "Summary" (e.g. the gap finding detail). */
  buttonLabel?: string;
}

export function DocumentSummaryPanel({ content, title = "", recordId = "-", module = "-", className, buttonLabel = "Summarize" }: Props) {
  const aiToken = useAppSelector((s) => {
    const u = s.auth.user;
    if (!u) return "anonymous";
    if (u.aiAccessToken) return u.aiAccessToken;
    const tenant = s.auth.tenants.find((t) => t.id === u.tenantId);
    return tenant?.config?.users?.find((x) => x.id === u.id)?.aiAccessToken ?? "anonymous";
  });

  const [open, setOpen] = useState(false);          // has a summary been requested?
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummaryResponse | null>(null);
  const [length, setLength] = useState<Length>("short");
  const [lens, setLens] = useState<Lens>("qa");
  const [lensMenu, setLensMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  async function run(nextLength: Length, nextLens: Lens) {
    setBusy(true);
    setError(null);
    setOpen(true);
    setVote(null);
    try {
      const res = await aiSummarizeSend(content, { title, length: nextLength, lens: nextLens, recordId, module }, aiToken);
      setResult(res);
    } catch (e) {
      console.error("[summary] failed", e);
      if (e instanceof AiChatError && e.status === 503) setError("Summarizer is unavailable right now. Please try again shortly.");
      else setError(friendlyAiError(e, "Couldn't summarize this record. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function pickLength(l: Length) { setLength(l); void run(l, lens); }
  function pickLens(l: Lens) { setLens(l); setLensMenu(false); void run(length, l); }

  async function copyAll() {
    if (!result?.bullets.length) return;
    try {
      await navigator.clipboard.writeText(result.bullets.map((b) => `• ${b}`).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  const toggleBtn = (active: boolean): CSSProperties =>
    active ? { background: "var(--ai-accent)", color: "#fff" } : { background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" };

  const close = () => setOpen(false);

  // The trigger stays in place; the summary now renders in the SHARED <Modal>
  // (centered dialog) instead of an inline page panel. ALL behavior is preserved
  // — immediate run on open, loading state, the labeled lens selector (in the
  // modal header) that regenerates, short-circuit/error states, bullets,
  // Short/Detailed, Copy + feedback.
  return (
    <>
      <AIButton size="sm" onClick={() => run(length, lens)} className={className}>
        {buttonLabel}
      </AIButton>

      <Modal
        open={open}
        onClose={close}
        title={`AI Summary${title ? ` — ${title}` : ""}`}
        header={
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-(--bg-border)">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold min-w-0 truncate" style={{ color: "var(--text-primary)" }}>
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: "var(--ai-accent)" }} aria-hidden="true" /> <span className="truncate">AI Summary{title ? ` — ${title}` : ""}</span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {/* Summary-view (lens) selector — re-frames the summary for a different
                  audience; each pick regenerates via pickLens(). Labeled + tooltip. */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLensMenu((v) => !v)}
                  aria-expanded={lensMenu}
                  aria-label="Summary view — re-frame this summary for a different audience"
                  title="Re-frame this summary for a different audience"
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border cursor-pointer"
                  style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)", background: "var(--bg-surface)" }}
                >
                  <span style={{ color: "var(--text-muted)" }}>Summary view:</span>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>{LENS_LABEL[lens]}</span>
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                </button>
                {lensMenu && (
                  <div className="absolute right-0 mt-1 z-20 rounded-lg py-1 text-[12px] min-w-[210px]" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
                    <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Re-frame summary for…</p>
                    {(Object.keys(LENS_LABEL) as Lens[]).map((l) => (
                      <button key={l} type="button" onClick={() => pickLens(l)} className="w-full text-left px-3 py-2 cursor-pointer border-0 bg-transparent" style={{ color: l === lens ? "var(--ai-accent)" : "var(--text-primary)" }}>
                        {LENS_LABEL[l]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Single header close (✕); the footer "Close" mirrors it (same action). */}
              <button type="button" onClick={close} aria-label="Close" className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors">
                <X className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
              </button>
            </div>
          </div>
        }
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={close}>Close</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {busy && <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Summarizing…</p>}
          {error && <p role="alert" className="text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}

          {!busy && result?.status === "skipped" && (
            <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--bg-surface)", color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--ai-accent)" }}>AI </span>{result.reason}
            </p>
          )}

          {!busy && result?.status === "error" && (
            <p className="text-[12px]" style={{ color: "var(--danger)" }}>{result.reason}</p>
          )}

          {!busy && result?.status === "summarized" && (
            <>
              <ul className="space-y-1.5">
                {result.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--text-primary)" }}>
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--ai-accent)" }} aria-hidden="true" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              {/* Short / Detailed length toggle */}
              <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
                <button type="button" onClick={() => pickLength("short")} className="px-3 py-1 text-[11px] font-medium border-0 cursor-pointer" style={toggleBtn(length === "short")}>Short</button>
                <button type="button" onClick={() => pickLength("detailed")} className="px-3 py-1 text-[11px] font-medium border-0 cursor-pointer" style={toggleBtn(length === "detailed")}>Detailed</button>
              </div>

              {/* Verify disclaimer */}
              <div className="flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11px]" style={{ background: "#fef3c7", color: "#92400e" }}>
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{result.disclaimer}</span>
              </div>

              {/* Copy + feedback */}
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="xs" icon={copied ? Check : Copy} onClick={copyAll}>
                  {copied ? "Copied" : "Copy"}
                </Button>
                <button type="button" aria-label="Helpful" onClick={() => setVote("up")} className="p-1.5 rounded-md border cursor-pointer" style={{ borderColor: "var(--bg-border)", background: "var(--bg-surface)", color: vote === "up" ? "var(--ai-accent)" : "var(--text-muted)" }}>
                  <ThumbsUp className="w-3 h-3" aria-hidden="true" />
                </button>
                <button type="button" aria-label="Not helpful" onClick={() => setVote("down")} className="p-1.5 rounded-md border cursor-pointer" style={{ borderColor: "var(--bg-border)", background: "var(--bg-surface)", color: vote === "down" ? "var(--danger)" : "var(--text-muted)" }}>
                  <ThumbsDown className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
