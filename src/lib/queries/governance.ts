import { cache } from "react";
import type { AuditLog } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Hard cap on how many audit-log rows the in-app /audit-trail view loads
// per request. The view is in-memory: filters and the CSV "Export" button
// operate on the loaded slice, not on the database. Without surfacing the
// total population the UI silently dropped older rows past the limit —
// for a Part-11 audit log that's an honest-display violation, hence the
// truncation flag exposed by getAuditLogs below.
const AUDIT_LOG_DISPLAY_LIMIT = 500;

export interface AuditLogQueryResult {
  logs: AuditLog[];
  totalCount: number;
  truncated: boolean;
  limit: number;
}

export const getRAIDItems = cache(async (tenantId: string) => {
  return prisma.rAIDItem.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
});

export const getDocuments = cache(async (tenantId: string) => {
  // Soft-deleted documents are retained but hidden from the library view.
  return prisma.document.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
});

/**
 * Band-aid for the Evidence & Documents global view: surface CAPA-side
 * EvidenceFile rows alongside the Document table. Tenant scope is enforced
 * via the parent CAPA (EvidenceFile → EvidenceItem → CAPA.tenantId).
 *
 * Throwaway aggregator. Phase 4 of the document-store unification will
 * fold these rows into the main Document table and drop this query.
 */
