import clsx from "clsx";
import {
  FolderOpen, Plus, Search, Filter, LayoutGrid, List,
  FileText, ClipboardList, Shield, CheckSquare, BarChart3, GitBranch,
  Award, BookOpen, File, ClipboardCheck, FileWarning,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { EvidenceDocument, DocType, DocArea, DocStatus } from "@/store/evidence.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

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
  systems: { id: string; name: string }[];
  isDark: boolean;
  role: string;
  timezone: string;
  dateFormat: string;
  onAddDocOpen: () => void;
  onNavigate: (path: string, options?: { state?: Record<string, unknown> }) => void;
}

export function DocumentLibraryTab({
  allDocs, filteredDocs, search, setSearch, areaFilter, setAreaFilter,
  typeFilter, setTypeFilter, systemFilter, setSystemFilter, statusFilter,
  setStatusFilter, dateFrom, setDateFrom, dateTo, setDateTo, anyFilter,
  clearFilters, viewMode, setViewMode, selectedDocs, toggleDocSelection,
  setSelectedDocs, systems, isDark, role, timezone, dateFormat,
  onAddDocOpen, onNavigate,
}: DocumentLibraryTabProps) {
  return (
    <>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <input type="search" className="input w-full pl-10 text-[13px]" placeholder="Search by document title or reference number..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search documents" />
      </div>

      {/* Facets */}
      <section aria-label="Document filters" className={clsx("flex items-center gap-3 flex-wrap mb-4 p-4 rounded-xl border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
        <Filter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>
        <Dropdown placeholder="All areas" value={areaFilter} onChange={setAreaFilter} width="w-36" options={[{ value: "", label: "All areas" }, ...DOC_AREAS.map((a) => ({ value: a, label: a }))]} />
        <Dropdown placeholder="All types" value={typeFilter} onChange={setTypeFilter} width="w-36" options={[{ value: "", label: "All types" }, ...DOC_TYPES.map((t) => ({ value: t, label: t }))]} />
        <Dropdown placeholder="All systems" value={systemFilter} onChange={setSystemFilter} width="w-44" options={[{ value: "", label: "All systems" }, ...systems.map((s) => ({ value: s.id, label: s.name }))]} />
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-36" options={[{ value: "", label: "All statuses" }, ...DOC_STATUSES.map((s) => ({ value: s, label: s }))]} />
        <input type="date" className="input text-[12px] w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
        <input type="date" className="input text-[12px] w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
        {anyFilter && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}

        {/* View toggle */}
        <div className={clsx("ml-auto flex items-center gap-1 p-1 rounded-lg", isDark ? "bg-[#071526]" : "bg-[#f1f5f9]")}>
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
          {filteredDocs.map((doc) => {
            const DocIcon = DOC_TYPE_ICONS[doc.type]; const iconColor = DOC_TYPE_COLORS[doc.type]; const isSel = selectedDocs.has(doc.id);
            return (
              <div key={doc.id} role="listitem" className={clsx("card cursor-pointer transition-all duration-150 hover:border-[#0ea5e9]", isSel && "ring-2 ring-[#0ea5e9] ring-offset-1")}>
                <div className="card-body">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: iconColor + "18" }}><DocIcon className="w-5 h-5" style={{ color: iconColor }} aria-hidden="true" /></div>
                    <input type="checkbox" className="w-4 h-4 accent-[#0ea5e9] cursor-pointer" checked={isSel} onChange={() => toggleDocSelection(doc.id)} aria-label={`Select ${doc.title}`} />
                  </div>
                  <p className="text-[13px] font-medium line-clamp-2 mb-1" style={{ color: "var(--text-primary)" }}>{doc.title}</p>
                  <p className="font-mono text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>{doc.reference}</p>
                  <div className="flex gap-1.5 flex-wrap mb-2">{docStatusBadge(doc.status)}<Badge variant="gray">{doc.type}</Badge><Badge variant="gray">{doc.area}</Badge></div>
                  {doc.complianceTags.length > 0 && <div className="flex gap-1 flex-wrap">{doc.complianceTags.map((tag) => <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[#6366f1]">{tag}</span>)}</div>}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t" style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>v{doc.version} &middot; {doc.effectiveDate ? dayjs.utc(doc.effectiveDate).tz(timezone).format(dateFormat) : "\u2014"}</span>
                    <div className="flex items-center gap-1.5">
                      {doc.findingId && <button onClick={() => onNavigate("/gap-assessment", { state: { openFindingId: doc.findingId } })} title={`Finding: ${doc.findingId}`} className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><Search className="w-3.5 h-3.5 text-[#0ea5e9]" /></button>}
                      {doc.capaId && <button onClick={() => onNavigate("/capa", { state: { openCapaId: doc.capaId } })} title={`CAPA: ${doc.capaId}`} className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><ClipboardCheck className="w-3.5 h-3.5 text-[#10b981]" /></button>}
                      {doc.eventId && <button onClick={() => onNavigate("/fda-483")} title="FDA 483 response" className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><FileWarning className="w-3.5 h-3.5 text-[#ef4444]" /></button>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="card overflow-hidden"><div className="overflow-x-auto">
          <table className="data-table" aria-label="Evidence document library">
            <caption className="sr-only">GxP evidence documents with status and compliance tags</caption>
            <thead><tr>
              <th scope="col"><input type="checkbox" className="w-4 h-4 accent-[#0ea5e9]" checked={selectedDocs.size === filteredDocs.length && filteredDocs.length > 0} onChange={() => setSelectedDocs(selectedDocs.size === filteredDocs.length ? new Set() : new Set(filteredDocs.map((d) => d.id)))} aria-label="Select all" /></th>
              <th scope="col">Document</th><th scope="col">Type</th><th scope="col">Area</th><th scope="col">Status</th><th scope="col">Version</th><th scope="col">Effective date</th><th scope="col">Compliance</th><th scope="col">Links</th>
            </tr></thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const DocIcon = DOC_TYPE_ICONS[doc.type]; const iconColor = DOC_TYPE_COLORS[doc.type];
                return (
                  <tr key={doc.id} className={clsx(selectedDocs.has(doc.id) && (isDark ? "bg-[#071e38]" : "bg-[#eff6ff]"))}>
                    <td><input type="checkbox" className="w-4 h-4 accent-[#0ea5e9]" checked={selectedDocs.has(doc.id)} onChange={() => toggleDocSelection(doc.id)} aria-label={`Select ${doc.title}`} /></td>
                    <th scope="row"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center" style={{ background: iconColor + "18" }}><DocIcon className="w-3.5 h-3.5" style={{ color: iconColor }} aria-hidden="true" /></div><div><p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{doc.title}</p><p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{doc.reference}</p></div></div></th>
                    <td><Badge variant="gray">{doc.type}</Badge></td>
                    <td><Badge variant="gray">{doc.area}</Badge></td>
                    <td>{docStatusBadge(doc.status)}</td>
                    <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>v{doc.version}</td>
                    <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{doc.effectiveDate ? dayjs.utc(doc.effectiveDate).tz(timezone).format(dateFormat) : "\u2014"}{doc.expiryDate && dayjs.utc(doc.expiryDate).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444]">Expired</div>}</td>
                    <td><div className="flex gap-1 flex-wrap">{doc.complianceTags.map((tag) => <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[#6366f1]">{tag}</span>)}</div></td>
                    <td><div className="flex items-center gap-1.5">
                      {doc.findingId && <button onClick={() => onNavigate("/gap-assessment", { state: { openFindingId: doc.findingId } })} title={`Finding: ${doc.findingId}`} className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><Search className="w-3.5 h-3.5 text-[#0ea5e9]" /></button>}
                      {doc.capaId && <button onClick={() => onNavigate("/capa", { state: { openCapaId: doc.capaId } })} title={`CAPA: ${doc.capaId}`} className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><ClipboardCheck className="w-3.5 h-3.5 text-[#10b981]" /></button>}
                      {doc.eventId && <button onClick={() => onNavigate("/fda-483")} title="FDA 483" className="opacity-50 hover:opacity-100 border-none bg-transparent cursor-pointer"><FileWarning className="w-3.5 h-3.5 text-[#ef4444]" /></button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></div>
      )}
    </>
  );
}
