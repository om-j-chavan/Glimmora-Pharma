"use client";

/**
 * Role-contextual AGI insights (Phase 6).
 *
 * The panel TITLE and the STREAMS both come from the role's config, so a QA Head
 * reads "AI Quality Insights" built from deviation/CAPA/finding signals while a CSV
 * Lead reads "AI Validation Recommendations" built from drift and qualification gaps
 * — same component, same data contract, no per-role branching.
 *
 * The AGI-policy gate is preserved exactly: manual mode renders the "configure
 * agents" state, and per-agent toggles still govern the regulatory and drift streams.
 * Insight action links are permission-stripped by `buildInsights`.
 */

import { memo, useMemo } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, Bot, CheckCircle2, Info } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Badge } from "@/components/ui/Badge";
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

export const AIInsightsWidget = memo(function AIInsightsWidget({
  data, dashboard, canOpen,
}: DashboardWidgetProps) {
  const agi = useAppSelector((s) => s.settings.agi);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";

  const insights = useMemo(
    () => buildInsights({
      streams: dashboard.ai.streams,
      data,
      agi,
      canOpen,
      limit: dashboard.ai.limit ?? 5,
    }),
    [dashboard.ai.streams, dashboard.ai.limit, data, agi, canOpen],
  );

  const activeAgents = Object.values(agi.agents).filter(Boolean).length;
  const totalAgents = Object.values(agi.agents).length;
  const statusBadge =
    agi.mode === "manual" || activeAgents === 0
      ? <Badge variant="gray">inactive</Badge>
      : activeAgents === totalAgents
        ? <Badge variant="green">autonomous</Badge>
        : <Badge variant="amber">{activeAgents}/{totalAgents} active</Badge>;

  return (
    <aside aria-label={dashboard.ai.title} className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
          <span className="card-title">{dashboard.ai.title}</span>
        </div>
        {statusBadge}
      </div>
      <div className="card-body space-y-2">
        {agi.mode === "manual" ? (
          <>
            <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
              AGI is in manual mode. Enable agents in Settings → AGI Policy.
            </p>
            {canOpen("settings") && (
              <Link
                href="/settings"
                className="inline-block text-[11px] mt-2 no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--brand)"
                style={{ color: "var(--brand)" }}
              >
                Configure &rarr;
              </Link>
            )}
          </>
        ) : dashboard.ai.streams.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
            No AI insights are available for your role.
          </p>
        ) : insights.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
            No insights to show. Adjust filters or enable AGI agents in Settings.
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
