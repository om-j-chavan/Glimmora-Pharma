import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthSession } from "@/lib/auth";
import { visibilityWhere } from "@/lib/permissions/recordVisibility";

/**
 * Gap (Finding) record-visibility fragment — the FLAT TEMPLATE (Inspection copies
 * this shape). Both the creator (`createdById`, Phase 0) AND the assignee
 * (`owner`) are FLAT columns on Finding, so — unlike Deviation/CSV — there is NO
 * compose: delegate straight to the shared helper.
 *   • see-all role (customer_admin/qa_head/super_admin) → `{}` (no narrowing).
 *   • otherwise → `{ OR: [ { createdById: uid }, { owner: uid } ] }` (fail-closed uid).
 * Net: a non-see-all user sees only findings they CREATED or OWN (are assigned to).
 * `owner` is overwritten on reassignment, but the CREATOR keeps visibility via
 * `createdById` (Phase 0) even after the finding is reassigned away from them.
 */
export function findingVisibilityWhere(session: AuthSession): Prisma.FindingWhereInput {
  return visibilityWhere(session, { creatorField: "createdById", assigneeField: "owner" }) as Prisma.FindingWhereInput;
}

/**
 * Cached query: all findings for a tenant, newest first. `visibility` is an
 * ADDITIONAL AND on top of tenant + deletedAt; default `{}` keeps existing
 * callers (dashboard/search) tenant-wide until their cross-cutting phase.
 * React cache() deduplicates within a single request.
 */
export const getFindings = cache(async (tenantId: string, visibility: Prisma.FindingWhereInput = {}) => {
  return prisma.finding.findMany({
    where: { tenantId, deletedAt: null, ...visibility },
    orderBy: { createdAt: "desc" },
    include: { edits: { orderBy: { editedAt: "asc" } } },
  });
});

export interface FindingAssignee { id: string; name: string; role: string }

/** Roles that can never be a finding assignee (platform/admin/read-only). */
const NON_ASSIGNEE_ROLES = ["super_admin", "customer_admin", "viewer"];

/**
 * SERVER-SCOPED assignable-users pool for findings (the assignee dropdown).
 * Two boundaries enforced IN THE QUERY:
 *   1. tenantId = the assigner's tenant — closes the cross-tenant leak.
 *   2. siteId  = the ASSIGNER'S OWN site — a site-bound user (e.g. a Chennai QA
 *      Head, whose User.siteId is set) assigns ONLY within their own site; a
 *      tenant-level admin with NO siteId falls back to tenant-wide (no site
 *      predicate) so they aren't locked out.
 * Operational staff only (platform/admin/viewer excluded). Mirrors — and is
 * re-enforced by — the assignFinding action.
 *
 * Excludes ONLY the current logged-in user (no self-assignment). Everyone else
 * eligible stays — including the RAISER of the finding, who QA may legitimately
 * assign the work to (the query has no createdById exclusion, by design).
 */
export async function getFindingAssignees(session: AuthSession): Promise<FindingAssignee[]> {
  const tenantId = session.user.tenantId;
  const me = await prisma.user.findFirst({ where: { id: session.user.id, tenantId }, select: { siteId: true } });
  const assignerSiteId = me?.siteId ?? null; // null → tenant-level admin → tenant-wide
  return prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      role: { notIn: NON_ASSIGNEE_ROLES },
      // Exclude only the current user — self-assignment is disallowed. The raiser
      // is NOT excluded here.
      id: { not: session.user.id },
      ...(assignerSiteId ? { siteId: assignerSiteId } : {}),
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Cached query: single finding by ID. Visibility enforced IN THE QUERY (no IDOR):
 * a non-see-all user who is neither creator nor owner gets `null` (not-found)
 * even with a valid id.
 */
export const getFinding = cache(async (id: string, session: AuthSession) => {
  return prisma.finding.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null, ...findingVisibilityWhere(session) },
    include: { edits: { orderBy: { editedAt: "asc" } } },
  });
});

/**
 * Cached query: the set of finding IDs that have an uploaded evidence document
 * (a Document row with retrievable bytes). The Evidence Index uses this to
 * decide whether a finding's evidence link should resolve to the in-app
 * download route (GET /api/findings/[id]/evidence). Typed-reference evidence
 * has no Document/storageKey and so is intentionally excluded.
 */
export const getFindingEvidenceDocIds = cache(async (tenantId: string) => {
  const docs = await prisma.document.findMany({
    where: {
      tenantId,
      linkedModule: "Gap Assessment",
      storageKey: { not: null },
      deletedAt: null,
    },
    select: { linkedRecordId: true },
  });
  return [...new Set(docs.map((d) => d.linkedRecordId).filter((x): x is string => !!x))];
});

/**
 * Gap→CAPA handoff (Stage 3) — the COMPLETE audit trail for a single finding,
 * surfaced read-only inside the linked CAPA's "Raised from finding" block so the
 * gap's in-progress history survives the handoff. Pulled from AuditLog (the full
 * ALCOA+ trail — every FINDING_* action), NOT FindingEdit (which only records
 * field edits; that partial trail is the modal's "Edit history"). Keyed by
 * recordId = the finding id, module-scoped, newest first. READ-ONLY — mirrors
 * getCapaAuditTrail; writes no audit rows.
 */
export interface FindingAuditEntry {
  id: string;
  action: string;
  userName: string;
  userRole: string | null;
  recordTitle: string | null;
  /** Raw newValue JSON. Only SOME finding actions carry a reason/detail here:
   *  FINDING_REWORK → { reason }, FINDING_ESCALATED_TO_CAPA → { capaReference },
   *  FINDING_CLOSED_BY_CAPA → { capaReference, closingNotes }. FINDING_SUBMITTED
   *  and FINDING_REVIEW_CLOSED carry NOTHING — that is not a bug, so the History
   *  renders those event-only rather than inventing a reason. Do NOT "fix" the
   *  gaps by reading Finding.reworkReason/completionNotes: those hold the
   *  LATEST value only and would mislabel older rows. */
  newValue: string | null;
  createdAt: string;
}

export const getFindingAuditTrail = cache(
  async (findingId: string, tenantId: string): Promise<FindingAuditEntry[]> => {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId, module: "Gap Assessment", recordId: findingId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, action: true, userName: true, userRole: true, recordTitle: true, newValue: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      userName: r.userName,
      userRole: r.userRole,
      recordTitle: r.recordTitle,
      newValue: r.newValue,
      createdAt: r.createdAt.toISOString(),
    }));
  },
);

/**
 * Computed stats for the Gap Assessment page header.
 */
export const getFindingStats = cache(async (tenantId: string) => {
  const findings = await getFindings(tenantId);
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "Critical").length,
    open: findings.filter((f) => f.status !== "Closed").length,
    closed: findings.filter((f) => f.status === "Closed").length,
  };
});
