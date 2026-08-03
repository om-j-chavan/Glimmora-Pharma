/**
 * ROLE-BASED DASHBOARD — the authorisation resolver (Phase 3 + Phase 8).
 *
 * THE SECURITY BOUNDARY OF THIS FEATURE. A `DashboardConfig` states what a role's
 * job is; this module decides what the role is ALLOWED to see, and nothing reaches
 * the renderer without passing through here.
 *
 * The rule it enforces: **config can only ever NARROW, never widen.** Every element
 * must satisfy BOTH its config listing AND its live permission clause, evaluated
 * against the same `DashboardAccess` the rest of the app derives from
 * `src/lib/permissions/roleSets.ts` + the permissions matrix. Consequences:
 *
 *   • A KPI whose module is revoked in Settings → Permissions disappears with no
 *     code change.
 *   • A deep link into a module the role cannot open is STRIPPED (the card stays,
 *     the link goes) — this is precisely the leak the pre-role dashboard had, where
 *     every role got clickable /capa, /csv-csa and /governance links with live
 *     counts.
 *   • A read-only posture loses every write-implying quick action even if a config
 *     lists one.
 *
 * Pure: no React, no Redux, no I/O — same inputs, same output, unit-testable.
 */

import { CHANGE_CONTROL_ENABLED } from "@/lib/change-control-constants";
import type { PermissionModule } from "@/lib/permissions/roleSets";
import type {
  DashboardAccess, DashboardConfig, DashboardWidgetKey, GuardedElement,
  KpiDefinition, NavShortcut, QuickAction, ResolvedDashboard,
} from "./types";

/**
 * The ONE gate. An element is permitted when every module it names is viewable
 * AND its own guard passes. Fail-CLOSED: a guard that throws is treated as denied
 * rather than allowed, so a bad config can never open a hole.
 */
export function isPermitted(element: GuardedElement, access: DashboardAccess): boolean {
  try {
    for (const module of element.requiresModules ?? []) {
      if (!access.can(module).canView) return false;
    }
    return element.guard ? element.guard(access) === true : true;
  } catch {
    return false;
  }
}

/** True when the viewer may follow a link owned by `module`. */
function canFollow(module: PermissionModule | undefined, access: DashboardAccess): boolean {
  if (!module) return true;
  // The CAPA and Governance module SURFACES are gated by role-set, not by the
  // matrix — mirror the route guards (app/(app)/capa, app/(app)/governance) so a
  // dashboard link can never land on a redirect.
  if (module === "capa") return access.canViewCAPAModule && access.can("capa").canView;
  if (module === "governance") return access.canViewGovernance;
  return access.can(module).canView;
}

/**
 * Resolve a KPI's deep link to the best destination the viewer may actually reach:
 * the primary (Governance scorecard anchor) if permitted, else the fallback (the
 * owning module), else NO link at all — the card then renders as a plain stat rather
 * than a dead link into a redirect.
 *
 * Returns the SAME object when the primary already works, so `useMemo` consumers keep
 * referential stability across renders.
 */
function withPermittedHref(kpi: KpiDefinition, access: DashboardAccess): KpiDefinition {
  if (!kpi.href || canFollow(kpi.hrefModule, access)) {
    // Primary is followable (or absent) — never advertise the fallback as well.
    if (!kpi.fallbackHref) return kpi;
    const { fallbackHref: _f, fallbackHrefModule: _fm, ...primaryOnly } = kpi;
    return primaryOnly;
  }
  if (kpi.fallbackHref && canFollow(kpi.fallbackHrefModule, access)) {
    const { fallbackHref, fallbackHrefModule, ...rest } = kpi;
    return { ...rest, href: fallbackHref, hrefModule: fallbackHrefModule };
  }
  const { href: _h, hrefModule: _hm, fallbackHref: _f, fallbackHrefModule: _fm, ...rest } = kpi;
  return rest;
}

/**
 * Resolve a role's declared dashboard into exactly what the viewer may see.
 *
 * Ordering is deliberate: KPIs keep config order (the role's own priority), and
 * duplicate keys are collapsed so a config that lists the same element twice — or
 * inherits it from two catalog groups — can never render a duplicated widget.
 */
export function resolveDashboard(
  config: DashboardConfig,
  access: DashboardAccess,
): ResolvedDashboard {
  const permitted = <T extends GuardedElement>(items: readonly T[]): T[] =>
    items.filter((i) => isPermitted(i, access));

  /** Dedupe by a key selector, preserving first-seen order. */
  const unique = <T>(items: T[], keyOf: (i: T) => string): T[] => {
    const seen = new Set<string>();
    return items.filter((i) => {
      const k = keyOf(i);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const kpis = unique(permitted(config.kpis), (k) => k.key)
    .map((k) => withPermittedHref(k, access));

  const quickActions = unique(permitted<QuickAction>(config.quickActions), (a) => a.key);
  const navShortcuts = unique(permitted<NavShortcut>(config.navShortcuts), (n) => n.key);

  /**
   * Drop a widget that would provably render NOTHING.
   *
   * The page lays its widgets out as GRID ITEMS, so a component that returns
   * `null` after being placed still costs a track — a hole in the layout that the
   * old two-stack markup happened to hide. Deciding it here, where the resolved
   * lists already exist, keeps "what renders" in one place instead of splitting it
   * between the resolver, the registry and the widget's own early return.
   */
  const rendersContent = (key: DashboardWidgetKey): boolean => {
    if (key === "quick-actions") return quickActions.length > 0;
    if (key === "nav-shortcuts") return navShortcuts.length > 0;
    if (key === "change-control-status") return CHANGE_CONTROL_ENABLED;
    return true;
  };

  const widgetKeys = (placements: DashboardConfig["mainWidgets"]) =>
    unique(permitted(placements), (w) => w.key).map((w) => w.key).filter(rendersContent);

  return {
    role: config.role,
    description: config.description,
    focusArea: config.focusArea,
    kpis,
    mainWidgets: widgetKeys(config.mainWidgets),
    railWidgets: widgetKeys(config.railWidgets),
    quickActions,
    // The AI panel itself is guarded; a denied panel resolves to zero streams so
    // the widget renders its own "nothing to show" state rather than disappearing
    // mid-layout.
    ai: isPermitted(config.ai, access) ? config.ai : { ...config.ai, streams: [] },
    navShortcuts,
  };
}
