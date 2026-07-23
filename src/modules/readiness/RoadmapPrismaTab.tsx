"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import type { Inspection, ReadinessAction } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { markActionComplete } from "@/actions/inspections";
import { Button } from "@/components/ui/Button";
import { useErrorPopup } from "@/components/ui/ErrorPopup";
import { Dropdown } from "@/components/ui/Dropdown";
import { StatusBadge } from "@/components/shared";
import { READINESS_STATUSES } from "@/constants/statusTaxonomy";

/**
 * Roadmap tab — Prisma-backed.
 *
 * Renders the `ReadinessAction` rows attached to a given Inspection
 * (the 16 standard rows that `createInspection` server-action seeds, plus
 * any added later). Drives the `markActionComplete` server action.
 *
 * Designed to live alongside (and eventually replace) the legacy roadmap
 * inside ReadinessPage that still operates on Redux `cards`. Wire it in
 * at the appropriate tab condition once the parent page is refactored.
 */

export interface RoadmapPrismaTabProps {
  inspection: Inspection & { actions: ReadinessAction[] };
  isAdmin: boolean;
}

const BUCKET_ORDER = ["12_weeks", "8_weeks", "4_weeks", "2_weeks", "1_week"] as const;
const BUCKET_LABELS: Record<string, string> = {
  "12_weeks": "12 Weeks Before",
  "8_weeks": "8 Weeks Before",
  "4_weeks": "4 Weeks Before",
  "2_weeks": "2 Weeks Before",
  "1_week": "1 Week Before",
};

function scoreColor(score: number): string {
  if (score < 30) return "var(--danger)";
  if (score < 70) return "var(--warning)";
  return "var(--success)";
}

type ActionFilter = "all" | "open" | "overdue" | "complete";
const FILTER_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "complete", label: "Complete" },
];

function isActionOverdue(a: ReadinessAction): boolean {
  return a.status !== "Complete" && a.dueDate !== null && new Date(a.dueDate) < new Date();
}

export function RoadmapPrismaTab({ inspection, isAdmin }: RoadmapPrismaTabProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // User-facing error surfaced when the mark-complete action fails.
  const { setError, errorPopup } = useErrorPopup();
  const [filter, setFilter] = useState<ActionFilter>("all");

  const actions = inspection.actions;
  const total = actions.length;
  const completed = actions.filter((a) => a.status === "Complete").length;
  const score = total > 0 ? Math.round((completed / total) * 100) : 0;
  const progressColor = scoreColor(score);
  const overdueCount = actions.filter(isActionOverdue).length;

  // Readiness % above always reflects ALL actions; the filter only narrows the
  // list below so the headline number never changes with a view toggle.
  const visibleActions = actions.filter((a) => {
    if (filter === "open") return a.status !== "Complete";
    if (filter === "complete") return a.status === "Complete";
    if (filter === "overdue") return isActionOverdue(a);
    return true;
  });

  async function handleMarkComplete(actionId: string) {
    setLoadingId(actionId);
    const result = await markActionComplete(actionId);
    setLoadingId(null);
    if (!result.success) {
      console.error("[roadmap] markActionComplete failed:", result.error);
      setError(result.error ?? "Could not mark the action complete. Please try again.");
    }
    // revalidatePath("/readiness") in the action triggers re-fetch of the
    // server page; refreshed `actions` arrive on the next render.
  }

  // Group the (filtered) actions by `bucket` (schema field — not `timeBucket`).
  const grouped: Record<string, ReadinessAction[]> = {};
  for (const a of visibleActions) {
    const key = a.bucket ?? "1_week";
    (grouped[key] ??= []).push(a);
  }

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <div
        className="flex items-center justify-between p-4 rounded-2xl border"
        style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}
      >
        <div>
          <p className="text-[12px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Inspection Readiness
          </p>
          <p className="text-2xl font-bold" style={{ color: progressColor }}>
            {score}%
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {completed} of {total} actions complete
          </p>
        </div>
        <div className="flex-1 mx-6">
          <div
            className="h-3 rounded-full overflow-hidden"
            style={{ background: "var(--bg-border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${score}%`, background: progressColor }}
            />
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <span>{visibleActions.length} of {total} shown</span>
            {overdueCount > 0 && (
              <button
                type="button"
                onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium cursor-pointer border-none"
                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
              >
                <AlertTriangle className="w-3 h-3" aria-hidden="true" /> {overdueCount} overdue
              </button>
            )}
          </div>
          <Dropdown
            value={filter}
            onChange={(v) => setFilter(v as ActionFilter)}
            options={FILTER_OPTIONS}
            width="w-44"
            size="sm"
          />
        </div>
      )}

      {total > 0 && visibleActions.length === 0 && (
        <div
          className="text-center py-8 text-[12px] rounded-2xl border border-dashed"
          style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
        >
          No actions match this filter.
        </div>
      )}

      {/* Actions by bucket */}
      {BUCKET_ORDER.map((bucket) => {
        const list = grouped[bucket];
        if (!list || list.length === 0) return null;
        return (
          <section key={bucket} aria-labelledby={`bucket-${bucket}`}>
            <h3
              id={`bucket-${bucket}`}
              className="text-[11px] font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              {BUCKET_LABELS[bucket] ?? bucket}
            </h3>
            <div className="space-y-2">
              {list.map((action) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  isAdmin={isAdmin}
                  isLoading={loadingId === action.id}
                  onMarkComplete={handleMarkComplete}
                />
              ))}
            </div>
          </section>
        );
      })}

      {total === 0 && (
        <div
          className="text-center py-8 text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          No actions yet for this inspection.
        </div>
      )}

      {/* Error feedback — canonical action-failure surface */}
      {errorPopup}
    </div>
  );
}

