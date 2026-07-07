import { EvidencePage } from "@/modules/evidence/EvidencePage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getEvidenceLibrary } from "@/lib/queries/evidenceLibrary";

export const metadata = {
  title: "Evidence & Documents — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  // ONE server-enforced, role-scoped, capability-flagged feed. A regular user
  // gets only their own documents; CA/QA see all in the tenant. Per-doc
  // canEdit/canDelete are decided here so the UI never renders a forbidden
  // action. (Scoping/mutability are re-enforced in the actions too.)
  const library = await getEvidenceLibrary(session);

  return (
    <ErrorBoundary moduleName="Evidence & Documents">
      <EvidencePage library={library} />
    </ErrorBoundary>
  );
}
