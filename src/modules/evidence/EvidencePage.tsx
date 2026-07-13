"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, RefreshCw, LayoutGrid, List, FileText, Lock, Clock, FilePen,
  Files, Search, X, FileSpreadsheet,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import { DataTable, type DataColumn, type DataFilter } from "@/components/table/DataTable";
import { StatCard } from "@/components/shared/StatCard";
import { DocumentCard } from "@/components/shared/DocumentCard";
import { evidenceDocToCardView } from "@/components/shared/documentCardAdapters";
import { downloadPDF, downloadExcel } from "@/lib/exportTable";
import type { EvidenceLibraryResult, EvidenceLibraryDoc, DocOrigin } from "@/lib/queries/evidenceLibrary";
import { DocumentFormModal } from "./DocumentFormModal";
import { DocumentDetailsModal } from "./DocumentDetailsModal";

const GRID_PAGE = 9; // 3 rows × 3 columns per "Show more"

/* ── Bulk metadata export (PDF / Excel) — the selected docs' info as a report.
   NOTE: a metadata REPORT, not the raw files (mixed types + link-only docs
   can't merge into one PDF/Excel; bundling raw files would be a ZIP). ── */
const EXPORT_HEADERS = ["Name", "Type", "Source", "Uploader", "Date", "Status", "Linked URL"];
function exportSelected(docs: EvidenceLibraryDoc[], format: "pdf" | "excel") {
  if (!docs.length) return;
  const rows = docs.map((d) => [
    d.title,
    d.category ?? "",
    d.originLabel,
    d.uploaderName,
    d.uploadedAt ? dayjs(d.uploadedAt).format("YYYY-MM-DD") : "",
    prettyStatus(d.status),
    d.linkUrl ?? "",
  ]);
  const filename = `evidence-selected-${dayjs().format("YYYY-MM-DD")}`;
  if (format === "pdf") {
    downloadPDF(filename, EXPORT_HEADERS, rows, { title: "Selected documents", subtitle: `${docs.length} document${docs.length === 1 ? "" : "s"}` });
  } else {
    downloadExcel(filename, EXPORT_HEADERS, rows);
  }
}

const ORIGIN_BADGE: Record<DocOrigin, "blue" | "purple" | "amber" | "red"> = {
  evidence: "blue",
  capa: "purple",
  csv: "amber",
  fda483: "red",
};

