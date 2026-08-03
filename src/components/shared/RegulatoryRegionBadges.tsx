"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { regulatoryRegionLabel } from "@/constants/regulatoryRegions";

/**
 * Renders a tenant's assigned Regulatory Regions as chips.
 *
 * A tenant can hold several regions, so a comma-joined sentence stops scanning
 * at a glance — each region gets its own chip instead. ONE component so the
 * Super Admin's customer detail page and the Customer Admin's Settings →
 * Organisation tab can never drift apart in how they present the same fact.
 *
 * Values resolve through `regulatoryRegionLabel`, which falls back from the
 * DB-sourced label map to the constant to a prettified value — so a tenant
 * sitting on an archived or unknown region still renders something readable.
 *
 * READ-ONLY by construction: there is no edit affordance here. Regions are
 * assigned by the platform Super Admin on the tenant create/edit modal; a
 * customer_admin only ever views them.
 */
export function RegulatoryRegionBadges({
  values,
  labelMap,
  hrefFor,
  emptyText = "—",
}: {
  values: string[];
  /** value → label, including archived regions (regions slice / getRegionLabelMap). */
  labelMap?: Record<string, string>;
  /** Optional deep link per region. Return null for a region with no reachable page. */
  hrefFor?: (value: string, label: string) => string | null;
  /** Shown when the tenant has no region assigned. */
  emptyText?: string;
}) {
  if (values.length === 0) {
    return <span className="text-[13px] italic text-(--text-muted)">{emptyText}</span>;
  }

  return (
    <ul
      role="list"
      aria-label="Assigned regulatory regions"
      className="flex flex-wrap items-center gap-1.5 list-none m-0 p-0"
    >
      {values.map((value) => {
        const label = regulatoryRegionLabel(value, labelMap);
        const href = hrefFor?.(value, label) ?? null;
        const chip = (
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-(--brand-muted) text-(--brand)">
            <Globe className="w-3 h-3 shrink-0" aria-hidden="true" />
            {label}
          </span>
        );
        return (
          <li key={value}>
            {href ? (
              <Link href={href} className="no-underline hover:underline" title={`Open ${label}`}>
                {chip}
              </Link>
            ) : (
              chip
            )}
          </li>
        );
      })}
    </ul>
  );
}
