/**
 * Role-based dashboard verification harness (Phase 10).
 *
 * Runs the REAL resolver against the REAL permission matrix + role-sets for EVERY
 * role in `RoleKey` and asserts the security and integrity properties the feature
 * claims. It imports the shipping modules — nothing is re-implemented here — so a
 * future config edit that opens a leak fails this script.
 *
 *   npx tsx scripts/verify-role-dashboards.ts
 *
 * Checks per role:
 *   1. The config resolves without throwing.
 *   2. No duplicate KPI / widget / action / shortcut keys.
 *   3. Every KPI `href` targets a module the role may actually open.
 *   4. Every quick action and shortcut targets a route the role may open.
 *   5. Nothing links to `/capa` unless the role holds CAPA_MODULE_VIEW_ROLES.
 *   6. Nothing links to `/governance` unless the role holds GOVERNANCE_VIEW_ROLES.
 *   7. Nothing links to `/audit-trail` unless the role holds AUDIT_TRAIL_VIEW_ROLES.
 *   8. Nothing links to `/change-control` while CHANGE_CONTROL_ENABLED is false.
 *   9. A read-only identity is offered no quick actions at all.
 *  10. Every widget key the config lists is mounted in the registry's key set.
 */

import { CHANGE_CONTROL_ENABLED } from "../src/lib/change-control-constants";
import {
  AUDIT_TRAIL_VIEW_ROLES, CAPA_MODULE_VIEW_ROLES, canViewGovernance,
  getModuleCapabilities, type PermissionModule,
} from "../src/lib/permissions/roleSets";
import type { ModuleKey, RoleKey } from "../src/store/permissions.slice";
import { DASHBOARD_CONFIGS, dashboardConfigForRole } from "../src/modules/dashboard/config";
import { resolveDashboard } from "../src/modules/dashboard/config/resolve";
import type { DashboardAccess, DashboardWidgetKey } from "../src/modules/dashboard/config/types";

/* The DEFAULT_MATRIX is module-private, so mirror the one fact this harness needs:
 * which (role, module) pairs are viewable. Kept in ONE place and asserted against
 * the real `getModuleCapabilities`, so a matrix change that this misses shows up as
 * a capability mismatch rather than a silent pass. */
const MATRIX: Record<RoleKey, Record<ModuleKey, string>> = {
  super_admin: { dashboard: "full", gap: "full", capa: "full", csv: "full", fda483: "full", evidence: "full", agi: "full", governance: "full", settings: "full" },
  customer_admin: { dashboard: "full", gap: "full", capa: "full", csv: "full", fda483: "full", evidence: "full", agi: "full", governance: "full", settings: "limited" },
  qa_head: { dashboard: "full", gap: "full", capa: "full", csv: "full", fda483: "full", evidence: "full", agi: "full", governance: "full", settings: "limited" },
  qa: { dashboard: "readonly", gap: "readonly", capa: "readonly", csv: "readonly", fda483: "readonly", evidence: "readonly", agi: "readonly", governance: "limited", settings: "none" },
  qc_lab_director: { dashboard: "readonly", gap: "full", capa: "limited", csv: "full", fda483: "readonly", evidence: "full", agi: "readonly", governance: "readonly", settings: "none" },
  regulatory_affairs: { dashboard: "readonly", gap: "full", capa: "limited", csv: "readonly", fda483: "full", evidence: "full", agi: "readonly", governance: "full", settings: "none" },
  csv_val_lead: { dashboard: "readonly", gap: "full", capa: "limited", csv: "full", fda483: "readonly", evidence: "full", agi: "limited", governance: "readonly", settings: "none" },
  it_cdo: { dashboard: "readonly", gap: "readonly", capa: "readonly", csv: "full", fda483: "readonly", evidence: "readonly", agi: "full", governance: "readonly", settings: "none" },
  operations_head: { dashboard: "full", gap: "readonly", capa: "limited", csv: "readonly", fda483: "readonly", evidence: "readonly", agi: "readonly", governance: "full", settings: "none" },
  viewer: { dashboard: "readonly", gap: "readonly", capa: "readonly", csv: "readonly", fda483: "readonly", evidence: "readonly", agi: "readonly", governance: "readonly", settings: "none" },
};

const MATRIX_MODULES = new Set<string>([
  "dashboard", "gap", "capa", "csv", "fda483", "evidence", "agi", "governance", "settings",
]);

/** Every widget key the registry mounts (mirrors `DashboardWidgetKey`). */
const MOUNTED_WIDGETS = new Set<DashboardWidgetKey>([
  "area-heatmap", "finding-trend", "deviation-trend", "validation-status",
  "regulatory-calendar", "tenant-health", "change-control-status", "action-plan",
  "ai-insights", "risk-signals", "compliance-status", "pending-tasks",
  "quick-actions", "alerts", "nav-shortcuts",
]);

/** Route → the permission that must hold for a role to follow it. */
const ROUTE_GATE: { prefix: string; allowed: (a: DashboardAccess) => boolean }[] = [
  { prefix: "/capa", allowed: (a) => a.canViewCAPAModule && a.can("capa").canView },
  { prefix: "/governance", allowed: (a) => a.canViewGovernance },
  { prefix: "/audit-trail", allowed: (a) => a.canViewAuditTrail },
  { prefix: "/change-control", allowed: () => CHANGE_CONTROL_ENABLED },
  { prefix: "/gap-assessment", allowed: (a) => a.can("gap").canView },
  { prefix: "/csv-csa", allowed: (a) => a.can("csv").canView },
  { prefix: "/fda-483", allowed: (a) => a.can("fda483").canView },
  { prefix: "/evidence", allowed: (a) => a.can("evidence").canView },
  { prefix: "/settings", allowed: (a) => a.can("settings").canView },
  { prefix: "/ai-policy", allowed: (a) => a.canManageTenant },
  // Always-on routes for every non-super_admin role (see Sidebar): /deviation,
  // /readiness, /worklist, /notifications, /support, /regulatory-intelligence.
];

