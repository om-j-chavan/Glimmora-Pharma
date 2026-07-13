/**
 * Substage 6.4 — Linked Change Control Execution coordination.
 *
 * Pure helpers for evaluating whether a CAPA's linked Change Controls are
 * sufficiently complete to allow the CAPA to be marked implemented. The
 * server gate inside signAndCloseCAPA and the UI banner in the CAPA detail
 * page (CAPADetailPage) both call into the same evaluator so the visible state
 * and the enforced state can never disagree.
 *
 * Risk-proportionate strictness:
 *   Critical / High → HARD gate: any incomplete linked CC blocks. No override.
 *   Medium  / Low  → SOFT gate: incomplete linked CCs trigger an override-
 *                    with-reason flow. Override reason ≥ 20 chars required.
 *   Any rejected   → HARD gate regardless of risk. A Rejected CC is a
 *                    terminal failure that can never satisfy the dependency
 *                    — operator must remove the link or initiate a
 *                    replacement CC before the CAPA can be implemented.
 */

import type { ChangeControl } from "@prisma/client";

/** CC statuses considered "complete" — the dependency is fulfilled. */
const COMPLETED_CC_STATUSES: ReadonlySet<string> = new Set([
  "Implemented",
  "Closed",
]);

/** CC statuses that hard-block regardless of CAPA risk. */
const BLOCKED_CC_STATUSES: ReadonlySet<string> = new Set(["Rejected"]);

/** Minimum length for the override reason on the soft-gate path. */
export const CC_OVERRIDE_REASON_MIN_LENGTH = 20;

export interface CCDependencyEntry {
  id: string;
  reference: string | null;
  status: string;
  targetImplementationDate: Date | string | null;
}

export interface CCDependencyState {
  /** Total number of linked CCs (excluding soft-deleted CCs at the caller). */
  linkedCount: number;
  /** CCs in Implemented or Closed. */
  completedCount: number;
  /** CCs in any non-terminal status (Draft / In Review / Approved / In Implementation). */
  incompleteCount: number;
  /** CCs in Rejected — a terminal status that can never satisfy the dependency. */
  blockedCount: number;
  /** CCs whose target date has passed but status isn't Implemented or Closed. */
  overdueCount: number;
  /** Full list of incomplete CCs for UI rendering (keyed by id). */
  incompleteCCs: CCDependencyEntry[];
  /** Full list of overdue CCs (subset of incomplete plus possibly some
   *  In Implementation rows whose target slipped). */
  overdueCCs: CCDependencyEntry[];
  /** Full list of blocked (Rejected) CCs for the rejected-banner variant. */
  blockedCCs: CCDependencyEntry[];
}

interface LinkLike {
  changeControl: Pick<
    ChangeControl,
    "id" | "reference" | "status" | "targetImplementationDate"
  > & { deletedAt?: Date | null };
}

/**
 * Compute the dependency state for a CAPA from its loaded link rows.
 * Soft-deleted CCs are excluded entirely — a deleted CC neither blocks
 * nor satisfies the dependency. The caller is responsible for filtering
 * if it doesn't already (deletedAt-checking).
 */
export function evaluateCCDependencies(
  links: LinkLike[],
  now: Date = new Date(),
): CCDependencyState {
  const live = links.filter((l) => !l.changeControl.deletedAt);
  const linkedCount = live.length;

  let completedCount = 0;
  let incompleteCount = 0;
  let blockedCount = 0;
  let overdueCount = 0;
  const incompleteCCs: CCDependencyEntry[] = [];
  const overdueCCs: CCDependencyEntry[] = [];
  const blockedCCs: CCDependencyEntry[] = [];

  for (const l of live) {
    const cc = l.changeControl;
    const entry: CCDependencyEntry = {
      id: cc.id,
      reference: cc.reference ?? null,
      status: cc.status,
      targetImplementationDate: cc.targetImplementationDate ?? null,
    };
    const target = cc.targetImplementationDate
      ? new Date(cc.targetImplementationDate)
      : null;
    const isOverdue =
      target !== null &&
      target.getTime() < now.getTime() &&
      !COMPLETED_CC_STATUSES.has(cc.status);

    if (BLOCKED_CC_STATUSES.has(cc.status)) {
      blockedCount += 1;
      blockedCCs.push(entry);
      continue;
    }
    if (COMPLETED_CC_STATUSES.has(cc.status)) {
      completedCount += 1;
      continue;
    }
    // Anything else = incomplete (Draft / In Review / Approved / In Implementation).
    incompleteCount += 1;
    incompleteCCs.push(entry);
    if (isOverdue) {
      overdueCount += 1;
      overdueCCs.push(entry);
    }
  }

  return {
    linkedCount,
    completedCount,
    incompleteCount,
    blockedCount,
    overdueCount,
    incompleteCCs,
    overdueCCs,
    blockedCCs,
  };
}

