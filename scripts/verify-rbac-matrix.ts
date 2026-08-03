/**
 * RBAC matrix verification harness.
 *
 * Asserts the agreed role matrix directly against the SHARED predicates in
 * src/lib/permissions/roleSets.ts — the same functions the Sidebar, the route
 * guards (requireRoleOrDeny) and the server actions all call. If this passes,
 * UI visibility and server authorization agree by construction, because there
 * is only one definition behind both.
 *
 * Run: npx tsx scripts/verify-rbac-matrix.ts
 */
import {
  canViewCSV, canWriteCSV,
  canViewReadiness, canWriteReadiness,
  canViewGovernance, canManageGovernance, canCreateRisk, canCreateManagementDecision,
  canViewFDA483, canWriteFDA483,
  canViewAuditTrail,
  canWriteQuality, canWriteOutsideSettings, isReadOnlyOutsideSettings,
  SETTINGS_MANAGE_ROLES,
  CAPA_MODULE_VIEW_ROLES,
} from "../src/lib/permissions/roleSets";

const ROLES = [
  "qa_head", "customer_admin", "csv_val_lead", "regulatory_affairs",
  "qa", "qc_lab_director", "it_cdo", "operations_head", "viewer", "super_admin",
] as const;
type Role = (typeof ROLES)[number];

type Check = { name: string; fn: (r: string) => boolean; allow: Role[] };

const CHECKS: Check[] = [
  // ── Module VIEW (sidebar entry + route guard) ──
  { name: "CSV · view",            fn: canViewCSV,        allow: ["qa_head", "customer_admin", "csv_val_lead"] },
  { name: "Readiness · view",      fn: canViewReadiness,  allow: ["qa_head", "customer_admin"] },
  { name: "Governance · view",     fn: canViewGovernance, allow: ["qa_head", "customer_admin"] },
  { name: "AuditTrail · view",     fn: canViewAuditTrail, allow: ["qa_head", "customer_admin", "super_admin"] },
  { name: "FDA483 · view",         fn: canViewFDA483,     allow: ["qa_head", "customer_admin", "regulatory_affairs"] },
  { name: "CAPA · view",           fn: (r) => CAPA_MODULE_VIEW_ROLES.includes(r), allow: ["qa_head", "customer_admin"] },

  // ── Module WRITE (server actions) — customer_admin must be absent everywhere ──
  { name: "CSV · write",           fn: canWriteCSV,       allow: ["qa_head", "csv_val_lead"] },
  { name: "Readiness · write",     fn: canWriteReadiness, allow: ["qa_head", "super_admin"] },
  { name: "Governance · manage",   fn: canManageGovernance, allow: ["qa_head", "super_admin"] },
  { name: "Governance · createRisk", fn: canCreateRisk,   allow: ["qa_head", "super_admin"] },
  { name: "Governance · minuteReview", fn: canCreateManagementDecision, allow: ["qa_head", "super_admin"] },
  { name: "FDA483 · write",        fn: canWriteFDA483,    allow: ["qa_head", "regulatory_affairs"] },
  { name: "Quality · write",       fn: canWriteQuality,   allow: ["qa_head", "csv_val_lead", "regulatory_affairs", "qa", "qc_lab_director", "it_cdo", "operations_head"] },
  { name: "AnyModule · write",     fn: canWriteOutsideSettings, allow: ["qa_head", "csv_val_lead", "regulatory_affairs", "qa", "qc_lab_director", "it_cdo", "operations_head"] },

  // ── Settings — the ONE place customer_admin may manage ──
  { name: "Settings · manage",     fn: (r) => SETTINGS_MANAGE_ROLES.includes(r), allow: ["customer_admin", "super_admin"] },
];

let failures = 0;
const rows: string[] = [];

for (const check of CHECKS) {
  const actual = ROLES.filter((r) => check.fn(r));
  const expected = [...check.allow].sort();
  const got = [...actual].sort();
  const ok = JSON.stringify(expected) === JSON.stringify(got);
  if (!ok) {
    failures++;
    rows.push(`FAIL  ${check.name}\n        expected: ${expected.join(", ") || "(none)"}\n        actual:   ${got.join(", ") || "(none)"}`);
  } else {
    rows.push(`ok    ${check.name.padEnd(30)} ${got.join(", ") || "(none)"}`);
  }
}

console.log(rows.join("\n"));

// ── Invariant: customer_admin writes NOTHING outside Settings ──
const CA_WRITE_GATES: [string, (r: string) => boolean][] = [
  ["canWriteCSV", canWriteCSV],
  ["canWriteFDA483", canWriteFDA483],
  ["canWriteReadiness", canWriteReadiness],
  ["canManageGovernance", canManageGovernance],
  ["canCreateRisk", canCreateRisk],
  ["canCreateManagementDecision", canCreateManagementDecision],
  ["canWriteQuality", canWriteQuality],
  ["canWriteOutsideSettings", canWriteOutsideSettings],
];
console.log("\n── customer_admin read-only invariant ──");
for (const [name, fn] of CA_WRITE_GATES) {
  const leaks = fn("customer_admin");
  if (leaks) { failures++; console.log(`FAIL  customer_admin passes ${name}`); }
  else console.log(`ok    customer_admin blocked by ${name}`);
}
if (!isReadOnlyOutsideSettings("customer_admin")) { failures++; console.log("FAIL  isReadOnlyOutsideSettings(customer_admin) is false"); }
if (!SETTINGS_MANAGE_ROLES.includes("customer_admin")) { failures++; console.log("FAIL  customer_admin lost Settings manage"); }
else console.log("ok    customer_admin RETAINS Settings manage");

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