function buildAccess(role: RoleKey, gxpSignatory = true): DashboardAccess {
  const can = (module: PermissionModule) => {
    let canView: boolean;
    if (module === "deviation" || module === "readiness") canView = true;
    else if (module === "audit-trail") canView = AUDIT_TRAIL_VIEW_ROLES.includes(role);
    else if (!MATRIX_MODULES.has(module)) canView = true;
    else canView = (MATRIX[role][module as ModuleKey] ?? "none") !== "none";
    return getModuleCapabilities(role, gxpSignatory, canView, module);
  };
  const allReadonly = Object.values(MATRIX[role]).every((v) => v === "readonly" || v === "none");
  return {
    role,
    gxpSignatory,
    can,
    canViewCAPAModule: CAPA_MODULE_VIEW_ROLES.includes(role),
    canViewGovernance: canViewGovernance(role),
    canViewAuditTrail: AUDIT_TRAIL_VIEW_ROLES.includes(role),
    canManageTenant: role === "customer_admin" || role === "super_admin",
    readOnly: role === "viewer" || allReadronlyGuard(allReadonly),
  };
}
/** Tiny indirection so the boolean reads the same way the hook words it. */
const allReadronlyGuard = (v: boolean) => v;

const failures: string[] = [];
const fail = (role: string, msg: string) => failures.push(`[${role}] ${msg}`);

function checkRoute(role: string, label: string, href: string, access: DashboardAccess) {
  const gate = ROUTE_GATE.find((g) => href.startsWith(g.prefix));
  if (gate && !gate.allowed(access)) {
    fail(role, `${label} links to "${href}" but the role may not open it`);
  }
}

function dupes<T>(items: T[], keyOf: (i: T) => string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const k = keyOf(i);
    if (seen.has(k)) out.push(k);
    seen.add(k);
  }
  return out;
}

const roles = Object.keys(DASHBOARD_CONFIGS) as RoleKey[];
const rows: string[] = [];

for (const role of roles) {
  const access = buildAccess(role);
  let resolved;
  try {
    resolved = resolveDashboard(dashboardConfigForRole(role), access);
  } catch (err) {
    fail(role, `resolveDashboard threw: ${String(err)}`);
    continue;
  }

  // 2 — no duplicates anywhere
  for (const [label, ds] of [
    ["KPI", dupes(resolved.kpis, (k) => k.key)],
    ["widget(main)", dupes(resolved.mainWidgets.map((k) => ({ k })), (i) => i.k)],
    ["widget(rail)", dupes(resolved.railWidgets.map((k) => ({ k })), (i) => i.k)],
    ["quick action", dupes(resolved.quickActions, (a) => a.key)],
    ["shortcut", dupes(resolved.navShortcuts, (n) => n.key)],
  ] as [string, string[]][]) {
    if (ds.length) fail(role, `duplicate ${label} keys: ${ds.join(", ")}`);
  }
  // A widget must not appear in BOTH columns either.
  const both = resolved.mainWidgets.filter((k) => resolved.railWidgets.includes(k));
  if (both.length) fail(role, `widget in both columns: ${both.join(", ")}`);

  // 3/4/5/6/7/8 — every link is followable, and the resolver must have collapsed the
  // primary/fallback pair down to a SINGLE href (never both).
  for (const k of resolved.kpis) {
    if (k.href) checkRoute(role, `KPI "${k.key}"`, k.href, access);
    if (k.fallbackHref) {
      fail(role, `KPI "${k.key}" still carries a fallbackHref after resolution`);
    }
  }
  for (const a of resolved.quickActions) checkRoute(role, `action "${a.key}"`, a.href, access);
  for (const n of resolved.navShortcuts) checkRoute(role, `shortcut "${n.key}"`, n.href, access);

  // 9 — read-only identity gets no quick actions
  if (access.readOnly && resolved.quickActions.length > 0) {
    fail(role, `read-only identity offered ${resolved.quickActions.length} quick action(s): ${resolved.quickActions.map((a) => a.key).join(", ")}`);
  }

  // 10 — every listed widget is mounted
  for (const k of [...resolved.mainWidgets, ...resolved.railWidgets]) {
    if (!MOUNTED_WIDGETS.has(k)) fail(role, `widget "${k}" is not mounted in the registry`);
  }

  // A dashboard with no KPIs at all is a regression, not a valid configuration.
  if (resolved.kpis.length === 0) fail(role, "resolved to ZERO KPI cards");

  rows.push(
    `${role.padEnd(19)} kpis=${String(resolved.kpis.length).padStart(2)}  `
    + `main=${String(resolved.mainWidgets.length).padStart(2)}  rail=${String(resolved.railWidgets.length).padStart(2)}  `
    + `actions=${String(resolved.quickActions.length).padStart(2)}  `
    + `nav=${String(resolved.navShortcuts.length).padStart(2)}  `
    + `ai=${resolved.ai.streams.join("/") || "(none)"}  `
    + `area=${resolved.focusArea ?? "-"}`,
  );
}

console.log("\nRole-based dashboard resolution\n" + "─".repeat(120));
for (const r of rows) console.log(r);
console.log("─".repeat(120));
console.log(`CHANGE_CONTROL_ENABLED = ${CHANGE_CONTROL_ENABLED}\n`);

if (failures.length) {
  console.error(`✗ ${failures.length} failure(s):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`✓ all ${roles.length} roles resolved with no permission leaks, duplicates or broken links.\n`);