/** Critical and High risks hard-gate; Medium and Low soft-gate. */
export function isHardGateRisk(risk: string): boolean {
  return risk === "Critical" || risk === "High";
}

export type CanMarkResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "HARD_GATE_BLOCKED"
        | "SOFT_GATE_REQUIRES_OVERRIDE"
        | "OVERRIDE_REASON_TOO_SHORT";
      details?: string;
    };

/**
 * Decide whether a CAPA can move into Implemented state given its risk,
 * its linked-CC dependency state, and an optional override.
 *
 * Decision order (matches the spec):
 *   1. No incomplete and no blocked → allowed.
 *   2. Any blocked (Rejected CC) → HARD_GATE_BLOCKED, regardless of risk.
 *      Rejected CCs require a replacement CC; no override path exists.
 *   3. Incomplete > 0 AND risk is hard-gate (Critical/High) → HARD_GATE_BLOCKED.
 *   4. Incomplete > 0 AND no override provided → SOFT_GATE_REQUIRES_OVERRIDE.
 *   5. Incomplete > 0 AND override reason too short → OVERRIDE_REASON_TOO_SHORT.
 *   6. Otherwise → allowed (override accepted).
 */
export function canMarkCAPAImplemented(opts: {
  capaRisk: string;
  deps: CCDependencyState;
  overrideProvided: boolean;
  overrideReason?: string;
}): CanMarkResult {
  const { capaRisk, deps, overrideProvided, overrideReason } = opts;

  if (deps.incompleteCount === 0 && deps.blockedCount === 0) {
    return { allowed: true };
  }
  if (deps.blockedCount > 0) {
    const refs = deps.blockedCCs
      .map((c) => c.reference ?? c.id.slice(0, 8))
      .join(", ");
    return {
      allowed: false,
      reason: "HARD_GATE_BLOCKED",
      details: `${deps.blockedCount} linked change control${deps.blockedCount === 1 ? "" : "s"} rejected: ${refs}. Remove the link or initiate a replacement Change Control.`,
    };
  }
  // From here on, deps.incompleteCount > 0.
  if (isHardGateRisk(capaRisk)) {
    const refs = deps.incompleteCCs
      .map((c) => c.reference ?? c.id.slice(0, 8))
      .join(", ");
    return {
      allowed: false,
      reason: "HARD_GATE_BLOCKED",
      details: `${deps.incompleteCount} linked change control${deps.incompleteCount === 1 ? "" : "s"} not yet completed: ${refs}. ${capaRisk} risk CAPAs require all linked change controls to be Implemented or Closed first.`,
    };
  }
  if (!overrideProvided) {
    return {
      allowed: false,
      reason: "SOFT_GATE_REQUIRES_OVERRIDE",
      details: `${deps.incompleteCount} linked change control${deps.incompleteCount === 1 ? "" : "s"} still incomplete. Provide an override reason to proceed.`,
    };
  }
  if (
    !overrideReason ||
    overrideReason.trim().length < CC_OVERRIDE_REASON_MIN_LENGTH
  ) {
    return {
      allowed: false,
      reason: "OVERRIDE_REASON_TOO_SHORT",
      details: `Override reason must be at least ${CC_OVERRIDE_REASON_MIN_LENGTH} characters.`,
    };
  }
  return { allowed: true };
}

/** Convenience: produce the audit-log-friendly snapshot of dep state. */
export function ccDepsSnapshot(deps: CCDependencyState): {
  linkedCount: number;
  completedCount: number;
  incompleteCount: number;
  blockedCount: number;
  overdueCount: number;
  incompleteRefs: string[];
} {
  return {
    linkedCount: deps.linkedCount,
    completedCount: deps.completedCount,
    incompleteCount: deps.incompleteCount,
    blockedCount: deps.blockedCount,
    overdueCount: deps.overdueCount,
    incompleteRefs: deps.incompleteCCs.map((c) => c.reference ?? c.id.slice(0, 8)),
  };
}
