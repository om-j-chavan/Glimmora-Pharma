import clsx from "clsx";
import {
  Package, CheckSquare, Download, Eye, X,
  FileText, ClipboardList, Shield, BarChart3, GitBranch,
  Award, BookOpen, File,
} from "lucide-react";
import type { EvidenceDocument, EvidencePack, DocType, DocStatus } from "@/store/evidence.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

const DOC_TYPE_ICONS: Record<DocType, LucideIcon> = { SOP: FileText, Record: ClipboardList, "Audit Trail": Shield, Validation: CheckSquare, Report: BarChart3, Protocol: GitBranch, Certificate: Award, Policy: BookOpen, Other: File };
const DOC_TYPE_COLORS: Record<DocType, string> = { SOP: "#0ea5e9", Record: "#10b981", "Audit Trail": "#6366f1", Validation: "#f59e0b", Report: "#a78bfa", Protocol: "#ef4444", Certificate: "#10b981", Policy: "#64748b", Other: "#94a3b8" };

function docStatusBadge(s: DocStatus) {
  const m: Record<DocStatus, "green" | "blue" | "gray" | "red" | "amber"> = { Current: "green", Draft: "blue", Superseded: "gray", Missing: "red", "Under Review": "amber" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

export interface PackBuilderTabProps {
  allDocs: EvidenceDocument[];
  packs: EvidencePack[];
  selectedDocs: Set<string>;
  toggleDocSelection: (id: string) => void;  onBuildPackOpen: () => void;
  onPreviewPack: (pack: EvidencePack) => void;
  onExportPack: (pack: EvidencePack) => void;
  onSwitchToLibrary: () => void;
}

export function PackBuilderTab({
  allDocs, packs, selectedDocs, toggleDocSelection,
  onBuildPackOpen, onPreviewPack, onExportPack, onSwitchToLibrary,
}: PackBuilderTabProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div><h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Evidence Pack Builder</h2><p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>Select documents from the library, name your pack and export for inspector review.</p></div>
        {selectedDocs.size > 0 && <Button variant="primary" icon={Package} onClick={onBuildPackOpen}>Create pack ({selectedDocs.size} docs)</Button>}
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {[{ step: 1, Icon: CheckSquare, color: "#0ea5e9", title: "Select documents", desc: "Go to Document Library and check the documents you want in the pack." },
          { step: 2, Icon: Package, color: "#6366f1", title: "Name the pack", desc: 'Give the pack a name and purpose, e.g. "FDA 483 Response Pack \u2014 Mar 2026".' },
          { step: 3, Icon: Download, color: "#10b981", title: "Export", desc: "Preview the pack metadata and export as a structured document list." }].map((s) => (
          <div key={s.step} className={clsx("rounded-xl p-4 border", "bg-(--bg-elevated) border-(--bg-border)")}>
            <div className="flex items-center gap-2 mb-2"><div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: s.color }}>{s.step}</div><s.Icon className="w-4 h-4" style={{ color: s.color }} aria-hidden="true" /></div>
            <p className="text-[12px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>{s.title}</p>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Selected docs preview */}
      {selectedDocs.size === 0 ? (
        <div className="card p-8 text-center"><Package className="w-10 h-10 mx-auto mb-2" style={{ color: "#334155" }} aria-hidden="true" /><p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>No documents selected yet. Go to Document Library and select documents to include.</p><Button variant="ghost" size="sm" className="mt-2" onClick={onSwitchToLibrary}>Go to Document Library</Button></div>
      ) : (
        <div className="card">
          <div className="card-header"><div className="flex items-center gap-2"><Package className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Selected for pack</span></div><Badge variant="blue">{selectedDocs.size} documents</Badge></div>
          <div className="card-body space-y-2">
            {Array.from(selectedDocs).map((docId) => { const doc = allDocs.find((d) => d.id === docId); if (!doc) return null; const DI = DOC_TYPE_ICONS[doc.type]; const ic = DOC_TYPE_COLORS[doc.type]; return (
              <div key={docId} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: "var(--bg-surface)" }}>
                <div className="flex items-center gap-2 flex-1 min-w-0"><div className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center" style={{ background: ic + "18" }}><DI className="w-3 h-3" style={{ color: ic }} aria-hidden="true" /></div><div className="min-w-0"><p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{doc.title}</p><p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{doc.reference} &middot; v{doc.version}</p></div></div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">{docStatusBadge(doc.status)}<button onClick={() => toggleDocSelection(docId)} aria-label={`Remove ${doc.title}`} className="opacity-40 hover:opacity-100 border-none bg-transparent cursor-pointer"><X className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} /></button></div>
              </div>
            ); })}
          </div>
        </div>
      )}

      {/* Saved packs */}
      {packs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Saved packs</h3>
          <div className="space-y-2">
            {packs.map((pack) => (
              <div key={pack.id} className="card p-4 flex items-center justify-between">
                <div><p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{pack.name}</p><p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{pack.purpose} &middot; {pack.documentIds.length} documents</p></div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" icon={Eye} aria-label="Preview pack" onClick={() => onPreviewPack(pack)} />
                  <Button variant="ghost" size="sm" icon={Download} aria-label="Export pack" onClick={() => onExportPack(pack)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
