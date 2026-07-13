"use client";

/**
 * Regulatory Intelligence — FDA/EMA guidance monitoring & change alerts.
 *
 * AGI agent surface for the `regulatory` toggle (Settings → AGI Policy).
 * CAN DO (AI-assisted): monitor FDA/EMA guidance updates, flag new
 * requirements, suggest compliance alignment, alert on changes.
 * CANNOT DO (human only): interpret requirements, make compliance
 * determinations, replace Regulatory Affairs expertise — every card carries
 * the advisory disclaimer and the agent never acts on its own.
 *
 * Data flows through the AI gateway getRegulatoryIntelligence() (mocked now;
 * flip MOCK_AI_RESPONSES + implement the real fetch to connect a live feed —
 * the return shape stays identical, so this UI needs no changes).
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Info,
  FileText,
  Sparkles,
  Radar,
  ShieldAlert,
  Landmark,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import {
  getRegulatoryIntelligence,
  type RegulatoryGuidanceUpdate,
} from "@/lib/ai";
import { useAppSelector } from "@/hooks/useAppSelector";
import { StatCard, CardSection } from "@/components/shared";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { IMPACT_BADGE, IMPACT_LABEL, SOURCE_COLOR } from "./_shared";

const MONITORED_SOURCES = ["FDA", "EMA", "ICH", "MHRA"] as const;

export function RegulatoryIntelligencePage() {
  const router = useRouter();
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.regulatory);
  const agentActive = agiMode !== "manual" && agiAgent;

  const [updates, setUpdates] = useState<RegulatoryGuidanceUpdate[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Acknowledged ids — "Mark reviewed" is a local, advisory action (no
  // determination is recorded). A real backend would persist this per user.
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRegulatoryIntelligence();
      setUpdates(result.updates);
      setScannedAt(result.scannedAt);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-scan on first mount when the agent is active.
  useEffect(() => {
    if (agentActive) scan();
  }, [agentActive, scan]);

  /* ── Agent disabled state ── */
  if (!agentActive) {
    return (
        <PageLayout
          title="Regulatory Intelligence"
          titleIcon={Landmark}
          description="FDA/EMA guidance monitoring and change alerts for your active frameworks."
        >
        <div className="card">
          <div className="card-body flex flex-col items-center text-center py-10 gap-3">
            <Radar className="w-10 h-10" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
              Regulatory Intelligence agent is off
            </p>
            <p className="text-[12px] max-w-sm" style={{ color: "var(--text-secondary)" }}>
              Enable the Regulatory Intelligence agent (or switch AGI out of
              manual mode) to monitor FDA/EMA guidance and receive change
              alerts.
            </p>
            <Button variant="secondary" size="sm" onClick={() => router.push("/settings")}>
              Configure in Settings → AGI Policy
            </Button>
          </div>
        </div>
        </PageLayout>
    );
  }

  /* ── Derived counts ── */
  const newRequirements = updates.filter((u) => u.isNewRequirement).length;
  const highImpact = updates.filter((u) => u.impact === "high").length;

  return (
      <PageLayout
        title="Regulatory Intelligence"
        titleIcon={Landmark}
        description="FDA/EMA guidance monitoring and change alerts for your active frameworks."
        actions={[{ label: loading ? "Scanning…" : "Scan for updates", variant: "secondary", icon: RefreshCw, onClick: scan, disabled: loading }]}
      >
        <div className="space-y-5">

      {/* AI advisory banner — agent is assistive, RA interprets. */}
      <div
        className="flex items-start gap-2 p-3 rounded-lg border"
        style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}
        role="note"
      >
        <Bot className="w-4 h-4 mt-0.5 shrink-0 text-[#6366f1]" aria-hidden="true" />
        <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          AI-monitored guidance summaries. The agent flags changes and suggests
          alignment — it does <strong>not</strong> interpret requirements or make
          compliance determinations. Regulatory Affairs must review and decide.
          {scannedAt && (
            <>
              {" "}
              <span style={{ color: "var(--text-muted)" }}>
                Last scan {dayjs(scannedAt).format("DD MMM YYYY, HH:mm")}.
              </span>
            </>
          )}
        </p>
      </div>

      {/* Stat cards */}
      <section
        aria-label="Regulatory intelligence summary"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <StatCard icon={FileText} color="#0ea5e9" label="Guidance updates" value={String(updates.length)} sub="Monitored this period" />
        <StatCard icon={ShieldAlert} color={newRequirements > 0 ? "#ef4444" : "#10b981"} label="New requirements" value={String(newRequirements)} sub={newRequirements > 0 ? "Flagged for review" : "None flagged"} />
        <StatCard icon={AlertTriangle} color={highImpact > 0 ? "#f59e0b" : "#10b981"} label="High impact" value={String(highImpact)} sub="High-impact changes" />
        <StatCard icon={Radar} color="#6366f1" label="Sources monitored" value={String(MONITORED_SOURCES.length)} sub={MONITORED_SOURCES.join(" · ")} />
      </section>

      {/* Updates list */}
      <CardSection icon={Radar} iconColor="#6366f1" title="Guidance updates & change alerts">
        {loading && updates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3" role="status" aria-live="polite">
            <div className="w-8 h-8 rounded-full border-2 border-[#6366f1] border-t-transparent animate-spin" aria-hidden="true" />
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Scanning FDA/EMA agency feeds…
            </p>
          </div>
        ) : updates.length === 0 ? (
          <p className="text-[12px] italic py-4" style={{ color: "var(--text-muted)" }}>
            No guidance updates found. Use Scan for updates to check the agency feeds.
          </p>
        ) : (
          <ul className="list-none p-0 m-0 space-y-3">
            {updates.map((u) => {
              const isAck = acknowledged.has(u.id);
              return (
                <li
                  key={u.id}
                  className="rounded-2xl border p-4"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--bg-border)",
                    opacity: isAck ? 0.7 : 1,
                  }}
                >
                  {/* Top row — source + badges */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                        style={{ background: SOURCE_COLOR[u.source] }}
                      >
                        {u.source}
                      </span>
                      <Badge variant={IMPACT_BADGE[u.impact]}>{IMPACT_LABEL[u.impact]}</Badge>
                      <Badge variant="gray">{u.changeType}</Badge>
                      {u.isNewRequirement && <Badge variant="purple">New requirement</Badge>}
                    </div>
                    {isAck ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#10b981]">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Reviewed
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={CheckCircle2}
                        onClick={() =>
                          setAcknowledged((prev) => new Set(prev).add(u.id))
                        }
                        aria-label={`Mark ${u.docRef} reviewed`}
                      >
                        Mark reviewed
                      </Button>
                    )}
                  </div>

                  {/* Title + meta */}
                  <p className="text-[13px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
                    {u.title}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    <span className="font-mono">{u.docRef}</span> &middot; {u.category} &middot;{" "}
                    Published {dayjs(u.publishedDate).format("DD MMM YYYY")}
                  </p>

                  {/* Summary */}
                  <p className="text-[12px] leading-relaxed mt-2" style={{ color: "var(--text-secondary)" }}>
                    {u.summary}
                  </p>

                  {/* Suggested alignment */}
                  <div
                    className="mt-3 flex items-start gap-2 p-2.5 rounded-lg"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#6366f1]" aria-hidden="true" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>
                        Suggested alignment
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {u.suggestedAlignment}
                      </p>
                    </div>
                  </div>

                  {/* Affected areas */}
                  {u.affectedAreas.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Info className="w-3 h-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Affected areas:
                      </span>
                      {u.affectedAreas.map((a) => (
                        <span
                          key={a}
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardSection>
        </div>
      </PageLayout>
  );
}
