import { ClipboardList } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";

/**
 * Placeholder for the Inspection Management module. The data layer
 * (actions/queries/inspections.*) exists, but the UI isn't built yet — show the
 * app's standard empty state instead of a bare stub. Not a feature build.
 */
export function InspectionPage() {
  return (
      <PageLayout
        title="Inspection Management"
        titleIcon={ClipboardList}
        description="Plan, schedule, and track regulatory inspections and audit readiness."
      >
        <div className="card p-10 text-center">
          <ClipboardList className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>Coming soon</p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            The Inspection Management module isn&apos;t available yet. Check back in a future release.
          </p>
        </div>
      </PageLayout>
  );
}