function statusBadge(status: string) {
  if (status === "approved") return <Badge variant="green">Approved</Badge>;
  if (status === "under_review") return <Badge variant="amber">Under Review</Badge>;
  if (status === "rejected") return <Badge variant="red">Rejected</Badge>;
  if (status === "draft") return <Badge variant="gray">Draft</Badge>;
  return <Badge variant="blue">Current</Badge>;
}
function prettyStatus(s: string): string {
  return s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function EvidencePage({ library }: { library: EvidenceLibraryResult }) {
  const router = useRouter();
  const { documents, stats, viewer } = library;

  const [view, setView] = useState<"grid" | "table">("grid");
  const [detailsDoc, setDetailsDoc] = useState<EvidenceLibraryDoc | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editDoc, setEditDoc] = useState<EvidenceLibraryDoc | null>(null);

  // Grid-specific filters (hidden in table mode — the DataTable has its own).
  const [gSearch, setGSearch] = useState("");
  const [gOrigin, setGOrigin] = useState("");
  const [gStatus, setGStatus] = useState("");
  const [gridVisible, setGridVisible] = useState(GRID_PAGE);
  // Grid selection (id set). Table selection lives inside DataTable's own bulk
  // primitive; both select ONLY over the server-scoped `documents` (permission
  // model unchanged — selection can't reveal a doc the viewer can't already see).
  const [gridSel, setGridSel] = useState<Set<string>>(new Set());

  const originOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of documents) if (!seen.has(d.origin)) seen.set(d.origin, d.originLabel);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [documents]);
  const statusOptions = useMemo(() => {
    const set = new Set(documents.map((d) => d.status));
    return [...set].map((s) => ({ value: s, label: prettyStatus(s) }));
  }, [documents]);

  const gridFiltered = useMemo(() => {
    const q = gSearch.trim().toLowerCase();
    return documents.filter((d) =>
      (!gOrigin || d.origin === gOrigin) &&
      (!gStatus || d.status === gStatus) &&
      (!q ||
        d.title.toLowerCase().includes(q) ||
        d.uploaderName.toLowerCase().includes(q) ||
        d.originLabel.toLowerCase().includes(q)),
    );
  }, [documents, gSearch, gOrigin, gStatus]);

  useEffect(() => { setGridVisible(GRID_PAGE); }, [gSearch, gOrigin, gStatus]);

  const gridHasFilter = gSearch.trim() !== "" || gOrigin !== "" || gStatus !== "";
  const clearGrid = () => { setGSearch(""); setGOrigin(""); setGStatus(""); };

  const openAdd = () => { setFormMode("add"); setEditDoc(null); setFormOpen(true); };
  const openEdit = (d: EvidenceLibraryDoc) => { setDetailsDoc(null); setFormMode("edit"); setEditDoc(d); setFormOpen(true); };

  const actions: PageAction[] = viewer.canCreate
    ? [{ label: "Add document", variant: "primary", icon: Plus, onClick: openAdd }]
    : [];

  const description = viewer.seeAll
    ? "Every document in your organisation — uploaded here plus read-only mirrors from CAPA, CSV/CSA validation, and Inspection. Only documents added here can be edited or deleted."
    : "Your documents — the ones you uploaded here plus read-only mirrors you own from other modules. Only documents you add here can be edited or deleted.";

  const gridSelectedDocs = useMemo(() => documents.filter((d) => gridSel.has(d.id)), [documents, gridSel]);
  const toggleGridSel = (id: string) =>
    setGridSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const bulkActions = [
    { label: "Export PDF", icon: FileText, onClick: (rows: EvidenceLibraryDoc[]) => exportSelected(rows, "pdf") },
    { label: "Export Excel", icon: FileSpreadsheet, onClick: (rows: EvidenceLibraryDoc[]) => exportSelected(rows, "excel") },
  ];

  // The Grid/Table segmented toggle — rendered top-right in the PageLayout header.
  const viewToggle = (
    <div className="inline-flex rounded-lg border border-(--bg-border) overflow-hidden">
      <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} title="Grid view"
        className={clsx("px-2.5 py-1.5 inline-flex items-center gap-1.5 text-[12px] border-none cursor-pointer", view === "grid" ? "bg-(--brand) text-white" : "bg-transparent text-(--text-secondary)")}>
        <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" /> Grid
      </button>
      <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")} title="Table view"
        className={clsx("px-2.5 py-1.5 inline-flex items-center gap-1.5 text-[12px] border-none cursor-pointer", view === "table" ? "bg-(--brand) text-white" : "bg-transparent text-(--text-secondary)")}>
        <List className="w-3.5 h-3.5" aria-hidden="true" /> Table
      </button>
    </div>
  );

  /* ── Table columns ── */
  const columns: DataColumn<EvidenceLibraryDoc>[] = [
    {
      key: "title", label: "Document", sortable: true, exportValue: (d) => d.title,
      render: (d) => (
        <div className="min-w-0">
          <span className="text-[13px] font-medium text-(--text-primary) inline-flex items-center gap-1.5">
            {d.title}
            {d.locked && <Lock className="w-3 h-3 text-(--text-muted)" aria-hidden="true" />}
          </span>
          {d.linkedRef && <p className="text-[11px] text-(--text-muted) truncate">{d.linkedRef}</p>}
        </div>
      ),
    },
    { key: "category", label: "Type", sortable: true, width: "w-[12%]", exportValue: (d) => d.category ?? "—", render: (d) => <span className="text-[12px] text-(--text-secondary)">{d.category ?? "—"}</span> },
    { key: "origin", label: "Source", sortable: true, width: "w-[14%]", sortValue: (d) => d.originLabel, exportValue: (d) => d.originLabel, render: (d) => <Badge variant={ORIGIN_BADGE[d.origin]}>{d.originLabel}</Badge> },
    { key: "uploaderName", label: "Uploader", sortable: true, width: "w-[14%]", exportValue: (d) => d.uploaderName, render: (d) => <span className="text-[12px] text-(--text-secondary)">{d.uploaderName}</span> },
    { key: "status", label: "Status", sortable: true, width: "w-[11%]", exportValue: (d) => prettyStatus(d.status), render: (d) => statusBadge(d.status) },
    { key: "uploadedAt", label: "Uploaded", sortable: true, width: "w-[12%]", exportValue: (d) => (d.uploadedAt ? dayjs(d.uploadedAt).format("YYYY-MM-DD") : ""), render: (d) => <span className="text-[12px] text-(--text-secondary)">{d.uploadedAt ? dayjs(d.uploadedAt).format("DD MMM YYYY") : "—"}</span> },
  ];

  const tableFilters: DataFilter<EvidenceLibraryDoc>[] = [
    { key: "origin", label: "sources", options: originOptions, match: (d, v) => d.origin === v },
    { key: "status", label: "statuses", options: statusOptions, match: (d, v) => d.status === v },
  ];

  return (
    <PageLayout title="Evidence & Documents" description={description} actions={actions} headerRight={viewToggle}>
      {/* Summary cards (role-scoped — counts reflect only what this viewer sees) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Files} color="var(--brand)" label="Total" value={String(stats.total)} sub={viewer.seeAll ? "All documents in tenant" : "Documents you can see"} />
        <StatCard icon={FilePen} color="var(--success)" label="Editable" value={String(stats.editable)} sub="Uploaded here" />
        <StatCard icon={Lock} color="var(--text-muted)" label="Locked" value={String(stats.locked)} sub="From other modules" />
        <StatCard icon={Clock} color="var(--warning)" label="Recent" value={String(stats.recent)} sub="Last 30 days" />
      </div>

      {/* Grid-only filters (the toggle now lives in the header top-right). In
          table mode these hide; the DataTable's own toolbar provides
          search/filters/clear. */}
      {view === "grid" && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Input id="grid-search" type="search" icon={Search} placeholder="Filter grid…" aria-label="Filter grid"
            className="flex-1 min-w-[200px] max-w-sm" value={gSearch} onChange={(e) => setGSearch(e.target.value)} />
          <Dropdown value={gOrigin} onChange={setGOrigin} width="w-44" placeholder="All sources" options={[{ value: "", label: "All sources" }, ...originOptions]} />
          <Dropdown value={gStatus} onChange={setGStatus} width="w-40" placeholder="All statuses" options={[{ value: "", label: "All statuses" }, ...statusOptions]} />
          {gridHasFilter && <Button variant="ghost" size="sm" icon={X} onClick={clearGrid}>Clear</Button>}
        </div>
      )}

      {/* Grid selection bar — mirrors the DataTable's contextual bulk bar. */}
      {view === "grid" && gridSel.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg flex-wrap" style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}>
          <span className="text-[12px] font-medium text-(--text-primary)">{gridSel.size} selected</span>
          <Button variant="secondary" size="sm" icon={FileText} onClick={() => exportSelected(gridSelectedDocs, "pdf")}>Export PDF</Button>
          <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={() => exportSelected(gridSelectedDocs, "excel")}>Export Excel</Button>
          <Button variant="ghost" size="sm" onClick={() => setGridSel(new Set())}>Clear selection</Button>
        </div>
      )}

      {/* ── GRID view ── */}
      {view === "grid" ? (
        gridFiltered.length === 0 ? (
          <div className="rounded-2xl border border-(--bg-border) bg-(--bg-elevated) p-10 text-center">
            <FileText className="w-10 h-10 mx-auto mb-2 text-(--text-muted)" aria-hidden="true" />
            <p className="text-[13px] text-(--text-muted)">{documents.length === 0 ? "No documents yet." : "No documents match the current filters."}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {gridFiltered.slice(0, gridVisible).map((d) => (
                <DocumentCard
                  key={d.id}
                  doc={evidenceDocToCardView(d)}
                  selectable
                  selected={gridSel.has(d.id)}
                  onToggleSelect={() => toggleGridSel(d.id)}
                  onView={() => setDetailsDoc(d)}
                />
              ))}
            </div>
            {gridFiltered.length > gridVisible && (
              <div className="flex items-center justify-between gap-3 mt-4">
                <span className="text-[11px] text-(--text-muted)">Showing {Math.min(gridVisible, gridFiltered.length)} of {gridFiltered.length}</span>
                <Button variant="ghost" size="sm" onClick={() => setGridVisible((v) => v + GRID_PAGE)}>
                  Show more ({gridFiltered.length - gridVisible} remaining)
                </Button>
              </div>
            )}
          </>
        )
      ) : (
        /* ── TABLE view ── */
        <DataTable<EvidenceLibraryDoc>
          mode="client"
          data={documents}
          rowKey={(d) => d.id}
          ariaLabel="Documents"
          columns={columns}
          search={{ placeholder: "Search documents…", keys: ["title", "uploaderName", "originLabel", "category"] }}
          filters={tableFilters}
          exportOptions={{ filename: `evidence-documents-${dayjs().format("YYYY-MM-DD")}`, title: "Evidence & Documents" }}
          toolbarActions={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => router.refresh()}>Refresh</Button>}
          bulk={{ actions: bulkActions }}
          onRowClick={(d) => setDetailsDoc(d)}
          emptyState="No documents match the current filters."
        />
      )}

      <DocumentDetailsModal doc={detailsDoc} onClose={() => setDetailsDoc(null)} onEdit={openEdit} onChanged={() => router.refresh()} />
      <DocumentFormModal open={formOpen} mode={formMode} doc={editDoc} onClose={() => setFormOpen(false)} onSaved={() => router.refresh()} />
    </PageLayout>
  );
}
