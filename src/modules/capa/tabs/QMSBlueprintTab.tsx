import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";
import type { CAPA } from "@/store/capa.slice";
import { Badge } from "@/components/ui/Badge";

interface LifecycleStep {
  step: number;
  label: string;
  Icon: LucideIcon;
  color: string;
  desc: string;
  targetState: string;
  currentGap: string;
}

interface QMSProcess {
  title: string;
  Icon: LucideIcon;
  color: string;
  sourceKey: string;
  targetState: string;
  currentGap: string;
}

interface QMSBlueprintTabProps {
  openCAPAs: CAPA[];
  noRCACount: number;
  pendingReviewCount: number;  selectedStep: number | null;
  onSelectStep: (step: number | null) => void;
  lifecycleSteps: LifecycleStep[];
  qmsProcesses: QMSProcess[];
  stepHasProblem: (step: number) => boolean;
  getProcessMetrics: (sourceKey: string) => { open: number; thisMonth: number; overdue: number };
}

export function QMSBlueprintTab({
  openCAPAs, noRCACount, pendingReviewCount,
  selectedStep, onSelectStep, lifecycleSteps, qmsProcesses,
  stepHasProblem, getProcessMetrics,
}: QMSBlueprintTabProps) {
  return (
    <div role="tabpanel" id="panel-blueprint" aria-labelledby="tab-blueprint" tabIndex={0}>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>CAPA lifecycle</h2>
        {openCAPAs.length === 0 ? <Badge variant="green">All clear</Badge> : <Badge variant="blue">{openCAPAs.length} active</Badge>}
        {noRCACount > 0 && <Badge variant="amber">{noRCACount} missing RCA</Badge>}
        {pendingReviewCount > 0 && <Badge variant="purple">{pendingReviewCount} pending review</Badge>}
      </div>

      {/* Lifecycle flow */}
      <div className="flex items-stretch overflow-x-auto pb-2 gap-0">
        {lifecycleSteps.map((step, i) => (
          <div key={step.step} className="flex items-stretch">
            <button type="button" role="button" aria-expanded={selectedStep === step.step}
              onClick={() => onSelectStep(selectedStep === step.step ? null : step.step)}
              className={clsx("flex-shrink-0 w-[148px] rounded-xl overflow-hidden border-t-2 p-3 text-left bg-transparent outline-none cursor-pointer transition-all duration-150 border border-(--bg-border)",
                selectedStep === step.step && "ring-2 ring-offset-1")}
              style={{ borderTopColor: step.color, background: "var(--bg-elevated)", ...(selectedStep === step.step ? { boxShadow: `0 0 0 2px ${step.color}` } : {}) }}>
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: step.color + "18" }}>
                  <step.Icon className="w-4 h-4" style={{ color: step.color }} aria-hidden="true" />
                </div>
                <span className="flex items-center gap-1">
                  {stepHasProblem(step.step) && <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] shrink-0" aria-label="Needs attention" />}
                  <span className="text-[10px] font-bold" style={{ color: step.color }}>Step {step.step}</span>
                </span>
              </div>
              <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{step.label}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{step.desc}</p>
            </button>
            {i < lifecycleSteps.length - 1 && <div className="flex-shrink-0 self-center mx-0.5" aria-hidden="true"><ChevronRight className="w-4 h-4" style={{ color: "var(--bg-border)" }} /></div>}
          </div>
        ))}
      </div>

      {selectedStep !== null && (() => {
        const s = lifecycleSteps[selectedStep - 1];
        if (!s) return null;
        return (
          <div className="card mt-3 p-4">
            <div className="flex items-center gap-2 mb-3">
              <s.Icon className="w-4 h-4" style={{ color: s.color }} aria-hidden="true" />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Step {s.step}: {s.label}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div><p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#10b981" }}>Target state</p><p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s.targetState}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#f59e0b" }}>Current gap</p><p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s.currentGap}</p></div>
            </div>
          </div>
        );
      })()}

      {/* QMS process cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        {qmsProcesses.map((proc) => {
          const metrics = getProcessMetrics(proc.sourceKey);
          const hasData = metrics.open > 0 || metrics.thisMonth > 0 || metrics.overdue > 0;
          return (
            <article key={proc.title} className="card overflow-hidden">
              <div className="card-header">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: proc.color + "18" }}><proc.Icon className="w-4 h-4" style={{ color: proc.color }} aria-hidden="true" /></div>
                  <span className="card-title">{proc.title}</span>
                </div>
              </div>
              <div className="card-body space-y-3">
                <div><p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#10b981" }}>Target state</p><p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proc.targetState}</p></div>
                <div className="border-t" style={{ borderColor: "var(--bg-border)" }} />
                <div><p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#f59e0b" }}>Current gap</p><p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proc.currentGap}</p></div>
                {hasData ? (
                  <div className="flex gap-6 pt-2">
                    {[
                      { label: "Open", value: metrics.open, color: metrics.open > 0 ? "#f59e0b" : "#10b981" },
                      { label: "This month", value: metrics.thisMonth, color: "var(--text-primary)" },
                      { label: "Overdue", value: metrics.overdue, color: metrics.overdue > 0 ? "#ef4444" : "#10b981" },
                    ].map((m) => (
                      <div key={m.label} className="flex flex-col">
                        <span className="text-[18px] font-bold" style={{ color: m.color }}>{m.value}</span>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] italic pt-1" style={{ color: "var(--text-muted)" }}>No {proc.title.toLowerCase()} CAPAs yet. Create a CAPA with source &ldquo;{proc.sourceKey}&rdquo; to track here.</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
