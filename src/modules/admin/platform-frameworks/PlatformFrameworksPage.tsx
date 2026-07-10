"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X, Globe, BookOpen, Pencil, Archive, ArchiveRestore, KeyRound, ArrowRight, ArrowUp, ArrowDown, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/shared";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { setFrameworkPlatformEnabled, archiveFramework, unarchiveFramework, bulkSetFrameworkPlatformEnabled, reorderFramework } from "@/actions/frameworks";
import type { CatalogFramework } from "@/lib/queries";
import { AddFrameworkModal } from "./_components/AddFrameworkModal";
import { SupersedeKeyModal } from "./_components/SupersedeKeyModal";
import { FrameworkActivityPanel } from "./_components/FrameworkActivityPanel";

interface Props {
  catalog: CatalogFramework[];
  regions: { value: string; label: string }[];
}

/**
 * Super Admin — platform framework catalog. Lists every framework with its
 * region scope + platform status; add new frameworks (non-reserved slug key);
 * toggle platformEnabled (audit-first) which immediately hides/shows it for
 * every tenant's Frameworks tab and Gap dropdown. Reuses the shared audited
 * actions; no inline role checks (the route + actions gate via isPlatformAdmin).
 */
export function PlatformFrameworksPage({ catalog, regions }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<CatalogFramework[]>(catalog);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState(""); // "" = All regions
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogFramework | null>(null);
  const [superseding, setSuperseding] = useState<CatalogFramework | null>(null);
  const [tab, setTab] = useState<"catalog" | "activity">("catalog");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyBulk, setBusyBulk] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(false);

  const TABS = [
    { id: "catalog" as const, label: "Catalog" },
    { id: "activity" as const, label: "Activity" },
  ];

  // Keep local rows in sync with the server after a router.refresh().
  useEffect(() => { setRows(catalog); }, [catalog]);

  const regionLabel = (v: string) => regions.find((r) => r.value === v)?.label ?? v;

  const archivedCount = useMemo(() => rows.filter((f) => f.archived).length, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter === "active") r = r.filter((f) => !f.archived);
    else if (statusFilter === "archived") r = r.filter((f) => f.archived);
    if (regionFilter) r = r.filter((f) => f.appliesToAllRegions || f.regions.includes(regionFilter));
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((f) => f.name.toLowerCase().includes(q) || f.key.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q));
    return r;
  }, [rows, statusFilter, regionFilter, search]);

  const togglePlatform = async (fw: CatalogFramework, enabled: boolean) => {
    setBusyId(fw.id);
    setRows((prev) => prev.map((r) => (r.id === fw.id ? { ...r, platformEnabled: enabled } : r)));
    const res = await setFrameworkPlatformEnabled(fw.id, enabled);
    setBusyId(null);
    if (!res.success) {
      setRows((prev) => prev.map((r) => (r.id === fw.id ? { ...r, platformEnabled: !enabled } : r)));
      toast.error(res.error);
      return;
    }
    toast.success(`${fw.name} ${enabled ? "enabled platform-wide" : "disabled platform-wide"}.`);
    router.refresh(); // server is source of truth
  };

  const archive = async (fw: CatalogFramework) => {
    setBusyId(fw.id);
    const res = await archiveFramework(fw.id);
    setBusyId(null);
    if (!res.success) { toast.error(res.error); return; }
    toast.success(`${fw.name} archived — hidden from all tenants.`);
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

  const reorder = async (fw: CatalogFramework, dir: "up" | "down") => {
    setBusyId(fw.id);
    const res = await reorderFramework(fw.id, dir);
    setBusyId(null);
    if (!res.success) { toast.error(res.error); return; }
    router.refresh();
  };

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (fw: CatalogFramework) => { setEditing(fw); setModalOpen(true); };

  const anyFilter = !!regionFilter || search.trim() !== "" || statusFilter !== "active";

  // ── Bulk selection (active rows only — platform enable/disable) ──
  const selectableRows = useMemo(() => filtered.filter((f) => !f.archived), [filtered]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((f) => selected.has(f.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableRows.map((f) => f.id)));
  const toggleOne = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const bulkSet = async (enabled: boolean) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusyBulk(true);
    const res = await bulkSetFrameworkPlatformEnabled(ids, enabled);
    setBusyBulk(false);
    if (!res.success) { toast.error(res.error); return; }
    toast.success(`${res.data.changed} framework${res.data.changed === 1 ? "" : "s"} ${enabled ? "enabled" : "disabled"}${res.data.skipped ? ` · ${res.data.skipped} already ${enabled ? "enabled" : "disabled"}` : ""}.`);
    setSelected(new Set());
    router.refresh();
  };

  // Reorder up/down only makes sense in the plain, unfiltered, ungrouped order.
  const canReorder = !anyFilter && !groupByCategory;

  // Grouped view: bucket the filtered rows by category (null → Uncategorized),
  // preserving sortOrder within each group.
  const groups = useMemo(() => {
    if (!groupByCategory) return [];
    const map = new Map<string, CatalogFramework[]>();
    for (const f of filtered) {
      const key = f.category?.trim() || "Uncategorized";
      (map.get(key) ?? map.set(key, []).get(key)!).push(f);
    }
    // Named categories A→Z, Uncategorized last.
    return [...map.entries()].sort(([a], [b]) =>
      a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b),
    );
  }, [filtered, groupByCategory]);

  const frameworkColumns = (showReorder: boolean): Column<CatalogFramework>[] => [
    {
      key: "select",
      header: (
        <input type="checkbox" aria-label="Select all frameworks" checked={allSelected} onChange={toggleAll} className="cursor-pointer align-middle" />
      ),
      width: "w-10",
      render: (f) =>
        f.archived ? null : (
          <input
            type="checkbox"
            aria-label={`Select ${f.name}`}
            checked={selected.has(f.id)}
            onChange={() => toggleOne(f.id)}
            onClick={(e) => e.stopPropagation()}
            className="cursor-pointer align-middle"
          />
        ),
    },
    {
      key: "name",
      header: "Framework",
      render: (f) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{f.name}</span>
            {f.reserved && <Badge variant="gray">Built-in</Badge>}
            {f.category && <Badge variant="blue">{f.category}</Badge>}
          </div>
          <p className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>{f.key}</p>
          {f.description && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{f.description}</p>}
          {f.successor && (
            <p className="text-[11px] mt-0.5 inline-flex items-center gap-1 font-mono" style={{ color: "var(--text-muted)" }}>
              <ArrowRight className="w-3 h-3" aria-hidden="true" /> superseded by {f.successor.key}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "scope",
      header: "Region scope",
      render: (f) =>
        f.appliesToAllRegions ? (
          <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <Globe className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" /> Global
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {f.regions.length === 0 ? (
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>—</span>
            ) : f.regions.map((r) => <Badge key={r} variant="blue">{regionLabel(r)}</Badge>)}
          </div>
        ),
    },
    {
      key: "status",
      header: "Platform status",
      render: (f) =>
        f.archived ? (
          <Badge variant="amber">Archived</Badge>
        ) : (
          <div className="flex items-center gap-3">
            <Toggle
              id={`plat-${f.id}`}
              checked={f.platformEnabled}
              onChange={() => togglePlatform(f, !f.platformEnabled)}
              label={`${f.name} platform status`}
              disabled={busyId === f.id}
              hideLabel
            />
            <Badge variant={f.platformEnabled ? "green" : "gray"}>{f.platformEnabled ? "Enabled" : "Disabled"}</Badge>
          </div>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      srOnly: true,
      render: (f) => {
        const i = selectableRows.findIndex((x) => x.id === f.id);
        return (
          <div className="flex justify-end gap-1">
            {f.archived ? (
              <Button variant="ghost" size="sm" icon={ArchiveRestore} onClick={() => unarchive(f)} disabled={busyId === f.id} aria-label={`Un-archive ${f.name}`}>
                Un-archive
              </Button>
            ) : (
              <>
                {showReorder && (
                  <>
                    <Button variant="ghost" size="sm" icon={ArrowUp} onClick={() => reorder(f, "up")} disabled={busyId === f.id || i <= 0} aria-label={`Move ${f.name} up`} />
                    <Button variant="ghost" size="sm" icon={ArrowDown} onClick={() => reorder(f, "down")} disabled={busyId === f.id || i < 0 || i >= selectableRows.length - 1} aria-label={`Move ${f.name} down`} />
                  </>
                )}
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(f)} aria-label={`Edit ${f.name}`} />
                {/* Reserved (built-in) frameworks can NEVER be superseded or
                    archived — buttons disabled with a reason; server hard-blocks. */}
                <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setSuperseding(f)} disabled={busyId === f.id || f.reserved} title={f.reserved ? "Built-in frameworks can't be re-keyed" : "Change key (archive & alias)"} aria-label={`Change key of ${f.name}`} />
                <Button variant="ghost" size="sm" icon={Archive} onClick={() => archive(f)} disabled={busyId === f.id || f.reserved} title={f.reserved ? "Built-in frameworks can't be archived" : undefined} aria-label={`Archive ${f.name}`} />
              </>
            )}
          </div>
        );
      },
    },
  ];

  const renderTable = (data: CatalogFramework[], showReorder: boolean, ariaLabel: string) => (
    <DataTable
      ariaLabel={ariaLabel}
      data={data}
      rowKey={(f) => f.id}
      emptyState={<p className="text-center text-[13px] py-8" style={{ color: "var(--text-muted)" }}>{anyFilter ? "No frameworks match the current filter." : "No frameworks yet."}</p>}
      columns={frameworkColumns(showReorder)}
    />
  );

  // "Add framework" is a header action only on the Catalog tab (Activity is
  // read-only) — pass an empty actions array otherwise so the button hides.
  const headerActions: PageAction[] = tab === "catalog"
    ? [{ label: "Add framework", variant: "primary", icon: Plus, onClick: openAdd }]
    : [];

  return (
    <PageLayout
      title="Compliance Frameworks"
      titleIcon={BookMarked}
      description="The master catalog of regulatory frameworks tenants can enable — archiving one removes it from every tenant immediately."
      actions={headerActions}
      className="w-full"
    >
      {/* Tab bar — Catalog (manage) / Activity (read-only audit) */}
      <div role="tablist" aria-label="Framework sections" className="flex gap-1 border-b border-(--bg-border) mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer outline-none transition-colors ${tab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "activity" ? (
        <FrameworkActivityPanel />
      ) : (
      <>
      {/* Filters — status + region + search */}
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
        <Dropdown
          value={regionFilter}
          onChange={setRegionFilter}
          width="w-52"
          searchable
          options={[{ value: "", label: "All regions" }, ...regions.map((r) => ({ value: r.value, label: r.label }))]}
        />
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search frameworks…"
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
        <Toggle
          id="group-by-category"
          checked={groupByCategory}
          onChange={() => setGroupByCategory((v) => !v)}
          label="Group by category"
        />
      </div>

      {/* Bulk action toolbar — appears when active rows are selected. */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-2.5 rounded-lg flex-wrap" style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}>
          <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{selected.size} selected</span>
          <Button variant="secondary" size="sm" onClick={() => bulkSet(true)} loading={busyBulk} disabled={busyBulk}>Enable platform-wide</Button>
          <Button variant="secondary" size="sm" onClick={() => bulkSet(false)} loading={busyBulk} disabled={busyBulk}>Disable platform-wide</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={busyBulk}>Clear</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <Card><EmptyState icon={BookOpen} title="No frameworks yet" description="Add your first framework to the catalog." /></Card>
      ) : groupByCategory ? (
        <div className="space-y-4">
          {groups.map(([cat, list]) => (
            <Card key={cat} padding="none" header={<><span className="card-title">{cat}</span><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{list.length}</span></>}>
              {renderTable(list, false, `Frameworks — ${cat}`)}
            </Card>
          ))}
        </div>
      ) : (
        <Card padding="none" header={<><span className="card-title">Catalog</span><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{filtered.length} of {rows.length}</span></>}>
          {renderTable(filtered, canReorder, "Framework catalog")}
        </Card>
      )}
      </>
      )}

      <AddFrameworkModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        regions={regions}
        framework={editing}
        onSaved={() => router.refresh()}
      />

      <SupersedeKeyModal
        open={!!superseding}
        framework={superseding}
        onClose={() => setSuperseding(null)}
        onDone={() => router.refresh()}
      />
    </PageLayout>
  );
}
