import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/shared";

/**
 * Placeholder for the Inspection Management module. The data layer
 * (actions/queries/inspections.*) exists, but the UI isn't built yet — show the
 * app's standard empty state instead of a bare stub. Not a feature build.
 */
export function InspectionPage() {
  return (
    <main id="main-content" aria-label="Inspection management" className="w-full space-y-5">
      <PageHeader
        icon={ClipboardCheck}
        title="Inspection Management"
        subtitle="Plan and track regulatory inspections"
      />
      <div className="card p-10 text-center">
        <ClipboardCheck className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>Coming soon</p>
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          The Inspection Management module isn&apos;t available yet. Check back in a future release.
        </p>
      </div>
    </main>
  );
}
