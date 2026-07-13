import { prisma } from "@/lib/prisma";

/**
 * Tenant-scope helper for child-row inserts.
 *
 * The problem: an action that accepts a parent ID (e.g. `eventId`,
 * `systemId`, `inspectionId`) and inserts a child row under that parent
 * must verify the caller's tenant actually owns the parent. Otherwise a
 * tenant-A user with a stolen or guessed parent ID writes data under
 * tenant B (IDOR class).
 *
 * The pattern: call `assertTenantOwnsParent` right after `requireAuth()`
 * + zod validation. If null, return `{ success: false, error: "FORBIDDEN" }`.
 * Then derive `tenantId` for the child row from the verified parent —
 * never from `session.user.tenantId` and never from input.
 *
 * Reference templates that already do this (do not modify):
 *   - addEvidenceFile in src/actions/evidence.ts (via loadEvidenceItemScoped)
 *   - addCAPAComment in src/actions/capa-comments.ts (via loadCAPAScoped)
 *
 * super_admin bypasses the tenant filter — they can write under any
 * tenant by design (cross-tenant write IS the super_admin power).
 */

export interface SessionLike {
  user: {
    id: string;
    role: string;
    tenantId: string;
  };
}

/**
 * Models that can serve as a tenant-owned parent for child-row inserts.
 * Each entry MUST have a direct `tenantId` column on its Prisma model;
 * the switch below uses `findFirst({ where: { id, tenantId } })` and
 * that won't compile for models that scope via a parent relation
 * (ValidationStage scopes via `system.tenantId`, RTMEntry via
 * `system.tenantId`, RoadmapActivity via `system.tenantId`, etc.). When
 * adding such a model in the future, either add a `tenantId` column to
 * its schema or add a separate helper that does relation-traversal
 * scoping.
 *
 * Add new direct-tenantId entries to the union as new parent classes
 * appear. The switch below uses `never` exhaustiveness so TypeScript
 * catches misses at compile time.
 */
export type TenantOwnedParent =
  | "fda483Event"
  | "gxpSystem"
  | "inspection"
  | "cAPA"
  | "changeControl";

/**
 * Verifies a parent record belongs to the caller's tenant. Returns the
 * parent record (with the requested `select` shape) if access is allowed,
 * or null if the parent doesn't exist or belongs to another tenant.
 *
 * For super_admin: returns the record from any tenant (cross-tenant
 * write is the super_admin power; child-row inserts must still derive
 * `tenantId` from `parent.tenantId`, not from `session.user.tenantId`).
 *
 * Caller is responsible for translating null → `FORBIDDEN` or
 * `parent-not-found` semantics in their ActionResult error string.
 */
/**
 * Phase 1.5 (C-1) — tenant-scoped WHERE fragment for find/update/delete by id
 * on a DIRECT-tenantId model (Site, User, CAPA, Deviation, Finding, Document,
 * GxPSystem, ChangeControl, FDA483Event, Inspection, RAIDItem, …).
 *
 * Prisma 6 accepts a unique locator (`id`) PLUS an extra `tenantId` filter in
 * update/delete `where`, so spreading this into the WRITE itself makes the
 * mutation tenant-atomic — closing the check-then-write (TOCTOU) gap that the
 * hand-rolled "pre-fetch findFirst{id,tenantId} then update{id}" pattern left
 * open.
 *
 * super_admin scope-widening is OPT-IN ONLY: pass `{ allowPlatformAdmin: true }`
 * at the ~10 sites that already intentionally bypass tenant scope for the
 * platform admin. It NEVER widens silently — omit the flag and the fragment is
 * always tenant-scoped (the safe default).
 *
 * Relation-scoped child models (FDA483Observation→event, CAPAComment→capa, …)
 * do NOT use this — they scope via a parent relation; use the relation-aware
 * path (assertTenantOwnsParent / an explicit relation filter) for those.
 */
export function scopedWhere(
  session: SessionLike,
  id: string,
  opts: { allowPlatformAdmin?: boolean } = {},
): { id: string; tenantId?: string } {
  if (opts.allowPlatformAdmin && session.user.role === "super_admin") {
    return { id };
  }
  return { id, tenantId: session.user.tenantId };
}

export async function assertTenantOwnsParent<T>(
  session: SessionLike,
  model: TenantOwnedParent,
  parentId: string,
  select?: Record<string, boolean>,
): Promise<T | null> {
  const isSuper = session.user.role === "super_admin";
  const baseWhere = isSuper
    ? { id: parentId }
    : { id: parentId, tenantId: session.user.tenantId };

  // Always include id + tenantId in the result so callers can derive the
  // child-row tenantId from the verified parent. Spread the caller's
  // requested fields on top.
  const finalSelect = { id: true, tenantId: true, ...(select ?? {}) };

  let result: unknown;

  switch (model) {
    case "fda483Event":
      result = await prisma.fDA483Event.findFirst({
        where: baseWhere,
        select: finalSelect,
      });
      break;
    case "gxpSystem":
      // RUNG 3B — never treat an archived (soft-deleted) system as a valid
      // parent, so children (RTM entries, roadmap activities) can't be added
      // to a system that has been removed from the inventory.
      result = await prisma.gxPSystem.findFirst({
        where: { ...baseWhere, deletedAt: null },
        select: finalSelect,
      });
      break;
    case "inspection":
      result = await prisma.inspection.findFirst({
        where: baseWhere,
        select: finalSelect,
      });
      break;
    case "cAPA":
      result = await prisma.cAPA.findFirst({
        where: baseWhere,
        select: finalSelect,
      });
      break;
    case "changeControl":
      result = await prisma.changeControl.findFirst({
        where: baseWhere,
        select: finalSelect,
      });
      break;
    default: {
      const exhaustiveCheck: never = model;
      throw new Error(`Unknown TenantOwnedParent model: ${String(exhaustiveCheck)}`);
    }
  }

  return result as T | null;
}
