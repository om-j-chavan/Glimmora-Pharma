/**
 * ROLE-BASED DASHBOARD — the widget contract.
 *
 * EVERY widget takes the SAME three props and nothing else. That uniformity is what
 * lets the registry render a role's layout from a plain list of keys, with no
 * per-role branching in the page component:
 *
 *   {dashboard.mainWidgets.map((key) => <DashboardWidget key={key} widget={key} … />)}
 *
 * A widget therefore never asks "which role am I rendering for?" — it reads the
 * dataset and the resolved config, both of which have already been narrowed to what
 * this viewer may see.
 */

import type { DashboardAccess, DashboardDataset, ResolvedDashboard } from "../config";
import type { CanOpen } from "../config/derive";

export interface DashboardWidgetProps {
  /** The assembled, filter-narrowed data model. */
  data: DashboardDataset;
  /** The role's config AFTER permission resolution. */
  dashboard: ResolvedDashboard;
  /** Live authorisation facts — for the last-mile link/affordance checks. */
  access: DashboardAccess;
  /** "May this viewer open that module?" — derived once from `access`. */
  canOpen: CanOpen;
}
