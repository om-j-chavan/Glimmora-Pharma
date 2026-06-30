import { cache } from "react";
import { prisma } from "@/lib/prisma";

// SME Section 1, Stage 2 (FULL) — include shape for the bidirectional
// CAPA↔Deviation link. Reused by both list and detail queries so the
// Redux mapper sees the same shape regardless of which path hydrated
// the row. Only the small set of columns the "Linked deviation" panel
// renders are fetched; full deviation row is one extra query away when
// needed.
const DEVIATION_INCLUDE = {
  select: {
    id: true,
    reference: true,
    title: true,
    severity: true,
    status: true,
    createdAt: true,
  },
} as const;

// SME Section 1, Stage 4 (FULL) — order by sequence so the Redux CAPA
// always renders action items in the right order without per-render
// sorting. Includes every column the new ActionItemsSection table needs.
const ACTION_ITEMS_INCLUDE = {
  // Soft-deleted action items are retained but hidden from detail/readiness.
  where: { deletedAt: null },
  orderBy: { sequence: "asc" },
} as const;

export const getCAPAs = cache(async (tenantId: string) => {
  return prisma.cAPA.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      documents: true,
      deviation: DEVIATION_INCLUDE,
      // CAPA-module batch — linked Gap reference + owner for the tracker's
      // readable source column (mirrors the deviation include).
      finding: { select: { id: true, reference: true, owner: true } },
      actionItems: ACTION_ITEMS_INCLUDE,
    },
  });
});

/**
 * Substage 5.2 — list every approval row recorded against a CAPA, oldest
 * first (chronological order matches how the Approvals section renders
 * the progress list). Tenant-scoped via the explicit `tenantId` filter
 * AND the implicit parent-CAPA-tenant guarantee.
 */
export const getCAPAApprovals = cache(
  async (tenantId: string, capaId: string) => {
    // revokedAt filter — soft-revoked approvals stay in the table for
    // audit traceability but are hidden from the active approval list
    // (the UI's "Awaiting approvals (n/total)" badge only counts live
    // signatures). Revocation history lives in the SignedRecord ledger
    // + AuditLog and isn't surfaced in the active panel.
    return prisma.cAPAApproval.findMany({
      where: { tenantId, capaId, revokedAt: null },
      orderBy: { approvedAt: "asc" },
    });
  },
);

/**
 * Substage 5.2 §5.3 — flat list of all comments on a CAPA, including
 * soft-deleted rows so the UI can render "[deleted]" placeholders without
 * losing reply chains. The tree structure (parent / replies) is derived
 * client-side from `parentId` — a flat list keeps the cache deterministic
 * and the server query simple. Order: createdAt ascending so the UI can
 * reconstruct deterministic threads.
 */
export const getCAPAComments = cache(
  async (tenantId: string, capaId: string) => {
    return prisma.cAPAComment.findMany({
      where: { tenantId, capaId },
      orderBy: { createdAt: "asc" },
    });
  },
);

export const getCAPA = cache(async (id: string, tenantId: string) => {
  return prisma.cAPA.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      documents: true,
      finding: true,
      deviation: DEVIATION_INCLUDE,
      actionItems: ACTION_ITEMS_INCLUDE,
    },
  });
});

/** A read-only document reference surfaced in the CAPA detail for a CAPA raised
 *  FROM a deviation — the deviation's own docs + the (cancelled) worker task's
 *  docs. They are NOT copied into the CAPA's evidence categories; they stay
 *  Documents on their originating records and are linked here for context. */
export interface CAPAOriginDoc {
  id: string;
  fileName: string;
  uploadedBy: string;
  source: "deviation" | "task";
}

/** Deviation→CAPA carryover (req 4) — fetch the originating deviation's docs and
 *  the worker task's docs for the "raised from deviation X" reference block. One
 *  tenant-scoped query (mirrors the batch pattern in queries/deviations.ts). */
