import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  GitBranch,
  Send,
  Wrench,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { CAPA } from "@/store/capa.slice";
import type { CAPAReadiness, ReadinessKey } from "@/lib/capa-readiness";

/**
 * Pure-logic helper that picks the single most-actionable next step for
 * a CAPA in any state. The result drives:
 *   - The persistent NextStepBanner above every modal tab body.
 *   - The Overview tab's contextual headline.
 *
 * Priority order (first match wins):
 *   1. Closed / Rejected / Pending QA review — terminal-state banners.
 *   2. Description, RCA, Criteria, Actions, Alignment — gating items
 *      checked in submission-priority order.
 *   3. "All ready, submit for review" — happy path.
 *
 * Pure function, no side effects, no JSX. Lives outside the CAPA detail page
 * so the helper can be tested in isolation and reused without dragging
 * the modal's React tree along.
 */

export type DetailSubTab =
  | "overview"
  | "evidence"
  | "rca"
  | "actions"
  | "criteria";

export interface NextStepInfo {
  Icon: typeof CheckCircle2;
  title: string;
  description: string;
  tone: "success" | "warning" | "info";
  /** Tab the banner suggests the user move to. The banner uses this to
   *  decide whether to render the "Go to X" action button — when the
   *  user is already on `targetTab`, the button is suppressed and the
   *  banner becomes pure guidance. */
  targetTab: DetailSubTab | null;
  action: { label: string; onClick: () => void } | null;
}

/** Which detail tab each readiness condition lives on — shared by the banner
 *  and the SubmissionChecklist so a "fix this" click always lands in the
 *  right place. */
export const READINESS_TAB: Record<ReadinessKey, DetailSubTab> = {
  rca: "rca",
  alignment: "actions",
  diGate: "overview",
  actions: "actions",
  evidence: "evidence",
  criteria: "criteria",
};

const READINESS_ICON: Record<ReadinessKey, typeof CheckCircle2> = {
  rca: GitBranch,
  alignment: AlertTriangle,
  diGate: AlertTriangle,
  actions: Wrench,
  evidence: FileText,
  criteria: ClipboardCheck,
};

const TAB_LABEL: Record<DetailSubTab, string> = {
  overview: "Overview",
  evidence: "Evidence",
  rca: "RCA",
  actions: "Action Plans",
  criteria: "Criteria",
};

/**
 * Phase 4 — getNextStep now derives the gating step from the SAME
 * getCAPAReadiness result the server enforces and the SubmissionChecklist
 * renders. No local boolean logic: the first unmet readiness condition (in
 * a-f order) becomes the next step; if all are met the step is "submit".
 */
export function getNextStep(args: {
  capa: CAPA;
  readiness: CAPAReadiness;
  timezone: string;
  dateFormat: string;
  onChangeTab: (tab: DetailSubTab) => void;
  onSubmitForReview: () => void;
}): NextStepInfo {
  const {
    capa,
    readiness,
    timezone,
    dateFormat,
    onChangeTab,
    onSubmitForReview,
  } = args;

  if (capa.status === "closed") {
    const dateText = capa.closedAt ? dayjs.utc(capa.closedAt).tz(timezone).format(dateFormat) : "—";
    return {
      Icon: CheckCircle2,
      title: "CAPA closed",
      description: `Closed on ${dateText}.`,
      tone: "success",
      targetTab: null,
      action: null,
    };
  }
  // Legacy "rejected" rows only — Phase 4 reject now bounces to in_progress,
  // so nothing new lands here. Kept for any pre-Phase-4 rejected row.
  if (capa.status === "rejected") {
    return {
      Icon: AlertCircle,
      title: "CAPA rejected",
      description: "QA returned this CAPA for revision. Re-open from the Action Plans tab.",
      tone: "warning",
      targetTab: "actions",
      action: { label: "Go to Action Plans tab", onClick: () => onChangeTab("actions") },
    };
  }
  if (capa.status === "pending_qa_review") {
    return {
      Icon: Clock,
      title: "Awaiting approvals",
      description: "QA Head review pending. The Action Plans tab tracks who's signed.",
      tone: "info",
      targetTab: "actions",
      action: { label: "Go to Action Plans tab", onClick: () => onChangeTab("actions") },
    };
  }

  // Editable states: open / in_progress. The first unmet readiness condition
  // (in a-f order) is the next step. This is the SAME readiness used by the
  // server gate and the checklist — they can't disagree.
  const firstUnmet = readiness.conditions.find((c) => !c.met);
  if (firstUnmet) {
    const tab = READINESS_TAB[firstUnmet.key];
    // Phase 4 — when QA has bounced this CAPA back (in_progress + a recorded
    // rejection reason), lead with that context.
    const bounced = capa.status === "in_progress" && Boolean(capa.rejectionReason);
    return {
      Icon: READINESS_ICON[firstUnmet.key],
      title: bounced ? "Address QA rework" : firstUnmet.label,
      description: bounced
        ? `QA returned this CAPA: "${capa.rejectionReason}". ${firstUnmet.detail ?? firstUnmet.label}.`
        : (firstUnmet.detail ?? firstUnmet.label) + ".",
      tone: "warning",
      targetTab: tab,
      action: { label: `Go to ${TAB_LABEL[tab]} tab`, onClick: () => onChangeTab(tab) },
    };
  }

  return {
    Icon: Send,
    title: "Submit for review",
    description: "All required items are in place. Send to QA for approval when ready.",
    tone: "info",
    targetTab: "actions",
    action: { label: "Submit for review", onClick: onSubmitForReview },
  };
}
