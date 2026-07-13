import { AiCapaIndex } from "@/modules/ai-capa/AiCapaIndex";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";

// Mirrors the `agi` access set in src/store/permissions.slice.ts DEFAULT_MATRIX
// — every declared role has at least readonly access. Explicit per-page so a
// future tightening lands here without depending on Redux client state.
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
    module: "ai_capa",
    extra: { path: "/ai-capa" },
  });

  return (
    <ErrorBoundary moduleName="AI CAPAs">
      <AiCapaIndex />
    </ErrorBoundary>
  );
}
