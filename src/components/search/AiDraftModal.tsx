"use client";

/**
 * Feature 5 — CAPA / Root-Cause Draft Helper.
 *
 * A pop-up modal that drafts hard-to-write RCA content for the author to
 * react to. Method-aware:
 *   • "text"     → one editable paragraph (Fault Tree / Other / CAPA desc)
 *   • "fiveWhy"  → up to 5 editable Why steps
 *   • "fishbone" → editable cause per category
 * Editable in the modal, with a Formal/Concise tone toggle, Regenerate, and
 * the firm "AI cannot approve" disclaimer. On "Insert into form" the content
 * is handed back to the host field(s); the human then edits and signs. The AI
 * never approves or signs.
 */

import { useEffect, useState } from "react";
import { Sparkles, RotateCcw, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAppSelector } from "@/hooks/useAppSelector";
import { aiDraftSend, AiChatError, type DraftKind, type DraftResponse } from "@/lib/aiChat";
import { friendlyAiError } from "@/lib/friendlyError";

type Tone = "formal" | "concise";
export type DraftMode = "text" | "fiveWhy" | "fishbone";

export interface DraftPayload {
  text?: string;
  whys?: string[];
  buckets?: Record<string, string>;
}

const FISHBONE_KEYS = ["People", "Process", "Equipment", "Materials", "Environment", "Measurement"] as const;

const MODE_KIND: Record<DraftMode, DraftKind> = {
  text: "rca",
  fiveWhy: "rca_5why",
  fishbone: "rca_fishbone",
};

interface Props {
  open: boolean;
  onClose: () => void;
  context: string;
  mode?: DraftMode;
  recordId?: string;
  module?: string;
  onInsert: (payload: DraftPayload) => void;
}

export function AiDraftModal({ open, onClose, context, mode = "text", recordId = "-", module = "-", onInsert }: Props) {
  const aiToken = useAppSelector((s) => {
    const u = s.auth.user;
    if (!u) return "anonymous";
    if (u.aiAccessToken) return u.aiAccessToken;
    const tenant = s.auth.tenants.find((t) => t.id === u.tenantId);
    return tenant?.config?.users?.find((x) => x.id === u.id)?.aiAccessToken ?? "anonymous";
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone>("formal");
  const [result, setResult] = useState<DraftResponse | null>(null);
  // Editable buffers per mode.
  const [text, setText] = useState("");
  const [whys, setWhys] = useState<string[]>([]);
  const [buckets, setBuckets] = useState<Record<string, string>>({});

  async function generate(nextTone: Tone) {
    setBusy(true);
    setError(null);
    try {
      const res = await aiDraftSend(context, { kind: MODE_KIND[mode], tone: nextTone, recordId, module }, aiToken);
      setResult(res);
      if (res.status !== "drafted") { setError("Couldn't produce a draft. Please try again."); return; }
      if (mode === "text") setText(res.draft);
      else if (mode === "fiveWhy") setWhys(res.whys ?? []);
      else setBuckets(res.buckets ?? {});
    } catch (e) {
      console.error("[ai-draft] failed", e);
      if (e instanceof AiChatError && e.status === 503) setError("The draft helper is unavailable right now. Please try again shortly.");
      else setError(friendlyAiError(e, "Couldn't produce a draft. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (open) {
      setText(""); setWhys([]); setBuckets({}); setResult(null); setError(null); setTone("formal");
      void generate("formal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pickTone(t: Tone) { setTone(t); void generate(t); }

  function handleInsert() {
    if (mode === "text") onInsert({ text: text.trim() });
    else if (mode === "fiveWhy") onInsert({ whys: whys.map((w) => w.trim()).filter(Boolean) });
    else onInsert({ buckets });
    onClose();
  }

  const hasContent =
    mode === "text" ? !!text.trim() :
    mode === "fiveWhy" ? whys.some((w) => w.trim()) :
    Object.values(buckets).some((v) => v.trim());

  const toggleStyle = (active: boolean) =>
    active ? { background: "var(--brand)", color: "#fff" } : { background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" };

  const inputCls = "input text-[12px] w-full";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI Draft Helper"
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <Button variant="secondary" size="sm" icon={RotateCcw} disabled={busy} onClick={() => generate(tone)}>Regenerate</Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={busy || !hasContent} onClick={handleInsert}>Insert into form</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: "var(--brand)" }}>
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Suggested draft (editable)
        </p>

        {busy && <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Drafting…</p>}
        {error && <p role="alert" className="text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}

        {!busy && result?.status === "drafted" && (
          <>
            {mode === "text" && (
              <textarea rows={6} className="input text-[13px] w-full resize-none leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} aria-label="Editable AI draft" />
            )}

            {mode === "fiveWhy" && (
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i}>
                    <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Why {i + 1}</label>
                    <input type="text" className={inputCls} value={whys[i] ?? ""} onChange={(e) => setWhys((prev) => { const n = [...prev]; while (n.length < 5) n.push(""); n[i] = e.target.value; return n; })} />
                  </div>
                ))}
              </div>
            )}

            {mode === "fishbone" && (
              <div className="grid grid-cols-2 gap-3">
                {FISHBONE_KEYS.map((k) => (
                  <div key={k}>
                    <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>{k}</label>
                    <input type="text" className={inputCls} value={buckets[k] ?? ""} onChange={(e) => setBuckets((prev) => ({ ...prev, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}

            {/* Tone toggle */}
            <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
              <button type="button" onClick={() => pickTone("formal")} className="px-3 py-1 text-[11px] font-medium border-0 cursor-pointer" style={toggleStyle(tone === "formal")}>Formal</button>
              <button type="button" onClick={() => pickTone("concise")} className="px-3 py-1 text-[11px] font-medium border-0 cursor-pointer" style={toggleStyle(tone === "concise")}>Concise</button>
            </div>

            {/* Firm "AI cannot approve" disclaimer */}
            <div className="flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11px]" style={{ background: "#fef3c7", color: "#92400e" }}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{result.disclaimer}</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
