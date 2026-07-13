"use client";

import { useState } from "react";
import { Plus, Paperclip, Trash2, X, UploadCloud, FileText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DocumentCard } from "./DocumentCard";
import { worklistDocToCardView } from "./documentCardAdapters";
import { EVIDENCE_CATEGORIES, EVIDENCE_CATEGORY_LABEL, type EvidenceCategory } from "@/lib/queries/evidence";
import type { WorklistDoc } from "@/lib/queries/worklist";

/**
 * Shared, reusable "categorized documents" surface for the Worklist. Renders the
 * existing docs on the SHARED <DocumentCard> (via the Worklist adapter) and adds
 * a multi-document upload flow where EACH document requires its own category.
 *
 *  • Display   — one <DocumentCard> per doc (Category badge + View + Download,
 *                and Delete WHERE PERMITTED). A non-deletable (foreign-origin /
 *                locked) doc renders with the card's `locked` treatment and NO
 *                Delete affordance.
 *  • Add       — an "Add Document" button opens a modal that stages MULTIPLE
 *                files, each with its own category Dropdown. Upload is blocked
 *                until every staged document has a category (per-doc validation).
 *  • Delete    — the shared <ConfirmModal> gates every removal.
 *
 * The component owns NO server logic: the caller passes `onUpload` (batch) and
 * `onRemove`, which call the module's audit-first, permission-enforcing actions.
 * `canDelete` governs only the UI affordance — the SERVER stays authoritative.
 */

export interface DocUploadEntry {
  file: File;
  category: string;
}

export interface CategorizedDocUploaderProps {
  docs: WorklistDoc[];
  /** Batch upload — the caller loops its single-file server action per entry.
   *  Omit for a READ-ONLY display (no Add Document button). */
  onUpload?: (entries: DocUploadEntry[]) => Promise<{ success: boolean; error?: string }>;
  /** Remove one doc — the caller's permission-enforcing server action. Omit for
   *  a display with no Delete affordance at all. */
  onRemove?: (docId: string) => Promise<{ success: boolean; error?: string }>;
  /** Per-doc delete permission. `false` → card is LOCKED, no Delete (e.g. a
   *  foreign-origin/read-only doc). Defaults to deletable for every doc. */
  canDelete?: (doc: WorklistDoc) => boolean;
  /** Hide Add Document + all deletes (e.g. the record is closed / read-only). */
  readOnly?: boolean;
  emptyText?: string;
  /** Categories offered per document. Defaults to the shared EVIDENCE_CATEGORIES. */
  categories?: readonly string[];
  /** Display labels for `categories`, keyed by the raw stored value. Defaults to
   *  EVIDENCE_CATEGORY_LABEL. A module with its OWN category vocabulary (e.g. the
   *  Risk Register's RISK_DOC_CATEGORIES) passes its own map so the dropdown and
   *  the card badge read as prose instead of raw SCREAMING_SNAKE values. Any key
   *  not present falls back to the raw value, so this stays optional. */
  categoryLabels?: Record<string, string>;
  /** Optional label for the Add button (default "Add Document"). */
  addLabel?: string;
}

interface StagedEntry {
  id: string;
  file: File;
  category: string;
}

