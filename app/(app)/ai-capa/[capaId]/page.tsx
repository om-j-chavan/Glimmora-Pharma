import { AiCapaPage } from "@/modules/ai-capa/AiCapaPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";

// Same access set as /ai-capa — mirrors `agi` matrix entries.
const ALLOWED_ROLES = new Set([
  "super_admin",
  "customer_admin",
  "qa_head",
  "qc_lab_director",
  "regulatory_affairs",
  "csv_val_lead",
  "it_cdo",
  "operations_head",
  "viewer",
]);

interface PageProps {
  params: Promise<{ capaId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { capaId } = await params;
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "ai_capa",
    recordId: capaId,
    recordTitle: `ai-capa/${capaId}`,
    extra: { path: `/ai-capa/${capaId}` },
  });

  return (
    <ErrorBoundary moduleName="AI CAPA Lifecycle">
      <AiCapaPage capaId={decodeURIComponent(capaId)} />
    </ErrorBoundary>
  );
}
