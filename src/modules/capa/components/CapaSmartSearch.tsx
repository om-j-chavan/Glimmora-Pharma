"use client";

/**
 * Feature 2 — Plain-English Record Search on the CAPA list.
 * Thin wrapper over the generic SmartRecordSearch, scoped to CAPAs.
 */

import { SmartRecordSearch } from "@/components/search/SmartRecordSearch";
import { buildCapaSource } from "@/lib/searchSources";
import type { SiteRef } from "@/lib/aiSearch";
import type { CAPA } from "@/store/capa.slice";

interface Props {
  capas: CAPA[];
  sites?: SiteRef[];
  onOpenCapa?: (id: string) => void;
}

export function CapaSmartSearch({ capas, sites = [], onOpenCapa }: Props) {
  return (
    <SmartRecordSearch
      title="CAPA Search"
      sources={[buildCapaSource(capas, sites, onOpenCapa)]}
    />
  );
}
