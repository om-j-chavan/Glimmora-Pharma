"use client";

/**
 * ImportObservationsModal — Feature M (FDA 483 PDF auto-extraction).
 *
 * Three steps in one modal:
 *   1. Upload   — drop/select a digital 483 PDF (≤ 25 MB).
 *   2. Analyzing — the AI gateway (getFda483Extraction) extracts observations.
 *   3. Review   — side-by-side: the PDF (left) vs. the extracted, EDITABLE rows
 *                 (right). Nothing is saved until the user confirms; the parent
 *                 then bulk-creates the (Part 11 audited) observations.
 *
 * Mock-first: with AI_MOCK.fda483Extraction = true this returns a deterministic
 * sample so the whole flow is demoable without the backend. Scanned/image PDFs
 * yield no text in Phase 1 → the modal surfaces the backend's `note` instead of
 * silently showing zero rows.
 */

import { useState } from "react";
import {
  UploadCloud,
  FileText,
  Sparkles,
  AlertTriangle,
  Trash2,
  Loader2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { useAppSelector } from "@/hooks/useAppSelector";
import {
  getFda483Extraction,
  type ExtractedSeverity,
} from "@/lib/ai";

const MAX_SIZE_MB = 25;
const SEVERITY_OPTIONS: { value: ExtractedSeverity; label: string }[] = [
  { value: "Critical", label: "Critical" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

/** A reviewable/editable row in the import table. */
export interface ImportReviewRow {
  /** Local key. */
  key: string;
  include: boolean;
  originalNumber: number;
  text: string;
  area: string;
  regulation: string;
  severity: ExtractedSeverity;
  sourcePage: number;
  confidence: number;
}

export interface ImportSourceFile {
  fileName: string;
  fileUrl: string; // base64 data URL
  fileType?: string;
  fileSize?: string;
}

export interface ImportObservationsPayload {
  observations: {
    text: string;
    area?: string;
    regulation?: string;
    severity: ExtractedSeverity;
    sourcePage?: number;
    confidence?: number;
    originalNumber?: number;
  }[];
  sourceFile: ImportSourceFile;
}

export interface ImportObservationsModalProps {
  open: boolean;
  onClose: () => void;
  /** The 483 event's reference — passed to the extractor for context. */
  inspectionReference: string;
  /** Human-readable site/facility name — extractor context. */
  facility: string;
  /** Bulk-create handler owned by the parent (adds eventId + calls the action).
   *  Resolves when the import is committed; the parent closes the modal. */
  onImport: (payload: ImportObservationsPayload) => Promise<void>;
}

type Step = "upload" | "analyzing" | "review";

function confidenceVariant(c: number): "green" | "amber" | "gray" {
  if (c >= 70) return "green";
  if (c >= 50) return "amber";
  return "gray";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ImportObservationsModal({
  open,
  onClose,
  inspectionReference,
  facility,
  onImport,
}: ImportObservationsModalProps) {
  const toast = useToast();
  const aiToken = useAppSelector((s) => {
    const u = s.auth.user;
    if (!u) return "anonymous";
    if (u.aiAccessToken) return u.aiAccessToken;
    const tenant = s.auth.tenants.find((t) => t.id === u.tenantId);
    return tenant?.config?.users?.find((x) => x.id === u.id)?.aiAccessToken ?? "anonymous";
  });

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportReviewRow[]>([]);
  const [sourceFile, setSourceFile] = useState<ImportSourceFile | null>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setStep("upload");
    setRows([]);
    setSourceFile(null);
    setDataUrl("");
    setNote(null);
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File is too large. Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }

    setStep("analyzing");
    setNote(null);
    try {
      const url = await readFileAsDataUrl(file);
      setDataUrl(url);
      const src: ImportSourceFile = {
        fileName: file.name,
        fileUrl: url,
        fileType: "pdf",
        fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      };
      setSourceFile(src);

      const result = await getFda483Extraction({
        file,
        fileName: file.name,
        inspectionReference,
        facility,
        token: aiToken,
      });

      setNote(result.note);
      setRows(
        result.observations.map((o, i) => ({
          key: `row-${i}`,
          include: true,
          originalNumber: o.number,
          text: o.text,
          area: o.area,
          regulation: o.regulation,
          severity: o.severity,
          sourcePage: o.sourcePage,
          confidence: o.confidence,
        })),
      );
      setStep("review");
    } catch (e) {
      console.error("[fda-483] extraction failed:", e);
      toast.error("Could not extract observations from that PDF. Please try again.");
      setStep("upload");
    }
  }

  function updateRow(key: string, patch: Partial<ImportReviewRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const includedRows = rows.filter((r) => r.include && r.text.trim().length >= 10);
  const includedCount = includedRows.length;

  async function handleConfirm() {
    if (!sourceFile || includedCount === 0) return;
    setSubmitting(true);
    try {
      await onImport({
        sourceFile,
        observations: includedRows.map((r) => ({
          text: r.text.trim(),
          area: r.area.trim() || undefined,
          regulation: r.regulation.trim() || undefined,
          severity: r.severity,
          sourcePage: r.sourcePage || undefined,
          confidence: r.confidence || undefined,
          originalNumber: r.originalNumber || undefined,
        })),
      });
      reset(); // parent closes the modal on success
    } catch {
      // Parent surfaces the error toast; keep the modal open so edits survive.
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import observations from a 483 PDF"
      className="max-w-[1100px] w-[95vw]"
      persistent={submitting}
      footer={
        step === "review" ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {includedCount} of {rows.length} selected
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={Sparkles}
                onClick={handleConfirm}
                disabled={includedCount === 0 || submitting}
                loading={submitting}
              >
                Confirm &amp; Add {includedCount} observation{includedCount === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <label
          className="flex flex-col items-center justify-center text-center gap-3 rounded-xl border-2 border-dashed cursor-pointer py-12 px-6"
          style={{ borderColor: "var(--bg-border)", background: "var(--bg-surface)" }}
        >
          <UploadCloud className="w-10 h-10" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
            Upload a digital FDA 483 PDF
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            The AI extracts each observation for you to review before saving. Max {MAX_SIZE_MB} MB.
            Text-selectable PDFs only (scanned PDFs need OCR — coming soon).
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = ""; // allow re-selecting the same file
            }}
          />
          <span className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
            style={{ background: "var(--brand-muted)", color: "var(--brand)" }}>
            <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Choose PDF
          </span>
        </label>
      )}

      {/* ── Step 2: Analyzing ── */}
      {step === "analyzing" && (
        <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Extracting observations from the 483…
          </p>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {step === "review" && (
        <div className="space-y-3">
          {/* AI disclaimer */}
          <div
            className="flex items-start gap-2 p-3 rounded-lg border"
            style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}
            role="note"
          >
            <Sparkles className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              AI-extracted from the uploaded PDF. Review and edit before saving — final wording is
              your responsibility under 21 CFR Part 11.
            </p>
          </div>

          {note && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg border"
              style={{ background: "var(--warning-bg)", borderColor: "var(--warning)" }}
              role="alert"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden="true" />
              <p className="text-[11px]" style={{ color: "var(--warning)" }}>{note}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT — PDF preview */}
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--bg-border)", minHeight: 480 }}>
              {dataUrl ? (
                <iframe src={dataUrl} title="Uploaded 483 PDF" className="w-full" style={{ height: 560 }} />
              ) : (
                <div className="flex items-center justify-center h-full text-[12px]" style={{ color: "var(--text-muted)" }}>
                  No preview available.
                </div>
              )}
            </div>

            {/* RIGHT — editable extracted rows */}
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {rows.length === 0 && (
                <p className="text-[12px] italic py-6 text-center" style={{ color: "var(--text-muted)" }}>
                  No observations were extracted from this PDF.
                </p>
              )}
              {rows.map((r) => (
                <div
                  key={r.key}
                  className="rounded-lg border p-3"
                  style={{
                    borderColor: "var(--bg-border)",
                    background: "var(--bg-surface)",
                    opacity: r.include ? 1 : 0.55,
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => updateRow(r.key, { include: e.target.checked })}
                      />
                      Observation #{r.originalNumber}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={confidenceVariant(r.confidence)}>{r.confidence}% confidence</Badge>
                      {r.sourcePage > 0 && <Badge variant="gray">p.{r.sourcePage}</Badge>}
                      <button
                        type="button"
                        onClick={() => updateRow(r.key, { include: false })}
                        aria-label={`Exclude observation ${r.originalNumber}`}
                        className="p-1 rounded hover:bg-[var(--bg-hover)]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={3}
                    className="input w-full text-[12px] resize-none"
                    value={r.text}
                    onChange={(e) => updateRow(r.key, { text: e.target.value })}
                    disabled={!r.include}
                  />
                  {r.text.trim().length < 10 && r.include && (
                    <p className="text-[10px] mt-1" style={{ color: "var(--danger)" }}>
                      Observation text must be at least 10 characters.
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>
                        Severity
                      </label>
                      <Dropdown
                        value={r.severity}
                        onChange={(v) => updateRow(r.key, { severity: v as ExtractedSeverity })}
                        width="w-full"
                        options={SEVERITY_OPTIONS}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>
                        Area
                      </label>
                      <input
                        className="input w-full text-[12px]"
                        value={r.area}
                        onChange={(e) => updateRow(r.key, { area: e.target.value })}
                        disabled={!r.include}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>
                        Regulation
                      </label>
                      <input
                        className="input w-full text-[12px]"
                        value={r.regulation}
                        onChange={(e) => updateRow(r.key, { regulation: e.target.value })}
                        disabled={!r.include}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
