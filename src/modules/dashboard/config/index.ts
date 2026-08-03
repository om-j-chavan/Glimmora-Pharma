/**
 * ROLE-BASED DASHBOARD — the config registry (Phase 3).
 *
 * ONE map from role → dashboard declaration. Adding a role to the app means adding
 * one file here; the page component never changes.
 *
 * COVERAGE IS COMPILE-CHECKED: `DASHBOARD_CONFIGS` is typed `Record<RoleKey, …>`,
 * so adding a role to `RoleKey` in `src/store/permissions.slice.ts` without giving
 * it a dashboard is a TypeScript error, not a blank screen at runtime.
 */

import type { RoleKey } from "@/store/permissions.slice";
import { customerAdminDashboard } from "./customerAdmin";
import { csvValidationLeadDashboard } from "./csvValidationLead";
import { itCdoDashboard } from "./itCdo";
import { operationsHeadDashboard } from "./operationsHead";
import { qaHeadDashboard } from "./qaHead";
import { qcLabDirectorDashboard } from "./qcLabDirector";
import { qualityAssuranceDashboard } from "./qualityAssurance";
import { regulatoryAffairsDashboard } from "./regulatoryAffairs";
import { viewerDashboard } from "./viewer";
import type { DashboardConfig } from "./types";

export const DASHBOARD_CONFIGS: Record<RoleKey, DashboardConfig> = {
  customer_admin: customerAdminDashboard,
  qa_head: qaHeadDashboard,
  qa: qualityAssuranceDashboard,
  qc_lab_director: qcLabDirectorDashboard,
  regulatory_affairs: regulatoryAffairsDashboard,
  csv_val_lead: csvValidationLeadDashboard,
  it_cdo: itCdoDashboard,
  operations_head: operationsHeadDashboard,
  viewer: viewerDashboard,
  // super_admin is walled to the /admin console — the (app) layout redirects it and
  // the Sidebar blanks its nav. It is mapped to the READ-ONLY viewer dashboard as
  // defense-in-depth: if a redirect is ever missed, a platform admin sees a
  // read-only tenant overview and no quality-authoring affordance, which is exactly
  // the `canAuthorGxP` bright line the server enforces.
  super_admin: viewerDashboard,
};

/**
 * The dashboard for a role string. Falls back to the READ-ONLY viewer config for
 * an unknown role — fail-closed, matching `usePermissions`, which also defaults an
 * unresolvable role to "viewer".
 */
export function dashboardConfigForRole(role: string | null | undefined): DashboardConfig {
  if (!role) return viewerDashboard;
  return DASHBOARD_CONFIGS[role as RoleKey] ?? viewerDashboard;
}

export { resolveDashboard, isPermitted } from "./resolve";
export * from "./types";
export type { DashboardDataset } from "./dataset";
export type {
  AlertEntry, ComplianceLine, PendingTaskEntry,
} from "./dataset";
