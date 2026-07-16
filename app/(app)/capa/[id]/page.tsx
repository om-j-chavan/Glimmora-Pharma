import { notFound, redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/errors";
import { CAPADetailPageV2 } from "@/modules/capa/CAPADetailPageV2";
import { requireAuth } from "@/lib/auth";
import { getCAPA, getCapaAuditTrail, getCAPADeviationDocs, getCAPAFindingDocs, getCAPAQaAddedFiles, getCAPAEvidenceByActionItem } from "@/lib/queries/capas";
import { getFindingAuditTrail } from "@/lib/queries/findings";
import { prisma } from "@/lib/prisma";
import { mapCAPAFromPrisma } from "@/lib/mappers/capaMapper";
import { getCAPAReadiness, EVIDENCE_CATEGORY_COUNT } from "@/lib/capa-readiness";
import { CAPA_MODULE_VIEW_ROLES } from "@/lib/permissions/roleSets";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Phase 6 — /capa/[id] is now a real full-page detail (the modal is retired).
export default async function CAPADetailRoute({ params }: PageProps) {
  const { id } = await params;
  const session = await requireAuth();
  // Phase 6 cleanup FIX 1 — module locked to qa_head/customer_admin.
  if (!CAPA_MODULE_VIEW_ROLES.includes(session.user.role)) redirect("/worklist");
  const row = await getCAPA(id, session.user.tenantId);
  if (!row) notFound();

  // Full readiness inputs (the same getCAPAReadiness the submit gate uses).
  const [evidenceItems, criteria, auditTrail] = await Promise.all([
    prisma.evidenceItem.findMany({ where: { capaId: id }, select: { status: true } }),
    prisma.cAPAEffectivenessCriterion.findMany({ where: { capaId: id, deletedAt: null }, select: { id: true } }),
    getCapaAuditTrail(id, session.user.tenantId),
  ]);
  const actionItems = (row.actionItems ?? []).map((a) => ({ status: a.status }));
  const readiness = getCAPAReadiness(row, actionItems, evidenceItems, criteria);
  const resolved = evidenceItems.filter((e) => e.status === "COMPLETE" || e.status === "NOT_APPLICABLE").length;
  // Req 4 — linked deviation + task docs for the "raised from deviation" block.
  const originDocs = row.deviationId ? await getCAPADeviationDocs(row.deviationId, session.user.tenantId) : [];
  // Phase 4 — EvidenceFiles added on this CAPA (qa_added deletable + null read-only),
  // for the Summary "documents by origin" card. Carried-over gap conversions excluded.
  const qaAddedFiles = await getCAPAQaAddedFiles(id, session.user.tenantId);
  // Phase 5 — SINGLE source for the Assignments per-person evidence, the
  // unattributed footnote, and the Evidence "Not linked" bucket.
  const evidenceFiles = await getCAPAEvidenceByActionItem(id, session.user.tenantId);
  // Item 1 — linked gap-finding docs + Stage 3 — the gap's COMPLETE audit trail
  // (read-only), fetched in parallel for the "raised from finding" block. Both
  // empty when this CAPA wasn't raised from a gap.
  const [findingDocs, findingAudit] = row.findingId
    ? await Promise.all([
        getCAPAFindingDocs(row.findingId, session.user.tenantId),
        getFindingAuditTrail(row.findingId, session.user.tenantId),
      ])
    : [[], []];

  return (
    <ErrorBoundary moduleName="CAPA">
      <CAPADetailPageV2
        capa={mapCAPAFromPrisma(row)}
        readiness={readiness}
        evidence={{ resolved, total: EVIDENCE_CATEGORY_COUNT }}
        auditTrail={auditTrail}
        originDocs={originDocs}
        findingDocs={findingDocs}
        findingAudit={findingAudit}
        qaAddedFiles={qaAddedFiles}
        evidenceFiles={evidenceFiles}
      />
    </ErrorBoundary>
  );
}
