"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flag, ArrowRight } from "lucide-react";
import { loadSourceRisk, type SourceRisk } from "@/actions/risk-conversion";
import type { RiskConvertTarget } from "@/constants/riskConversion";

/**
 * "⚑ Raised from RISK-… [view →]" — the REVERSE half of the risk-conversion link,
 * rendered on the detail surface of the Gap / Deviation / CAPA that a risk became.
 *
 * Self-loading on purpose. Gap findings and deviations render their detail from a
 * Redux-seeded slice rather than a per-record server fetch, so threading
 * `raisedFromRiskId` through those adapters would mean touching three unrelated
 * data paths. One small server action keeps all three mount points identical.
 *
 * Renders NOTHING when the record was not raised from a risk (the overwhelmingly
 * common case), so it costs one cheap query and no layout on ordinary records.
 */
export function RaisedFromRiskBanner({ target, recordId }: { target: RiskConvertTarget; recordId: string }) {
  const [risk, setRisk] = useState<SourceRisk | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRisk(null);
    void (async () => {
      try {
        const r = await loadSourceRisk(target, recordId);
        if (!cancelled) setRisk(r);
      } catch {
        /* provenance is decoration — never break the detail view over it */
      }
    })();
    return () => { cancelled = true; };
  }, [target, recordId]);

  if (!risk) return null;

  return (
    <div
      className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2"
      style={{ background: "var(--info-bg, var(--bg-surface))", border: "1px solid var(--bg-border)" }}
    >
      <Flag className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        Raised from risk{" "}
        <strong style={{ color: "var(--text-primary)" }}>{risk.reference ?? risk.id.slice(0, 8)}</strong>
        {" — "}
        {risk.title}
      </p>
      <Link
        href={risk.href}
        className="inline-flex items-center gap-1 text-[12px] font-semibold hover:underline ml-auto"
        style={{ color: "var(--brand)" }}
      >
        view <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
