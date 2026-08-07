"use client";

/**
 * Drift Detection — AGI monitoring for CSV/CSA Validation.
 *
 * Continuous monitoring of validated systems. CAN DO (AI-assisted): monitor
 * configuration changes, detect access-control changes, flag audit-trail
 * coverage drops, alert on system changes. CANNOT DO (human only): change
 * configurations, restore access controls, make IT security decisions — so
 * this surface is read-only alerting; a human investigates and acts.
 *
 * Alerts flow through the AI gateway getDriftDetection() (mocked now). Flip
 * MOCK_AI_RESPONSES + stream from a real config/access/audit monitor to
 * connect a live agent — the DriftAlert return shape stays identical.
 *
 * Surface: the drift state lives in the `useDriftDetection` hook so the CSV/CSA
 * page can drive BOTH a header button (count badge in its label) and this
 * modal from a single scan. The old inline card-strip was replaced by that
 * header-button + modal pairing (mirrors Deviation's `useDeviationIntelligence`).
 */

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { getDriftDetection, type DriftDetectionResult } from "@/lib/ai";
import type { DriftAlert, DriftSeverity, DriftStatus } from "@/types/agi";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AIBadge } from "@/components/ai";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/severity";

function sevBadge(s: DriftSeverity) {
  return (
    <Badge variant={getSeverityVariant(s, "fda")}>
      {normalizeSeverityForDisplay(s, "fda") ?? s}
    </Badge>
  );
}

function statusBadge(s: DriftStatus) {
  const m: Record<DriftStatus, "blue" | "amber" | "green"> = {
    Open: "blue",
    Investigating: "amber",
    Resolved: "green",
  };
  return <Badge variant={m[s]}>{s}</Badge>;
}

/* ── Shared drift state ──────────────────────────────────────────────────────
 * One hook drives the header button (count badge) AND the modal body, so a
 * single scan populates both. Gated on the `drift` agent being active. */

export interface DriftDetectionState {
  /** Whether the AGI `drift` agent is active — the whole surface hides when false. */
  agentActive: boolean;
  alerts: DriftAlert[];
  /** Provenance of the current alerts: "backend" = real scan, "fallback" = the
   *  gateway's fallback fixture (backend unreachable). null before the first
   *  scan resolves. Surfaced as a badge so fixture alerts are never read as a
   *  live finding about the tenant's systems. */
  source: DriftDetectionResult["source"] | null;
  /** Alerts not yet Resolved (drives the "N open" count). */
  openCount: number;
  /** Alerts at Critical severity (drives the "· N critical" count). */
  criticalCount: number;
  loading: boolean;
  /** Re-run the scan (initial mount runs it automatically). */
  scan: () => Promise<void>;
}

export function useDriftDetection(): DriftDetectionState {
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiAgent = useAppSelector((s) => s.settings.agi.agents.drift);
  const agentActive = agiMode !== "manual" && !!agiAgent;

  const [result, setResult] = useState<DriftDetectionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await getDriftDetection());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (agentActive) scan();
  }, [agentActive, scan]);

  const alerts: DriftAlert[] = result?.alerts ?? [];
  const openCount = alerts.filter((a) => a.status !== "Resolved").length;
  const criticalCount = alerts.filter((a) => a.severity === "Critical").length;

  return {
    agentActive,
    alerts,
    source: result?.source ?? null,
    openCount,
    criticalCount,
    loading,
    scan,
  };
}

/** Short count summary reused by the header-button label and the modal footer.
 *  "Scanning…" while the first scan runs, then "N open · M critical" / "no drift". */
export function driftSummary(drift: DriftDetectionState): string {
  if (drift.loading && drift.alerts.length === 0) return "Scanning…";
  if (drift.openCount === 0) return "no drift";
  return `${drift.openCount} open${drift.criticalCount > 0 ? ` · ${drift.criticalCount} critical` : ""}`;
}

/* ── Alert list (reused inside the modal body) ────────────────────────────── */

function DriftAlertList({ alerts, loading }: { alerts: DriftAlert[]; loading: boolean }) {
  if (loading && alerts.length === 0) {
    return (
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
          Scanning systems for drift…
        </p>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2">
        <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0" aria-hidden="true" />
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          No configuration, access, or audit-trail drift detected.
        </p>
      </div>
    );
  }

  return (
    <ul className="list-none p-0 m-0 space-y-2.5">
      {alerts.map((a) => (
        <li
          key={a.id}
          className="rounded-2xl border p-3"
          style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}
        >
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {a.severity === "Critical" ? (
                <ShieldAlert className="w-4 h-4 text-[#ef4444]" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" />
              )}
              <Badge variant="gray">{a.type}</Badge>
              {sevBadge(a.severity)}
              {statusBadge(a.status)}
            </div>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {dayjs(a.detectedAt).format("DD MMM YYYY")}
            </span>
          </div>

          <p className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            {a.description}
          </p>

          {a.action && (
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
              <span className="font-semibold">Suggested action:</span> {a.action}
            </p>
          )}
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            Owner: {a.owner}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* ── Modal ────────────────────────────────────────────────────────────────── */

export function DriftDetectionModal({
  open,
  onClose,
  drift,
}: {
  open: boolean;
  onClose: () => void;
  drift: DriftDetectionState;
}) {
  const { alerts, loading, scan, source } = drift;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Drift Detection"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {driftSummary(drift)}
            </span>
            {/* Provenance — getDriftDetection() silently falls back to the mock
                fixture when the backend errors; without this the user cannot tell
                a real scan from demo data. Mirrors ApprovalBriefPanel. */}
            {!loading && source && <AIBadge source={source} />}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={scan}
            disabled={loading}
            aria-label="Re-scan systems for drift"
          >
            {loading ? "Scanning…" : "Re-scan"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Advisory — read-only alerting, human acts. */}
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Continuous monitoring of configuration, access, and audit-trail
          coverage. The agent alerts on drift — it does <strong>not</strong>{" "}
          change configurations, restore access, or make IT security decisions.
        </p>

        <DriftAlertList alerts={alerts} loading={loading} />
      </div>
    </Modal>
  );
}
