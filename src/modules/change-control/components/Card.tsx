"use client";

/**
 * Small labelled card primitive used inside the Change Control detail
 * Overview tab. Extracted from the modal monolith. Only consumer is the
 * Overview tab today, so it lives under the change-control module
 * rather than the global components folder.
 */
export function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-md p-2.5"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-wider mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="text-[12px] whitespace-pre-wrap"
        style={{ color: "var(--text-primary)" }}
      >
        {children}
      </p>
    </div>
  );
}
