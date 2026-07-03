"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import {
  FolderOpen, Plus, Search, Filter, LayoutGrid, List,
  FileText, ClipboardList, Shield, CheckSquare, BarChart3, GitBranch,
  Award, BookOpen, File, ClipboardCheck, FileWarning, Download, Lock, Clock,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { EvidenceDocument, DocType, DocArea, DocStatus } from "@/store/evidence.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { DataTable, type Column } from "@/components/shared";

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

const DOC_TYPE_ICONS: Record<DocType, LucideIcon> = { SOP: FileText, Record: ClipboardList, "Audit Trail": Shield, Validation: CheckSquare, Report: BarChart3, Protocol: GitBranch, Certificate: Award, Policy: BookOpen, Other: File };
const DOC_TYPE_COLORS: Record<DocType, string> = { SOP: "#0ea5e9", Record: "#10b981", "Audit Trail": "#6366f1", Validation: "#f59e0b", Report: "#a78bfa", Protocol: "#ef4444", Certificate: "#10b981", Policy: "#64748b", Other: "#94a3b8" };
const DOC_TYPES: DocType[] = ["SOP", "Record", "Audit Trail", "Validation", "Report", "Protocol", "Certificate", "Policy", "Other"];
const DOC_AREAS: DocArea[] = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT", "Regulatory", "Training", "HR"];
const DOC_STATUSES: DocStatus[] = ["Current", "Draft", "Superseded", "Missing", "Under Review"];

function docStatusBadge(s: DocStatus) {
  const m: Record<DocStatus, "green" | "blue" | "gray" | "red" | "amber"> = { Current: "green", Draft: "blue", Superseded: "gray", Missing: "red", "Under Review": "amber" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

/** Periodic-review lifecycle state derived from a document's nextReviewDate.
 *  null = no review scheduled (borrowed evidence, or none set). */
export type ReviewState = "overdue" | "due" | "ok";
/** Documents within this many days of their review date are "due" (amber). */
export const REVIEW_DUE_WINDOW_DAYS = 30;

export function documentReviewState(doc: EvidenceDocument): ReviewState | null {
  if (!doc.nextReviewDate) return null;
  const due = dayjs.utc(doc.nextReviewDate);
  const now = dayjs.utc();
  if (due.isBefore(now, "day")) return "overdue";
  if (due.diff(now, "day") <= REVIEW_DUE_WINDOW_DAYS) return "due";
  return "ok";
}

/** Compact review badge for cards/rows. Returns null when nothing to show. */
function reviewBadge(doc: EvidenceDocument) {
  const state = documentReviewState(doc);
  if (state === null || state === "ok") return null;
  const due = dayjs.utc(doc.nextReviewDate);
  const days = Math.abs(due.diff(dayjs.utc(), "day"));
  const label = state === "overdue" ? `Overdue ${days}d` : `Review due ${days}d`;
  const color = state === "overdue" ? "#ef4444" : "#f59e0b";
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: color + "1a", color }}>
      <Clock className="w-2.5 h-2.5" aria-hidden="true" />{label}
    </span>
  );
}

/** Where an aggregated (non-native) document came from — drives the read-only
 *  source pill and the detail drawer's lifecycle gating. Native `Document`
 *  rows return readOnly:false; everything else is a mirror of its source. */
export function docSource(doc: EvidenceDocument): { label: string; readOnly: boolean } {
  if (doc.isNative) return { label: "Document", readOnly: false };
  const id = doc.id;
  if (id.startsWith("evidencefile-") || doc.capaId) return { label: "CAPA evidence", readOnly: true };
  if (id.startsWith("483-") || id.startsWith("483doc-") || doc.eventId) return { label: "FDA 483", readOnly: true };
  if (id.startsWith("finding-") || doc.findingId) return { label: "Finding", readOnly: true };
  if (id.startsWith("dev-doc-")) return { label: "Deviation", readOnly: true };
  if (id.startsWith("stagedoc-")) return { label: "CSV validation", readOnly: true };
  return { label: "Linked", readOnly: true };
}

