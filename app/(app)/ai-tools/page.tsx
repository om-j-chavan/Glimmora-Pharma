import { AiToolsPage } from "@/modules/ai-tools/AiToolsPage";
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

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "ai_tools",
    extra: { path: "/ai-tools" },
  });

  return (
    <ErrorBoundary moduleName="AI Backend Tools">
      <AiToolsPage />
    </ErrorBoundary>
  );
}
