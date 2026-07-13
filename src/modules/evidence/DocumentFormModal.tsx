"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Plus, Save, FileText, X, Link as LinkIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { createDocument, updateDocument } from "@/actions/documents";
import type { EvidenceLibraryDoc } from "@/lib/queries/evidenceLibrary";

/** The minimal Type list (maps to Document.category). */
const DOC_TYPES = ["SOP", "Record", "Report", "Protocol", "Certificate", "Policy", "Validation", "Other"];

const MAX_MB = 10;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt";

/**
 * Add / Edit a document — the SIMPLIFIED form.
 *
 * ADD: only the essentials — File (REQUIRED), Title (required), Type, optional
 * Description. There is NO Author field: the server auto-assigns the logged-in
 * user as uploader (createDocument stamps uploadedBy + uploadedById from the
 * session) and marks origin = Evidence & Documents (editable/deletable).
 *
 * EDIT: metadata only (Title / Type / Description) via updateDocument — the file
 * and origin are immutable. The server re-checks the role + here-origin gate.
 */
export function DocumentFormModal({
  open,
  mode,
  doc,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "add" | "edit";
  doc?: EvidenceLibraryDoc | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = mode === "edit";
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setLink("");
    setTitle(isEdit ? doc?.title ?? "" : "");
    setType(isEdit ? doc?.category ?? "" : "");
    setDescription(isEdit ? doc?.description ?? "" : "");
    setBusy(false);
    setTitleError(null);
    setFileError(null);
    setLinkError(null);
  }, [open, isEdit, doc]);

  function validLink(v: string): boolean {
    try {
      const u = new URL(v.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function pickFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      setFileError(`File exceeds the ${MAX_MB} MB limit.`);
      return;
    }
    setFile(f);
    setFileError(null);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!title.trim()) { setTitleError("Title is required."); return; }
    if (!isEdit) {
      // File-OR-link: at least one is required (server re-enforces).
      if (!file && !link.trim()) { setFileError("Provide a file or a document link."); return; }
      if (link.trim() && !validLink(link)) { setLinkError("Enter a valid http(s) link."); return; }
    }
    setBusy(true);
    setTitleError(null);
    try {
      if (isEdit) {
        const res = await updateDocument(doc!.actionTargetId!, { fileName: title.trim(), category: type || undefined, description: description.trim() || undefined });
        if (!res.success) { toast.error(res.error); setBusy(false); return; }
        toast.success("Document updated.");
      } else {
        const fd = new FormData();
        fd.set("fileName", title.trim());
        if (type) fd.set("category", type);
        if (description.trim()) fd.set("description", description.trim());
        if (file) fd.set("file", file);
        if (link.trim()) fd.set("linkUrl", link.trim());
        const res = await createDocument(fd);
        if (!res.success) {
          if (res.fieldErrors?.linkUrl?.length) setLinkError(res.fieldErrors.linkUrl[0]);
          else if (res.fieldErrors?.file?.length) setFileError(res.fieldErrors.file[0]);
          else toast.error(res.error);
          setBusy(false);
          return;
        }
        toast.success(`Document “${title.trim()}” added.`);
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={isEdit ? "Edit document" : "Add document"}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" icon={isEdit ? Save : Plus} onClick={submit} loading={busy} disabled={busy}>
            {isEdit ? "Save changes" : "Add document"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* FILE-OR-LINK — provide EITHER a file OR a link (at least one). Both
            client- and server-validated. Hidden on edit (metadata-only). */}
        {!isEdit && (
          <div>
            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">
              Document — file or link <span className="text-(--danger)" aria-hidden="true">*</span>
            </label>
            {file ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-(--bg-elevated) border-(--bg-border)">
                <FileText className="w-5 h-5 shrink-0 text-(--brand)" aria-hidden="true" />
                <span className="flex-1 min-w-0 text-[12px] truncate text-(--text-primary)">{file.name}</span>
                <Button variant="ghost" size="xs" icon={X} onClick={() => setFile(null)} aria-label="Remove file" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-(--bg-border) hover:border-(--brand) p-6 text-center cursor-pointer transition-colors bg-transparent"
              >
                <Upload className="w-6 h-6 mx-auto mb-1.5 text-(--text-muted)" aria-hidden="true" />
                <p className="text-[12px] font-medium text-(--text-primary)">Click to choose a file</p>
                <p className="text-[10px] mt-1 text-(--text-muted)">PDF, PNG, JPG, XLSX, DOCX, CSV, TXT · Max {MAX_MB} MB</p>
              </button>
            )}
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} aria-label="Choose file" />
            {fileError && <p role="alert" className="text-[11px] text-(--danger) mt-1">{fileError}</p>}

            <div className="flex items-center gap-2 my-2" aria-hidden="true">
              <span className="flex-1 border-t border-(--bg-border)" />
              <span className="text-[10px] uppercase tracking-wider text-(--text-muted)">or</span>
              <span className="flex-1 border-t border-(--bg-border)" />
            </div>

            <Input
              id="doc-link"
              type="url"
              icon={LinkIcon}
              placeholder="https://link-to-document…"
              aria-label="Document link (URL)"
              value={link}
              error={linkError ?? undefined}
              onChange={(e) => { setLink(e.target.value); setLinkError(null); setFileError(null); }}
            />
          </div>
        )}

        <Input
          id="doc-title"
          label="Title"
          required
          value={title}
          error={titleError ?? undefined}
          placeholder="e.g. Cleaning Validation SOP"
          onChange={(e) => { setTitle(e.target.value); setTitleError(null); }}
        />

        <div>
          <label className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">Type</label>
          <Dropdown
            value={type}
            onChange={setType}
            width="w-full"
            placeholder="Select a type"
            options={[{ value: "", label: "Unspecified" }, ...DOC_TYPES.map((t) => ({ value: t, label: t }))]}
          />
        </div>

        <Textarea
          id="doc-description"
          label="Description (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this document?"
        />
      </div>
    </Modal>
  );
}
