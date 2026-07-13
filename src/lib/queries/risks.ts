import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthSession } from "@/lib/auth";
import { visibilityWhere } from "@/lib/permissions/recordVisibility";
import { RISK_SOURCE_MODULE } from "@/constants/risk";
import { convertedRecordHref } from "@/constants/riskConversion";
import type { WorklistDoc } from "@/lib/queries/worklist";

/**
 * Risk record-visibility fragment — the FLAT template (same shape as
 * `findingVisibilityWhere`). Both id-keyed columns live directly on Risk, so we
 * delegate straight to the shared helper with no compose step.
 *
 *   • see-all role (customer_admin / qa_head / super_admin) → `{}` — no narrowing.
 *   • otherwise → `{ OR: [ { createdById: uid }, { ownerId: uid } ] }`, fail-closed uid.
 *
 * Net: a seat user sees only risks they RAISED or OWN. Reassigning a risk away
 * from its creator does not blind the creator — `createdById` is immutable.
 *
 * This is applied from day one to BOTH the list and the by-id read, so the
 * detail route is IDOR-safe: a non-see-all user who is neither creator nor
 * owner gets `null` (not-found) even with a valid risk id.
 */
export function riskVisibilityWhere(session: AuthSession): Prisma.RiskWhereInput {
  return visibilityWhere(session, {
    creatorField: "createdById",
    assigneeField: "ownerId",
  }) as Prisma.RiskWhereInput;
}

/** The shape the Risk Register list tab renders. Plain/serializable. */
export interface RiskListRow {
  id: string;
  reference: string | null;
  title: string;
  description: string;
  category: string;
  severity: string;
  likelihood: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  createdById: string | null;
  createdBy: string;
  siteId: string | null;
  targetDate: string | null;
  mitigationPlan: string | null;
  /** Governance Phase 2 — forward half of the conversion link. Null until converted. */
  convertedToType: string | null;
  convertedToId: string | null;
  createdAt: string;
  updatedAt: string;
}

const RISK_SELECT = {
  id: true,
  reference: true,
  title: true,
  description: true,
  category: true,
  severity: true,
  likelihood: true,
  status: true,
  ownerId: true,
  createdById: true,
  createdBy: true,
  siteId: true,
  targetDate: true,
  mitigationPlan: true,
  convertedToType: true,
  convertedToId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { name: true } },
} satisfies Prisma.RiskSelect;

type RiskRow = Prisma.RiskGetPayload<{ select: typeof RISK_SELECT }>;

function toListRow(r: RiskRow): RiskListRow {
  return {
    id: r.id,
    reference: r.reference,
    title: r.title,
    description: r.description,
    category: r.category,
    severity: r.severity,
    likelihood: r.likelihood,
    status: r.status,
    ownerId: r.ownerId,
    ownerName: r.owner?.name ?? null,
    createdById: r.createdById,
    createdBy: r.createdBy,
    siteId: r.siteId,
    targetDate: r.targetDate ? r.targetDate.toISOString() : null,
    mitigationPlan: r.mitigationPlan,
    convertedToType: r.convertedToType,
    convertedToId: r.convertedToId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * Cached query: every risk the CALLER may see, newest first. Visibility is an
 * additional AND on top of tenant + soft-delete scope — it only narrows.
 * React `cache()` dedupes within one request.
 */
export const getRisks = cache(async (session: AuthSession): Promise<RiskListRow[]> => {
  const rows = await prisma.risk.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      ...riskVisibilityWhere(session),
    },
    select: RISK_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toListRow);
});

/**
 * Cached query: a single risk by id. Visibility is enforced IN THE QUERY, so a
 * seat user who is neither creator nor owner gets `null` — the detail page 404s
 * instead of leaking. This is the IDOR guard; do NOT fetch-then-check.
 */
export const getRisk = cache(async (id: string, session: AuthSession): Promise<RiskListRow | null> => {
  const row = await prisma.risk.findFirst({
    where: {
      id,
      tenantId: session.user.tenantId,
      deletedAt: null,
      ...riskVisibilityWhere(session),
    },
    select: RISK_SELECT,
  });
  return row ? toListRow(row) : null;
});

