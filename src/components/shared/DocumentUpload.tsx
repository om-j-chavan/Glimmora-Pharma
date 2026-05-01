"use client";

import { useState, useRef } from "react";
import {
  FileText, Upload, Trash2, CheckCircle2, X, File,
  FileSpreadsheet, Image, Download,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";

/* ── Document interface — used across all modules ── */

export type DocFileType = "pdf" | "doc" | "docx" | "xls" | "xlsx" | "jpg" | "png" | "txt";
export type DocStatus = "current" | "under_review" | "approved" | "superseded";

export interface LinkedDocument {
  id: string;
  fileName: string;
  fileType: DocFileType;
  fileSize: string;
  uploadedBy: string;
  uploadedByRole: string;
  uploadedAt: string;
  version: string;
  status: DocStatus;
  linkedTo: { module: string; recordId: string; recordTitle: string };
  description?: string;
  approvedBy?: string;
  approvedAt?: string;
  /** base64 data URL of the uploaded file — enables view/download */
  dataUrl?: string;
}

function downloadLinkedDocument(doc: LinkedDocument) {
  if (!doc.dataUrl) return;
  const a = document.createElement("a");
  a.href = doc.dataUrl;
  a.download = doc.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ── Helpers ── */

const FILE_TYPE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt";
const MAX_SIZE_MB = 25;

function fileTypeFromName(name: string): DocFileType {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "doc") return "doc";
  if (ext === "docx") return "docx";
  if (ext === "xls") return "xls";
  if (ext === "xlsx") return "xlsx";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "png") return "png";
  if (ext === "txt") return "txt";
  return "txt";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: DocFileType) {
  if (type === "pdf") return FileText;
  if (type === "xls" || type === "xlsx") return FileSpreadsheet;
  if (type === "jpg" || type === "png") return Image;
  return File;
}

function statusBadge(s: DocStatus) {
  if (s === "approved") return <Badge variant="green">Approved</Badge>;
  if (s === "under_review") return <Badge variant="amber">Under Review</Badge>;
  if (s === "superseded") return <Badge variant="gray">Superseded</Badge>;
  return <Badge variant="blue">Current</Badge>;
}

function nextVersion(existing: LinkedDocument[], baseName: string): string {
  const matches = existing.filter((d) => d.fileName === baseName && d.status !== "superseded");
  if (matches.length === 0) return "v1.0";
  const max = matches.reduce((m, d) => {
    const n = parseFloat(d.version.replace("v", ""));
    return n > m ? n : m;
  }, 1.0);
  return `v${(max + 0.1).toFixed(1)}`;
}

/* ── Component ── */

export interface DocumentUploadProps {
  recordId: string;
  recordTitle: string;
  module: string;
  existingDocs: LinkedDocument[];
  onUpload: (doc: LinkedDocument) => void;
  onDelete?: (docId: string) => void;
  onApprove?: (docId: string, approvedBy: string) => void;
  readOnly?: boolean;
}

