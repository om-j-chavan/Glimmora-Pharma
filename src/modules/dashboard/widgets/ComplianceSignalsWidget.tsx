"use client";

/**
 * Role-contextual compliance signals (Phase 6).
 *
 * The panel TITLE and the STREAMS both come from the role's config, so a QA Head
 * reads "Quality Signals" built from deviation/CAPA/finding counts while a CSV
 * Lead reads "Validation Signals" built from drift and qualification gaps
 * — same component, same data contract, no per-role branching.
 *
 * ── This is NOT an AI surface ──────────────────────────────────────
 * Every line here is a deterministic threshold over the tenant's own records,
 * computed in this component's render via `buildInsights()`. No model is
 * involved, nothing is sent to the AI service, and nothing is generated.
 *
 * It used to be branded as one: titles read "AI Quality Insights", the header
 * carried a Bot icon, and the panel sat behind the AGI-policy agent toggles —
 * so a deterministic count of overdue CAPAs was presented to QA and to auditors
 * as model output. In a GxP tool that is a claim you cannot support. The
 * branding is gone; the signals, thresholds, and permission-stripped action
 * links are unchanged.
 *
 * Real AI surfaces in this app all call the backend and badge their provenance
 * with <AIBadge> — see src/lib/ai/index.ts.
 */

import { memo, useMemo } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, Activity, CheckCircle2, Info } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { buildInsights, type DashboardInsight } from "../config/insights";
import type { DashboardWidgetProps } from "./types";

const ICON = {
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;

const ICON_COLOR = {
  warning: "#f59e0b",
  success: "#10b981",
  info: "#0ea5e9",
} as const;

/** Tone classes per insight type, in both themes (theme tokens where available). */
function toneClass(type: DashboardInsight["type"], isDark: boolean): string {
  if (type === "warning") {
    return isDark ? "bg-(--warning-bg) border border-(--warning)" : "bg-[#fffbeb] border border-[#fde68a]";
  }
  if (type === "success") {
    return isDark ? "bg-(--success-bg) border border-(--success)" : "bg-[#f0fdf4] border border-[#a7f3d0]";
  }
  return "bg-(--bg-surface) border border-(--bg-border)";
}

export const ComplianceSignalsWidget = memo(function ComplianceSignalsWidget({
  data, dashboard, canOpen,
}: DashboardWidgetProps) {
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";

  const insights = useMemo(
    () => buildInsights({
      streams: dashboard.ai.streams,
      data,
      canOpen,
      limit: dashboard.ai.limit ?? 5,
    }),
    [dashboard.ai.streams, dashboard.ai.limit, data, canOpen],
  );

  // No agent/autonomy badge: these are computed signals, not agents doing work.

  return (
    <aside aria-label={dashboard.ai.title} className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: "var(--text-secondary)" }} aria-hidden="true" />
          <span className="card-title">{dashboard.ai.title}</span>
        </div>
      </div>
      <div className="card-body space-y-2">
        {dashboard.ai.streams.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
            No compliance signals are configured for your role.
          </p>
        ) : insights.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
            No signals to show — nothing currently crosses a threshold.
          </p>
        ) : (
          insights.map((ins) => {
            const Icon = ICON[ins.type];
            return (
              <div key={ins.id} className={clsx("flex items-start gap-2 p-2.5 rounded-lg", toneClass(ins.type, isDark))}>
                <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: ICON_COLOR[ins.type] }} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{ins.text}</p>
                  {ins.action && ins.href && (
                    <Link
                      href={ins.href}
                      className="inline-block text-[10px] mt-1 no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--brand)"
                      style={{ color: "var(--brand)" }}
                    >
                      {ins.action} &rarr;
                    </Link>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
});
