"use client";

import { useState } from "react";
import { AIButton, AIBadge } from "@/components/ai";
import type { RCAMethod } from "@/store/capa.slice";
import { AiDraftModal, type DraftMode, type DraftPayload } from "@/components/search/AiDraftModal";

/**
 * Batch 2 — method-driven RCA inputs + (de)serialization.
 *
 * The structured data lives in ONE object (all method keys present so switching
 * method never loses the others' data). On save the modal stores this object as
 * a JSON string in `rcaDetail` AND a readable plain-text mirror in `rca` (which
 * is what readiness / rca-review / the RCA tab read — unchanged).
 */
export const FISHBONE_KEYS = ["People", "Process", "Equipment", "Materials", "Environment", "Measurement"] as const;
export type FishboneKey = (typeof FISHBONE_KEYS)[number];

export interface RcaDetail {
  whys?: string[];                      // "5 Why"
  buckets?: Partial<Record<FishboneKey, string>>; // "Fishbone"
  faultTree?: string;                   // "Fault Tree"
  text?: string;                        // "Other"
}

export function parseRcaDetail(json: string | undefined | null): RcaDetail {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as RcaDetail) : {};
  } catch {
    return {};
  }
}

/** Readable plain-text mirror for the `rca` column (per active method). */
export function rcaDetailToText(method: RCAMethod | undefined, d: RcaDetail): string {
  if (method === "5 Why") {
    return (d.whys ?? [])
      .map((w, i) => ({ w: (w ?? "").trim(), i }))
      .filter((x) => x.w.length > 0)
      .map((x) => `Why ${x.i + 1}: ${x.w}`)
      .join("\n");
  }
  if (method === "Fishbone") {
    return FISHBONE_KEYS
      .map((k) => ({ k, v: (d.buckets?.[k] ?? "").trim() }))
      .filter((x) => x.v.length > 0)
      .map((x) => `${x.k}: ${x.v}`)
      .join("\n");
  }
  if (method === "Fault Tree") return (d.faultTree ?? "").trim();
  if (method === "Other") return (d.text ?? "").trim();
  return "";
}

/** Whether the active method has the minimum required input. */
export function rcaDetailValid(method: RCAMethod | undefined, d: RcaDetail): boolean {
  if (method === "5 Why") return (d.whys?.[0] ?? "").trim().length > 0;
  if (method === "Fishbone") return FISHBONE_KEYS.some((k) => (d.buckets?.[k] ?? "").trim().length > 0);
  if (method === "Fault Tree") return (d.faultTree ?? "").trim().length > 0;
  if (method === "Other") return (d.text ?? "").trim().length > 0;
  return false;
}

const labelCls = "text-[11px] font-medium text-(--text-secondary) block mb-1";

