/**
 * CSV/CSA detail-page workflow phases (RUNG 2.6).
 *
 * The detail page is organized as five workflow phases rather than
 * content-based tabs, mirroring the FDA 483 module's workflow-driven layout:
 *
 *   Assess → Plan → Execute → Sign Off → Inspect
 *
 * Both helpers below are pure (no React, no server imports) so the server
 * route can pick the landing tab and the header card can compute the same
 * "next step" → tab mapping without duplicating the state machine.
 */
import dayjs from "@/lib/dayjs";
import type { GxPSystem } from "@/types/csv-csa";

export type WorkflowTab = "assess" | "plan" | "execute" | "signoff" | "inspect";

export const WORKFLOW_TABS: { id: WorkflowTab; label: string }[] = [
  { id: "assess", label: "Assess" },
  { id: "plan", label: "Plan" },
  { id: "execute", label: "Execute" },
  { id: "signoff", label: "Sign Off" },
  { id: "inspect", label: "Inspect" },
];

/** True when every stage has resolved to approved or skipped (≥1 stage). */
export function allStagesResolved(sys: Pick<GxPSystem, "validationStages">): boolean {
  const stages = sys.validationStages ?? [];
  return stages.length > 0 && stages.every((s) => s.status === "approved" || s.status === "skipped");
}

/**
 * Where to land a freshly-opened system, by lifecycle position:
 *   signed off → Inspect; all stages resolved (unsigned) → Sign Off;
 *   any stage started → Execute; assessed but no stages → Plan; fresh → Assess.
 */
export function computeDefaultTab(sys: GxPSystem): WorkflowTab {
  if (sys.signedOffAt) return "inspect";
  if (allStagesResolved(sys)) return "signoff";
  const stages = sys.validationStages ?? [];
  if (stages.some((s) => s.status !== "not_started")) return "execute";
  if (sys.intendedUse?.trim()) return "plan";
  return "assess";
}

export interface NextStep {
  label: string;
  tab: WorkflowTab;
}

/**
 * One prioritized next action + the tab that resolves it. Priority:
 * rejected stage → review overdue → open findings → stage in review →
 * not assessed → not submitted → ready to sign → signed off → in progress.
 */
export function computeNextStep(sys: GxPSystem): NextStep {
  const stages = sys.validationStages ?? [];

  const rejected = stages.find((s) => s.status === "rejected");
  if (rejected) return { label: `${rejected.key} rejected. Re-execute and resubmit.`, tab: "execute" };

  const overdue = !!sys.nextReview && dayjs.utc(sys.nextReview).isBefore(dayjs()) && sys.validationStatus !== "Not Started";
  if (overdue) {
    const days = dayjs().diff(dayjs.utc(sys.nextReview), "day");
    return { label: `Review overdue by ${days} day${days === 1 ? "" : "s"}. Re-validate and re-sign.`, tab: "signoff" };
  }

  const openFindings = (sys.findings ?? []).filter((f) => f.status !== "Closed");
  if (openFindings.length > 0) {
    return { label: `${openFindings.length} open finding${openFindings.length === 1 ? "" : "s"} require remediation.`, tab: "inspect" };
  }

  const inReview = stages.find((s) => s.status === "in_review");
  if (inReview) return { label: `${inReview.key} awaiting QA approval.`, tab: "execute" };

  if (!sys.intendedUse?.trim()) return { label: "Document intended use and risk in the Assess tab.", tab: "assess" };

  const anySubmitted = stages.some((s) => s.status !== "not_started");
  if (!anySubmitted) return { label: "Submit the URS stage for QA review.", tab: "execute" };

  if (allStagesResolved(sys) && !sys.signedOffAt) {
    return { label: "All stages approved. Sign off the validation.", tab: "signoff" };
  }
  if (sys.signedOffAt) return { label: "Validated and signed off. Review inspection readiness.", tab: "inspect" };

  return { label: "Continue executing the remaining validation stages.", tab: "execute" };
}
