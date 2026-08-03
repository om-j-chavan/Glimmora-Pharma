/**
 * Re-export barrel for the CAPA action domain. Existing consumers can
 * keep importing from "@/actions/capas" — the implementations have moved
 * to capas/{lifecycle,closure,alignment,approvals}.ts but the import
 * shape is unchanged.
 *
 * Why split: the original capas.ts grew to 1,572 lines mixing five
 * unrelated workflows (lifecycle / closure / alignment review / tiered
 * approvals / approval revocation). The pre-commit audit flagged it as
 * "should split"; this barrel preserves backward-compatible import
 * paths while the actual code now lives in the four domain files.
 *
 * Note: NO "use server" directive on this barrel. Each domain file
 * carries its own "use server" — that's where Next 16's server-action
 * graph is rooted. A "use server" barrel doesn't propagate re-exports
 * through Next 16's RSC compiler (verified empirically: tsc passes,
 * `next build` errors with "The module has no exports at all"). The
 * regular module barrel pattern below works because it's just a normal
 * ES module re-export of the (already-server-marked) functions.
 */

export {
  createCAPA,
  updateCAPA,
  clearDIGate,
  submitForReview,
  rejectCAPA,
  startCAPAProgress,
  reopenCAPA,
  deleteCAPA,
} from "./capas/lifecycle";

export { signAndCloseCAPA, loadCAPACCDeps } from "./capas/closure";

export {
  setCAPAAlignmentStatus,
  overrideCAPAAlignmentFlag,
  clearCAPAAlignmentReview,
} from "./capas/alignment";

// Phase 4 — approveCAPA / revokeCAPAApproval / loadApprovalsForCAPA removed.
// A separate approve step added nothing after per-person accept (Phase 2) +
// RCA-review SoD; Sign & Close IS the approval. capa-approvals.ts (canApproveCAPA
// / APPROVAL_REQUIREMENTS) stays — effectiveness.ts still uses it. The
// CAPAApproval model + CAPA_APPROVAL* SignedRecords stay (Part 11 immutability).

export {
  reviewRCA,
  overrideRCAReview,
  clearRCAReview,
} from "./capas/rca-review";

export {
  verifyCAPA,
  revokeCAPAVerification,
} from "./capas/verification";

export {
  addActionItem,
  updateActionItem,
  deleteActionItem,
  loadActionItemsForCAPA,
  acceptWork,
  sendWorkBack,
  cancelTask,
  skipTask,
  reassignTask,
  nudgeActionItemOwner,
} from "./capas/action-items";

export {
  recordEffectivenessReview,
  revokeEffectivenessReview,
} from "./capas/effectiveness";
