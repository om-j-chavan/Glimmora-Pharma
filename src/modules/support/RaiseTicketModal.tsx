"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShieldAlert, Sparkles, Check, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { useAppSelector } from "@/hooks/useAppSelector";
import { DocumentUpload, uploadDocuments } from "@/components/documents/DocumentUpload";
import { createTicket, suggestTriage, type TriageSuggestion } from "@/actions/support";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  GXP_REQUEST_CATEGORIES,
  SUPPORT_RELATED_MODULES,
  type TicketCategory,
} from "@/lib/support/constants";

const schema = z.object({
  subject: z.string().min(3, "Subject is required"),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  description: z.string().min(5, "Description is required"),
  relatedModule: z.string().optional(),
  relatedRecordRef: z.string().optional(),
  // Optional evidence URL — accept "" so a cleared field still validates.
  evidenceLink: z.string().url("Enter a valid URL (https://…)").optional().or(z.literal("")),
  // Required for a customer_admin (enforced below + server-side); optional here
  // because other roles derive their site server-side.
  siteId: z.string().optional(),
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
  siteOptions = [],
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
  /** Sites for the CA-only site picker (the caller's tenant). Empty for
   *  non-CA callers, whose site is derived server-side. */
  siteOptions?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const role = useAppSelector((s) => s.auth.user?.role) ?? "";
  const requireSite = role === "customer_admin";
  const [files, setFiles] = useState<File[]>([]);

  const { register, handleSubmit, control, watch, reset, setValue, setError, trigger, getValues, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { category: "Technical/Bug", priority: "Medium", siteId: "", evidenceLink: "" },
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

  // Apply prefill each time the modal opens (and clear any stale files). The
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
      evidenceLink: "",
      siteId: "",
    });
    setFiles([]);
    setTriage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const category = watch("category") as TicketCategory;
  const isGxpRequest = GXP_REQUEST_CATEGORIES.has(category);

  function close() {
    setFiles([]);
    setTriage(null);
    reset({ category: "Technical/Bug", priority: "Medium", siteId: "", evidenceLink: "" });
    onClose();
  }

  const onSubmit = handleSubmit(async (data) => {
    if (requireSite && !data.siteId) {
      setError("siteId", { message: "Select a site." });
      return;
    }
    const res = await createTicket(
      {
        ...data,
        relatedModule: data.relatedModule || undefined,
        relatedRecordRef: data.relatedRecordRef || undefined,
        evidenceLink: data.evidenceLink || undefined,
        siteId: data.siteId || undefined,
        // Auto-captured context (hidden — not user inputs).
        originUrl: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
      },
      // Help Assistant handoff: attach the conversation as the first message.
      transcript ? { transcript } : undefined,
    );
    if (!res.success) {
      toast.error(`Could not raise ticket: ${res.error}`);
      if (res.fieldErrors?.siteId) setError("siteId", { message: res.fieldErrors.siteId[0] });
      return;
    }
    onCreated?.(res.data);

    // ATTACHMENTS — TICKET-FIRST ORDERING (root-cause fix). Attachments link to
    // the ticket via linkedRecordId, so the ticket MUST exist before we upload.
    // We create the ticket above, then persist each collected file with the
    // returned id. Uploading before the ticket existed would orphan the files.
    if (files.length > 0) {
      const { failed } = await uploadDocuments(files, { module: "Support", recordId: res.data.id });
      if (failed > 0) {
        toast.error(`Ticket created, but ${failed} attachment${failed === 1 ? "" : "s"} failed to upload.`);
      }
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
      header={
        // Custom header row: title left; AI Smart Triage sits immediately to the
        // LEFT of the Close (X). Same suggestTriage call — repositioned per spec.
        // The sr-only <h2 id="modal-title"> is still emitted by Modal for a11y.
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-(--bg-border)">
          <span className="text-[14px] font-semibold text-(--text-primary)">Raise Ticket</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" type="button" icon={Sparkles} loading={triageBusy} onClick={runTriage}>
              AI Smart Triage
            </Button>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150"
            >
              <X className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
            </button>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={close}>Cancel</Button>
          {/* type=submit + form= targets the form in the scrollable body, so the
              footer stays pinned and the buttons are never pushed off-screen. */}
          <Button variant="primary" type="submit" form="raise-ticket-form" loading={isSubmitting}>Create</Button>
        </div>
      }
    >
      <form id="raise-ticket-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {/* Smart Triage suggestions — rendered once the AI has returned. The
            trigger lives in the footer; this card shows the applyable results. */}
        {triage && (
          <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} aria-hidden="true" /> Smart Triage
            </div>
            <div className="space-y-2">
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
          </div>
        )}

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

        {/* Site — required only for a customer_admin (they raise on behalf of a
            site). Other roles derive their site server-side, so this is hidden. */}
        {requireSite && (
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Site *</label>
            <Controller name="siteId" control={control} render={({ field }) => (
              <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select a site" width="w-full"
                options={siteOptions.map((s) => ({ value: s.id, label: s.name }))} />
            )} />
            {errors.siteId && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.siteId.message}</p>}
          </div>
        )}

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
                options={[{ value: "", label: "None" }, ...SUPPORT_RELATED_MODULES.map((m) => ({ value: m, label: m }))]} />
            )} />
          </div>
          <div>
            <label htmlFor="t-rec" className={lbl} style={{ color: "var(--text-muted)" }}>Related record ID (optional)</label>
            <input id="t-rec" className="input text-[12px]" placeholder="e.g. CAPA-CHN-2026-001" {...register("relatedRecordRef")} />
          </div>
        </div>

        {/* Evidence Link — optional free-text URL, validated on blur (client) and
            by the server schema. Placed between Description and Attachments. */}
        <div>
          <label htmlFor="t-evidence" className={lbl} style={{ color: "var(--text-muted)" }}>Evidence Link (optional)</label>
          <input
            id="t-evidence"
            type="url"
            className="input text-[12px]"
            placeholder="https://…"
            {...register("evidenceLink", { onBlur: () => { void trigger("evidenceLink"); } })}
          />
          {errors.evidenceLink && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.evidenceLink.message}</p>}
        </div>

        <div>
          <label className={lbl} style={{ color: "var(--text-muted)" }}>Attachments (optional)</label>
          <DocumentUpload files={files} onChange={setFiles} onReject={(m) => toast.error(m)} />
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
