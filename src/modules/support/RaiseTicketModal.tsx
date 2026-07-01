"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShieldAlert, Upload, FileText, X, Sparkles, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { createTicket, suggestTriage, type TriageSuggestion } from "@/actions/support";
import { createDocument } from "@/actions/documents";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, GXP_REQUEST_CATEGORIES, type TicketCategory } from "@/lib/support/constants";
import { RELATED_MODULES } from "./_shared";

const schema = z.object({
  subject: z.string().min(3, "Subject is required"),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  description: z.string().min(5, "Description is required"),
  relatedModule: z.string().optional(),
  relatedRecordRef: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";

/** Prefill for the Help Assistant handoff (and any future prefill caller). */
export interface RaiseTicketPrefill {
  subject?: string;
  category?: FormValues["category"];
  priority?: FormValues["priority"];
  description?: string;
  relatedModule?: string;
  relatedRecordRef?: string;
}

export function RaiseTicketModal({
  open,
  onClose,
  prefill,
  transcript,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Optional prefilled values (e.g. from the Help Assistant). */
  prefill?: RaiseTicketPrefill;
  /** Conversation transcript attached to the ticket via createTicket's
   *  { transcript } option (stored as the first message — Phase 1 behavior). */
  transcript?: string;
  /** Fired after a successful create so a caller (the assistant) can confirm. */
  onCreated?: (t: { id: string; reference: string | null }) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);

  const { register, handleSubmit, control, watch, reset, setValue, getValues, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { category: "Technical/Bug", priority: "Medium" },
    });

  // Smart Triage (suggestion-only). Holds the latest AI suggestion + busy
  // state; never auto-applies — the user clicks Apply per field.
  const [triage, setTriage] = useState<TriageSuggestion | null>(null);
  const [triageBusy, setTriageBusy] = useState(false);

  async function runTriage() {
    const { subject, description } = getValues();
    if ((subject?.trim().length ?? 0) < 3 || (description?.trim().length ?? 0) < 5) {
      toast.error("Add a subject and a short description first.");
      return;
    }
    setTriageBusy(true);
    const res = await suggestTriage({ subject, description });
    setTriageBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setTriage(res.data);
  }

  // Apply prefill each time the modal opens (and clear any stale file). The
  // queue caller passes no prefill → blank defaults, exactly as before.
  useEffect(() => {
    if (!open) return;
    reset({
      subject: prefill?.subject ?? "",
      category: prefill?.category ?? "Technical/Bug",
      priority: prefill?.priority ?? "Medium",
      description: prefill?.description ?? "",
      relatedModule: prefill?.relatedModule ?? "",
      relatedRecordRef: prefill?.relatedRecordRef ?? "",
    });
    setFile(null);
    setTriage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const category = watch("category") as TicketCategory;
  const isGxpRequest = GXP_REQUEST_CATEGORIES.has(category);

  function close() {
    setFile(null);
    setTriage(null);
    reset({ category: "Technical/Bug", priority: "Medium" });
    onClose();
  }

  const onSubmit = handleSubmit(async (data) => {
    const res = await createTicket(
      {
        ...data,
        relatedModule: data.relatedModule || undefined,
        relatedRecordRef: data.relatedRecordRef || undefined,
        // Auto-captured context (hidden — not user inputs).
        originUrl: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
      },
      // Help Assistant handoff: attach the conversation as the first message.
      transcript ? { transcript } : undefined,
    );
    if (!res.success) {
      toast.error(`Could not raise ticket: ${res.error}`);
      return;
    }
    onCreated?.(res.data);
    // Optional attachment via the same fileStorage pipeline as Evidence
    // (linkedModule="Support" → surfaced on the ticket detail; downloaded via
    // /api/documents/[id]).
    if (file) {
      const fd = new FormData();
      fd.set("fileName", file.name);
      fd.set("linkedModule", "Support");
      fd.set("linkedRecordId", res.data.id);
      fd.set("file", file);
      const up = await createDocument(fd);
      if (!up.success) toast.error("Ticket created, but the attachment failed to upload.");
    }
    toast.success(`Ticket ${res.data.reference ?? ""} raised.`);
    close();
    router.refresh();
  });

  return (
    <Modal
      open={open}
      onClose={close}
      title="Raise Ticket"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={close}>Cancel</Button>
          {/* type=submit + form= targets the form in the scrollable body, so the
              footer stays pinned and the buttons are never pushed off-screen. */}
          <Button variant="primary" type="submit" form="raise-ticket-form" loading={isSubmitting}>Raise Ticket</Button>
        </div>
      }
    >
      <form id="raise-ticket-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {/* Smart Triage (suggestion-only) — recommends category + priority from
            the subject/description. Never auto-fills; the user clicks Apply. */}
        <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} aria-hidden="true" /> Smart Triage
            </div>
            <Button variant="secondary" size="sm" type="button" icon={Sparkles} loading={triageBusy} onClick={runTriage}>
              {triage ? "Re-analyse" : "Suggest category & priority"}
            </Button>
          </div>
          {triage && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <SuggestionChip
                  label="Category" value={triage.category}
                  applied={watch("category") === triage.category}
                  onApply={() => setValue("category", triage.category, { shouldValidate: true })}
                />
                <SuggestionChip
                  label="Priority" value={triage.priority}
                  applied={watch("priority") === triage.priority}
                  onApply={() => setValue("priority", triage.priority, { shouldValidate: true })}
                />
              </div>
              {triage.rationale && (
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {triage.rationale}
                  {triage.confidence > 0 && ` · ${Math.round(triage.confidence * 100)}% confidence`}
                </p>
              )}
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>AI suggestion — review before applying. Support may re-triage.</p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="t-subject" className={lbl} style={{ color: "var(--text-muted)" }}>Subject *</label>
          <input id="t-subject" className="input text-[12px]" placeholder="Short summary of the issue" {...register("subject")} />
          {errors.subject && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.subject.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Category *</label>
            <Controller name="category" control={control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={TICKET_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            )} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Priority *</label>
            <Controller name="priority" control={control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={TICKET_PRIORITIES.map((p) => ({ value: p, label: p }))} />
            )} />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Support may re-triage priority.</p>
          </div>
        </div>

        {isGxpRequest && (
          <div className="flex items-start gap-2 rounded-lg p-3 text-[12px]" role="note" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)", color: "var(--text-secondary)" }}>
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden="true" />
            <span>This ticket can <strong>request</strong> a record change but will not modify any GxP record. Approved changes go through the proper CAPA / Deviation / Change Control flow with their own e-signature; this ticket only links to the record.</span>
          </div>
        )}

        <div>
          <label htmlFor="t-desc" className={lbl} style={{ color: "var(--text-muted)" }}>Description *</label>
          <textarea id="t-desc" rows={4} className="input text-[12px] resize-none" placeholder="What happened? Steps, expected vs actual, impact." {...register("description")} />
          {errors.description && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Related module (optional)</label>
            <Controller name="relatedModule" control={control} render={({ field }) => (
              <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="None" width="w-full"
                options={[{ value: "", label: "None" }, ...RELATED_MODULES.map((m) => ({ value: m, label: m }))]} />
            )} />
          </div>
          <div>
            <label htmlFor="t-rec" className={lbl} style={{ color: "var(--text-muted)" }}>Related record ID (optional)</label>
            <input id="t-rec" className="input text-[12px]" placeholder="e.g. CAPA-CHN-2026-001" {...register("relatedRecordRef")} />
          </div>
        </div>

        <div>
          <label className={lbl} style={{ color: "var(--text-muted)" }}>Attachment (optional)</label>
          {file ? (
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 border-(--bg-border) bg-(--bg-surface)">
              <FileText className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate text-[12px]" style={{ color: "var(--text-primary)" }}>{file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="border-none bg-transparent cursor-pointer shrink-0" style={{ color: "var(--text-muted)" }}><X className="w-3.5 h-3.5" aria-hidden="true" /></button>
            </div>
          ) : (
            <label htmlFor="t-file" className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 cursor-pointer text-center transition-colors border-(--bg-border) hover:border-(--brand)">
              <Upload className="w-5 h-5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>Click to choose a file</span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>PDF, PNG, JPG, DOCX, XLSX, CSV, TXT · max 10 MB</span>
              <input id="t-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** A single AI-suggested field value with an Apply control. Shows an applied
 *  (checked) state when the form already matches the suggestion. */
function SuggestionChip({
  label,
  value,
  applied,
  onApply,
}: {
  label: string;
  value: string;
  applied: boolean;
  onApply: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onApply}
      disabled={applied}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-default"
      style={{
        borderColor: applied ? "var(--success)" : "var(--brand)",
        color: applied ? "var(--success)" : "var(--brand)",
        background: "var(--bg-surface)",
      }}
      aria-label={applied ? `${label} ${value} applied` : `Apply suggested ${label} ${value}`}
    >
      {applied ? <Check className="w-3 h-3" aria-hidden="true" /> : <Sparkles className="w-3 h-3" aria-hidden="true" />}
      <span style={{ color: "var(--text-muted)" }}>{label}:</span>
      <span>{value}</span>
      {!applied && <span style={{ color: "var(--text-muted)" }}>· Apply</span>}
    </button>
  );
}
