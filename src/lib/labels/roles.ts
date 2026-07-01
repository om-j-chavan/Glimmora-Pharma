/**
 * Shared role label layer.
 *
 * Roles are free strings in the schema (User.role / Tenant.role), so this is
 * the single source of *display text* for a role. The UI must never render a
 * raw role code (e.g. "qc_lab_director" or "superadmin") — import roleLabel()
 * and pass the stored role string. Known roles get a curated label; unknown
 * roles get a humanised fallback so a newly-added role still reads sensibly.
 *
 * Colour / badge-variant maps stay per-module — this module is text only.
 * Matches the plain-TS convention of src/lib/plans.ts (no deps).
 */

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Platform Admin",
  // Alias: the platform admin's username/identity is sometimes "superadmin"
  // (no underscore) — never let that raw token reach the UI.
  superadmin: "Platform Admin",
  customer_admin: "Customer Admin",
  qa_head: "QA Head",
  qa: "Quality Assurance",
  qc_lab_director: "QC / Lab Director",
  regulatory_affairs: "Regulatory Affairs",
  csv_val_lead: "CSV / Val Lead",
  it_cdo: "IT / CDO",
  operations_head: "Operations Head",
  viewer: "Viewer",
};

/** Title-case a snake_case code — last-resort label for unknown roles. */
function humanise(code: string): string {
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Human label for a role string. Known roles use ROLE_LABELS; unknown roles
 * fall back to a humanised form so a raw code never reaches the UI.
 */
export function roleLabel(role: string): string {
  if (!role) return "";
  return ROLE_LABELS[role] ?? humanise(role);
}
