import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { REGULATORY_REGIONS } from "@/constants/regulatoryRegions";

/**
 * Regulatory-region read layer (Item #3, Stage 2). Migrates the region read
 * path off the REGULATORY_REGIONS constant onto the RegulatoryRegion table. The
 * constant stays as the SEED SOURCE + a hard FALLBACK: if the table is empty or
 * the query fails, callers still get the exact 8 load-bearing options, so a
 * dropdown can never render empty. Regions are platform reference data (not
 * tenant-scoped), so there is no tenant gate here.
 */

export interface RegionOption {
  value: string;
  label: string;
}

const CONSTANT_ACTIVE: RegionOption[] = REGULATORY_REGIONS.map((r) => ({ value: r.value, label: r.label }));
const CONSTANT_MAP: Record<string, string> = Object.fromEntries(REGULATORY_REGIONS.map((r) => [r.value, r.label]));

/** Active regions for dropdowns (archivedAt=null), stable creation order.
 *  Falls back to the constant on empty/error so a dropdown is never blank. */
export const getActiveRegions = cache(async (): Promise<RegionOption[]> => {
  try {
    const rows = await prisma.regulatoryRegion.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { value: true, label: true },
    });
    return rows.length ? rows : CONSTANT_ACTIVE;
  } catch (err) {
    console.error("[queries] getActiveRegions failed — falling back to the constant:", err);
    return CONSTANT_ACTIVE;
  }
});

/** value → label for ALL regions INCLUDING archived — so a tenant sitting on an
 *  archived/removed region still renders a readable label. Constant fills any
 *  gap; on error, the constant map alone. */
export const getRegionLabelMap = cache(async (): Promise<Record<string, string>> => {
  try {
    const rows = await prisma.regulatoryRegion.findMany({ select: { value: true, label: true } });
    const map: Record<string, string> = { ...CONSTANT_MAP };
    for (const r of rows) map[r.value] = r.label; // DB wins over the constant
    return map;
  } catch (err) {
    console.error("[queries] getRegionLabelMap failed — falling back to the constant:", err);
    return { ...CONSTANT_MAP };
  }
});

export interface RegionCatalogRow {
  id: string;
  value: string;
  label: string;
  description: string | null;
  archived: boolean;
  /** Successor via old.aliasOf (Stage 3) — set on an archived, superseded row. */
  successor: { value: string; label: string } | null;
  /** How many tenants have this value selected (TenantRegion). A tenant
   *  with several regions is counted once under EACH of them. */
  tenantCount: number;
  /** How many FrameworkRegion links currently point at this value. */
  frameworkCount: number;
}

/** Super-Admin management view: EVERY region (active + archived) with its
 *  successor and current reference counts (tenants + framework-region links).
 *  The counts drive the archive-in-use block. Not tenant-scoped. */
export const getRegionCatalog = cache(async (): Promise<RegionCatalogRow[]> => {
  const [rows, tenantGroups, fwGroups] = await Promise.all([
    prisma.regulatoryRegion.findMany({
      orderBy: { createdAt: "asc" },
      include: { aliasOf: { select: { value: true, label: true } } },
    }),
    prisma.tenantRegion.groupBy({ by: ["region"], _count: true }),
    prisma.frameworkRegion.groupBy({ by: ["region"], _count: true }),
  ]);
  const tenantCounts = new Map(tenantGroups.map((g) => [g.region, g._count]));
  const fwCounts = new Map(fwGroups.map((g) => [g.region, g._count]));
  return rows.map((r) => ({
    id: r.id,
    value: r.value,
    label: r.label,
    description: r.description,
    archived: r.archivedAt !== null,
    successor: r.aliasOf ? { value: r.aliasOf.value, label: r.aliasOf.label } : null,
    tenantCount: tenantCounts.get(r.value) ?? 0,
    frameworkCount: fwCounts.get(r.value) ?? 0,
  }));
});
