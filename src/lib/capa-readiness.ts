/**
 * SINGLE SOURCE OF TRUTH for CAPA submission readiness (Phase 4).
 *
 * Imported by BOTH the server (submitForReview enforces it) and the client UI
 * (SubmissionChecklist / getNextStep / NextStepBanner render it), so the two
 * can never disagree about what "ready to submit" means. Framework-agnostic:
 * NO React, NO Prisma — plain data in, ordered conditions out. Same pattern as
 * src/lib/permissions/roleSets.ts.
 *
 * The six conditions:
 *   a. RCA approved by QA            (rcaApproved === true)
 *   b. alignment aligned / overridden
 *   c. DI gate cleared               — ONLY present when capa.diGate is set;
 *      when DI gate doesn't apply the condition is OMITTED entirely (not
 *      auto-met) so the list is honest about what actually applies.
 *   d. all action items complete     (every item complete|skipped; 0 items = NOT met)
 *   e. all 7 evidence categories resolved (COMPLETE or NOT_APPLICABLE)
 *   f. >= 1 effectiveness criterion defined
 *
 * a-c were already the server's submit gate; d-f are PROMOTED from UI-only
 * hints to real, enforced conditions — a deliberate tightening of submit.
 */

export interface ReadinessCAPAInput {
  rcaApproved?: boolean | null;
  alignmentStatus?: string | null;
  alignmentOverrideReason?: string | null;
  diGate?: boolean | null;
  diGateStatus?: string | null;
}

export interface ReadinessActionItem {
  status: string;
}

export interface ReadinessEvidenceItem {
  status: string;
}

export interface ReadinessCriterion {
  // Length is all that matters for condition (f); kept as an object so callers
  // can pass the real rows without reshaping.
  id?: string;
}

export type ReadinessKey =
  | "rca"
  | "alignment"
  | "diGate"
  | "actions"
  | "evidence"
  | "criteria";

export interface ReadinessCondition {
  key: ReadinessKey;
  label: string;
  met: boolean;
  /** Short human explanation of WHY it is unmet (or extra context). */
  detail?: string;
}

export interface CAPAReadiness {
  /** Ordered a -> f (DI gate omitted when it doesn't apply). */
  conditions: ReadinessCondition[];
  allMet: boolean;
  /** The subset still blocking submission (keys + labels), submit-order. */
  unmet: { key: ReadinessKey; label: string }[];
}

/** The canonical evidence category count (mirrors EVIDENCE_CATEGORIES). */
export const EVIDENCE_CATEGORY_COUNT = 7;

const RESOLVED_EVIDENCE_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETE",
  "NOT_APPLICABLE",
]);
const DONE_ACTION_STATUSES: ReadonlySet<string> = new Set(["complete", "skipped"]);

export function getCAPAReadiness(
  capa: ReadinessCAPAInput,
  actionItems: ReadinessActionItem[],
  evidenceItems: ReadinessEvidenceItem[],
  criteria: ReadinessCriterion[],
): CAPAReadiness {
  const conditions: ReadinessCondition[] = [];

  // a. RCA approved by QA
  conditions.push({
    key: "rca",
    label: "Root cause analysis approved by QA",
    met: capa.rcaApproved === true,
    detail:
      capa.rcaApproved === false
        ? "RCA was rejected — revise and request re-review"
        : capa.rcaApproved === true
          ? undefined
          : "Awaiting QA review of the root cause analysis",
  });

  // b. alignment aligned or overridden
  const alignmentMet =
    capa.alignmentStatus === "aligned" || Boolean(capa.alignmentOverrideReason);
  conditions.push({
    key: "alignment",
    label: "Action plan alignment reviewed",
    met: alignmentMet,
    detail: alignmentMet
      ? undefined
      : capa.alignmentStatus
        ? `Alignment verdict is "${capa.alignmentStatus}" — needs aligned/override`
        : "No alignment verdict recorded yet",
  });

  // c. DI gate — only when it applies.
  if (capa.diGate) {
    const diMet = capa.diGateStatus === "cleared";
    conditions.push({
      key: "diGate",
      label: "Data Integrity gate cleared",
      met: diMet,
      detail: diMet ? undefined : "DI gate is still pending clearance",
    });
  }

  // d. all action items complete (zero items = NOT met).
  const totalActions = actionItems.length;
  const doneActions = actionItems.filter((a) => DONE_ACTION_STATUSES.has(a.status)).length;
  const actionsMet = totalActions > 0 && doneActions === totalActions;
  conditions.push({
    key: "actions",
    label: "All corrective actions complete",
    met: actionsMet,
    detail: actionsMet
      ? undefined
      : totalActions === 0
        ? "No action items defined yet"
        : `${doneActions} of ${totalActions} actions complete`,
  });

  // e. all 7 evidence categories resolved (COMPLETE or NOT_APPLICABLE).
  const resolved = evidenceItems.filter((e) =>
    RESOLVED_EVIDENCE_STATUSES.has(e.status),
  ).length;
  const evidenceMet = resolved >= EVIDENCE_CATEGORY_COUNT;
  conditions.push({
    key: "evidence",
    label: "All evidence categories resolved",
    met: evidenceMet,
    detail: evidenceMet
      ? undefined
      : `${resolved} of ${EVIDENCE_CATEGORY_COUNT} categories complete or N/A`,
  });

  // f. at least one effectiveness criterion defined.
  const criteriaMet = criteria.length > 0;
  conditions.push({
    key: "criteria",
    label: "At least 1 effectiveness criterion defined",
    met: criteriaMet,
    detail: criteriaMet ? undefined : "Define how effectiveness will be measured",
  });

  const unmet = conditions
    .filter((c) => !c.met)
    .map((c) => ({ key: c.key, label: c.label }));

  return { conditions, allMet: unmet.length === 0, unmet };
}
