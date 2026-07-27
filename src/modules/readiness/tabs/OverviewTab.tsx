"use client";

import { ArrowRight, CalendarClock, ClipboardList, GraduationCap, AlertTriangle, Sparkles } from "lucide-react";
import type { Inspection, ReadinessAction, Simulation, TrainingRecord } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import { AIButton } from "@/components/ai";
import { StatusBadge } from "@/components/shared";
import { READINESS_STATUSES } from "@/constants/statusTaxonomy";
import { openAssistant } from "@/lib/assistant";

type FullInspection = Inspection & {
  actions: ReadinessAction[];
  simulations: Simulation[];
  trainingRecords: TrainingRecord[];
};

export interface OverviewTabProps {
  inspection: FullInspection;
  isAdmin: boolean;
  /** Jump to another workspace tab (e.g. from the Next-Best-Action card). */
  onNavigate: (tab: string) => void;
}

const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

// Bucket → human phase name (data uses week-based bucket keys).
const PHASES: { key: string; label: string }[] = [
  { key: "12_weeks", label: "Assess" },
  { key: "8_weeks", label: "Prepare" },
  { key: "4_weeks", label: "Rehearse" },
  { key: "2_weeks", label: "Comms" },
  { key: "1_week", label: "Finalize" },
];

function scoreColor(score: number): string {
  if (score < 30) return "var(--danger)";
  if (score < 70) return "var(--warning)";
  return "var(--success)";
}

function isOverdue(a: ReadinessAction): boolean {
  return a.status !== "Complete" && a.dueDate !== null && new Date(a.dueDate) < new Date();
}

// Transparent reasoning for why this action is the suggested next step — the
// ranking is deterministic (priority, then due date), not an opaque model.
function nextActionReason(a: ReadinessAction): string {
  if (isOverdue(a)) return "Overdue — this is holding back your readiness.";
  if (a.priority === "Critical") return "Highest-priority open action.";
  if (a.dueDate) return "Nearest due date among your open actions.";
  return "Next open action to tackle.";
}

const INSIGHT_TONE: Record<string, string> = {
  danger: "var(--danger)",
  warning: "var(--warning)",
  info: "var(--brand)",
};

