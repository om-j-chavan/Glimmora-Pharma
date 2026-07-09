/**
 * Error-code label layer (super-admin-facing).
 *
 * Maps machine error codes that surface to a super_admin to human sentences.
 * Pre-seeded with the plan-cap / expiry codes so cap enforcement can throw
 * them and the UI already knows how to render them. Unknown codes get a
 * humanised fallback so a raw code never reaches the UI.
 *
 * Matches the plain-TS convention of src/lib/plans.ts (no deps).
 */

export const ERROR_CODE_LABELS: Record<string, string> = {
  PLAN_CAP_EXCEEDED: "User limit reached for this plan",
  SITE_CAP_EXCEEDED: "Site limit reached for this plan",
  // Role-cap block (Phase B). The create path surfaces THIS exact tenant-facing
  // copy for a full role. The gate's role-SPECIFIC detail ("QA Head limit reached
  // (2/2)") is preserved in the USER_CREATE_BLOCKED audit entry, not the UI.
  ROLE_CAP_EXCEEDED: "The maximum number of users allowed for this role has been reached. Please upgrade your subscription or choose a different role.",
  NO_PLAN_ASSIGNED: "No plan assigned to this account",
  PLAN_EXPIRED: "This plan has expired",
  SUBSCRIPTION_INACTIVE: "Subscription inactive",
  AMBIGUOUS_EMAIL: "This email matches more than one account",
};

/** Title-case an UPPER_SNAKE error code — fallback for un-mapped codes. */
function humanise(code: string): string {
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Human label for an error code. Mapped codes use ERROR_CODE_LABELS; unknown
 * codes get a humanised fallback so no raw code reaches the UI.
 */
export function errorCodeLabel(code: string): string {
  if (!code) return "";
  // Only machine codes (UPPER_SNAKE / digits) are mapped or humanised. An input
  // that is already a human sentence — e.g. the gate's role-specific
  // "QA Head limit reached (2/2)" — is returned verbatim, never mangled.
  if (!/^[A-Z0-9_]+$/.test(code)) return code;
  return ERROR_CODE_LABELS[code] ?? humanise(code);
}
