"use client";

import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, ArrowRight } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { GxPSystem, RTMEntry } from "@/types/csv-csa";
import { Badge } from "@/components/ui/Badge";

type Tone = "ok" | "warn" | "bad";

const TONE_ICON = {
  ok: <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" aria-hidden="true" />,
  warn: <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" aria-hidden="true" />,
  bad: <XCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" />,
} as const;

export interface InspectionReadinessCardProps {
  system: GxPSystem;
  rtmEntries: RTMEntry[];
  timezone: string;
  dateFormat: string;
  onNavigateTab: (tab: "lifecycle" | "rtm" | "compliance") => void;
}

export function InspectionReadinessCard({ system, rtmEntries, timezone, dateFormat, onNavigateTab }: InspectionReadinessCardProps) {
  const stages = system.validationStages ?? [];
  const docCount = stages.reduce((n, s) => n + (s.documents?.length ?? 0), 0);

  // Q1 — validated?
  const q1Tone: Tone = system.validationStatus === "Validated" ? "ok"
    : system.validationStatus === "Overdue" || system.validationStatus === "Validation Failed" ? "bad" : "warn";

  // Q3 — RTM coverage
  const rtmTotal = rtmEntries.length;
  const rtmComplete = rtmEntries.filter((r) => r.traceabilityStatus === "complete").length;
  const coverage = rtmTotal > 0 ? Math.round((rtmComplete / rtmTotal) * 100) : 0;
  const q3Tone: Tone = rtmTotal === 0 ? "bad" : coverage === 100 ? "ok" : "warn";

  // Q4 — findings
  const openFindings = (system.findings ?? []).filter((f) => f.status.toLowerCase() !== "closed");
  const latestCapa = (system.capas ?? [])[0];
  const q4Tone: Tone = openFindings.length === 0 ? "ok" : "warn";

  // Q5 — next review
  const overdue = !!system.nextReview && dayjs.utc(system.nextReview).isBefore(dayjs());
  const daysLeft = system.nextReview ? dayjs.utc(system.nextReview).diff(dayjs(), "day") : null;
  const q5Tone: Tone = !system.nextReview ? "warn" : overdue ? "bad" : "ok";

  const rows: { tone: Tone; q: string; a: React.ReactNode; cta?: { label: string; go: () => void } }[] = [
    {
      tone: q1Tone,
      q: "Is this system validated?",
      a: <>Status is <strong>{system.validationStatus}</strong> ({system.statusManuallySet ? "manually attested" : "auto-derived from stages"}).</>,
      cta: { label: "View lifecycle", go: () => onNavigateTab("lifecycle") },
    },
    {
      tone: docCount > 0 ? "ok" : "warn",
      q: "What's the validation evidence?",
      a: (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          {docCount} document{docCount === 1 ? "" : "s"} across stages
          <Badge variant={system.part11Status === "Compliant" ? "green" : "gray"}>P11: {system.part11Status}</Badge>
          <Badge variant={system.annex11Status === "Compliant" ? "green" : "gray"}>Annex 11: {system.annex11Status}</Badge>
        </span>
      ),
      cta: { label: "View evidence", go: () => onNavigateTab("lifecycle") },
    },
    {
      tone: q3Tone,
      q: "How traceable are requirements?",
      a: rtmTotal === 0 ? <>No RTM requirements captured yet.</> : <><strong>{coverage}%</strong> traced — {rtmComplete}/{rtmTotal} complete.</>,
      cta: { label: "View RTM", go: () => onNavigateTab("rtm") },
    },
    {
      tone: q4Tone,
      q: "Findings against this system?",
      a: openFindings.length === 0
        ? <>No open findings.{latestCapa ? <> Latest CAPA: <strong>{latestCapa.reference ?? latestCapa.id.slice(0, 8)}</strong>.</> : null}</>
        : <><strong>{openFindings.length}</strong> open finding{openFindings.length === 1 ? "" : "s"}.{latestCapa ? <> Latest CAPA: {latestCapa.reference ?? latestCapa.id.slice(0, 8)}.</> : null}</>,
      cta: { label: "View compliance", go: () => onNavigateTab("compliance") },
    },
    {
      tone: q5Tone,
      q: "When's the next review?",
      a: !system.nextReview ? <>Not scheduled.</>
        : overdue ? <><strong>Overdue</strong> ({dayjs.utc(system.nextReview).tz(timezone).format(dateFormat)}).</>
        : <>{dayjs.utc(system.nextReview).tz(timezone).format(dateFormat)} — {daysLeft} day{daysLeft === 1 ? "" : "s"} remaining.</>,
    },
  ];

  return (
    <div className="card">
      <div className="card-header"><div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" /><span className="card-title">Inspection readiness</span></div></div>
      <div className="card-body space-y-2.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-2.5 text-[12px]">
            {TONE_ICON[r.tone]}
            <div className="flex-1 min-w-0">
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{r.q}</p>
              <p style={{ color: "var(--text-secondary)" }}>{r.a}</p>
            </div>
            {r.cta && (
              <button type="button" onClick={r.cta.go} className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer">
                {r.cta.label} <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