function ActionRow({
  action,
  isAdmin,
  isLoading,
  onMarkComplete,
}: {
  action: ReadinessAction;
  isAdmin: boolean;
  isLoading: boolean;
  onMarkComplete: (id: string) => Promise<void>;
}) {
  const isComplete = action.status === "Complete";
  const isOverdue =
    !isComplete && action.dueDate !== null && new Date(action.dueDate) < new Date();

  const borderColor = isComplete
    ? "var(--success)"
    : isOverdue
      ? "var(--danger)"
      : "var(--bg-border)";
  const bgColor = isComplete
    ? "var(--success-bg)"
    : isOverdue
      ? "var(--danger-bg)"
      : "var(--bg-surface)";

  return (
    <article
      className="flex items-center justify-between p-4 rounded-lg border transition-colors"
      style={{ borderColor, background: bgColor }}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={
            isComplete
              ? { background: "var(--success)", color: "#fff" }
              : { border: "2px solid var(--bg-border)" }
          }
          aria-hidden="true"
        >
          {isComplete && <CheckCircle2 className="w-3 h-3" />}
        </div>
        <div className="min-w-0">
          <p
            className="text-[13px] font-medium"
            style={{
              color: isComplete ? "var(--text-secondary)" : "var(--text-primary)",
              textDecoration: isComplete ? "line-through" : "none",
            }}
          >
            {action.title}
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <StatusBadge taxonomy={READINESS_STATUSES} status={isOverdue ? "Overdue" : action.status} />
            {action.priority === "Critical" && (
              <span className="text-[11px] font-medium" style={{ color: "var(--danger)" }}>
                Critical
              </span>
            )}
            {action.dueDate && (
              <span
                className="text-[11px] inline-flex items-center gap-1"
                style={{ color: isOverdue ? "var(--danger)" : "var(--text-secondary)" }}
              >
                <Clock className="w-3 h-3" aria-hidden="true" />
                Due {dayjs(action.dueDate).format("DD MMM")}
              </span>
            )}
            {action.completedBy && (
              <span className="text-[11px]" style={{ color: "var(--success)" }}>
                ✓ {action.completedBy}
              </span>
            )}
          </div>
        </div>
      </div>

      {isAdmin && !isComplete && (
        <Button
          variant="secondary"
          size="sm"
          loading={isLoading}
          onClick={() => onMarkComplete(action.id)}
          className="shrink-0 ml-4"
        >
          Mark complete
        </Button>
      )}
    </article>
  );
}
