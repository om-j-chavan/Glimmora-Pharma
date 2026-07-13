"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { DetailSubTab, NextStepInfo } from "../helpers/getNextStep";

/**
 * Persistent next-step banner. Rendered above every tab body in the modal
 * so the user always sees the same guidance regardless of which tab is
 * active. When the suggested target tab matches the active tab, the
 * action button is suppressed (clicking would be a no-op) and the banner
 * becomes pure context.
 */
export function NextStepBanner({
  nextStep,
  currentTab,
}: {
  nextStep: NextStepInfo;
  currentTab: DetailSubTab;
}) {
  const toneBg =
    nextStep.tone === "success"
      ? "var(--success-bg)"
      : nextStep.tone === "info"
        ? "var(--info-bg)"
        : "var(--warning-bg)";
  const toneFg =
    nextStep.tone === "success"
      ? "var(--success)"
      : nextStep.tone === "info"
        ? "var(--brand)"
        : "var(--warning)";
  const toneBorder =
    nextStep.tone === "success"
      ? "var(--success)"
      : nextStep.tone === "info"
        ? "var(--brand-border)"
        : "var(--warning)";

  // Hide the action button when the user is already on the suggested
  // tab — clicking "Go to Actions tab" while on the Actions tab would
  // be a no-op and is just visual clutter. The "Submit for review"
  // action is the exception: it's a real side-effect, not navigation.
  const onTargetTab =
    nextStep.targetTab !== null && nextStep.targetTab === currentTab;
  const showAction =
    nextStep.action !== null &&
    (!onTargetTab || nextStep.action.label.startsWith("Submit"));

  return (
    <aside
      className="flex items-center gap-3 p-3 rounded-lg border mb-4"
      style={{ background: toneBg, borderColor: toneBorder }}
      aria-label={`Next step: ${nextStep.title}`}
    >
      <nextStep.Icon
        className="w-5 h-5 shrink-0"
        style={{ color: toneFg }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold flex items-center gap-1" style={{ color: toneFg }}>
          {nextStep.tone === "success" ? (
            nextStep.title
          ) : (
            <>
              <span>Next step:</span>
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
              <span>{nextStep.title}</span>
            </>
          )}
        </p>
        <p
          className="text-[11px] mt-0.5"
          style={{ color: "var(--text-secondary)" }}
        >
          {nextStep.description}
        </p>
      </div>
      {showAction && nextStep.action && (
        <Button variant="secondary" size="sm" onClick={nextStep.action.onClick}>
          {nextStep.action.label}
        </Button>
      )}
    </aside>
  );
}
