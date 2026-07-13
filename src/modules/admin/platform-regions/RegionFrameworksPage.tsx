"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Globe, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { DisplayId } from "@/components/ui/DisplayId";
import { Popup } from "@/components/ui/Popup";
import { useToast } from "@/components/ui/Toast";
import { PageLayout } from "@/components/layout/PageLayout";
import { DataTable, type DataColumn, type RowMenuItem } from "@/components/table/DataTable";
import { setFrameworkPlatformEnabled, archiveFramework, unarchiveFramework } from "@/actions/frameworks";
import { isReservedRegion } from "@/constants/regulatoryRegions";
import { regionDisplayId, frameworkDisplayId } from "@/lib/displayIds";
import type { CatalogFramework } from "@/lib/queries";
import { AddFrameworkModal } from "../platform-frameworks/_components/AddFrameworkModal";

interface Props {
  region: { value: string; label: string };
  frameworks: CatalogFramework[];
  regions: { value: string; label: string }[];
}

/**
 * Region drill-down — MIGRATED to the shared <PageLayout> + <DataTable>
 * primitives (client mode). Exercises: breadcrumb header, required description,
 * single primary action, toolbar (search + status filter + clear), sortable
 * headers, Show-more, an INLINE Toggle that persists on click (optimistic +
 * revert on the Stage-4 ≥1-active block), a ⋮ menu with a VISIBLE-but-disabled
 * "Soft delete" for built-ins (reason shown), and a custom-rendered Scope cell
 * (the escape hatch). All the underlying handlers are unchanged.
 */
