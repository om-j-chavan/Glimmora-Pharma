/**
 * ROLE-BASED DASHBOARD — configuration contract (Phase 3).
 *
 * A role's dashboard is DECLARED here as data, never branched in JSX. One config
 * per role lists which KPI cards, widgets, quick actions, AI panels and
 * navigation shortcuts that role sees; the resolver (./resolve.ts) then filters
 * the declaration against the LIVE RBAC layer before anything renders.
 *
 * TWO INDEPENDENT GATES, both mandatory:
 *
 *   1. CONFIG      — "is this element part of this role's job?"  (relevance)
 *   2. PERMISSION  — "is this role allowed to see/do it?"        (authorisation)
 *
 * A config listing an element it has no permission for is a no-op: the resolver
 * drops it. That ordering matters — it means a future config edit can never widen
 * access, because authorisation is decided by `src/lib/permissions/roleSets.ts` +
 * the permissions matrix, exactly as it is everywhere else in the app.
 *
 * Pure types + pure selector signatures — NO React imports, so a config module
 * can be unit-tested and imported from either side of the client boundary.
 */

import type { LucideIcon } from "lucide-react";
import type { ModuleCapabilities, PermissionModule } from "@/lib/permissions/roleSets";
import type { DashboardDataset } from "./dataset";

/* ══════════════════════════════════════════════════════════════════════════
 * The access context every guard is evaluated against
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * The resolved authorisation facts a dashboard element may be gated on. Built by
 * `useDashboardAccess()` from the SAME sources the rest of the app uses — the
 * permissions matrix (`usePermissions(module)`) and the shared role-sets — so the
 * dashboard can never advertise something the module page or server action denies.
 */
export interface DashboardAccess {
  role: string;
  /** The user's Part 11 e-signature flag (gates sign/approve affordances). */
  gxpSignatory: boolean;
  /** Live per-module capabilities — matrix `canView` + server-mirrored actions. */
  can: (module: PermissionModule) => ModuleCapabilities;
  /** CAPA module surface gate (CAPA_MODULE_VIEW_ROLES) — NOT the matrix. */
  canViewCAPAModule: boolean;
  /** Governance module surface gate (GOVERNANCE_VIEW_ROLES). */
  canViewGovernance: boolean;
  /** Audit-trail route gate (AUDIT_TRAIL_VIEW_ROLES). */
  canViewAuditTrail: boolean;
  /** Tenant-admin identity (manages users/sites/settings, not quality records). */
  canManageTenant: boolean;
  /**
   * READ-ONLY posture. True for `viewer`, and for any role whose dashboard
   * matrix level is "readonly" — such a role gets metrics and navigation but no
   * action affordance that implies authoring.
   */
  readOnly: boolean;
}

/** A predicate over the access context. Must be pure and side-effect free. */
export type DashboardGuard = (access: DashboardAccess) => boolean;

/**
 * The RBAC clause shared by every dashboard element.
 *
 * `requiresModules` is the primary gate and should be preferred over `guard`:
 * it reads the live matrix, so a tenant that revokes a module in Settings →
 * Permissions immediately loses the corresponding dashboard elements with no
 * code change.
 */
export interface GuardedElement {
  /** ALL listed modules must be viewable (AND). */
  requiresModules?: readonly PermissionModule[];
  /** Extra predicate, ANDed with `requiresModules`. */
  guard?: DashboardGuard;
}

/* ══════════════════════════════════════════════════════════════════════════
 * KPI cards
 * ══════════════════════════════════════════════════════════════════════════ */

/** The rendered value of one KPI card, derived from real records. */
export interface KpiValue {
  /** Formatted headline — "83%", "12", "—" when the metric has no data. */
  value: string;
  /** One-line supporting context beneath the value. */
  sub: string;
  /** Semantic colour (READINESS_COLORS / severity palette). */
  color: string;
}

