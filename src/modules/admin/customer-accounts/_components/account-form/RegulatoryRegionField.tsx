"use client";

import { MultiSelect } from "@/components/ui/MultiSelect";
import { useAppSelector } from "@/hooks/useAppSelector";

/**
 * Regulatory Regions picker for the Super Admin tenant create/edit modal.
 *
 * A tenant operates under one OR MORE regions — a manufacturer shipping to the
 * US, the EU and the UK answers to FDA, EMA and MHRA at once — so this is a
 * MULTI-select over the DB-sourced ACTIVE regions (regions slice; Item #3,
 * Stage 2), whose initial state is the REGULATORY_REGIONS constant so the picker
 * is never empty. Super Admin SELECTS existing values; there is no runtime
 * "add new value" path here (regions are managed in Regions & Frameworks).
 *
 * Only the Super Admin ever renders this — a customer_admin sees the assigned
 * regions read-only in Settings → Organisation.
 */
export function RegulatoryRegionField({
  values,
  onChange,
  required = false,
  error,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  /** Show the required marker (regions are required on tenant create). */
  required?: boolean;
  /** Inline validation error (e.g. "Select at least one Regulatory Region"). */
  error?: string;
}) {
  // ACTIVE regions only (archivedAt=null), DB-sourced via getActiveRegions →
  // regions slice. GLOBAL is active + protected so it appears; archived regions
  // are excluded.
  const regions = useAppSelector((s) => s.regions.active);

  // A stored value that is no longer active (legacy or just-archived) must still
  // be listed, otherwise editing an unrelated field would silently drop it from
  // the submitted set.
  const known = new Set(regions.map((r) => r.value));
  const options = [
    ...values.filter((v) => !known.has(v)).map((v) => ({ value: v, label: v })),
    ...regions.map((r) => ({ value: r.value, label: r.label })),
  ];

  return (
    <MultiSelect
      label="Regulatory Region"
      required={required}
      values={values}
      onChange={onChange}
      options={options}
      placeholder="Select one or more regions"
      searchPlaceholder="Search regions…"
      error={error}
      hint="Determines which compliance frameworks this customer sees. Selecting several applies the union of their frameworks."
      size="sm"
    />
  );
}
