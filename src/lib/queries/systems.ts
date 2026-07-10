import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthSession } from "@/lib/auth";
import { canSeeAllRecords, resolveVisibilityUid } from "@/lib/permissions/recordVisibility";

/**
 * CSV/CSA (GxPSystem) record-visibility fragment — the DEEP-COMPOSE template.
 *
 * The creator lives on GxPSystem (`createdById`, Phase 0); the assignee lives on
 * a DEEP-nested grandchild — `ValidationStageTask.assigneeId` reached via
 * `validationStages` → `reworkTasks` (confirmed schema:1033 `validationStages
 * ValidationStage[]`, schema:1068 `reworkTasks ValidationStageTask[]`,
 * schema:1090 `assigneeId String?`). The shared helper's flat field can't express
 * that, so compose from the two shared primitives (like Deviation, via
 * resolveVisibilityUid — never `OR[0]`):
 *   • see-all role → {} (no narrowing).
 *   • otherwise → one fail-closed `uid` drives the flat creator branch AND the
 *     nested relation assignee branch.
 * Net: a non-see-all user sees only systems they CREATED or are a rework-task
 * assignee on. ADDITIONAL AND on top of tenant + deletedAt.
 */
export function systemVisibilityWhere(session: AuthSession): Prisma.GxPSystemWhereInput {
  if (canSeeAllRecords(session.user.role)) return {};
  const uid = resolveVisibilityUid(session);
  return {
    OR: [
      { createdById: uid },                                                        // creator (flat)
      { validationStages: { some: { reworkTasks: { some: { assigneeId: uid } } } } }, // assignee (deep relation)
    ],
  };
}

// Validation stages always pull active (non-deleted) StageDocument rows.
// Soft-deleted documents stay in the DB for audit but never render in UI.
// The orderBy on documents matches the Evidence pattern — newest first so
// the most recent upload sits at the top of each stage card.
const STAGE_INCLUDE = {
  documents: {
    where: { deletedAt: null },
    orderBy: { uploadedAt: "desc" as const },
  },
  // CSV/CSA stage rework tasks — active (non-cancelled/deleted) only, oldest
  // first so the rework list reads in the order it was raised.
  reworkTasks: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" as const },
  },
};

// RUNG 2 — minimal selects for the cross-module FK relations surfaced in the
// system detail page (linked findings / CAPAs, and per-RTM linkage).
const FINDING_SELECT = { id: true, reference: true, status: true, requirement: true, severity: true, targetDate: true, createdAt: true } as const;
const CAPA_SELECT = { id: true, reference: true, status: true, description: true, risk: true, owner: true, dueDate: true, createdAt: true } as const;
const RTM_LINK_INCLUDE = {
  finding: { select: { id: true, reference: true, status: true } },
  capa: { select: { id: true, reference: true, status: true } },
} as const;

const SYSTEM_INCLUDE = {
  validationStages: { orderBy: { stageName: "asc" as const }, include: STAGE_INCLUDE },
  rtmEntries: { orderBy: { ursId: "asc" as const }, include: RTM_LINK_INCLUDE },
  roadmapActivities: { orderBy: { startDate: "asc" as const } },
  findings: { select: FINDING_SELECT, orderBy: { createdAt: "desc" as const } },
  capas: { select: CAPA_SELECT, orderBy: { createdAt: "desc" as const } },
} as const;

// RUNG 3B — read paths return ACTIVE systems only (deletedAt: null). Archived
// systems are surfaced exclusively via getDeletedSystems (admin archive view).
export const getSystems = cache(async (tenantId: string, visibility: Prisma.GxPSystemWhereInput = {}) => {
  return prisma.gxPSystem.findMany({
    // Visibility is an ADDITIONAL AND; default {} keeps dashboard/search callers
    // tenant-wide until their cross-cutting phase.
    where: { tenantId, deletedAt: null, ...visibility },
    orderBy: { createdAt: "desc" },
    include: SYSTEM_INCLUDE,
  });
});

