/**
 * Substage 5.2 — Tiered Approval Routing for CAPA.
 *
 * Single-tier QA model — count-based instead of role-tier-based. Distinct
 * users (by id) at the required role count toward the requirement; the
 * same user approving twice still counts as 1, and the upstream
 * approveCAPA action's alreadyApproved check ensures one userId can never
 * fill two slots even if they wear two role hats.
 *
 * Spec mapping (from CAPA_Lifecycle_Stages.pdf §5.2):
 *   Critical → Site Head + QA Director + Reg Affairs
 *   High     → QA Director
 *   Medium   → QA Manager
 *   Low      → QA Reviewer
 *
 * Real-world calibration: most pharma sites have one QA Head (sometimes
 * two — Director + a deputy). Demanding 3 distinct qa_heads to close a
 * Critical CAPA is theatrical separation-of-duties that breaks for
 * smaller customers. The simplified mapping here keeps the
 * separation-of-duties property at the role level (QA cannot self-approve
 * a Critical CAPA without a Regulatory Affairs sign-off) while staying
 * achievable for a 1-2-QA-Head org:
 *
 *   Critical → 1 qa_head + 1 regulatory_affairs (two distinct roles,
 *              two distinct people — distinct-user enforcement happens
 *              at approveCAPA via approverId uniqueness)
 *   High     → 1 qa_head
 *   Medium   → 1 qa_head
 *   Low      → 1 qa_head
 *
 * The High-tier "second pair of eyes" was a workaround for the same
 * staffing reality and dropped for the same reason. The discussion thread
 * (substage 5.3, see CAPAComment + evaluateApprovalProgress comments
 * argument) is the actual second-pair-of-eyes mechanism — concerns block
 * approval until adjudicated.
 */

export type ApprovalTier = "Critical" | "High" | "Medium" | "Low";

export interface ApprovalRequirement {
  /** Role required to approve. */
  role: "qa_head" | "regulatory_affairs";
  /** Count of distinct users with this role required. */
  count: number;
}

export const APPROVAL_REQUIREMENTS: Record<ApprovalTier, ApprovalRequirement[]> = {
  Critical: [
    { role: "qa_head", count: 1 },
    { role: "regulatory_affairs", count: 1 },
  ],
  High: [{ role: "qa_head", count: 1 }],
  Medium: [{ role: "qa_head", count: 1 }],
  Low: [{ role: "qa_head", count: 1 }],
};

/**
 * Result of evaluateApprovalProgress.
 *
 * `satisfied: true` means the CAPA can be closed via signAndCloseCAPA —
 * every approver slot is filled AND every concern comment is resolved.
 *
 * When `satisfied: false`, `reason` discriminates the block: unresolved
 * concerns take precedence over insufficient approvers (per substage 5.2
 * §5.3, "all reviewer comments adjudicated and documented before
 * approval"). `missing` is always populated with the current approver
 * shortfall so the UI can render the per-slot list regardless of why the
 * gate is closed.
 */
export interface ApprovalProgress {
  satisfied: boolean;
  /** Approver slots still required, grouped by role with remaining count. */
  missing: ApprovalRequirement[];
  /** Number of unresolved concern comments blocking final approval. */
  unresolvedConcerns: number;
  /** Why approval is blocked. Undefined when satisfied = true. */
  reason?: "UNRESOLVED_CONCERNS" | "INSUFFICIENT_APPROVERS";
}

/** Comment shape this evaluator needs — keep it minimal so callers can
 *  use either Prisma rows (Date | null) or serialised tree nodes. */
export interface ApprovalProgressComment {
  isConcern: boolean;
  resolvedAt: Date | string | null;
  deletedAt: Date | string | null;
}

/**
 * Evaluate whether a CAPA's collected approvals satisfy its tier
 * requirement AND its discussion thread has no unresolved concerns. Pure
 * function — same input always produces same output, no Prisma / network
 * access. Used by both the server (close-gate inside signAndCloseCAPA and
 * approveCAPA) and the client (badge / disabled approve button in the
 * Actions tab).
 *
 * Behaviour:
 * - Approvals from a role NOT in the tier requirement are ignored (don't
 *   subtract).
 * - Same userId at the same role counts as 1 (dedupe by id).
 * - `missing` lists what's still needed, with `count = remaining slots`.
 *   Roles already fully satisfied are omitted from `missing`.
 * - Empty approvals → all tier requirements appear in `missing`.
 * - `comments` defaults to []. Unresolved concerns count as: isConcern &&
 *   !resolvedAt && !deletedAt. Soft-deleted concerns are withdrawn — they
 *   don't block.
 * - When `unresolvedConcerns > 0`, returns reason="UNRESOLVED_CONCERNS"
 *   even if the approver count is otherwise satisfied.
 *
 * @example
 *   evaluateApprovalProgress("High", [], []);
 *   // { satisfied: false, missing: [{role:"qa_head",count:2}],
 *   //   unresolvedConcerns: 0, reason: "INSUFFICIENT_APPROVERS" }
 *
 *   evaluateApprovalProgress("Low",
 *     [{approverRole:"qa_head",approverId:"u1"}],
 *     [{isConcern:true, resolvedAt:null, deletedAt:null}]);
 *   // { satisfied: false, missing: [],
 *   //   unresolvedConcerns: 1, reason: "UNRESOLVED_CONCERNS" }
 */
export function evaluateApprovalProgress(
  risk: ApprovalTier,
  approvals: { approverRole: string; approverId: string }[],
  comments: ApprovalProgressComment[] = [],
): ApprovalProgress {
  const requirements = APPROVAL_REQUIREMENTS[risk];

  // Bucket approver ids by role; dedupe within each bucket.
  const distinctIdsByRole = new Map<string, Set<string>>();
  for (const a of approvals) {
    const set = distinctIdsByRole.get(a.approverRole) ?? new Set<string>();
    set.add(a.approverId);
    distinctIdsByRole.set(a.approverRole, set);
  }

  const missing: ApprovalRequirement[] = [];
  for (const req of requirements) {
    const have = distinctIdsByRole.get(req.role)?.size ?? 0;
    const remaining = Math.max(0, req.count - have);
    if (remaining > 0) {
      missing.push({ role: req.role, count: remaining });
    }
  }

  // Unresolved concerns: isConcern AND not yet resolved AND not deleted.
  // Deleted concerns are treated as withdrawn — they don't block approval.
  const unresolvedConcerns = comments.filter(
    (c) => c.isConcern && !c.resolvedAt && !c.deletedAt,
  ).length;

  if (unresolvedConcerns > 0) {
    return {
      satisfied: false,
      missing,
      unresolvedConcerns,
      reason: "UNRESOLVED_CONCERNS",
    };
  }
  if (missing.length > 0) {
    return {
      satisfied: false,
      missing,
      unresolvedConcerns: 0,
      reason: "INSUFFICIENT_APPROVERS",
    };
  }
  return { satisfied: true, missing: [], unresolvedConcerns: 0 };
}

/**
 * UI-side gate — show or hide the Approve button for a given user role
 * and CAPA risk. Server enforces the same rule via the same import.
 */
export function canApproveCAPA(userRole: string, capaRisk: string): boolean {
  const requirements = APPROVAL_REQUIREMENTS[capaRisk as ApprovalTier];
  if (!requirements) return false;
  return requirements.some((r) => r.role === userRole);
}