export function DocumentUpload({
  recordId, recordTitle, module, existingDocs,
  onUpload, onDelete, onApprove, readOnly = false,
}: DocumentUploadProps) {
  const user = useAppSelector((s) => s.auth.user);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { isQAHead } = usePermissions();
  const { org } = useTenantConfig();
  const timezone = org.timezone;

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number; type: DocFileType; dataUrl: string } | null>(null);
  const [description, setDescription] = useState("");
  const [versionMode, setVersionMode] = useState<"new_version" | "separate">("new_version");
  const [existingMatch, setExistingMatch] = useState<LinkedDocument | null>(null);
  const [successPopup, setSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const activeDocs = existingDocs.filter((d) => d.status !== "superseded");

  function handleFileSelect(file: File) {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }
    const ft = fileTypeFromName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFile({ name: file.name, size: file.size, type: ft, dataUrl: String(reader.result ?? "") });
      setDescription("");
      const match = activeDocs.find((d) => d.fileName === file.name);
      setExistingMatch(match ?? null);
      setVersionMode("new_version");
    };
    reader.onerror = () => alert("Failed to read file. Please try again.");
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleAttach() {
    if (!selectedFile || !user) return;
    const version = existingMatch && versionMode === "new_version"
      ? nextVersion(existingDocs, selectedFile.name)
      : "v1.0";

    // If new version, supersede old doc
    if (existingMatch && versionMode === "new_version" && onApprove) {
      // We handle supersede via a separate mechanism — for now the parent will update
    }

    const doc: LinkedDocument = {
      id: `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      fileName: selectedFile.name,
      fileType: selectedFile.type,
      fileSize: formatSize(selectedFile.size),
      uploadedBy: user.name,
      uploadedByRole: user.role,
      uploadedAt: new Date().toISOString(),
      version,
      status: "current",
      linkedTo: { module, recordId, recordTitle },
      description: description.trim() || undefined,
      dataUrl: selectedFile.dataUrl || undefined,
    };

    onUpload(doc);
    auditLog({
      action: "DOCUMENT_ATTACHED",
      module,
      recordId,
      recordTitle: `${selectedFile.name} → ${recordId}`,
      newValue: selectedFile.name,
    });

    setSuccessMsg(`${selectedFile.name} → ${recordId}`);
    setModalOpen(false);
    setSelectedFile(null);
    setSuccessPopup(true);
  }

  function handleApprove(doc: LinkedDocument) {
    if (!user || !onApprove) return;
    onApprove(doc.id, user.name);
    auditLog({
      action: "DOCUMENT_APPROVED",
      module,
      recordId,
      recordTitle: doc.fileName,
      oldValue: doc.status,
      newValue: "approved",
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Attached documents{activeDocs.length > 0 && ` (${activeDocs.length})`}
        </p>
        {!readOnly && (
          <Button variant="secondary" size="sm" icon={Upload} onClick={() => { setSelectedFile(null); setModalOpen(true); }}>
            Attach document
          </Button>
        )}
      </div>

      {/* Doc list */}
      {activeDocs.length === 0 ? (
        <div className={clsx("rounded-lg p-4 text-center border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
          <FileText className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No documents attached yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeDocs.map((doc) => {
            const Icon = fileIcon(doc.fileType);
            return (
              <div
                key={doc.id}
                className={clsx("flex items-start gap-3 rounded-lg p-3 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--brand-muted)" }}>
                  <Icon className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{doc.fileName}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Uploaded by {doc.uploadedBy} · {dayjs.utc(doc.uploadedAt).tz(timezone).format("DD/MM/YYYY")} · {doc.version} · {doc.fileSize}
                  </p>
                  {doc.description && <p className="text-[10px] italic mt-0.5" style={{ color: "var(--text-secondary)" }}>{doc.description}</p>}
                  {doc.approvedBy && (
                    <p className="text-[10px] mt-0.5" style={{ color: "#10b981" }}>
                      Approved by {doc.approvedBy} · {doc.approvedAt ? dayjs.utc(doc.approvedAt).tz(timezone).format("DD/MM/YYYY") : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {statusBadge(doc.status)}
                  <button
                    type="button"
                    onClick={() => downloadLinkedDocument(doc)}
                    disabled={!doc.dataUrl}
                    title={doc.dataUrl ? `Download ${doc.fileName}` : "File not available for download"}
                    aria-label={`Download ${doc.fileName}`}
                    className="p-1 rounded cursor-pointer border-none bg-transparent hover:bg-[rgba(14,165,233,0.1)] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ color: "var(--brand)" }}
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  {isQAHead && doc.status !== "approved" && doc.status !== "superseded" && onApprove && (
                    <button
                      type="button"
                      onClick={() => handleApprove(doc)}
                      title="Approve document"
                      className="p-1 rounded cursor-pointer border-none bg-transparent hover:bg-[rgba(16,185,129,0.1)]"
                      style={{ color: "#10b981" }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                  {!readOnly && onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(doc.id)}
                      title="Delete document"
                      className="p-1 rounded cursor-pointer border-none bg-transparent hover:bg-[rgba(239,68,68,0.1)]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setSelectedFile(null); }} title="Attach Document">
        <div className="space-y-4">
          {/* Drop zone */}
          {!selectedFile ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={clsx(
                "rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
                dragOver ? "border-[#0ea5e9] bg-[rgba(14,165,233,0.06)]" : isDark ? "border-[#1e3a5a] hover:border-[#0ea5e9]" : "border-[#e2e8f0] hover:border-[#0ea5e9]",
              )}
            >
              <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Drag & drop files here</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>or click to browse</p>
              <p className="text-[10px] mt-3" style={{ color: "var(--text-muted)" }}>
                Supported: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, TXT · Max {MAX_SIZE_MB} MB
              </p>
              <input ref={inputRef} type="file" accept={FILE_TYPE_ACCEPT} onChange={handleInputChange} className="hidden" aria-label="Choose file to upload" />
            </div>
          ) : (
            <>
              {/* File info */}
              <div className={clsx("flex items-center gap-3 p-3 rounded-lg border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                {(() => { const Icon = fileIcon(selectedFile.type); return <Icon className="w-5 h-5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />; })()}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{selectedFile.name}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{formatSize(selectedFile.size)} · {selectedFile.type.toUpperCase()}</p>
                </div>
                <button type="button" onClick={() => setSelectedFile(null)} className="p-1 cursor-pointer border-none bg-transparent" style={{ color: "var(--text-muted)" }} aria-label="Remove selected file">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Versioning prompt */}
              {existingMatch && (
                <div className={clsx("rounded-lg p-3 border", isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.2)]" : "bg-[#fef9ec] border-[#fde68a]")}>
                  <p className="text-[12px] font-medium mb-2" style={{ color: "#f59e0b" }}>
                    {existingMatch.fileName} ({existingMatch.version}) already exists
                  </p>
                  <label className="flex items-start gap-2 mb-1.5 cursor-pointer">
                    <input type="radio" name="version-mode" checked={versionMode === "new_version"} onChange={() => setVersionMode("new_version")} className="mt-0.5 accent-[#0ea5e9]" />
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Upload as new version ({nextVersion(existingDocs, selectedFile.name)}) — previous marked superseded</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="version-mode" checked={versionMode === "separate"} onChange={() => setVersionMode("separate")} className="mt-0.5 accent-[#0ea5e9]" />
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Upload as separate document</span>
                  </label>
                </div>
              )}

              {/* Description */}
              <div>
                <label htmlFor="doc-desc" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>Description (optional)</label>
                <input
                  id="doc-desc"
                  type="text"
                  className="input w-full"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this document?"
                />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => { setModalOpen(false); setSelectedFile(null); }}>Cancel</Button>
            <Button variant="primary" icon={Upload} disabled={!selectedFile} onClick={handleAttach}>Attach document</Button>
          </div>
        </div>
      </Modal>

      <Popup isOpen={successPopup} variant="success" title="Document attached" description={successMsg} onDismiss={() => setSuccessPopup(false)} />
    </div>
  );
}