export function RegionFrameworksPage({ region, frameworks, regions }: Props) {
  const router = useRouter();
  const toast = useToast();
  const reservedRegion = isReservedRegion(region.value);
  const [rows, setRows] = useState<CatalogFramework[]>(frameworks);
  // LIVE UPDATE (item 5): after add / archive / restore the handlers call
  // router.refresh(), which re-renders this page with a fresh `frameworks` prop.
  // `rows` is local state (needed for the optimistic inline toggle), so sync it
  // whenever the server prop changes — otherwise the new/removed row wouldn't
  // appear until a manual reload.
  useEffect(() => { setRows(frameworks); }, [frameworks]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogFramework | null>(null);
  const [blockWarning, setBlockWarning] = useState<string | null>(null);

  const regionLabel = (v: string) => regions.find((r) => r.value === v)?.label ?? v;
  const scopeText = (f: CatalogFramework) =>
    f.appliesToAllRegions
      ? "Global"
      : f.regions.length <= 1
        ? `${regionLabel(f.regions[0] ?? region.value)} only`
        : f.regions.map(regionLabel).join(", ");

  // The dataset: this region's links ∪ all GLOBAL frameworks. Toolbar search /
  // status filter / sort / show-more operate over this in the DataTable.
  const applicable = rows.filter((f) => f.appliesToAllRegions || f.regions.includes(region.value));

  const togglePlatform = async (fw: CatalogFramework, enabled: boolean) => {
    setBusyId(fw.id);
    // Inline toggles write IMMEDIATELY (optimistic), reverting on failure.
    setRows((prev) => prev.map((r) => (r.id === fw.id ? { ...r, platformEnabled: enabled } : r)));
    const res = await setFrameworkPlatformEnabled(fw.id, enabled);
    setBusyId(null);
    if (!res.success) {
      setRows((prev) => prev.map((r) => (r.id === fw.id ? { ...r, platformEnabled: !enabled } : r)));
      if (!enabled) setBlockWarning(res.error);
      else toast.error(res.error);
      return;
    }
    toast.success(`${fw.name} ${enabled ? "enabled" : "disabled"} platform-wide.`);
    router.refresh();
  };

  const archive = async (fw: CatalogFramework) => {
    setBusyId(fw.id);
    const res = await archiveFramework(fw.id);
    setBusyId(null);
    if (!res.success) { toast.error(res.error); return; }
    toast.success(`${fw.name} archived.`);
    router.refresh();
  };

  const unarchive = async (fw: CatalogFramework) => {
    setBusyId(fw.id);
    const res = await unarchiveFramework(fw.id);
    setBusyId(null);
    if (!res.success) { toast.error(res.error); return; }
    toast.success(`${fw.name} restored.`);
    router.refresh();
  };

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (fw: CatalogFramework) => { setEditing(fw); setModalOpen(true); };

  const columns: DataColumn<CatalogFramework>[] = [
    { key: "id", label: "Framework ID", sortable: true, width: "w-[13%]", sortValue: (f) => f.key, exportValue: (f) => frameworkDisplayId(f.key),
      render: (f) => <DisplayId className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{frameworkDisplayId(f.key)}</DisplayId> },
    { key: "name", label: "Name", sortable: true, width: "w-[20%]",
      render: (f) => <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{f.name}</span> },
    { key: "description", label: "Description", width: "w-[22%]", exportValue: (f) => f.description ?? "",
      render: (f) => <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{f.description ?? "—"}</span> },
    // Escape hatch — a fully custom cell.
    { key: "scope", label: "Scope", width: "w-[14%]", exportValue: (f) => (f.appliesToAllRegions ? "Global" : scopeText(f)),
      render: (f) => f.appliesToAllRegions
        ? <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}><Globe className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" /> Global</span>
        : <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{scopeText(f)}</span> },
    { key: "type", label: "Type", sortable: true, width: "w-[9%]", sortValue: (f) => (f.reserved ? "Built-in" : "Custom"),
      render: (f) => <Badge variant={f.reserved ? "gray" : "blue"}>{f.reserved ? "Built-in" : "Custom"}</Badge> },
    // Inline control — persists on click (optimistic + revert). Not batch-to-save.
    { key: "status", label: "Status", width: "w-[12%]", exportValue: (f) => (f.archived ? "Archived" : f.platformEnabled ? "On" : "Off"),
      render: (f) => f.archived
        ? <Badge variant="amber">Archived</Badge>
        : <div className="flex items-center gap-2">
            <Toggle id={`plat-${f.id}`} checked={f.platformEnabled} onChange={() => togglePlatform(f, !f.platformEnabled)} label={`${f.name} status`} disabled={busyId === f.id} hideLabel />
            <Badge variant={f.platformEnabled ? "green" : "gray"}>{f.platformEnabled ? "On" : "Off"}</Badge>
          </div> },
  ];

  const rowMenu = (f: CatalogFramework): RowMenuItem[] => {
    const items: RowMenuItem[] = [{ label: "Edit", icon: Pencil, onClick: () => openEdit(f) }];
    if (f.reserved) {
      // Built-in: delete stays VISIBLE but disabled with the reason.
      items.push({ label: "Soft delete (archive)", icon: Archive, danger: true, disabled: true, disabledReason: "Built-in frameworks can't be deleted." });
    } else if (f.archived) {
      items.push({ label: "Restore", icon: ArchiveRestore, onClick: () => void unarchive(f) });
    } else {
      items.push({ label: "Soft delete (archive)", icon: Archive, danger: true, onClick: () => void archive(f) });
    }
    return items;
  };

  return (
    <PageLayout
      breadcrumb={{ parent: "All regions", parentHref: "/admin/regions", current: region.label }}
      description={`${regionDisplayId(region.value)}${reservedRegion ? " · System region" : ""} — frameworks that apply here (its own links plus every Global framework). Built-ins always show as Global.`}
      actions={[{ label: "Add framework", variant: "primary", icon: Plus, onClick: openAdd }]}
    >
      <DataTable<CatalogFramework>
        mode="client"
        data={applicable}
        rowKey={(f) => f.id}
        ariaLabel={`Frameworks for ${region.label}`}
        columns={columns}
        search={{ placeholder: "Search frameworks…", keys: ["name", "key", "description"] }}
        filters={[{
          key: "status",
          label: "statuses",
          options: [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }],
          match: (f, v) => (v === "active" ? !f.archived : f.archived),
        }]}
        exportOptions={{ filename: `frameworks-${region.value}`, title: `Frameworks — ${region.label}` }}
        rowMenu={rowMenu}
      />

      <AddFrameworkModal open={modalOpen} onClose={() => setModalOpen(false)} regions={regions} framework={editing} defaultRegion={region.value} onSaved={() => router.refresh()} />

      {/* Stage 4 — blocked-disable warning (server is the real guard). */}
      <Popup isOpen={!!blockWarning} variant="warning" title="Can't disable framework" description={blockWarning ?? ""} onDismiss={() => setBlockWarning(null)} />
    </PageLayout>
  );
}