export function CategorizedDocUploader({
  docs,
  onUpload,
  onRemove,
  canDelete,
  readOnly = false,
  emptyText = "No documents yet.",
  categories = EVIDENCE_CATEGORIES,
  categoryLabels,
  addLabel = "Add Document",
}: CategorizedDocUploaderProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [entries, setEntries] = useState<StagedEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorklistDoc | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  /** Raw stored value → display label. Caller's map wins; Evidence is the default. */
  const labelFor = (c: string) =>
    categoryLabels?.[c] ?? EVIDENCE_CATEGORY_LABEL[c as EvidenceCategory] ?? c;
  const catOptions = categories.map((c) => ({ value: c, label: labelFor(c) }));
  const allHaveCategory = entries.length > 0 && entries.every((e) => e.category);

  function addFiles(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setEntries((prev) => [
      ...prev,
      ...list.map((file, i) => ({ id: `${file.name}-${file.size}-${prev.length + i}-${file.lastModified}`, file, category: "" })),
    ]);
  }

  function openAdd() { setEntries([]); setAddErr(null); setAddOpen(true); }
  function resetAdd() { setEntries([]); setAddErr(null); setAddOpen(false); }

  async function doUpload() {
    if (!onUpload) return;
    if (!allHaveCategory) { setAddErr("Every document needs a category before uploading."); return; }
    setUploading(true); setAddErr(null);
    const res = await onUpload(entries.map((e) => ({ file: e.file, category: e.category })));
    setUploading(false);
    if (!res.success) { setAddErr(res.error ?? "Upload failed."); return; }
    resetAdd();
  }

  async function doDelete() {
    if (!pendingDelete || !onRemove) return;
    setRemovingId(pendingDelete.id);
    await onRemove(pendingDelete.id); // errors surfaced by the caller's toast
    setRemovingId(null);
    setPendingDelete(null);
  }

  const fileFieldId = "cat-doc-file-input";

  return (
    <div>
      {docs.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {docs.map((d) => {
            // A doc is FOREIGN when `canDelete` is supplied and returns false —
            // that's a genuine origin/permission lock (shows the card's Lock icon
            // + no Delete). `readOnly` only suppresses the Delete affordance for
            // this view (e.g. own docs shown read-only), WITHOUT a misleading lock.
            const foreign = canDelete ? !canDelete(d) : false;
            const deletable = !readOnly && !!onRemove && !foreign;
            const base = worklistDocToCardView(d);
            // The adapter labels the category badge from EVIDENCE_CATEGORY_LABEL.
            // When the caller supplies its own vocabulary, relabel the badge with
            // the same `labelFor` the dropdown uses, so both read identically.
            const view =
              categoryLabels && d.category
                ? { ...base, badge: { label: labelFor(d.category), tone: "blue" as const } }
                : base;
            return (
              <DocumentCard
                key={d.id}
                doc={foreign ? { ...view, locked: true } : view}
                onRemove={deletable ? () => setPendingDelete(d) : undefined}
                removing={removingId === d.id}
              />
            );
          })}
        </div>
      )}

      {!readOnly && onUpload && (
        <Button variant="secondary" size="sm" icon={Plus} className="mt-2" onClick={openAdd}>{addLabel}</Button>
      )}

      {/* Add documents — multi-file, per-document category (required). */}
      <Modal
        open={addOpen}
        onClose={uploading ? () => undefined : resetAdd}
        title="Add documents"
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <label htmlFor={fileFieldId} className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer px-2.5 py-1.5 rounded-lg border" style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)" }}>
              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" /> {entries.length ? "Add more files" : "Choose files"}
              <input id={fileFieldId} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }} />
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={resetAdd} disabled={uploading}>Cancel</Button>
              <Button variant="primary" size="sm" icon={UploadCloud} onClick={() => void doUpload()} disabled={uploading || !allHaveCategory} loading={uploading}>
                Upload{entries.length ? ` ${entries.length}` : ""}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Add one or more documents. Each document needs a category — different documents can have different categories.
          </p>
          {entries.length === 0 ? (
            <label htmlFor={fileFieldId} className="block rounded-lg border border-dashed p-6 text-center cursor-pointer" style={{ borderColor: "var(--bg-border)" }}>
              <Paperclip className="w-4 h-4 mx-auto mb-1.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Choose files to add</span>
            </label>
          ) : (
            <div className="rounded-lg border" style={{ borderColor: "var(--bg-border)" }}>
              {entries.map((e) => (
                <div key={e.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0" style={{ borderColor: "var(--bg-border)" }}>
                  <FileText className="w-4 h-4 shrink-0 text-(--brand)" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium truncate text-(--text-primary)" title={e.file.name}>{e.file.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{Math.max(1, Math.round(e.file.size / 1024))} KB</p>
                  </div>
                  <div className="w-44 shrink-0">
                    <Dropdown
                      placeholder="Category…"
                      value={e.category}
                      onChange={(v) => setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, category: v } : x)))}
                      width="w-full"
                      size="sm"
                      options={catOptions}
                      disabled={uploading}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setEntries((prev) => prev.filter((x) => x.id !== e.id))}
                    disabled={uploading}
                    aria-label={`Remove ${e.file.name}`}
                    className="w-7 h-7 rounded-md flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-(--bg-hover) text-(--text-muted) disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {entries.length > 0 && !allHaveCategory && (
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Pick a category for every document to enable upload.</p>
          )}
          {addErr && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{addErr}</p>}
        </div>
      </Modal>

      {/* Delete confirmation — shared square ConfirmModal. */}
      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void doDelete()}
        loading={!!removingId}
        variant="danger"
        icon={Trash2}
        title="Delete this document?"
        message={pendingDelete ? <>&ldquo;{pendingDelete.fileName}&rdquo; will be removed from this record.</> : null}
        confirmLabel="Delete"
      />
    </div>
  );
}
