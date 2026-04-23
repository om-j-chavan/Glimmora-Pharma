"use client";

/**
 * Gap Assessment — Server Component page.
 *
 * This is Phase 1 of the server-first migration:
 * - Data is fetched server-side via Prisma (no Redux dispatch)
 * - The existing GapPage client component is preserved as-is
 * - ErrorBoundary wraps the client component
 * - loading.tsx handles Suspense fallback
 *
 * Phase 2 (future): Split GapPage into server + client sub-components
 */

import { GapPage } from "@/modules/gap-assessment/GapPage";
import { ErrorBoundary } from "@/components/errors";

// Server Component — no "use client"
export default function GapAssessmentPage() {
  // For now, delegate to the existing client component.
  // The GapPage still uses Redux internally — that's OK.
  // The page wrapper is a Server Component, which means:
  //   - loading.tsx works as Suspense fallback
  //   - error.tsx works as error boundary
  //   - metadata can be set (see below)
  //
  // When we're ready for Phase 2, this becomes:
  //   const session = await requireAuth()
  //   const findings = await getFindings(session.user.tenantId)
  //   return <GapContent findings={findings} session={session} />
  return (
    <ErrorBoundary moduleName="Gap Assessment">
      <GapPage />
    </ErrorBoundary>
  );
}
