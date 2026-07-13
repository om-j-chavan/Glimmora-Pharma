/**
 * Record-visibility — the SERVER-ENFORCED read-scoping model, generalized from
 * the Evidence & Documents pattern (src/lib/permissions/documents.ts +
 * src/lib/queries/evidenceLibrary.ts).
 *
 * THE RULE: a user may VIEW a record if ANY of —
 *   (1) they created it (creator),
 *   (2) they are a see-all role (Customer Admin / QA Head / platform admin),
 *   (3) they are assigned to it (assignee/owner).
 * Else the record is hidden.
 *
 * Two properties copied EXACTLY from the Evidence pattern:
 *   • FAIL-CLOSED — an unresolvable actor id becomes a sentinel that matches
 *     nothing, so scope can only ever NARROW, never widen. A model with no
 *     creator/assignee id column HIDES rather than leaks.
 *   • ID-KEYED — matches on the authoritative User id, NEVER a display name.
 *
 * Pure (no Prisma/React/Redux) so the same file backs server queries AND a
 * client capability mirror — the UI can hide a row, but the server where-clause
 * is the authority.
 *
 * PHASE 1 (this file): DEFINED but WIRED TO NOTHING. No list/detail/related read
 * query imports `visibilityWhere` yet — per-module adoption is Phase 2+. Reads
 * are unchanged until then.
 */
import type { AuthSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions/roleSets";

/**
 * Fail-closed sentinel. The leading space guarantees it can never equal a real
 * cuid/User id, so `{ field: NO_MATCH }` matches zero rows. Mirrors the
 * `" no-such-user"` sentinel in evidenceLibrary.ts.
 */
const NO_MATCH = " no-such-user";

/**
 * VISIBILITY: who sees EVERY record in the tenant vs. only their own+assigned.
 * Identical membership to the Evidence `canSeeAllDocuments` rule — Customer
 * Admin + QA Head oversee all; platform admin (super_admin) via isPlatformAdmin.
 * Every other role (execution `qa`, csv_val_lead, regulatory_affairs, viewer, …)
 * sees only records they created or are assigned to. Pure — also usable
 * client-side to hide rows; the server where-fragment is the authority.
 */
export function canSeeAllRecords(role: string): boolean {
  return role === "customer_admin" || role === "qa_head" || isPlatformAdmin(role);
}

/**
 * The fail-closed actor uid that `visibilityWhere` matches on: `session.user.id`
 * for a seat/User role, or the `NO_MATCH` sentinel if the id is somehow absent.
 *
 * Exported so COMPOSE-modules — records whose assignee lives on a CHILD relation
 * (Deviation via DeviationTask, CSV via ValidationStageTask) — can build their
 * relation OR-branch `{ child: { some: { assigneeId: uid } } }` with the SAME uid
 * DIRECTLY, instead of reaching into `visibilityWhere`'s output shape.
 *
 * ALWAYS returns a string (never null): returning null would make a branch like
 * `{ assigneeId: null }` MATCH unassigned rows — a leak. The sentinel matches
 * nothing, preserving fail-closed.
 */
export function resolveVisibilityUid(session: AuthSession): string {
  return session.user.id || NO_MATCH;
}

/**
 * Build a Prisma `where`-FRAGMENT that scopes a record read to the visibility
 * rule. Spread it into a query's existing where alongside tenant/soft-delete
 * scope — it NARROWS, never replaces:
 *
 *   prisma.finding.findMany({ where: {
 *     tenantId, deletedAt: null,
 *     ...visibilityWhere(session, { creatorField: "createdById", assigneeField: "owner" }),
 *   }})
 *
 * Behaviour:
 *   • see-all role  → {}                       (no narrowing — sees everything)
 *   • otherwise     → { OR: [ {creatorField: uid}?, {assigneeField: uid}? ] }
 *                     for whichever id fields the model has.
 *   • NEITHER field → { id: NO_MATCH }          (impossible filter — a model with
 *                     no creator/assignee id HIDES rather than leaks; fail-closed).
 *
 * `uid` is the authoritative User id. Non-see-all roles are all seat/User roles
 * whose `session.user.id` IS their User.id, so no async lookup is needed (keeps
 * this pure + client-usable). If the id is somehow absent it falls back to the
 * fail-closed sentinel, which matches nothing.
 */
export function visibilityWhere(
  session: AuthSession,
  fields: { creatorField?: string; assigneeField?: string },
): Record<string, unknown> {
  if (canSeeAllRecords(session.user.role)) return {};

  const uid = resolveVisibilityUid(session); // id-keyed; fail-closed if missing
  const or: Record<string, unknown>[] = [];
  if (fields.creatorField) or.push({ [fields.creatorField]: uid });
  if (fields.assigneeField) or.push({ [fields.assigneeField]: uid });

  // No creator/assignee id column supplied → hide, don't leak.
  if (or.length === 0) return { id: NO_MATCH };
  return { OR: or };
}