export const getCAPAEvidenceFiles = cache(async (tenantId: string) => {
  return prisma.evidenceFile.findMany({
    where: {
      deletedAt: null,
      evidenceItem: {
        capa: { tenantId },
      },
    },
    include: {
      evidenceItem: {
        include: {
          capa: {
            select: {
              id: true,
              reference: true,
              tenantId: true,
              siteId: true,
              // Surfaced into the global Evidence view's complianceTags as
              // ["CAPA", capa.source] — matches the existing CAPA-Redux
              // upload-row convention so the page-level source filter
              // ("Inspection", "Internal Audit", etc.) catches these rows.
              source: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
});

export const getDocumentStats = cache(async (tenantId: string) => {
  const docs = await getDocuments(tenantId);
  return {
    total: docs.length,
    approved: docs.filter((d) => d.status === "approved").length,
    underReview: docs.filter((d) => d.status === "under_review").length,
    draft: docs.filter((d) => d.status === "draft").length,
    rejected: docs.filter((d) => d.status === "rejected").length,
  };
});

export const getAuditLogs = cache(async (tenantId: string): Promise<AuditLogQueryResult> => {
  const where = { tenantId };
  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: AUDIT_LOG_DISPLAY_LIMIT,
    }),
    // The where clause MUST stay identical to the findMany above. The
    // truncated flag (totalCount > limit) is meaningful only when both
    // queries count the same population — if these drift, the
    // "showing X of Y" notice becomes a lie and the Part-11
    // honest-display promise breaks.
    prisma.auditLog.count({ where }),
  ]);
  return {
    logs,
    totalCount,
    truncated: totalCount > AUDIT_LOG_DISPLAY_LIMIT,
    limit: AUDIT_LOG_DISPLAY_LIMIT,
  };
});

/* ── Audit Trail view enrichment ──────────────────────────────────────────
   The audit log stores recordId (the affected entity's internal UUID) and a
   denormalised recordTitle. Neither is the entity's PROPER domain id (e.g.
   "CAPA-CHN-2026-001"). To show that — and link to the source the way the
   other modules link — we resolve recordId → the entity's reference per
   module family, tenant-scoped, and attach a navigable href.

   Deep links only exist where a per-id route exists (CAPA). The other modules
   are modal-based with no per-record URL, so they link to their list route —
   "where the other modules would link". */

type AuditFamily = "capa" | "deviation" | "changeControl" | "fda483" | "finding" | "system" | "support";

const AUDIT_LIST_ROUTE: Record<AuditFamily, string> = {
  capa: "/capa",
  deviation: "/deviation",
  changeControl: "/change-control",
  fda483: "/fda-483",
  finding: "/gap-assessment",
  system: "/csv-csa",
  support: "/support",
};

/** Map an AuditLog.module string to its domain family (or null = no entity). */
function auditModuleFamily(module: string): AuditFamily | null {
  if (module.startsWith("CAPA")) return "capa"; // covers "CAPA / Approvals" etc.
  if (module === "Deviation Management") return "deviation";
  if (module === "Change Control") return "changeControl";
  if (module === "FDA 483") return "fda483";
  if (module === "Gap Assessment") return "finding";
  if (module === "CSV/CSA") return "system";
  if (module === "Support") return "support";
  return null;
}

/** An AuditLog row enriched with a human domain id + a link to the source. */
export type AuditTrailRow = AuditLog & {
  /** Proper domain id (resolved reference) ?? recordTitle ?? short UUID ?? "—". */
  displayId: string;
  /** Navigable source-record link, or null when the module has no entity/route. */
  href: string | null;
};

export interface AuditTrailView {
  rows: AuditTrailRow[];
  totalCount: number;
  truncated: boolean;
  limit: number;
}

/** Resolve recordId → reference for the loaded slice, batched per family. */
async function resolveAuditReferences(
  tenantId: string,
  logs: AuditLog[],
): Promise<Map<string, string>> {
  const buckets: Record<AuditFamily, Set<string>> = {
    capa: new Set(), deviation: new Set(), changeControl: new Set(),
    fda483: new Set(), finding: new Set(), system: new Set(), support: new Set(),
  };
  for (const log of logs) {
    if (!log.recordId) continue;
    const fam = auditModuleFamily(log.module);
    if (fam) buckets[fam].add(log.recordId);
  }

  const ref = new Map<string, string>();
  const set = (rows: { id: string; ref: string | null }[]) =>
    rows.forEach((r) => r.ref && ref.set(r.id, r.ref));
  const ids = (s: Set<string>) => Array.from(s);

  await Promise.all([
    buckets.capa.size
      ? prisma.cAPA.findMany({ where: { tenantId, id: { in: ids(buckets.capa) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
    buckets.deviation.size
      ? prisma.deviation.findMany({ where: { tenantId, id: { in: ids(buckets.deviation) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
    buckets.changeControl.size
      ? prisma.changeControl.findMany({ where: { tenantId, id: { in: ids(buckets.changeControl) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
    buckets.fda483.size
      ? prisma.fDA483Event.findMany({ where: { tenantId, id: { in: ids(buckets.fda483) } }, select: { id: true, referenceNumber: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.referenceNumber }))))
      : null,
    buckets.finding.size
      ? prisma.finding.findMany({ where: { tenantId, id: { in: ids(buckets.finding) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
    buckets.system.size
      ? prisma.gxPSystem.findMany({ where: { tenantId, id: { in: ids(buckets.system) } }, select: { id: true, name: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.name }))))
      : null,
    buckets.support.size
      ? prisma.ticket.findMany({ where: { tenantId, id: { in: ids(buckets.support) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
  ]);

  return ref;
}

/**
 * Audit-trail view: the same tenant-scoped, capped slice as getAuditLogs, with
 * each row enriched with a proper domain id + source link. Used by the
 * /audit-trail page so the table and detail modal can reference records by
 * their real ids (CAPA-…, DEV-…, CC-…) instead of raw UUIDs.
 */
export const getAuditTrailView = cache(async (tenantId: string): Promise<AuditTrailView> => {
  const where = { tenantId };
  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: AUDIT_LOG_DISPLAY_LIMIT }),
    prisma.auditLog.count({ where }),
  ]);

  const refMap = await resolveAuditReferences(tenantId, logs);

  const rows: AuditTrailRow[] = logs.map((log) => {
    const fam = auditModuleFamily(log.module);
    const resolved = log.recordId ? refMap.get(log.recordId) : undefined;
    const displayId = resolved ?? log.recordTitle ?? (log.recordId ? log.recordId.slice(0, 8) : "—");
    // CAPA is the only module with a per-id route — deep-link only when the
    // recordId actually resolved to a CAPA (so sub-entity ids don't 404).
    const href =
      fam === "capa" && resolved && log.recordId
        ? `/capa/${log.recordId}`
        : fam
          ? AUDIT_LIST_ROUTE[fam]
          : null;
    return { ...log, displayId, href };
  });

  return { rows, totalCount, truncated: totalCount > AUDIT_LOG_DISPLAY_LIMIT, limit: AUDIT_LOG_DISPLAY_LIMIT };
});

/**
 * AGI-related activity from the audit log — agent toggles + AI suggestion
 * shown/accepted/dismissed events. Used by /agi-console activity feed.
 */
export const getAGIActivityLogs = cache(async (tenantId: string) => {
  return prisma.auditLog.findMany({
    where: {
      tenantId,
      action: {
        in: [
          "AI_SUGGESTION_SHOWN",
          "AI_SUGGESTION_ACCEPTED",
          "AI_SUGGESTION_DISMISSED",
          "AGI_AGENT_TOGGLED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
});