export const getCAPADeviationDocs = cache(async (deviationId: string, tenantId: string): Promise<CAPAOriginDoc[]> => {
  const tasks = await prisma.deviationTask.findMany({
    where: { deviationId, tenantId },
    select: { id: true },
  });
  const taskIds = tasks.map((t) => t.id);
  const docs = await prisma.document.findMany({
    where: {
      tenantId, deletedAt: null,
      OR: [
        { linkedModule: "Deviation Management", linkedRecordId: deviationId },
        ...(taskIds.length ? [{ linkedModule: "Deviation Task", linkedRecordId: { in: taskIds } }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, originalFileName: true, uploadedBy: true, linkedModule: true },
  });
  return docs.map((d) => ({
    id: d.id,
    fileName: d.originalFileName ?? d.fileName,
    uploadedBy: d.uploadedBy,
    source: d.linkedModule === "Deviation Task" ? "task" : "deviation",
  }));
});

/**
 * SME Section 1, Stage 6 (FULL) — suggested-recurrence query.
 *
 * Returns up to 10 closed CAPAs in the same tenant + (optional) same
 * site whose closure date is within the lookback window (default 90
 * days). Used by the Deviation / Finding creation modals to offer
 * "possible recurrence" candidates; user confirms by selecting one and
 * the creation action persists previousCAPAId.
 *
 * Filters:
 *  - tenantId match (mandatory)
 *  - status === "closed"
 *  - siteId match (when supplied)
 *  - closedAt within last windowDays days
 *  - excludes CAPAs already known to be ineffective — the recurrence
 *    conversation is different for those (the team should look at the
 *    fresh root cause, not re-confirm the prior CAPA's failure)
 * Ordered by closedAt desc; limited to 10 rows.
 */
export const getSuggestedRecurrenceMatches = cache(
  async (params: {
    tenantId: string;
    siteId?: string;
    windowDays?: number;
  }) => {
    const windowDays = params.windowDays ?? 90;
    const earliest = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    return prisma.cAPA.findMany({
      where: {
        tenantId: params.tenantId,
        status: "closed",
        deletedAt: null,
        closedAt: { gte: earliest },
        ...(params.siteId ? { siteId: params.siteId } : {}),
        NOT: { effectivenessVerdict: "ineffective" },
      },
      orderBy: { closedAt: "desc" },
      take: 10,
      select: {
        id: true,
        reference: true,
        description: true,
        closedAt: true,
        dueDate: true,
        effectivenessDate: true,
        siteId: true,
        risk: true,
      },
    });
  },
);

export const getCAPAStats = cache(async (tenantId: string) => {
  const capas = await getCAPAs(tenantId);
  const now = new Date();
  return {
    total: capas.length,
    open: capas.filter((c) => c.status !== "closed").length,
    overdue: capas.filter((c) => (c.status === "open" || c.status === "in_progress") && c.dueDate && c.dueDate < now).length,
    closed: capas.filter((c) => c.status === "closed").length,
  };
});

/**
 * Phase 2 — effectiveness due-surfacing FOUNDATION (no UI yet; the tracker
 * queue is Phase 6). Returns closed CAPAs whose committed 90-day effectiveness
 * check has come due (effectivenessDate <= now) and has not yet been reviewed
 * (effectivenessVerdict is null). Oldest-due first. Backed by the new
 * CAPA.effectivenessDate index. Tenant-scoped; read-only.
 */
export const getEffectivenessChecksDue = cache(async (tenantId: string) => {
  const now = new Date();
  return prisma.cAPA.findMany({
    where: {
      tenantId,
      status: "closed",
      deletedAt: null,
      effectivenessDate: { lte: now },
      effectivenessVerdict: null,
    },
    orderBy: { effectivenessDate: "asc" },
    select: {
      id: true,
      reference: true,
      description: true,
      risk: true,
      closedAt: true,
      effectivenessDate: true,
      owner: true,
      siteId: true,
    },
  });
});

/**
 * Phase 2 — Worklist FOUNDATION (no UI yet; Phase 3 owns access, Phase 6 the
 * screen). Returns the action items assigned to one user (ownerId = userId),
 * tenant-scoped, joined with their parent CAPA's reference / title / status /
 * dueDate, ordered by the ACTION ITEM's own dueDate (soonest first). Backed by
 * the new CAPAActionItem.ownerId index. Read-only; applies NO permission
 * filtering — callers/Phase 3 decide who may invoke it.
 */
export const getMyActionItems = cache(
  async (userId: string, tenantId: string) => {
    return prisma.cAPAActionItem.findMany({
      // Exclude soft-deleted items AND items whose parent CAPA was soft-deleted
      // (so a deleted CAPA never lingers in anyone's worklist via its children).
      where: { ownerId: userId, tenantId, deletedAt: null, capa: { deletedAt: null } },
      orderBy: { dueDate: "asc" },
      // No `select` on the item itself → every scalar (incl. the Phase-2 rework
      // fields reworkReason / reworkRequestedById / reworkRequestedAt) is
      // returned. The parent CAPA carries risk + ownerId so the Worklist can
      // colour the group header and detect when the viewer is the driver.
      include: {
        capa: {
          select: {
            id: true,
            reference: true,
            description: true,
            status: true,
            dueDate: true,
            risk: true,
            ownerId: true,
          },
        },
      },
    });
  },
);

/**
 * Phase B (Zone 6) — the audit trail for a single CAPA. AuditLog rows are
 * keyed by recordId = the CAPA id across the CAPA family (lifecycle, action
 * items, approvals, etc.). Newest first; serialised for the client bar.
 */
export interface CapaAuditEntry {
  id: string;
  action: string;
  userName: string;
  userRole: string | null;
  recordTitle: string | null;
  createdAt: string;
}

export const getCapaAuditTrail = cache(
  async (capaId: string, tenantId: string): Promise<CapaAuditEntry[]> => {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId, recordId: capaId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, action: true, userName: true, userRole: true, recordTitle: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      userName: r.userName,
      userRole: r.userRole,
      recordTitle: r.recordTitle,
      createdAt: r.createdAt.toISOString(),
    }));
  },
);

/**
 * Batch 2b (#3) — light linkable-record lists for the New CAPA source picker.
 * OPEN records only, tenant-scoped; the modal further filters by the selected
 * site client-side (the chosen site is client state). `text` feeds the
 * Description prefill (#4). NOTE: there is no separate Internal-Audit-finding
 * model — only Finding (gap) + Deviation exist; getOpenAuditFindings is N/A.
 */
export interface LinkableRecord {
  id: string;
  reference: string | null;
  title: string;
  text: string;
  siteId: string | null;
}

export const getOpenGapFindings = cache(
  async (tenantId: string): Promise<LinkableRecord[]> => {
    const rows = await prisma.finding.findMany({
      where: { tenantId, status: { in: ["Open", "open"] }, deletedAt: null },
      select: { id: true, reference: true, requirement: true, siteId: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) => ({ id: r.id, reference: r.reference, title: r.requirement.slice(0, 120), text: r.requirement, siteId: r.siteId }));
  },
);

export const getOpenDeviations = cache(
  async (tenantId: string): Promise<LinkableRecord[]> => {
    const rows = await prisma.deviation.findMany({
      where: { tenantId, status: { in: ["open", "Open"] }, deletedAt: null },
      select: { id: true, reference: true, title: true, description: true, siteId: true },
      orderBy: { detectedDate: "desc" },
      take: 200,
    });
    return rows.map((r) => ({ id: r.id, reference: r.reference, title: r.title, text: r.description, siteId: r.siteId }));
  },
);