function downloadEvidenceDoc(doc: EvidenceDocument) {
  if (!doc.url) return;
  const isDataUrl = doc.url.startsWith("data:");
  const a = document.createElement("a");
  a.href = doc.url;
  if (isDataUrl) a.download = doc.title;
  else a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export interface DocumentLibraryTabProps {
  allDocs: EvidenceDocument[];
  filteredDocs: EvidenceDocument[];
  search: string;
  setSearch: (v: string) => void;
  areaFilter: string;
  setAreaFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  systemFilter: string;
  setSystemFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  anyFilter: boolean;
  clearFilters: () => void;
  viewMode: "grid" | "list";
  setViewMode: (v: "grid" | "list") => void;
  selectedDocs: Set<string>;
  toggleDocSelection: (id: string) => void;
  setSelectedDocs: (v: Set<string>) => void;
  systems: { id: string; name: string }[];  role: string;
  timezone: string;
  dateFormat: string;
  onAddDocOpen: () => void;
  onNavigate: (path: string, options?: { state?: Record<string, unknown> }) => void;
  /** Open the document detail drawer (metadata + approve/reject/delete). */
  onOpenDoc: (doc: EvidenceDocument) => void;
}

export function DocumentLibraryTab({
  allDocs, filteredDocs, search, setSearch, areaFilter, setAreaFilter,
  typeFilter, setTypeFilter, systemFilter, setSystemFilter, statusFilter,
  setStatusFilter, dateFrom, setDateFrom, dateTo, setDateTo, anyFilter,
  clearFilters, viewMode, setViewMode, selectedDocs, toggleDocSelection,
  setSelectedDocs, systems, role, timezone, dateFormat,
  onAddDocOpen, onNavigate, onOpenDoc,
}: DocumentLibraryTabProps) {
  // Client-side pagination (no server pagination pattern exists in the app yet
  // — confirmed against CAPA/Deviation). Grid shows more per page than the
  // denser table. Page resets to 1 whenever the result set or view changes.
  const [page, setPage] = useState(1);
  const pageSize = viewMode === "grid" ? 12 : 25;
  useEffect(() => {
    setPage(1);
  }, [search, areaFilter, typeFilter, systemFilter, statusFilter, dateFrom, dateTo, viewMode]);
  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageDocs = filteredDocs.slice((safePage - 1) * pageSize, safePage * pageSize);
  // Select-all is scoped to the CURRENT page — it must not silently select
  // documents on other pages the user can't see (they'd end up in an export
  // pack unknowingly). Selections on other pages are preserved.
  const pageAllSelected = pageDocs.length > 0 && pageDocs.every((d) => selectedDocs.has(d.id));
  function toggleSelectPage() {
    const next = new Set(selectedDocs);
    if (pageAllSelected) pageDocs.forEach((d) => next.delete(d.id));
    else pageDocs.forEach((d) => next.add(d.id));
    setSelectedDocs(next);
  }

  return (
    <>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <input type="search" className="input w-full pl-10 text-[13px]" placeholder="Search documents…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search documents" />
      </div>

      {/* Facets */}
      <section aria-label="Document filters" className={clsx("flex items-center gap-3 flex-wrap mb-4 p-4 rounded-xl border", "bg-(--bg-elevated) border-(--bg-border)")}>
        <Filter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>
        <Dropdown placeholder="All areas" value={areaFilter} onChange={setAreaFilter} width="w-36" options={[{ value: "", label: "All areas" }, ...DOC_AREAS.map((a) => ({ value: a, label: a }))]} />
        <Dropdown placeholder="All types" value={typeFilter} onChange={setTypeFilter} width="w-36" options={[{ value: "", label: "All types" }, ...DOC_TYPES.map((t) => ({ value: t, label: t }))]} />
        <Dropdown placeholder="All systems" value={systemFilter} onChange={setSystemFilter} width="w-44" options={[{ value: "", label: "All systems" }, ...systems.map((s) => ({ value: s.id, label: s.name }))]} />
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-40" options={[{ value: "", label: "All statuses" }, ...DOC_STATUSES.map((s) => ({ value: s, label: s })), { value: "__review_due", label: "Review due" }, { value: "__overdue", label: "Overdue" }]} />
        <DatePicker id="doc-filter-from" value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} placeholder="From date" className="w-36" />
        <DatePicker id="doc-filter-to" value={dateTo} onChange={setDateTo} min={dateFrom || undefined} placeholder="To date" className="w-36" />
        {anyFilter && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}

        {/* View toggle */}
        <div className={clsx("ml-auto flex items-center gap-1 p-1 rounded-lg", "bg-(--bg-surface)")}>
          <button type="button" aria-pressed={viewMode === "grid"} aria-label="Grid view" onClick={() => setViewMode("grid")} className={clsx("p-1.5 rounded-md transition-colors border-none cursor-pointer", viewMode === "grid" ? "bg-[#0ea5e9] text-white" : "bg-transparent text-(--text-muted)")}>
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button type="button" aria-pressed={viewMode === "list"} aria-label="List view" onClick={() => setViewMode("list")} className={clsx("p-1.5 rounded-md transition-colors border-none cursor-pointer", viewMode === "list" ? "bg-[#0ea5e9] text-white" : "bg-transparent text-(--text-muted)")}>
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* Results count */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""} found</span>
        {selectedDocs.size > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[12px] text-[#0ea5e9]">{selectedDocs.size} selected</span>
            <button onClick={() => setSelectedDocs(new Set())} className="text-[11px] border-none bg-transparent cursor-pointer ml-1" style={{ color: "var(--text-muted)" }}>Clear</button>
          </div>
        )}
      </div>

      {/* Empty states */}
      {allDocs.length === 0 ? (
        <div className="card p-10 text-center">
          <FolderOpen className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No documents in the workspace yet</p>
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>Documents appear here automatically from Gap Assessment findings, CAPA evidence links and FDA 483 responses. You can also add documents manually.</p>
          <div className="flex gap-2 justify-center">
            {role !== "viewer" && <Button variant="primary" size="sm" icon={Plus} onClick={onAddDocOpen}>Add document</Button>}
            <Button variant="ghost" size="sm" onClick={() => onNavigate("/gap-assessment")}>Go to Gap Assessment</Button>
          </div>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="card p-8 text-center"><p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>No documents match the current filters</p><Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>Clear filters</Button></div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="list" aria-label="Documents grid">
          {pageDocs.map((doc) => {
            const DocIcon = DOC_TYPE_ICONS[doc.type]; const iconColor = DOC_TYPE_COLORS[doc.type]; const isSel = selectedDocs.has(doc.id);
            const src = docSource(doc);
            return (
              <div
                key={doc.id}
                role="listitem"
                tabIndex={0}
                aria-label={`Open ${doc.title}`}
                onClick={() => onOpenDoc(doc)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDoc(doc); } }}
                className={clsx("card cursor-pointer transition-all duration-150 hover:border-[#0ea5e9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9]", isSel && "ring-2 ring-[#0ea5e9] ring-offset-1")}
              >
                <div className="card-body">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: iconColor + "18" }}><DocIcon className="w-5 h-5" style={{ color: iconColor }} aria-hidden="true" /></div>
                    <input type="checkbox" className="w-4 h-4 accent-[#0ea5e9] cursor-pointer" checked={isSel} onClick={(e) => e.stopPropagation()} onChange={() => toggleDocSelection(doc.id)} aria-label={`Select ${doc.title}`} />
                  </div>
                  <p className="text-[13px] font-medium line-clamp-2 mb-1" style={{ color: "var(--text-primary)" }}>{doc.title}</p>
                  <p className="font-mono text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>{doc.reference}</p>
                  <div className="flex gap-1.5 flex-wrap mb-2">{docStatusBadge(doc.status)}<Badge variant="gray">{doc.type}</Badge><Badge variant="gray">{doc.area}</Badge>{reviewBadge(doc)}{src.readOnly && <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-(--bg-surface)" style={{ color: "var(--text-muted)" }}><Lock className="w-2.5 h-2.5" aria-hidden="true" />{src.label}</span>}</div>
                  {doc.complianceTags.length > 0 && <div className="flex gap-1 flex-wrap">{doc.complianceTags.map((tag) => <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-(--info-bg) text-[#6366f1]">{tag}</span>)}</div>}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t" style={{ borderColor: "var(--bg-border)" }}>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>v{doc.version} &middot; {doc.effectiveDate ? dayjs.utc(doc.effectiveDate).tz(timezone).format(dateFormat) : "\u2014"}</span>
                    <div className="flex items-center gap-1.5">
                      {doc.url && <button type="button" onClick={(e) => { e.stopPropagation(); downloadEvidenceDoc(doc); }} title={`Download ${doc.title}`} aria-label={`Download ${doc.title}`} className="opacity-70 hover:opacity-100 border-none bg-transparent cursor-pointer"><Download className="w-3.5 h-3.5 text-[#0ea5e9]" /></button>}
                      {doc.findingId && <button onClick={(e) => { e.stopPropagation(); onNavigate("/gap-assessment", { state: { openFindingId: doc.findingId } }); }} title={`Finding: ${doc.findingId}`} className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><Search className="w-3.5 h-3.5 text-[#0ea5e9]" /></button>}
                      {doc.capaId && <button onClick={(e) => { e.stopPropagation(); onNavigate("/capa", { state: { openCapaId: doc.capaId } }); }} title={`CAPA: ${doc.capaId}`} className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><ClipboardCheck className="w-3.5 h-3.5 text-[#10b981]" /></button>}
                      {doc.eventId && <button onClick={(e) => { e.stopPropagation(); onNavigate("/fda-483"); }} title="FDA 483 response" className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><FileWarning className="w-3.5 h-3.5 text-[#ef4444]" /></button>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="card overflow-hidden">
          <DataTable
            ariaLabel="Evidence document library"
            caption="GxP evidence documents with status and compliance tags"
            data={pageDocs}
            rowKey={(doc) => doc.id}
            minWidth={1000}
            onRowClick={(doc) => onOpenDoc(doc)}
            rowClassName={(doc) => clsx("cursor-pointer", selectedDocs.has(doc.id) && "bg-(--brand-muted)")}
            columns={[
              {
                key: "select",
                // Select-all checkbox — scoped to the current page (see pageAllSelected).
                header: (
                  <input type="checkbox" className="w-4 h-4 accent-[#0ea5e9]" checked={pageAllSelected} onClick={(e) => e.stopPropagation()} onChange={toggleSelectPage} aria-label="Select documents on this page" />
                ),
                render: (doc) => (
                  <input type="checkbox" className="w-4 h-4 accent-[#0ea5e9]" checked={selectedDocs.has(doc.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleDocSelection(doc.id)} aria-label={`Select ${doc.title}`} />
                ),
              },
              {
                key: "document",
                header: "Document",
                render: (doc) => {
                  const DocIcon = DOC_TYPE_ICONS[doc.type]; const iconColor = DOC_TYPE_COLORS[doc.type];
                  const src = docSource(doc);
                  return (
                    <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center" style={{ background: iconColor + "18" }}><DocIcon className="w-3.5 h-3.5" style={{ color: iconColor }} aria-hidden="true" /></div><div className="min-w-0 max-w-[260px]"><p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }} title={doc.title}>{doc.title}</p><p className="font-mono text-[10px] truncate" style={{ color: "var(--text-muted)" }} title={doc.reference}>{doc.reference}</p></div>{src.readOnly && <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-(--bg-surface)" style={{ color: "var(--text-muted)" }} title={`Managed in ${src.label}`}><Lock className="w-2.5 h-2.5" aria-hidden="true" />{src.label}</span>}</div>
                  );
                },
              },
              {
                key: "type",
                header: "Type",
                render: (doc) => <Badge variant="gray">{doc.type}</Badge>,
              },
              {
                key: "area",
                header: "Area",
                render: (doc) => <Badge variant="gray">{doc.area}</Badge>,
              },
              {
                key: "status",
                header: "Status",
                render: (doc) => <div className="flex items-center gap-1 flex-wrap">{docStatusBadge(doc.status)}{reviewBadge(doc)}</div>,
              },
              {
                key: "version",
                header: "Version",
                cellClassName: "text-[12px]",
                render: (doc) => <span style={{ color: "var(--text-secondary)" }}>v{doc.version}</span>,
              },
              {
                key: "effectiveDate",
                header: "Effective date",
                cellClassName: "text-[12px]",
                render: (doc) => (
                  <span style={{ color: "var(--text-secondary)" }}>{doc.effectiveDate ? dayjs.utc(doc.effectiveDate).tz(timezone).format(dateFormat) : "\u2014"}{doc.expiryDate && dayjs.utc(doc.expiryDate).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444]">Expired</div>}</span>
                ),
              },
              {
                key: "compliance",
                header: "Compliance",
                render: (doc) => <div className="flex gap-1 flex-wrap">{doc.complianceTags.map((tag) => <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-(--info-bg) text-[#6366f1]">{tag}</span>)}</div>,
              },
              {
                key: "links",
                header: "Links",
                render: (doc) => (
                  <div className="flex items-center gap-1.5">
                    {doc.url && <button type="button" onClick={(e) => { e.stopPropagation(); downloadEvidenceDoc(doc); }} title={`Download ${doc.title}`} aria-label={`Download ${doc.title}`} className="opacity-70 hover:opacity-100 border-none bg-transparent cursor-pointer"><Download className="w-3.5 h-3.5 text-[#0ea5e9]" /></button>}
                    {doc.findingId && <button onClick={(e) => { e.stopPropagation(); onNavigate("/gap-assessment", { state: { openFindingId: doc.findingId } }); }} title={`Finding: ${doc.findingId}`} className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><Search className="w-3.5 h-3.5 text-[#0ea5e9]" /></button>}
                    {doc.capaId && <button onClick={(e) => { e.stopPropagation(); onNavigate("/capa", { state: { openCapaId: doc.capaId } }); }} title={`CAPA: ${doc.capaId}`} className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><ClipboardCheck className="w-3.5 h-3.5 text-[#10b981]" /></button>}
                    {doc.eventId && <button onClick={(e) => { e.stopPropagation(); onNavigate("/fda-483"); }} title="FDA 483" className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><FileWarning className="w-3.5 h-3.5 text-[#ef4444]" /></button>}
                  </div>
                ),
              },
            ] satisfies Column<EvidenceDocument>[]}
          />
        </div>
      )}

      {/* Pagination — shown for both views (grid + list) when there are results. */}
      {allDocs.length > 0 && filteredDocs.length > 0 && (
        <Pagination
          page={safePage}
          pageSize={pageSize}
          total={filteredDocs.length}
          onChange={setPage}
          itemLabel="document"
          className="mt-4"
        />
      )}
    </>
  );
}
