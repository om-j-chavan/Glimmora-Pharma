"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, RefreshCw, LayoutGrid, List, FileText, Lock, Clock, FilePen,
  Files, X, Download, Search,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { formatDocumentSource } from "@/lib/labels/documentSource";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import { DataTable, type DataColumn } from "@/components/table/DataTable";
import { StatCard } from "@/components/shared/StatCard";
import { DocumentCard } from "@/components/shared/DocumentCard";
import { evidenceDocToCardView } from "@/components/shared/documentCardAdapters";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import {
  toggleEvidenceSelection,
  setEvidenceSelection,
  clearEvidenceSelection,
} from "@/store/evidence.slice";
import type { EvidenceLibraryResult, EvidenceLibraryDoc } from "@/lib/queries/evidenceLibrary";
import { prettyStatus } from "@/lib/format/text";
import { DocumentFormModal } from "./DocumentFormModal";
import { DocumentDetailsModal } from "./DocumentDetailsModal";
import { ORIGIN_BADGE, statusBadge } from "./_shared";
import { exportSelected } from "./export";

const GRID_PAGE = 9; // 3 rows × 3 columns per "Show more"

export function EvidencePage({ library }: { library: EvidenceLibraryResult }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { documents, stats, viewer } = library;

  const [view, setView] = useState<"grid" | "table">("grid");
  const [detailsDoc, setDetailsDoc] = useState<EvidenceLibraryDoc | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editDoc, setEditDoc] = useState<EvidenceLibraryDoc | null>(null);
  const [gridVisible, setGridVisible] = useState(GRID_PAGE);
  const [confirmDownload, setConfirmDownload] = useState(false);

  // Search + filters are PAGE-LEVEL (single shared toolbar) so they render in
  // BOTH Grid and Table views and their state persists across a view switch.
  // The filtered set feeds both views (the DataTable receives it pre-filtered).
  const [search, setSearch] = useState("");
  const [fOrigin, setFOrigin] = useState("");
  const [fStatus, setFStatus] = useState("");

  // Bulk selection lives in Redux (evidence.selectedIds) so a selection made in
  // Grid is reflected in Table and vice-versa, and survives a view switch. Both
  // views select ONLY over the server-scoped `documents` (permission model
  // unchanged — selection can't reveal a doc the viewer can't already see).
  const selectedIds = useAppSelector((s) => s.evidence.selectedIds);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedDocs = useMemo(() => documents.filter((d) => selectedSet.has(d.id)), [documents, selectedSet]);
  const toggleSel = (id: string) => dispatch(toggleEvidenceSelection(id));
  const clearSel = () => dispatch(clearEvidenceSelection());

  const originOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of documents) if (!seen.has(d.origin)) seen.set(d.origin, formatDocumentSource(d.originLabel));
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [documents]);
  const statusOptions = useMemo(() => {
    const set = new Set(documents.map((d) => d.status));
    return [...set].map((s) => ({ value: s, label: prettyStatus(s) }));
  }, [documents]);

  // Shared filtering — identical predicates to the previous per-view logic
  // (origin + status exact-match, case-insensitive text over the same keys the
  // table search used: title, uploader, source label, type).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) =>
      (!fOrigin || d.origin === fOrigin) &&
      (!fStatus || d.status === fStatus) &&
      (!q ||
        d.title.toLowerCase().includes(q) ||
        d.uploaderName.toLowerCase().includes(q) ||
        d.originLabel.toLowerCase().includes(q) ||
        (d.category ?? "").toLowerCase().includes(q)),
    );
  }, [documents, search, fOrigin, fStatus]);

  // Reset the grid "Show more" window whenever the filter query changes.
  useEffect(() => { setGridVisible(GRID_PAGE); }, [search, fOrigin, fStatus]);

  const hasFilter = search.trim() !== "" || fOrigin !== "" || fStatus !== "";
  const clearFilters = () => { setSearch(""); setFOrigin(""); setFStatus(""); };

  // Table select-all operates over the CURRENTLY FILTERED set, and is additive:
  // it never drops selections that are outside the current filter.
  const allSelected = filtered.length > 0 && filtered.every((d) => selectedSet.has(d.id));
  const toggleAll = () => {
    const filteredIds = filtered.map((d) => d.id);
    if (allSelected) {
      const drop = new Set(filteredIds);
      dispatch(setEvidenceSelection(selectedIds.filter((id) => !drop.has(id))));
    } else {
      dispatch(setEvidenceSelection([...new Set([...selectedIds, ...filteredIds])]));
    }
  };

  const openAdd = () => { setFormMode("add"); setEditDoc(null); setFormOpen(true); };
  const openEdit = (d: EvidenceLibraryDoc) => { setDetailsDoc(null); setFormMode("edit"); setEditDoc(d); setFormOpen(true); };

  const actions: PageAction[] = viewer.canCreate
    ? [{ label: "Add document", variant: "primary", icon: Plus, onClick: openAdd }]
    : [];

  const description = viewer.seeAll
    ? "Every document in your organisation — uploaded here plus read-only mirrors from CAPA, CSV/CSA validation, and Inspection. Only documents added here can be edited or deleted."
    : "Your documents — the ones you uploaded here plus read-only mirrors you own from other modules. Only documents you add here can be edited or deleted.";

  // How many of the selected docs actually have a downloadable file (link-only /
  // metadata-only docs are skipped by the per-file download).
  const downloadableCount = useMemo(() => selectedDocs.filter((d) => d.hasFile && d.url).length, [selectedDocs]);

  // "Download Selected": per-file downloads via the existing /api/documents/[id]
  // route. NOT a single ZIP archive — a real ZIP needs a bundling library, which
  // is out of scope under the "no new dependencies" constraint. Files are
  // triggered with a small stagger so the browser doesn't drop rapid successive
  // downloads; link-only docs are skipped. Selection clears afterwards.
  function downloadSelected() {
    const files = selectedDocs.filter((d) => d.hasFile && d.url);
    files.forEach((d, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = d.url!;
        a.download = d.title || "document";
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 300);
    });
    clearSel();
  }

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

  // Header keeps only the COUNT. "Clear Selection" moved down into the toolbar
  // row, immediately before Export, so every bulk control sits together instead
  // of being split between the page header and the toolbar.
  const bulkToolbar = selectedIds.length > 0 ? (
    <span className="text-[12px] font-medium text-(--text-primary)">{selectedIds.length} Selected</span>
  ) : null;

  // The bulk controls themselves. Rendered in the filter row for Grid, and inside
  // the DataTable's own toolbar for Table, so Table ends up with ONE toolbar row
  // instead of two. Same handlers either way — nothing about what they DO changed.
  // Label shortened to "Clear". The filter-clear button on the same row is also
  // labelled "Clear", so both carry distinct aria-labels + titles — visually they
  // are separated into the left (filters) and right (bulk actions) groups.
  const clearSelectionButton = (
    <Button
      variant="ghost"
      size="sm"
      icon={X}
      onClick={clearSel}
      aria-label="Clear selection"
      title="Clear selection"
    >
      Clear
    </Button>
  );
  const downloadSelectedButton = (
    <Button variant="secondary" size="sm" icon={Download} onClick={() => setConfirmDownload(true)}>Download Selected</Button>
  );

  const headerRight = (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      {bulkToolbar}
      {viewToggle}
    </div>
  );

  /* ── Table columns ── */
  const columns: DataColumn<EvidenceLibraryDoc>[] = [
    {
      key: "_select",
      label: "Select",
      width: "w-10",
      exportValue: null,
      header: (
        <input
          type="checkbox"
          aria-label="Select all documents"
          checked={allSelected}
          onChange={toggleAll}
          className="cursor-pointer"
        />
      ),
      render: (d) => (
        // stopPropagation so ticking the box doesn't also open the details modal
        // (the row's onRowClick).
        <span onClick={(e) => e.stopPropagation()} className="inline-flex">
          <input
            type="checkbox"
            aria-label={`Select ${d.title}`}
            checked={selectedSet.has(d.id)}
            onChange={() => toggleSel(d.id)}
            className="cursor-pointer"
          />
        </span>
      ),
    },
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
    { key: "origin", label: "Source", sortable: true, width: "w-[14%]", sortValue: (d) => formatDocumentSource(d.originLabel), exportValue: (d) => formatDocumentSource(d.originLabel), render: (d) => <Badge variant={ORIGIN_BADGE[d.origin]}>{formatDocumentSource(d.originLabel)}</Badge> },
    { key: "uploaderName", label: "Uploader", sortable: true, width: "w-[14%]", exportValue: (d) => d.uploaderName, render: (d) => <span className="text-[12px] text-(--text-secondary)">{d.uploaderName}</span> },
    { key: "status", label: "Status", sortable: true, width: "w-[11%]", exportValue: (d) => prettyStatus(d.status), render: (d) => statusBadge(d.status) },
    { key: "uploadedAt", label: "Uploaded", sortable: true, width: "w-[12%]", exportValue: (d) => (d.uploadedAt ? dayjs(d.uploadedAt).format("YYYY-MM-DD") : ""), render: (d) => <span className="text-[12px] text-(--text-secondary)">{d.uploadedAt ? dayjs(d.uploadedAt).format("DD MMM YYYY") : "—"}</span> },
  ];

  /* The table's Export ▾ (list/metadata → CSV / Excel / PDF) is now rendered in
     the single toolbar row below instead of inside the DataTable's own toolbar,
     which is what created the second row. It is the SAME `ExportMenu` the
     DataTable was rendering, fed the same way: every non-null `exportValue`
     column, over the same already-filtered set the table receives (Evidence
     passes `filtered` and no search/filters props, so DataTable's internal
     `clientFiltered` is exactly `filtered`). Output is byte-identical. */
  const exportCols = columns.filter((c) => c.exportValue !== null);
  const exportHeaders = exportCols.map((c) => c.exportHeader ?? c.label);
  const buildExportRows = () =>
    filtered.map((d) => exportCols.map((c) => (c.exportValue ? c.exportValue(d) : "")));

  return (
    <PageLayout title="Evidence & Documents" description={description} actions={actions} headerRight={headerRight}>
      {/* Summary cards (role-scoped — counts reflect only what this viewer sees) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Files} color="var(--brand)" label="Total" value={String(stats.total)} sub={viewer.seeAll ? "All documents in tenant" : "Documents you can see"} />
        <StatCard icon={FilePen} color="var(--success)" label="Editable" value={String(stats.editable)} sub="Uploaded here" />
        <StatCard icon={Lock} color="var(--text-muted)" label="Locked" value={String(stats.locked)} sub="From other modules" />
        <StatCard icon={Clock} color="var(--warning)" label="Recent" value={String(stats.recent)} sub="Last 30 days" />
      </div>

      {/* Shared search + filter toolbar — renders in BOTH Grid and Table views
          (no view-mode gating). State is page-level, so it persists across a
          view switch and the filtered set feeds both views identically. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Input id="evidence-search" type="search" icon={Search} placeholder="Search documents…" aria-label="Search documents"
          className="flex-1 min-w-[200px] max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Dropdown value={fOrigin} onChange={setFOrigin} width="w-44" placeholder="All sources" options={[{ value: "", label: "All sources" }, ...originOptions]} />
        <Dropdown value={fStatus} onChange={setFStatus} width="w-40" placeholder="All statuses" options={[{ value: "", label: "All statuses" }, ...statusOptions]} />
        {hasFilter && <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>Clear</Button>}
        {/* ACTION GROUP — same row as the filters above, pushed right by
            `ml-auto` and wrapping onto its own line when space runs out.

            Order is Clear → Export → Download Selected → Refresh.

            Table and Grid differ only in WHICH Export they show, because the two
            have always done different things and neither changed here:
              • Table  → ExportMenu: the filtered LIST as CSV / Excel / PDF.
              • Grid   → exportSelected(): the SELECTION as a PDF report.
            Refresh is table-only, as before. */}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {selectedIds.length > 0 && clearSelectionButton}
          {view === "table" ? (
            <ExportMenu
              filename={`evidence-documents-${dayjs().format("YYYY-MM-DD")}`}
              title="Evidence & Documents"
              headers={exportHeaders}
              rows={buildExportRows}
              size="sm"
              variant="secondary"
              disabled={filtered.length === 0}
            />
          ) : (
            selectedIds.length > 0 && (
              <Button variant="secondary" size="sm" icon={FileText} onClick={() => exportSelected(selectedDocs, "pdf")}>Export</Button>
            )
          )}
          {selectedIds.length > 0 && downloadSelectedButton}
          {view === "table" && (
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => router.refresh()}>Refresh</Button>
          )}
        </div>
      </div>

      {/* ── GRID view ── */}
      {view === "grid" ? (
        filtered.length === 0 ? (
          <div className="rounded-2xl border border-(--bg-border) bg-(--bg-elevated) p-10 text-center">
            <FileText className="w-10 h-10 mx-auto mb-2 text-(--text-muted)" aria-hidden="true" />
            <p className="text-[13px] text-(--text-muted)">{documents.length === 0 ? "No documents yet." : "No documents match the current filters."}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.slice(0, gridVisible).map((d) => (
                <DocumentCard
                  key={d.id}
                  doc={evidenceDocToCardView(d)}
                  selectable
                  selected={selectedSet.has(d.id)}
                  onToggleSelect={() => toggleSel(d.id)}
                  onView={() => setDetailsDoc(d)}
                />
              ))}
            </div>
            {filtered.length > gridVisible && (
              <div className="flex items-center justify-between gap-3 mt-4">
                <span className="text-[11px] text-(--text-muted)">Showing {Math.min(gridVisible, filtered.length)} of {filtered.length}</span>
                <Button variant="ghost" size="sm" onClick={() => setGridVisible((v) => v + GRID_PAGE)}>
                  Show more ({filtered.length - gridVisible} remaining)
                </Button>
              </div>
            )}
          </>
        )
      ) : (
        /* ── TABLE view ── receives the SAME page-filtered set as Grid (search +
            filters live in the shared toolbar above, not in the widget). Selection
            is a hand-rolled checkbox column bound to the same Redux selection. */
        <DataTable<EvidenceLibraryDoc>
          mode="client"
          data={filtered}
          rowKey={(d) => d.id}
          ariaLabel="Documents"
          columns={columns}
          /* No `exportOptions` / `toolbarActions`: both rendered DataTable's own
             toolbar, which was the SECOND row. Export ▾, Download Selected, Clear
             and Refresh all now live in the single row above — same components,
             same handlers. */
          onRowClick={(d) => setDetailsDoc(d)}
          emptyState={documents.length === 0 ? "No documents yet." : "No documents match the current filters."}
        />
      )}

      <DocumentDetailsModal doc={detailsDoc} onClose={() => setDetailsDoc(null)} onEdit={openEdit} onChanged={() => router.refresh()} />
      <DocumentFormModal open={formOpen} mode={formMode} doc={editDoc} onClose={() => setFormOpen(false)} onSaved={() => router.refresh()} />

      {/* Download confirmation. Honest copy: per-file downloads, not a single ZIP
          (a real archive needs a bundling library — out of scope under the
          no-new-dependencies constraint). Link-only docs are skipped. */}
      <ConfirmModal
        open={confirmDownload}
        onClose={() => setConfirmDownload(false)}
        onConfirm={() => { setConfirmDownload(false); downloadSelected(); }}
        title="Download Selected Documents?"
        message={
          downloadableCount > 0
            ? `You are about to download ${downloadableCount} document${downloadableCount === 1 ? "" : "s"} as individual files${selectedIds.length > downloadableCount ? ` (${selectedIds.length - downloadableCount} link-only ${selectedIds.length - downloadableCount === 1 ? "document is" : "documents are"} skipped)` : ""}.`
            : "None of the selected documents have a downloadable file — link-only documents can be opened individually from their details."
        }
        confirmLabel={downloadableCount > 0 ? "Download" : "OK"}
        variant="primary"
        icon={Download}
      />
    </PageLayout>
  );
}
