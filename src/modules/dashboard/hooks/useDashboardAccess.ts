"use client";

/**
 * useDashboardAccess — builds the `DashboardAccess` context the dashboard resolver
 * gates every element on (Phase 3 / Phase 8).
 *
 * It derives NOTHING of its own. Every fact comes from the app's existing
 * authorisation layer:
 *
 *   • per-module capabilities  → `usePermissions(module)` (permissions matrix +
 *                                the server-mirrored role-sets in roleSets.ts)
 *   • CAPA module surface      → `CAPA_MODULE_VIEW_ROLES` (same set the /capa route
 *                                and the Sidebar use)
 *   • Governance surface       → `canViewGovernance` (GOVERNANCE_VIEW_ROLES)
 *   • Audit trail              → `AUDIT_TRAIL_VIEW_ROLES`
 *   • read-only posture        → the `viewer` role or `useRole().isViewOnly`
 *
 * That indirection is the point: the dashboard cannot advertise a capability the
 * module page or the server action would refuse, and a permissions-matrix edit in
 * Settings takes effect here immediately.
 */

import { useCallback, useMemo } from "react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import {
  CAPA_MODULE_VIEW_ROLES, canViewGovernance, canViewAuditTrail,
  computeModuleCanView,
  getModuleCapabilities, type ModuleCapabilities, type PermissionModule,
} from "@/lib/permissions/roleSets";
import type { DashboardAccess } from "../config";

export function useDashboardAccess(): DashboardAccess {
  const user = useAppSelector((s) => s.auth.user);
  const matrix = useAppSelector((s) => s.permissions?.matrix);
  const { isViewOnly } = useRole();

  const role = user?.role ?? "viewer";
  const gxpSignatory = user?.gxpSignatory === true;

  /**
   * Per-module capabilities. Identical computation to `usePermissions(module)` —
   * intentionally re-derived here rather than calling that hook, because the
   * resolver needs to query MANY modules and React hooks cannot be called in a
   * loop. Both paths funnel into the SAME `getModuleCapabilities`, so they can
   * never diverge.
   */
  const can = useCallback(
    (module: PermissionModule): ModuleCapabilities => {
      // ONE shared resolver — the same one usePermissions() calls, so a
      // dashboard tile can never deep-link to a module the route will refuse.
      const canView = computeModuleCanView(role, module, matrix);
      return getModuleCapabilities(role, gxpSignatory, canView, module);
    },
    [role, gxpSignatory, matrix],
  );

  return useMemo<DashboardAccess>(
    () => ({
      role,
      gxpSignatory,
      can,
      canViewCAPAModule: CAPA_MODULE_VIEW_ROLES.includes(role),
      canViewGovernance: canViewGovernance(role),
      canViewAuditTrail: canViewAuditTrail(role),
      canManageTenant: role === "customer_admin" || role === "super_admin",
      /**
       * Read-only IDENTITY — not "read-only dashboard". Deliberately NOT derived
       * from the matrix's `dashboard` level: most seat roles carry
       * `dashboard: readonly` (the dashboard has no mutations to grant) while still
       * holding real authoring rights in their own modules — a csv_val_lead is in
       * CSV_CREATE_ROLES, a qc_lab_director in DEVIATION_CREATE_ROLES. Gating their
       * quick actions on the dashboard level would hide work the server accepts.
       *
       * So this is true only when the identity may author NOTHING ANYWHERE: the
       * `viewer` role, or `useRole().isViewOnly` (every module readonly/none).
       * Per-module authoring is gated by `can(module).canCreate/canEdit/…`, which
       * is the authoritative mirror of the server gate.
       */
      readOnly: role === "viewer" || isViewOnly,
    }),
    [role, gxpSignatory, can, isViewOnly],
  );
}
