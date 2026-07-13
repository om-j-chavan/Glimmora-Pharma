import { AIPolicyPage } from "@/modules/settings/AIPolicyPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";

// Deliberately narrower than the `agi` matrix entries — this surface sets
// agent enable flags and policy modes. Restricted to super_admin and
// customer_admin only. Not matrix-derived; a policy decision documented in
// MERGE_AUDIT_FOR_DEV_TEAM.md alongside the other un-gated-AI-pages resolution.
const ALLOWED_ROLES = new Set(["super_admin", "customer_admin"]);

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "ai_policy",
    extra: { path: "/ai-policy" },
  });

  return (
    <ErrorBoundary moduleName="AI Policy">
      <AIPolicyPage />
    </ErrorBoundary>
  );
}