/**
 * A risk's supporting documents, on the shared polymorphic `Document` model.
 *
 * GATED: it re-runs the risk visibility check first and returns `[]` when the
 * caller cannot see the parent risk. Without this a seat user who guessed a
 * risk id could read its attachments through the docs loader even though the
 * detail page itself is hidden from them.
 *
 * Returned as `WorklistDoc[]` so the shared <CategorizedDocUploader> /
 * <DocumentCard> render them with no bespoke adapter.
 */
export const getRiskDocuments = cache(async (riskId: string, session: AuthSession): Promise<WorklistDoc[]> => {
  const risk = await getRisk(riskId, session);
  if (!risk) return []; // not visible → no documents, ever.

  const docs = await prisma.document.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      // Read on the NEW pointer pair; createRiskDocument dual-writes both.
      sourceModule: RISK_SOURCE_MODULE,
      sourceId: riskId,
    },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileExtension: true,
      fileSize: true,
      uploadedBy: true,
      uploadedById: true,
      uploadedAt: true,
      createdAt: true,
      category: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return docs.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    fileType: d.fileType,
    fileExtension: d.fileExtension,
    fileSize: d.fileSize,
    uploadedBy: d.uploadedBy,
    uploadedById: d.uploadedById,
    uploadedAt: (d.uploadedAt ?? d.createdAt).toISOString(),
    category: d.category,
  }));
});

/** Header counters for the Governance page description line. */
export const getRiskStats = cache(async (session: AuthSession) => {
  const risks = await getRisks(session);
  return {
    total: risks.length,
    open: risks.filter((r) => r.status === "Open").length,
    mitigating: risks.filter((r) => r.status === "Mitigating").length,
    critical: risks.filter((r) => r.severity === "Critical" && r.status !== "Closed").length,
  };
});

/**
 * The risk's audit trail, for the detail page's clock modal. Tenant-scoped and
 * gated on the same visibility check as the record itself.
 */
export const getRiskAuditTrail = cache(async (riskId: string, session: AuthSession) => {
  const risk = await getRisk(riskId, session);
  if (!risk) return [];

  const rows = await prisma.auditLog.findMany({
    where: { tenantId: session.user.tenantId, module: "Governance", recordId: riskId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, action: true, userName: true, userRole: true,
      oldValue: true, newValue: true, createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
});

/** Assignable risk owners: active tenant users, excluding read-only viewers. */
export async function getRiskOwners(session: AuthSession): Promise<{ id: string; name: string; role: string }[]> {
  return prisma.user.findMany({
    where: { tenantId: session.user.tenantId, isActive: true, role: { not: "viewer" } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * Conversion history (Governance Phase 2)
 * ══════════════════════════════════════════════════════════════════════════ */

export interface RiskConversion {
  target: "Gap" | "Deviation" | "CAPA";
  recordId: string;
  recordReference: string | null;
  href: string;
  convertedBy: string | null;
  convertedAt: string | null;
}

/**
 * The "⚑ Converted to CAPA-X on <date> by <user>" line on a converted risk.
 *
 * Returns null unless BOTH halves of the forward link are set — a risk whose
 * status is Converted but whose `convertedToId` is null is a conversion that was
 * rolled back mid-flight (or is in-flight), and must NOT render as a completed
 * conversion. Who/when come from the `RISK_CONVERTED` audit row, which is written
 * in the same transaction as the link, so it always exists when the link does.
 */
export const getRiskConversion = cache(async (riskId: string, session: AuthSession): Promise<RiskConversion | null> => {
  const risk = await getRisk(riskId, session);
  if (!risk?.convertedToType || !risk.convertedToId) return null;

  const target = risk.convertedToType as RiskConversion["target"];
  const tenantId = session.user.tenantId;
  const id = risk.convertedToId;

  const where = { id, tenantId };
  const select = { reference: true };
  const rec =
    target === "Gap" ? await prisma.finding.findFirst({ where, select })
    : target === "Deviation" ? await prisma.deviation.findFirst({ where, select })
    : await prisma.cAPA.findFirst({ where, select });

  const audit = await prisma.auditLog.findFirst({
    where: { tenantId, module: "Governance", action: "RISK_CONVERTED", recordId: riskId },
    orderBy: { createdAt: "desc" },
    select: { userName: true, createdAt: true },
  });

  return {
    target,
    recordId: id,
    recordReference: rec?.reference ?? null,
    href: convertedRecordHref(target, id),
    convertedBy: audit?.userName ?? null,
    convertedAt: audit ? audit.createdAt.toISOString() : null,
  };
});
