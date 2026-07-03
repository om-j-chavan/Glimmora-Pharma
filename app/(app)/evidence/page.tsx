import { EvidencePage } from "@/modules/evidence/EvidencePage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getCAPAEvidenceFiles, getDocuments, getDocumentStats, getValidationStageDocuments, getFDA483EvidenceDocuments, getFindings } from "@/lib/queries";

export const metadata = {
  title: "Evidence & Documents — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const [docs, stats, capaEvidenceFiles, validationStageDocs, fda483EvidenceDocs, findings] = await Promise.all([
    getDocuments(session.user.tenantId),
    getDocumentStats(session.user.tenantId),
    getCAPAEvidenceFiles(session.user.tenantId),
    getValidationStageDocuments(session.user.tenantId),
    getFDA483EvidenceDocuments(session.user.tenantId),
    getFindings(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Evidence & Documents">
      <EvidencePage
        docs={docs}
        stats={stats}
        capaEvidenceFiles={capaEvidenceFiles}
        validationStageDocs={validationStageDocs}
        fda483EvidenceDocs={fda483EvidenceDocs}
        findings={findings}
      />
    </ErrorBoundary>
  );
}
