"use client";

/**
 * Regulatory AI Assistant — focused overlay launched from the "Ask Regulatory
 * AI" button on Settings → Frameworks.
 *
 * Why an overlay (not a sidebar module): Regulatory Intelligence is reference
 * work, not a daily workflow. Surfacing it as a button on the Frameworks page —
 * exactly where a user is already thinking about FDA/EMA/ICH/MHRA rules — keeps
 * the navigation lean and gives the AI its context for free (the frameworks in
 * view, the org region, the user's role). When open, the overlay docks right at
 * full height over a dimmed + blurred backdrop, so the sidebar and page recede
 * and the conversation is the only thing in focus.
 *
 * UI states: idle (context + suggestions) → loading → answering → error.
 * The assistant is advisory: it summarises and cites clauses, it never makes a
 * compliance determination (Regulatory Affairs decides).
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Sparkles,
  X,
  Send,
  FileText,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Globe,
  UserRound,
  Layers,
} from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useRole } from "@/hooks/useRole";
import { roleLabel } from "@/lib/labels/roles";
import {
  askRegulatoryAI,
  type RegulatoryAIAnswer,
  type RegulatoryAIConfidence,
} from "@/lib/ai/regulatoryAssistant";

/** Framework key → display label, mirroring Settings → Frameworks. */

// Centered-modal dimensions. Width/height are capped but shrink to fit small
// viewports (the min()/calc in the style), and the body scrolls inside.
const MODAL_WIDTH = 640;
const MODAL_HEIGHT = 720;
const MODAL_MARGIN = 16;

type UiState = "idle" | "loading" | "answering" | "error";

interface QA {
  question: string;
  answer: RegulatoryAIAnswer;
  /** True for the briefing auto-generated on open (no user-typed question). */
  auto?: boolean;
}

/** Question auto-asked when the assistant opens, so answers show immediately. */
const OPENING_BRIEFING =
  "Give me a concise regulatory briefing for my active frameworks and region: " +
  "the key obligations to keep in mind, and anything notable or new in recent " +
  "FDA / EMA / ICH / MHRA guidance. Keep it short and practical.";

