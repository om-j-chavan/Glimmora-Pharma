"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Lock, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DisplayId } from "@/components/ui/DisplayId";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import { DataTable, type DataColumn, type DataFilter, type RowMenuItem } from "@/components/table/DataTable";
import { isReservedRegion } from "@/constants/regulatoryRegions";
import { regionDisplayId } from "@/lib/displayIds";
import type { RegionCatalogRow } from "@/lib/queries";
import { RegionModal } from "./_components/RegionModal";
import { ArchivedRegionsModal } from "./_components/ArchivedRegionsModal";
import { ArchiveRegionConfirm } from "./_components/ArchiveRegionConfirm";

export type RegionListRow = RegionCatalogRow & { frameworkApplyCount: number };

/**
 * Regulatory Regions & Frameworks — landing table. MIGRATED to the shared
 * <PageLayout> + new <DataTable> primitives (client mode): built-in
 * search + type filter + Clear on one line, sortable headers (asc/desc), and
 * Show-more. Lists ACTIVE regions by their readable REG-<VALUE> id; archived
 * regions (Restore / Permanent delete) live behind the "Archived" header
 * action → ArchivedRegionsModal. GLOBAL shows a System lock and can't be
 * archived (reserved guard preserved).
 */
export function RegionsLandingPage({ rows }: { rows: RegionListRow[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RegionCatalogRow | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archiving, setArchiving] = useState<RegionCatalogRow | null>(null);

  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (r: RegionCatalogRow) => { setEditing(r); setFormOpen(true); };
  const goto = (r: RegionCatalogRow) => router.push(`/admin/regions/${encodeURIComponent(r.value)}`);

  const columns: DataColumn<RegionListRow>[] = [
    {
      key: "id",
      label: "Region ID",
      sortable: true,
      width: "w-[16%]",
      sortValue: (r) => r.value,
      render: (r) => <DisplayId className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{regionDisplayId(r.value)}</DisplayId>,
    },
    {
      key: "name",
      label: "Name",
      sortable: true,
      width: "w-[34%]",
      sortValue: (r) => r.label,
      render: (r) => (
        <div className="min-w-0">
          <span className="text-[13px] font-semibold inline-flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
            {r.label}
            {isReservedRegion(r.value) && (
              <span title="Protected system region">
                <Badge variant="gray">
                  <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden="true" /> System</span>
                </Badge>
              </span>
            )}
          </span>
          {r.description && <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{r.description}</p>}
        </div>
      ),
    },
    {
      key: "frameworks",
      label: "Frameworks",
      sortable: true,
      width: "w-[18%]",
      sortValue: (r) => r.frameworkApplyCount,
      render: (r) => (
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {r.frameworkApplyCount} framework{r.frameworkApplyCount === 1 ? "" : "s"} apply
        </span>
      ),
    },
    {
      key: "tenants",
      label: "Tenants",
      sortable: true,
      width: "w-[16%]",
      sortValue: (r) => r.tenantCount,
      render: (r) => (
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {r.tenantCount} tenant{r.tenantCount === 1 ? "" : "s"}
        </span>
      ),
    },
  ];

  // ⋮ row menu — Edit + Soft-delete (archive). Reserved (GLOBAL) keeps the
  // soft-delete VISIBLE but disabled with the reason (never silently hidden).
  const rowMenu = (r: RegionListRow): RowMenuItem[] => {
    const reserved = isReservedRegion(r.value);
    return [
      { label: "Edit", icon: Pencil, onClick: () => openEdit(r) },
      {
        label: "Soft delete (archive)",
        icon: Archive,
        danger: true,
        disabled: reserved,
        disabledReason: reserved ? "Protected system region — can't be archived." : undefined,
        onClick: () => { if (!reserved) setArchiving(r); },
      },
    ];
  };

  // Type filter (System / Custom); the empty default = all regions.
  const filters: DataFilter<RegionListRow>[] = [
    {
      key: "type",
      label: "regions",
      options: [
        { value: "system", label: "System (GLOBAL)" },
        { value: "custom", label: "Custom regions" },
      ],
      match: (r, v) => (v === "system" ? isReservedRegion(r.value) : !isReservedRegion(r.value)),
    },
  ];

  const actions: PageAction[] = [
    { label: `Archived${archived.length ? ` (${archived.length})` : ""}`, variant: "secondary", icon: ArchiveRestore, onClick: () => setArchivedOpen(true) },
    { label: "Add region", variant: "primary", icon: Plus, onClick: openAdd },
  ];

  return (
    <PageLayout
      title="Regulatory Regions & Frameworks"
      description="Regions are the landing view. Open a region to manage the frameworks that apply to it (its own links plus every Global framework)."
      actions={actions}
    >
      <DataTable<RegionListRow>
        mode="client"
        data={active}
        rowKey={(r) => r.id}
        ariaLabel="Regulatory regions"
        columns={columns}
        search={{ placeholder: "Search regions…", keys: ["label", "value", "description"] }}
        filters={filters}
        rowMenu={rowMenu}
        onRowClick={goto}
        emptyState="No regions match the current filter."
      />

      <RegionModal open={formOpen} region={editing} onClose={() => setFormOpen(false)} onSaved={() => router.refresh()} />
      <ArchivedRegionsModal open={archivedOpen} archived={archived} onClose={() => setArchivedOpen(false)} onChanged={() => router.refresh()} />
      <ArchiveRegionConfirm region={archiving} onClose={() => setArchiving(null)} onDone={() => router.refresh()} />
    </PageLayout>
  );
}
