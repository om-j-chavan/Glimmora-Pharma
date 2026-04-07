import { useNavigate } from "react-router";
import clsx from "clsx";
import { CheckCircle2 } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useSetupStatus } from "@/hooks/useSetupStatus";

export function SetupChecklist() {
  const navigate = useNavigate();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { steps, completedCount, totalSteps, setupNeeded, progressPct } = useSetupStatus();

  if (!setupNeeded) return null;

  return (
    <div
      className={clsx("p-5 rounded-xl mb-6 border", isDark ? "bg-[rgba(14,165,233,0.06)] border-[rgba(14,165,233,0.15)]" : "bg-[#eff6ff] border-[#bfdbfe]")}
      role="status"
      aria-label="Platform setup progress"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Platform setup</p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Complete these steps to activate your dashboard</p>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-bold text-[#0ea5e9]">{completedCount}/{totalSteps}</p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>steps done</p>
        </div>
      </div>

      <div className={clsx("h-1.5 rounded-full mb-4", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[#0ea5e9] transition-all duration-500" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.key} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {step.done ? (
                <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0" aria-hidden="true" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 flex-shrink-0" style={{ borderColor: "#334155" }} aria-hidden="true" />
              )}
              <div>
                <span className={clsx("text-[12px]", step.done && "line-through opacity-50")} style={{ color: "var(--text-primary)" }}>{step.label}</span>
                {!step.done && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{step.desc}</p>}
              </div>
            </div>
            {!step.done && (
              <button type="button" onClick={() => navigate(step.link)} className="text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer flex-shrink-0 ml-3">
                {step.action} &rarr;
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