export function RcaMethodFields({
  method,
  detail,
  onChange,
  disabled,
  draftContext,
  recordId,
}: {
  method: RCAMethod | undefined;
  detail: RcaDetail;
  onChange: (next: RcaDetail) => void;
  disabled?: boolean;
  /** Problem context for the AI Draft helper (e.g. title + description).
   *  When provided, an "AI Draft" button appears on the free-text methods. */
  draftContext?: string;
  recordId?: string;
}) {
  // Feature 5 — AI Draft Helper state (hooks must be unconditional, before
  // the per-method early returns below).
  const [draftOpen, setDraftOpen] = useState(false);
  const [aiAssisted, setAiAssisted] = useState(false);
  const canDraft = !!draftContext?.trim() && !disabled;

  const draftButton = canDraft ? (
    <AIButton size="xs" onClick={() => setDraftOpen(true)}>
      AI Draft
    </AIButton>
  ) : null;

  const aiMarker = aiAssisted ? (
    <p className="inline-flex items-center gap-1.5 mt-1">
      <AIBadge label="AI-assisted draft" />
      <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
        edited by you
      </span>
    </p>
  ) : null;

  /** Render the method-aware draft modal that applies its payload on insert. */
  const draftModal = (mode: DraftMode, apply: (p: DraftPayload) => void) => canDraft ? (
    <AiDraftModal
      open={draftOpen}
      onClose={() => setDraftOpen(false)}
      context={draftContext!}
      mode={mode}
      recordId={recordId ?? "-"}
      module="capa"
      onInsert={(p) => { apply(p); setAiAssisted(true); }}
    />
  ) : null;

  if (!method) {
    return <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Select an RCA method above to record the analysis.</p>;
  }

  if (method === "5 Why") {
    const whys = detail.whys ?? [];
    const setWhy = (i: number, val: string) => {
      const next = [...whys];
      while (next.length < 5) next.push("");
      next[i] = val;
      onChange({ ...detail, whys: next });
    };
    const applyWhys = (p: DraftPayload) => {
      const next = [...whys];
      while (next.length < 5) next.push("");
      (p.whys ?? []).slice(0, 5).forEach((w, i) => { next[i] = w; });
      onChange({ ...detail, whys: next });
    };
    return (
      <div className="space-y-2">
        {canDraft && <div className="flex justify-end">{draftButton}</div>}
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>
            <label htmlFor={`why-${i}`} className={labelCls}>
              Why {i + 1}{i === 0 && <span className="text-(--danger)"> *</span>}{i > 0 && <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}> (optional)</span>}
            </label>
            <input id={`why-${i}`} type="text" className="input text-[12px]" disabled={disabled}
              placeholder={i === 0 ? "Why did the problem occur?" : "…and why did that happen?"}
              value={whys[i] ?? ""} onChange={(e) => setWhy(i, e.target.value)} />
          </div>
        ))}
        {aiMarker}
        {draftModal("fiveWhy", applyWhys)}
      </div>
    );
  }

  if (method === "Fishbone") {
    const buckets = detail.buckets ?? {};
    const setBucket = (k: FishboneKey, val: string) => onChange({ ...detail, buckets: { ...buckets, [k]: val } });
    const applyBuckets = (p: DraftPayload) => onChange({ ...detail, buckets: { ...buckets, ...(p.buckets ?? {}) } });
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex items-center justify-between">
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Fill at least one category.</p>
          {draftButton}
        </div>
        {FISHBONE_KEYS.map((k) => (
          <div key={k}>
            <label htmlFor={`fb-${k}`} className={labelCls}>{k}</label>
            <input id={`fb-${k}`} type="text" className="input text-[12px]" disabled={disabled}
              value={buckets[k] ?? ""} onChange={(e) => setBucket(k, e.target.value)} />
          </div>
        ))}
        {aiMarker && <div className="col-span-2">{aiMarker}</div>}
        {draftModal("fishbone", applyBuckets)}
      </div>
    );
  }

  if (method === "Fault Tree") {
    const applyDraft = (p: DraftPayload) => {
      const t = (p.text ?? "").trim();
      if (!t) return;
      const base = (detail.faultTree ?? "").trim();
      onChange({ ...detail, faultTree: base ? `${base}\n\n${t}` : t });
    };
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="ft" className={labelCls + " mb-0"}>Top event + contributing factors<span className="text-(--danger)"> *</span></label>
          {draftButton}
        </div>
        <textarea id="ft" rows={5} className="input text-[12px] resize-none" disabled={disabled}
          placeholder="Top event: …&#10;Contributing factors:&#10;- …&#10;- …"
          value={detail.faultTree ?? ""} onChange={(e) => onChange({ ...detail, faultTree: e.target.value })} />
        {aiMarker}
        {draftModal("text", applyDraft)}
      </div>
    );
  }

  // Other
  const applyOther = (p: DraftPayload) => {
    const t = (p.text ?? "").trim();
    if (!t) return;
    const base = (detail.text ?? "").trim();
    onChange({ ...detail, text: base ? `${base}\n\n${t}` : t });
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor="rca-other" className={labelCls + " mb-0"}>Root cause analysis<span className="text-(--danger)"> *</span></label>
        {draftButton}
      </div>
      <textarea id="rca-other" rows={4} className="input text-[12px] resize-none" disabled={disabled}
        placeholder="Describe the root cause…"
        value={detail.text ?? ""} onChange={(e) => onChange({ ...detail, text: e.target.value })} />
      {aiMarker}
      {draftModal("text", applyOther)}
    </div>
  );
}
