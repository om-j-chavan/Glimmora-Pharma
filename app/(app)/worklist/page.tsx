import { WorklistPage } from "@/modules/worklist/WorklistPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getWorklist } from "@/lib/queries/worklist";

/**
 * Phase 5 — /worklist, the fixer's surface. Gating is intentionally INDEPENDENT
 * of the capa matrix entry: any authenticated customer role reaches their CAPA
 * work here (super_admin is already walled to /admin by the (app) layout;
 * viewer renders read-only via the client). Reads getWorklist; all writes go
 * through the existing Phase-3/4/5 owner/driver server paths.
 */
export default async function Page() {
  const session = await requireAuth();
  const worklist = await getWorklist(session.user.id, session.user.tenantId);

  return (
    <ErrorBoundary moduleName="Worklist">
      <WorklistPage worklist={worklist} />
    </ErrorBoundary>
  );
}
