"use client";

import { Dropdown } from "@/components/ui/Dropdown";
import { useAppSelector } from "@/hooks/useAppSelector";

const LABEL = "block text-[11px] font-medium mb-1" as const;

/**
 * Regulatory Region picker for the Super Admin tenant create/edit modal. Backed
 * by the DB-sourced ACTIVE regions (regions slice; Item #3, Stage 2), whose
 * initial state is the REGULATORY_REGIONS constant so the picker is never empty.
 * Super Admin SELECTS an existing value — there is no runtime "add new value"
 * path here. The selected value is persisted on the tenant.
 */
export function RegulatoryRegionField({
  value,
  onChange,
  required = false,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Show the required marker (Stage 5 — required on tenant create). */
  required?: boolean;
  /** Inline validation error (e.g. "Regulatory Region is required"). */
  error?: string;
}) {
  // ACTIVE regions only (archivedAt=null), DB-sourced via getActiveRegions →
  // regions slice. GLOBAL is active + protected so it appears; archived regions
  // are excluded (Stage 5).
  const regions = useAppSelector((s) => s.regions.active);
  // Ensure a legacy/archived stored value (not in the active list) still shows
  // on the trigger, rather than rendering blank.
  const options = (value && !regions.some((r) => r.value === value)
    ? [{ value, label: value }, ...regions]
    : regions
  ).map((r) => ({ value: r.value, label: r.label }));

  return (
    <div>
      <label className={LABEL} style={{ color: "var(--text-secondary)" }}>
        Regulatory Region {required && <span style={{ color: "var(--danger)" }}>*</span>}
      </label>
      <Dropdown
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Select region"
        searchable
        width="w-full"
        size="sm"
      />
      {error && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
