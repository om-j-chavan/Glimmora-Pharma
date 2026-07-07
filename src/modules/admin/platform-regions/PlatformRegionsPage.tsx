"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X, Globe, Pencil, Archive, ArchiveRestore, KeyRound, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/shared";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { archiveRegion, unarchiveRegion } from "@/actions/regions";
import { isReservedRegion } from "@/constants/regulatoryRegions";
import type { RegionCatalogRow } from "@/lib/queries";
import { RegionFormModal } from "./_components/RegionFormModal";
import { SupersedeRegionModal } from "./_components/SupersedeRegionModal";

interface Props {
  catalog: RegionCatalogRow[];
}

/**
 * Super Admin — regulatory region management (Item #3, Stage 3). Add regions,
 * edit their label (never the value), archive unused ones (blocked while any
 * tenant/framework references them), and change a value via archive-and-alias
 * (supersede) which re-points every reference. All writes are audit-first and
 * super_admin-gated (route + actions).
 */
export function PlatformRegionsPage({ catalog }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<RegionCatalogRow[]>(catalog);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RegionCatalogRow | null>(null);
  const [superseding, setSuperseding] = useState<RegionCatalogRow | null>(null);

  useEffect(() => { setRows(catalog); }, [catalog]);

  const archivedCount = useMemo(() => rows.filter((r) => r.archived).length, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter === "active") r = r.filter((x) => !x.archived);
    else if (statusFilter === "archived") r = r.filter((x) => x.archived);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((x) => x.value.toLowerCase().includes(q) || x.label.toLowerCase().includes(q));
    return r;
  }, [rows, statusFilter, search]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (r: RegionCatalogRow) => { setEditing(r); setFormOpen(true); };

  const archive = async (r: RegionCatalogRow) => {
    setBusyId(r.id);
    const res = await archiveRegion(r.id);
    setBusyId(null);
    if (!res.success) { toast.error(res.error); return; }
    toast.success(`${r.label} archived.`);
    router.refresh();
  };

  const unarchive = async (r: RegionCatalogRow) => {
    setBusyId(r.id);
    const res = await unarchiveRegion(r.id);
    setBusyId(null);
    if (!res.success) { toast.error(res.error); return; }
    toast.success(`${r.label} restored.`);
    router.refresh();
  };

  const anyFilter = search.trim() !== "" || statusFilter !== "active";

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>Regulatory Regions</h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            The central region list. The value is a permanent key; the label is editable. Archiving is blocked while a region is in use.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openAdd}>Add region</Button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Dropdown
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "active" | "archived" | "all")}
          width="w-44"
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: `Archived${archivedCount ? ` (${archivedCount})` : ""}` },
            { value: "all", label: "All statuses" },
          ]}
        />
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search regions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg py-2 pl-9 pr-8 text-[13px] outline-none"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer" style={{ color: "var(--text-muted)" }} aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={Globe} title="No regions yet" description="Add your first regulatory region." /></Card>
      ) : (
        <Card padding="none" header={<><span className="card-title">Regions</span><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{filtered.length} of {rows.length}</span></>}>
          <DataTable
            ariaLabel="Regulatory regions"
            data={filtered}
            rowKey={(r) => r.id}
            minWidth={760}
            emptyState={<p className="text-center text-[13px] py-8" style={{ color: "var(--text-muted)" }}>{anyFilter ? "No regions match the current filter." : "No regions yet."}</p>}
            columns={[
              {
                key: "region",
                header: "Region",
                render: (r) => (
                  <div className="min-w-0">
                    <span className="text-[13px] font-semibold inline-flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                      {r.label}
                      {isReservedRegion(r.value) && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                          title="Protected system region — can't be archived, superseded, or deleted"
                        >
                          <Lock className="w-3 h-3" aria-hidden="true" /> System
                        </span>
                      )}
                    </span>
                    <p className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>{r.value}</p>
                    {r.successor && (
                      <p className="text-[11px] mt-0.5 inline-flex items-center gap-1 font-mono" style={{ color: "var(--text-muted)" }}>
                        <ArrowRight className="w-3 h-3" aria-hidden="true" /> superseded by {r.successor.value}
                      </p>
                    )}
                  </div>
                ),
              },
              {
                key: "usage",
                header: "In use by",
                render: (r) => {
                  const inUse = r.tenantCount + r.frameworkCount;
                  return inUse === 0 ? (
                    <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>—</span>
                  ) : (
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {r.tenantCount} tenant{r.tenantCount === 1 ? "" : "s"}, {r.frameworkCount} framework{r.frameworkCount === 1 ? "" : "s"}
                    </span>
                  );
                },
              },
              {
                key: "status",
                header: "Status",
                render: (r) => <Badge variant={r.archived ? "amber" : "green"}>{r.archived ? "Archived" : "Active"}</Badge>,
              },
              {
                key: "actions",
                header: "Actions",
                srOnly: true,
                render: (r) => {
                  const inUse = r.tenantCount + r.frameworkCount > 0;
                  // Reserved regions (GLOBAL) are permanent — the value can't be
                  // superseded and the row can't be archived/deleted. The server
                  // hard-blocks both; the UI disables them with a reason.
                  const reserved = isReservedRegion(r.value);
                  return (
                    <div className="flex justify-end gap-1">
                      {r.archived ? (
                        <Button variant="ghost" size="sm" icon={ArchiveRestore} onClick={() => unarchive(r)} disabled={busyId === r.id} aria-label={`Un-archive ${r.label}`}>
                          Un-archive
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(r)} aria-label={`Edit label of ${r.label}`} />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={KeyRound}
                            onClick={() => setSuperseding(r)}
                            disabled={busyId === r.id || reserved}
                            title={reserved ? "Protected system region — its value is permanent" : "Change value (archive & alias, re-points references)"}
                            aria-label={`Change value of ${r.label}`}
                          />
                          {/* Archive is blocked while the region is in use — the
                              server also hard-blocks and names the blockers.
                              Reserved (GLOBAL) can never be archived. */}
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Archive}
                            onClick={() => archive(r)}
                            disabled={busyId === r.id || inUse || reserved}
                            title={reserved ? "Protected system region — can't be archived" : inUse ? "In use — supersede the value or move references off it first" : undefined}
                            aria-label={`Archive ${r.label}`}
                          />
                        </>
                      )}
                    </div>
                  );
                },
              },
            ] satisfies Column<RegionCatalogRow>[]}
          />
        </Card>
      )}

      <RegionFormModal open={formOpen} region={editing} onClose={() => setFormOpen(false)} onSaved={() => router.refresh()} />
      <SupersedeRegionModal open={!!superseding} region={superseding} onClose={() => setSuperseding(null)} onDone={() => router.refresh()} />
    </div>
  );
}
