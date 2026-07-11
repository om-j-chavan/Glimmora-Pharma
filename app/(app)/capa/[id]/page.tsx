import { notFound, redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/errors";
import { CAPADetailPage } from "@/modules/capa/CAPADetailPage";
import { requireAuth } from "@/lib/auth";
import { getCAPA, getCapaAuditTrail, getCAPADeviationDocs, getCAPAFindingDocs } from "@/lib/queries/capas";
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
  // Item 1 — linked gap-finding docs for the "raised from finding" block.
  const findingDocs = row.findingId ? await getCAPAFindingDocs(row.findingId, session.user.tenantId) : [];

  return (
    <ErrorBoundary moduleName="CAPA">
      <CAPADetailPage
        capa={mapCAPAFromPrisma(row)}
        readiness={readiness}
        evidence={{ resolved, total: EVIDENCE_CATEGORY_COUNT }}
        criteriaCount={criteria.length}
        auditTrail={auditTrail}
        originDocs={originDocs}
        findingDocs={findingDocs}
      />
    </ErrorBoundary>
  );
}