export interface KpiDefinition extends GuardedElement {
  /** Stable slug — the React key and the config reference. */
  key: string;
  label: string;
  icon: LucideIcon;
  /** Pure selector over the assembled dataset. */
  select: (data: DashboardDataset) => KpiValue;
  /**
   * PRIMARY deep link — usually the Governance KPI-scorecard anchor that explains
   * the metric (`/governance?tab=kpis#kpi-…`).
   */
  href?: string;
  /** Module that owns `href`. Omit for links every role may follow. */
  hrefModule?: PermissionModule;
  /**
   * FALLBACK deep link, used when the primary's module is denied.
   *
   * Why two: the Governance scorecard is the most informative destination for a KPI,
   * but `GOVERNANCE_VIEW_ROLES` is only {qa_head, customer_admin} — 8 of 10 roles
   * cannot open it. The pre-role dashboard linked 4 of its 5 cards there for
   * EVERYONE, so most roles got a dead link into a redirect. Rather than choose
   * between an informative link for two roles and a working link for eight, a card
   * declares both: governance-capable roles land on the scorecard section, everyone
   * else lands on the module that owns the records. When neither is followable the
   * resolver strips the link entirely and the card renders as a plain stat.
   */
  fallbackHref?: string;
  /** Module that owns `fallbackHref`. */
  fallbackHrefModule?: PermissionModule;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Widgets (charts, tables, panels)
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every widget the dashboard can render. Adding a role-specific panel means
 * adding a key here plus one entry in the widget registry — never a branch in
 * the page component.
 */
export type DashboardWidgetKey =
  // ── main column ──
  | "area-heatmap"
  | "finding-trend"
  | "deviation-trend"
  | "validation-status"
  | "regulatory-calendar"
  | "tenant-health"
  | "change-control-status"
  | "action-plan"
  // ── side rail ──
  | "ai-insights"
  | "risk-signals"
  | "compliance-status"
  | "pending-tasks"
  | "quick-actions"
  | "alerts"
  | "nav-shortcuts";

/** A widget placement inside a role's layout. */
export interface WidgetPlacement extends GuardedElement {
  key: DashboardWidgetKey;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Quick actions / navigation shortcuts
 * ══════════════════════════════════════════════════════════════════════════ */

export interface QuickAction extends GuardedElement {
  key: string;
  label: string;
  /** One-line "what this does" — rendered as the row's secondary text. */
  description: string;
  icon: LucideIcon;
  /** In-app route. Quick actions navigate; they never mutate from here. */
  href: string;
}

export interface NavShortcut extends GuardedElement {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Live count badge, or null to render no badge. Pure selector. */
  badge?: (data: DashboardDataset) => number | null;
  /** Badge colour when the count is > 0. */
  badgeColor?: string;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Role-contextual AI panels
 * ══════════════════════════════════════════════════════════════════════════ */

/** The AI insight streams a role's AGI panel may draw from. */
export type AIInsightStream =
  | "organisation"   // tenant roll-up + licence/seat risk (Customer Admin)
  | "quality"        // deviation / CAPA / finding signals (QA)
  | "regulatory"     // 483 deadlines, commitments, guidance changes
  | "validation"     // CSV drift, qualification gaps, periodic review
  | "laboratory"     // QC-Lab-area signals
  | "operations";    // Manufacturing-area + change-control signals

export interface AIPanelConfig extends GuardedElement {
  /** Panel heading — role-specific ("Quality Signals"). */
  title: string;
  /** Streams contributing insights, in priority order. */
  streams: readonly AIInsightStream[];
  /** Max insights rendered (keeps the rail short). */
  limit?: number;
}

/* ══════════════════════════════════════════════════════════════════════════
 * The role config
 * ══════════════════════════════════════════════════════════════════════════ */

export interface DashboardConfig {
  /** The role key this config serves (RoleKey from the permissions slice). */
  role: string;
  /** Headline shown under the page title — states the role's remit. */
  description: string;
  /**
   * The GxP area this role owns, when it owns one (QC Lab Director → "QC Lab",
   * Operations Head → "Manufacturing"). Drives the area-scoped KPI group and
   * narrows the area widgets. Undefined = tenant-wide remit.
   */
  focusArea?: string;
  /** KPI cards, in render order. */
  kpis: readonly KpiDefinition[];
  /** Main-column widgets, in render order. */
  mainWidgets: readonly WidgetPlacement[];
  /** Side-rail widgets, in render order. */
  railWidgets: readonly WidgetPlacement[];
  quickActions: readonly QuickAction[];
  ai: AIPanelConfig;
  navShortcuts: readonly NavShortcut[];
}

/** A config with every element filtered down to what the viewer may see. */
export interface ResolvedDashboard {
  role: string;
  description: string;
  focusArea?: string;
  kpis: KpiDefinition[];
  mainWidgets: DashboardWidgetKey[];
  railWidgets: DashboardWidgetKey[];
  quickActions: QuickAction[];
  ai: AIPanelConfig;
  navShortcuts: NavShortcut[];
}