export function OverviewTab({ inspection, onNavigate }: OverviewTabProps) {
  const actions = inspection.actions;
  const total = actions.length;
  const completed = actions.filter((a) => a.status === "Complete").length;
  const score = total > 0 ? Math.round((completed / total) * 100) : 0;
  const color = scoreColor(score);
  const overdue = actions.filter(isOverdue).length;

  // Next best action: highest priority, then nearest due date, among the open ones.
  const nextAction = actions
    .filter((a) => a.status !== "Complete")
    .sort((a, b) => {
      const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
      if (pr !== 0) return pr;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    })[0];

  const daysToInspection = inspection.expectedDate
    ? dayjs(inspection.expectedDate).startOf("day").diff(dayjs().startOf("day"), "day")
    : null;

  const simsCompleted = inspection.simulations.filter((s) => s.status === "Completed").length;
  const trainingDone = inspection.trainingRecords.filter((t) => t.status === "completed").length;

  // Derived readiness insights (computed signals, ranked danger → info). Each can
  // hand off to the real AI assistant for a remediation plan.
  const insights: { tone: "danger" | "warning" | "info"; text: string; ask: string }[] = [];
  const criticalOverdue = actions.filter((a) => isOverdue(a) && a.priority === "Critical").length;
  if (criticalOverdue > 0) {
    insights.push({
      tone: "danger",
      text: `${criticalOverdue} critical action${criticalOverdue > 1 ? "s" : ""} overdue — on your critical path.`,
      ask: `Which overdue critical actions for "${inspection.title}" should I prioritise, and how do I close them quickly?`,
    });
  }
  if (daysToInspection !== null && daysToInspection >= 0 && daysToInspection <= 21 && score < 70) {
    insights.push({
      tone: "warning",
      text: `Inspection in ${daysToInspection} days but only ${score}% ready.`,
      ask: `I have ${daysToInspection} days until my ${inspection.agency} inspection and I'm ${score}% ready. What's the fastest path to inspection-ready?`,
    });
  }
  if (inspection.simulations.length === 0) {
    insights.push({
      tone: "info",
      text: "No mock simulation scheduled yet.",
      ask: `How should I plan mock inspection simulations for "${inspection.title}"?`,
    });
  }
  if (inspection.trainingRecords.length > 0 && trainingDone < inspection.trainingRecords.length) {
    const pct = Math.round((trainingDone / inspection.trainingRecords.length) * 100);
    insights.push({
      tone: "info",
      text: `Team training ${pct}% complete (${trainingDone}/${inspection.trainingRecords.length}).`,
      ask: `Which training modules are still outstanding for "${inspection.title}"?`,
    });
  }
  const topInsights = insights.slice(0, 3);

  return (
    <div className="space-y-5">
      {/* Readiness + countdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border p-4 sm:col-span-1" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
          <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Readiness</p>
          <p className="text-3xl font-bold" style={{ color }}>{score}%</p>
          <div className="h-2 rounded-full overflow-hidden mt-2" style={{ background: "var(--bg-border)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: color }} />
          </div>
          <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>{completed} of {total} actions complete</p>
        </div>

        <div className="rounded-2xl border p-4 flex flex-col justify-center" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
          <p className="text-[11px] font-medium mb-1 inline-flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
            <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> Inspection date
          </p>
          {daysToInspection !== null ? (
            <>
              <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {daysToInspection >= 0 ? `${daysToInspection} days` : `${Math.abs(daysToInspection)} days ago`}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                {dayjs(inspection.expectedDate).format("DD MMM YYYY")}
              </p>
            </>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No date set</p>
          )}
        </div>

        <div className="rounded-2xl border p-4 flex flex-col justify-center gap-2" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
          <div className="flex items-center justify-between text-[12px]">
            <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Overdue</span>
            <span className="font-semibold" style={{ color: overdue > 0 ? "var(--danger)" : "var(--text-primary)" }}>{overdue}</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><GraduationCap className="w-3.5 h-3.5" aria-hidden="true" /> Simulations done</span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{simsCompleted}</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><ClipboardList className="w-3.5 h-3.5" aria-hidden="true" /> Training records</span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{trainingDone}</span>
          </div>
        </div>
      </div>

      {/* Next best action */}
      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--brand)", background: "var(--brand-muted)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 inline-flex items-center gap-1.5" style={{ color: "var(--brand)" }}>
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Suggested next step
        </p>
        {nextAction ? (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{nextAction.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusBadge taxonomy={READINESS_STATUSES} status={isOverdue(nextAction) ? "Overdue" : nextAction.status} />
                {nextAction.priority === "Critical" && (
                  <span className="text-[11px] font-medium" style={{ color: "var(--danger)" }}>Critical</span>
                )}
                {nextAction.dueDate && (
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Due {dayjs(nextAction.dueDate).format("DD MMM")}</span>
                )}
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--text-secondary)" }}>{nextActionReason(nextAction)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <AIButton variant="subtle" size="sm" onClick={() => openAssistant(`For my inspection "${inspection.title}", how should I approach the task "${nextAction.title}"?`)}>Ask AI</AIButton>
              <Button variant="primary" size="sm" icon={ArrowRight} onClick={() => onNavigate("tasks")}>Go to Tasks</Button>
            </div>
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            All readiness actions are complete. This inspection is ready. 🎉
          </p>
        )}
      </div>

      {/* Readiness insights */}
      {topInsights.length > 0 && (
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 inline-flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Readiness insights
          </p>
          <ul className="space-y-2.5 list-none p-0 m-0">
            {topInsights.map((ins, i) => (
              <li key={i} className="flex items-start justify-between gap-3">
                <span className="flex items-start gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: INSIGHT_TONE[ins.tone] }} aria-hidden="true" />
                  <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{ins.text}</span>
                </span>
                <AIButton
                  variant="quiet"
                  size="xs"
                  className="shrink-0"
                  onClick={() => openAssistant(ins.ask)}
                >
                  Ask AI
                </AIButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Phase progress */}
      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Readiness journey</p>
        <div className="space-y-3">
          {PHASES.map((phase) => {
            const list = actions.filter((a) => (a.bucket ?? "1_week") === phase.key);
            if (list.length === 0) return null;
            const done = list.filter((a) => a.status === "Complete").length;
            const pct = Math.round((done / list.length) * 100);
            return (
              <div key={phase.key}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>{phase.label}</span>
                  <span style={{ color: "var(--text-muted)" }}>{done}/{list.length}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-border)" }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: scoreColor(pct) }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key facts */}
      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Inspection details</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4 text-[12px]">
          {[
            { label: "Agency", value: inspection.agency },
            { label: "Type", value: inspection.type },
            { label: "Site", value: inspection.siteName },
            { label: "Lead", value: inspection.inspectionLead || "—" },
            { label: "Status", value: inspection.status },
            { label: "Created by", value: inspection.createdBy },
          ].map((f) => (
            <div key={f.label}>
              <p style={{ color: "var(--text-muted)" }}>{f.label}</p>
              <p className="font-medium mt-0.5" style={{ color: "var(--text-primary)" }}>{f.value}</p>
            </div>
          ))}
        </div>
        {inspection.notes && (
          <p className="text-[12px] mt-3 pt-3 border-t" style={{ color: "var(--text-secondary)", borderColor: "var(--bg-border)" }}>
            {inspection.notes}
          </p>
        )}
      </div>
    </div>
  );
}