/** RUNG 3B — soft-deleted (archived) systems for the admin archive view. */
export const getDeletedSystems = cache(async (tenantId: string) => {
  return prisma.gxPSystem.findMany({
    where: { tenantId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    include: SYSTEM_INCLUDE,
  });
});

export const getSystem = cache(async (id: string, session: AuthSession) => {
  // Visibility enforced in the query (no IDOR).
  return prisma.gxPSystem.findFirst({
    where: { id, tenantId: session.user.tenantId, deletedAt: null, ...systemVisibilityWhere(session) },
    include: SYSTEM_INCLUDE,
  });
});

/** RUNG 2 — routed detail lookup by human reference OR raw cuid.
 *  RUNG 3B — archived systems 404 (deletedAt: null).
 *  Phase 4 — visibility enforced IN THE QUERY: a non-see-all/non-creator/non-
 *  rework-assignee gets null even with a valid ref/id (no IDOR). */
export const getSystemByRef = cache(async (refOrId: string, session: AuthSession) => {
  return prisma.gxPSystem.findFirst({
    // AND-wrap: the ref/id lookup is its own OR, so the visibility fragment (also
    // an OR for seat roles) must be ANDed as a sibling — spreading it at the top
    // level would overwrite the ref/id OR. For see-all, systemVisibilityWhere is
    // {} → the AND collapses to the ref/id match.
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      AND: [
        { OR: [{ reference: refOrId }, { id: refOrId }] },
        systemVisibilityWhere(session),
      ],
    },
    include: SYSTEM_INCLUDE,
  });
});

/** Tenant findings not yet linked to any system — candidates for the
 *  "Link finding" picker on the system detail page. */
export const getLinkableFindings = cache(async (tenantId: string) => {
  return prisma.finding.findMany({
    where: { tenantId, systemId: null, deletedAt: null },
    select: { id: true, reference: true, requirement: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
});

/** 3 most-recent audit entries for a system + its child records. */
export const getSystemRecentActivity = cache(async (systemId: string, tenantId: string) => {
  const sys = await prisma.gxPSystem.findFirst({
    where: { id: systemId, tenantId },
    select: { id: true, validationStages: { select: { id: true } }, rtmEntries: { select: { id: true } } },
  });
  if (!sys) return [];
  const ids = [sys.id, ...sys.validationStages.map((s) => s.id), ...sys.rtmEntries.map((r) => r.id)];
  return prisma.auditLog.findMany({
    // RUNG 3C — module string unified to "CSV/CSA" (the legacy "CSV / Validation"
    // split is backfilled away). Single value now matches all CSV/CSA entries.
    where: { tenantId, recordId: { in: ids }, module: "CSV/CSA" },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
});

/**
 * Headline stats for the CSV/CSA module.
 *
 * Schema fields: GxPSystem.`validationStatus` (not `status`),
 * `siteId` (not `site`). Values are PascalCase per the slice's
 * ValidationStatus enum + seeded data ("Not Started", "In Progress",
 * "Validated", "Overdue"). There is no `auditTrailEnabled` column —
 * we proxy via `part11Status === "Compliant"` (same pattern Governance
 * already uses for "audit trail coverage").
 */
export const getSystemsStats = cache(async (tenantId: string) => {
  const systems = await getSystems(tenantId);
  return {
    total: systems.length,
    validated: systems.filter((s) => s.validationStatus === "Validated").length,
    inProgress: systems.filter((s) => s.validationStatus === "In Progress").length,
    notStarted: systems.filter((s) => s.validationStatus === "Not Started").length,
    overdue: systems.filter((s) => s.validationStatus === "Overdue").length,
    auditTrailEnabled: systems.filter(
      (s) => s.part11Status === "Compliant" || s.part11Status === "N/A",
    ).length,
  };
});

export const getRTMStats = cache(async (tenantId: string) => {
  const systems = await getSystems(tenantId);
  const allRTM = systems.flatMap((s) => s.rtmEntries);
  return {
    total: allRTM.length,
    complete: allRTM.filter((r) => r.traceabilityStatus === "complete").length,
    partial: allRTM.filter((r) => r.traceabilityStatus === "partial").length,
    broken: allRTM.filter((r) => r.traceabilityStatus === "broken").length,
  };
});