export function RegulatoryAIAssistant({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // ── Context (grounds every answer) ──
  const { org } = useTenantConfig();
  const region = org?.regulatoryRegion || "your region";
  const { role } = useRole();
  const roleText = roleLabel(role);
  // Effective enabled frameworks for this tenant (server-resolved, non-persisted).
  // The slice carries each framework's catalog name, used as the AI-context label.
  const frameworkList = useAppSelector((s) => s.frameworks.list);
  const activeFrameworks = frameworkList.map((f) => ({ key: f.key, label: f.name }));

  // AI backend token — same resolution the floating Compliance Assistant uses.
  // The backend is permissive, so we fall back to "anonymous" rather than
  // blocking the user when no per-user token is cached.
  const aiToken = useAppSelector((s) => {
    const u = s.auth.user;
    if (!u) return "anonymous";
    if (u.aiAccessToken) return u.aiAccessToken;
    const tenant = s.auth.tenants.find((t) => t.id === u.tenantId);
    return tenant?.config?.users?.find((x) => x.id === u.id)?.aiAccessToken ?? "anonymous";
  });

  const [uiState, setUiState] = useState<UiState>("idle");
  const [input, setInput] = useState("");
  const [thread, setThread] = useState<QA[]>([]);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Suggested prompts — bias toward the user's active frameworks so the
  // empty state is immediately relevant, with sensible fallbacks.
  const suggestions = buildSuggestions(activeFrameworks.map((f) => f.label));

  // Focus the ask box and bind Escape-to-close while open (modal convention).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Pin the conversation to the bottom — called on new turns and on every
  // streaming tick so the caret stays visible as the answer types out.
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Keep the latest answer in view when a turn is added or state changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, uiState]);

  async function ask(question: string, opts?: { auto?: boolean }) {
    const q = question.trim();
    if (!q || uiState === "loading") return;
    setError(null);
    setInput("");
    setUiState("loading");
    try {
      // Flatten prior turns into chat history so the live model has context.
      const history = thread.flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer.answer },
      ]);
      const answer = await askRegulatoryAI(q, {
        region,
        roleLabel: roleText,
        activeFrameworks,
        token: aiToken,
        history,
      });
      setThread((t) => [...t, { question: q, answer, auto: opts?.auto }]);
      setUiState("answering");
    } catch (e) {
      console.error("[regulatory-ai] ask failed", e);
      setError("The assistant couldn't answer just now. Please try again.");
      setUiState("error");
    }
  }

  // Auto-brief on open: the moment the assistant opens with an empty thread,
  // it generates a regulatory briefing itself — so the user immediately sees
  // AI responses instead of a blank "ask me" screen. Fires once per open; a
  // reopen with an existing conversation just shows it (no re-fetch), and
  // "New question" (reset) lets it brief again.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      autoStartedRef.current = false;
      return;
    }
    if (autoStartedRef.current) return;
    if (thread.length > 0 || uiState === "loading") return;
    autoStartedRef.current = true;
    void ask(OPENING_BRIEFING, { auto: true });
    // ask is intentionally not a dep — we trigger only on open/empty state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, thread.length, uiState]);

  function reset() {
    setThread([]);
    setError(null);
    setUiState("idle");
    // Allow the auto-briefing to run again for the fresh session.
    autoStartedRef.current = false;
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes reg-ai-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes reg-ai-panel-in {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes reg-ai-msg-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes reg-ai-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%           { transform: scale(1);   opacity: 1; }
        }
        @keyframes reg-ai-caret { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .reg-ai-msg { animation: reg-ai-msg-in 0.22s ease both; }
        .reg-ai-detail { animation: reg-ai-msg-in 0.3s ease both; }
        .reg-ai-caret {
          display: inline-block; width: 2px; height: 1em; margin-left: 1px;
          background: var(--brand); vertical-align: text-bottom;
          animation: reg-ai-caret 0.9s step-end infinite;
        }
        .reg-ai-dot {
          display: inline-block; width: 6px; height: 6px; border-radius: 50%;
          background: var(--text-muted); animation: reg-ai-dot 1.2s infinite ease-in-out;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-reg-ai-backdrop], [data-reg-ai-panel],
          .reg-ai-msg, .reg-ai-detail, .reg-ai-dot, .reg-ai-caret { animation: none !important; }
        }
      `}</style>

      {/* Dimmed + blurred backdrop, doubling as the centering container for the
          modal. Above the app/sidebar (z-999) so the page recedes and becomes
          non-interactive while the assistant is the active surface. Clicking the
          scrim (outside the dialog) closes it (standard modal behaviour). */}
      <div
        data-reg-ai-backdrop
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: MODAL_MARGIN,
          background: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          animation: "reg-ai-backdrop-in 0.2s ease",
        }}
      >
        <section
          data-reg-ai-panel
          role="dialog"
          aria-modal="true"
          aria-label="Regulatory AI Assistant"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: `min(${MODAL_WIDTH}px, 100%)`,
            height: `min(${MODAL_HEIGHT}px, calc(100vh - ${MODAL_MARGIN * 2}px))`,
            zIndex: 1000,
            animation: "reg-ai-panel-in 0.24s cubic-bezier(0.16, 1, 0.3, 1)",
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius-card)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
        {/* ── Header ── */}
        <header
          className="flex items-center justify-between gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--card-border)", background: "var(--bg-elevated)" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center rounded-lg shrink-0"
              style={{ width: 32, height: 32, background: "var(--brand)", color: "#fff" }}
            >
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--card-text)" }}>
                Regulatory AI Assistant
              </p>
              <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
                Grounded in your frameworks · advisory only
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {thread.length > 0 && (
              <button
                type="button"
                aria-label="New question"
                title="Start over"
                onClick={reset}
                className="p-1.5 rounded-md transition-colors bg-transparent border-0 cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              aria-label="Close assistant"
              title="Close (Esc)"
              onClick={onClose}
              className="p-1.5 rounded-md transition-colors bg-transparent border-0 cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-4.5 h-4.5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* ── Context bar — what the AI knows ── */}
        <div
          className="flex items-center gap-2 flex-wrap px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--card-border)", background: "var(--bg-base)" }}
        >
          <ContextChip icon={Globe} label="Region" value={org?.regulatoryRegion || "Not set"} />
          <ContextChip icon={UserRound} label="Role" value={roleText} />
          <ContextChip
            icon={Layers}
            label="Frameworks"
            value={
              activeFrameworks.length > 0
                ? `${activeFrameworks.length} active`
                : "none active"
            }
          />
        </div>

        {/* ── Body ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: "var(--bg-base)" }}>
          {/* Idle / empty state */}
          {thread.length === 0 && uiState !== "loading" && (
            <div className="space-y-4">
              <div
                className="flex items-start gap-2.5 rounded-2xl p-3"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
              >
                <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-[#6366f1]" aria-hidden="true" />
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Ask about the regulations behind your frameworks — audit trails,
                  e-signatures, validation stages, data integrity, or what guidance
                  is new this period. Answers are scoped to <strong>{region}</strong> and
                  your active frameworks.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>
                  Try asking
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-[12px] transition-colors cursor-pointer"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
                  >
                    <span className="truncate">{s}</span>
                    <Send className="w-3 h-3 shrink-0" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Answered turns — chat style: user bubble, then the assistant
              replies with an avatar + a bubble whose text streams in. */}
          {thread.map((qa, i) => (
            <div key={i} className="space-y-3">
              {/* The auto-briefing has no user-typed question, so we show a
                  caption instead of a user bubble. Typed turns show the
                  right-aligned user bubble as usual. */}
              {qa.auto ? (
                <div className="flex items-center gap-1.5 reg-ai-msg">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-[#6366f1]" aria-hidden="true" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>
                    Regulatory briefing
                  </span>
                </div>
              ) : (
                <div className="flex justify-end reg-ai-msg">
                  <div
                    className="max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-[12px]"
                    style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}
                  >
                    {qa.question}
                  </div>
                </div>
              )}
              {/* Assistant message — avatar + streaming bubble */}
              <div className="flex items-start gap-2 reg-ai-msg">
                <AiAvatar />
                <div className="flex-1 min-w-0">
                  <AssistantBubble answer={qa.answer} onStream={scrollToBottom} />
                </div>
              </div>
            </div>
          ))}

          {/* Loading state — assistant "typing…" bubble */}
          {uiState === "loading" && (
            <div className="flex items-start gap-2 reg-ai-msg" role="status" aria-live="polite">
              <AiAvatar />
              <div
                className="inline-flex items-center gap-2.5 rounded-2xl rounded-tl-sm px-3.5 py-3"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
              >
                <span className="inline-flex items-center gap-1" aria-hidden="true">
                  <span className="reg-ai-dot" style={{ animationDelay: "0ms" }} />
                  <span className="reg-ai-dot" style={{ animationDelay: "180ms" }} />
                  <span className="reg-ai-dot" style={{ animationDelay: "360ms" }} />
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Reviewing your frameworks…
                </span>
              </div>
            </div>
          )}

          {/* Error state */}
          {uiState === "error" && error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl px-3 py-2.5"
              style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
              <div className="text-[12px]" style={{ color: "var(--danger)" }}>
                {error}
                <button
                  type="button"
                  onClick={() => thread.length === 0 && setUiState("idle")}
                  className="ml-1 underline cursor-pointer bg-transparent border-0 p-0"
                  style={{ color: "var(--danger)" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Ask box ── */}
        <div
          className="flex items-center gap-2 p-3"
          style={{ borderTop: "1px solid var(--card-border)", background: "var(--bg-elevated)" }}
        >
          <input
            ref={inputRef}
            type="text"
            className="input text-[13px] flex-1"
            placeholder={uiState === "loading" ? "Thinking…" : "Ask Regulatory AI…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            disabled={uiState === "loading"}
            aria-label="Ask a regulatory question"
          />
          <button
            type="button"
            aria-label="Send question"
            onClick={() => ask(input)}
            disabled={uiState === "loading" || !input.trim()}
            className="p-2.5 rounded-lg transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--brand)", color: "#fff" }}
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        </section>
      </div>
    </>
  );
}

/* ── Chat assistant message ────────────────────────────────────── */

/** Small AI avatar shown beside every assistant reply (chat convention). */
function AiAvatar() {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 inline-flex items-center justify-center rounded-lg mt-0.5"
      style={{ width: 26, height: 26, background: "var(--brand)", color: "#fff" }}
    >
      <Sparkles className="w-3.5 h-3.5" />
    </span>
  );
}

/**
 * The assistant's reply, rendered as a chat bubble. The lead answer TYPES
 * itself out (typewriter), then the supporting detail — bullets, sources,
 * confidence, disclaimer — fades in. This is what makes it read like an AI
 * assistant talking, not a static results card. Reduced-motion users get the
 * full text immediately.
 */
function AssistantBubble({
  answer,
  onStream,
}: {
  answer: RegulatoryAIAnswer;
  onStream?: () => void;
}) {
  const full = answer.answer;
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !full) {
      setShown(full);
      setDone(true);
      return;
    }
    setShown("");
    setDone(false);
    let i = 0;
    // ~2-3 chars per tick so even a long answer finishes in ~1.5s.
    const step = Math.max(2, Math.round(full.length / 70));
    const id = window.setInterval(() => {
      i += step;
      if (i >= full.length) {
        setShown(full);
        setDone(true);
        onStream?.();
        window.clearInterval(id);
      } else {
        setShown(full.slice(0, i));
        onStream?.();
      }
    }, 22);
    return () => window.clearInterval(id);
    // Run once per answer instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  return (
    <div
      className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 space-y-3 max-w-[92%]"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
    >
      {/* Streaming lead answer (preserves the model's own line breaks) */}
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
        {shown}
        {!done && <span className="reg-ai-caret" aria-hidden="true" />}
      </p>

      {/* Supporting detail — revealed once the lead finishes typing */}
      {done && (
        <div className="reg-ai-detail space-y-3">
          {/* Live indicator (real model) or confidence band (local fallback) */}
          <div className="flex items-center gap-2 flex-wrap">
            {answer.source === "live" ? (
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#dcfce7", color: "#15803d" }}
                title="Answered live by the AI model"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#16a34a" }} aria-hidden="true" />
                LIVE AI
              </span>
            ) : (
              <span style={bandStyle(answer.confidence)}>{answer.confidence} confidence</span>
            )}
            {answer.relatedFrameworks.map((f) => (
              <span
                key={f}
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }}
              >
                {f}
              </span>
            ))}
          </div>

          {/* Supporting points */}
          {answer.bullets.length > 0 && (
            <ul className="space-y-1.5">
              {answer.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: "var(--brand)" }} aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Sources */}
          {answer.sources.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                Sources
              </p>
              <ul className="space-y-1">
                {answer.sources.map((s) => (
                  <li key={s.ref} className="flex items-start gap-1.5 text-[11px]">
                    <FileText className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "var(--brand)" }} aria-hidden="true" />
                    <span style={{ color: "var(--text-secondary)" }}>
                      <span className="font-mono" style={{ color: "var(--brand)" }}>{s.ref}</span> — {s.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Advisory disclaimer */}
          <div className="flex items-start gap-1.5 pt-2.5" style={{ borderTop: "1px dashed var(--bg-border)" }}>
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[10.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
              {answer.disclaimer}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Small pieces ──────────────────────────────────────────────── */

function ContextChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px]"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
      title={`${label}: ${value}`}
    >
      <Icon className="w-3 h-3 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
      <span style={{ color: "var(--text-muted)" }}>{label}:</span>
      <span className="font-medium truncate max-w-[120px]" style={{ color: "var(--text-primary)" }}>
        {value}
      </span>
    </span>
  );
}

function bandStyle(band: RegulatoryAIConfidence): CSSProperties {
  const map: Record<RegulatoryAIConfidence, [string, string]> = {
    HIGH: ["#dcfce7", "#15803d"],
    MEDIUM: ["#fef3c7", "#b45309"],
    LOW: ["#fee2e2", "#b91c1c"],
  };
  const [bg, fg] = map[band];
  return {
    background: bg,
    color: fg,
    padding: "1px 8px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.02em",
  };
}

/** Framework-aware suggestion list with stable fallbacks. */
function buildSuggestions(activeLabels: string[]): string[] {
  const out: string[] = [];
  const has = (frag: string) => activeLabels.some((l) => l.toLowerCase().includes(frag));
  if (has("part 11")) out.push("How do e-signatures need to work under Part 11?");
  if (has("annex 11")) out.push("What are the audit-trail requirements for Annex 11?");
  if (has("annex 15")) out.push("Walk me through the IQ/OQ/PQ qualification stages.");
  if (has("gamp")) out.push("How does GAMP 5 decide validation depth by category?");
  if (has("q9")) out.push("What does ICH Q9 expect for quality risk management?");
  if (has("mhra")) out.push("What is ALCOA+ and how do I evidence it?");
  // Always-useful fallbacks to reach 3.
  for (const s of [
    "What's new in FDA/EMA guidance this period?",
    "What are the audit-trail requirements?",
    "Which frameworks apply to my region?",
  ]) {
    if (out.length >= 3) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, 3);
}
