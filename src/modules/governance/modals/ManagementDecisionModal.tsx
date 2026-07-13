"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { CategorizedDocUploader, type DocUploadEntry } from "@/components/shared/CategorizedDocUploader";
import { roleLabel } from "@/lib/labels/roles";
import dayjs from "@/lib/dayjs";
import {
  DECISION_DOC_CATEGORIES,
  DECISION_DOC_CATEGORY_LABEL,
} from "@/constants/managementDecision";
import type { ManagementDecisionRow } from "@/lib/queries/managementDecisions";
import type { WorklistDoc } from "@/lib/queries/worklist";

const LABEL = "text-[11px] font-semibold uppercase tracking-wider block mb-1";
const ERR = "text-[11px] text-[#ef4444] mt-1";

export interface DecisionParticipant {
  id: string;
  name: string;
  role: string;
}

export interface DecisionItemValues {
  id?: string;
  text: string;
  ownerId: string;
  dueDate: string;
}

export interface ManagementDecisionFormValues {
  topic: string;
  meetingDate: string;
  attendees: string;
  chairedById: string;
  items: DecisionItemValues[];
}

export interface ManagementDecisionModalProps {
  open: boolean;
  onClose: () => void;
  /** null = create mode; a row = edit mode. */
  decision: ManagementDecisionRow | null;
  participants: DecisionParticipant[];
  /** Existing supporting docs (edit mode only). */
  docs?: WorklistDoc[];
  onSubmit: (values: ManagementDecisionFormValues) => Promise<{ success: boolean; error?: string }>;
  onUploadDocs?: (entries: DocUploadEntry[]) => Promise<{ success: boolean; error?: string }>;
  onRemoveDoc?: (docId: string) => Promise<{ success: boolean; error?: string }>;
}

const EMPTY_ITEM: DecisionItemValues = { text: "", ownerId: "", dueDate: "" };

/**
 * Record / amend a management review meeting.
 *
 * Built from the shared primitives only (Modal, Dropdown, DatePicker, Button,
 * CategorizedDocUploader) — no new components.
 *
 * The DECISIONS & ACTION ITEMS section is a `useFieldArray` repeater. Each row is
 * one minuted statement; adding an owner and/or a due date is what turns a plain
 * DECISION into an ACTION ITEM (the distinction is derived, never a separate
 * field). At least one item is required — a management review with nothing minuted
 * is not a record of anything.
 *
 * CREATE mode stages documents in memory and uploads them AFTER the meeting row
 * exists (a doc needs a parent id). EDIT mode uploads/removes immediately.
 */
export function ManagementDecisionModal({
  open, onClose, decision, participants, docs = [], onSubmit, onUploadDocs, onRemoveDoc,
}: ManagementDecisionModalProps) {
  const isEdit = !!decision;
  const [serverError, setServerError] = useState("");
  const [stagedDocs, setStagedDocs] = useState<DocUploadEntry[]>([]);

  const form = useForm<ManagementDecisionFormValues>({
    defaultValues: { topic: "", meetingDate: "", attendees: "", chairedById: "", items: [EMPTY_ITEM] },
  });
  const { register, control, handleSubmit, reset, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    if (!open) return;
    setServerError("");
    setStagedDocs([]);
    reset(
      decision
        ? {
            topic: decision.topic,
            meetingDate: dayjs.utc(decision.meetingDate).format("YYYY-MM-DD"),
            attendees: decision.attendees,
            chairedById: decision.chairedById ?? "",
            items: decision.items.map((i) => ({
              id: i.id,
              text: i.text,
              ownerId: i.ownerId ?? "",
              dueDate: i.dueDate ? dayjs.utc(i.dueDate).format("YYYY-MM-DD") : "",
            })),
          }
        : { topic: "", meetingDate: "", attendees: "", chairedById: "", items: [EMPTY_ITEM] },
    );
  }, [open, decision, reset]);

  async function submit(values: ManagementDecisionFormValues) {
    setServerError("");
    const res = await onSubmit(values);
    if (!res.success) {
      setServerError(res.error || "Failed to save the management decision.");
      return;
    }
    if (!isEdit && stagedDocs.length > 0 && onUploadDocs) {
      const up = await onUploadDocs(stagedDocs);
      if (!up.success) {
        setServerError(up.error || "Meeting saved, but some documents failed to upload.");
        return;
      }
    }
    onClose();
  }

  /** CREATE mode: stage in memory, render as pseudo-docs, upload after save. */
  const stagedAsDocs: WorklistDoc[] = stagedDocs.map((e, i) => ({
    id: `staged-${i}`,
    fileName: e.file.name,
    fileType: e.file.type || null,
    fileExtension: e.file.name.includes(".") ? e.file.name.split(".").pop() ?? null : null,
    fileSize: `${Math.max(1, Math.round(e.file.size / 1024))} KB`,
    uploadedBy: "Pending upload",
    uploadedAt: new Date(0).toISOString(),
    category: e.category,
  }));

  const ownerOptions = [
    { value: "", label: "— No owner (a decision, not a task)" },
    ...participants.map((p) => ({ value: p.id, label: `${p.name} (${roleLabel(p.role)})` })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Amend Meeting — ${decision?.reference ?? ""}` : "Record Management Decision"}
      className="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="button" loading={formState.isSubmitting} onClick={handleSubmit(submit)}>
            {isEdit ? "Save amendment" : "Record meeting"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor="md-topic" className={LABEL} style={{ color: "var(--text-muted)" }}>Topic *</label>
            <input id="md-topic" className="input text-[12px]"
              placeholder="e.g. Q3 2026 Management Review"
              {...register("topic", { required: "Topic is required", minLength: { value: 3, message: "At least 3 characters" } })} />
            {formState.errors.topic && <p role="alert" className={ERR}>{formState.errors.topic.message}</p>}
          </div>

          <div>
            <label className={LABEL} style={{ color: "var(--text-muted)" }}>Meeting date *</label>
            <Controller name="meetingDate" control={control} rules={{ required: "Meeting date is required" }}
              render={({ field }) => (
                <DatePicker id="md-date" value={field.value ?? ""} onChange={field.onChange}
                  placeholder="Select date" error={formState.errors.meetingDate?.message} />
              )} />
          </div>

          <div>
            <label className={LABEL} style={{ color: "var(--text-muted)" }}>Chaired by</label>
            <Controller name="chairedById" control={control}
              render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} placeholder="Select chair" width="w-full"
                  options={[{ value: "", label: "— Not recorded" },
                            ...participants.map((p) => ({ value: p.id, label: `${p.name} (${roleLabel(p.role)})` }))]} />
              )} />
          </div>

          <div className="col-span-2">
            <label htmlFor="md-attendees" className={LABEL} style={{ color: "var(--text-muted)" }}>Attendees *</label>
            <textarea id="md-attendees" rows={3} className="input text-[12px] resize-none"
              placeholder="One attendee per line. External attendees (auditors, consultants) are welcome — this is free text, not a user list."
              {...register("attendees", { required: "At least one attendee is required" })} />
            {formState.errors.attendees && <p role="alert" className={ERR}>{formState.errors.attendees.message}</p>}
          </div>
        </div>

        {/* ── Decisions & action items (repeatable) ── */}
        <div className="pt-3 border-t border-(--bg-border)">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Decisions &amp; action items *
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Add an owner or a due date to turn a decision into a tracked action item.
              </p>
            </div>
            <Button variant="secondary" size="sm" icon={Plus} type="button" onClick={() => append({ ...EMPTY_ITEM })}>
              Add item
            </Button>
          </div>

          {formState.errors.items?.root && (
            <p role="alert" className={ERR}>{formState.errors.items.root.message}</p>
          )}

          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border p-3"
                   style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-mono mt-2 shrink-0" style={{ color: "var(--text-muted)" }}>
                    {index + 1}.
                  </span>
                  <div className="flex-1 space-y-2">
                    <div>
                      <textarea rows={2} className="input text-[12px] resize-none w-full"
                        placeholder="What was decided, or what action was agreed?"
                        {...register(`items.${index}.text` as const, {
                          required: "Each item needs text",
                          minLength: { value: 3, message: "At least 3 characters" },
                        })} />
                      {formState.errors.items?.[index]?.text && (
                        <p role="alert" className={ERR}>{formState.errors.items[index]?.text?.message}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Owner</label>
                        <Controller name={`items.${index}.ownerId` as const} control={control}
                          render={({ field: f }) => (
                            <Dropdown value={f.value} onChange={f.onChange} placeholder="No owner" width="w-full" size="sm" options={ownerOptions} />
                          )} />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Due date</label>
                        <Controller name={`items.${index}.dueDate` as const} control={control}
                          render={({ field: f }) => (
                            <DatePicker id={`md-item-due-${index}`} value={f.value ?? ""} onChange={f.onChange} placeholder="No due date" className="w-full" />
                          )} />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="danger-ghost" size="xs" icon={Trash2} type="button"
                    aria-label={`Remove item ${index + 1}`}
                    disabled={fields.length === 1}
                    title={fields.length === 1 ? "A meeting must record at least one decision." : undefined}
                    onClick={() => remove(index)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Supporting documents ── */}
        <div className="pt-3 border-t border-(--bg-border)">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
            Supporting documents
          </p>
          {isEdit ? (
            <CategorizedDocUploader
              docs={docs}
              categories={DECISION_DOC_CATEGORIES}
              categoryLabels={DECISION_DOC_CATEGORY_LABEL}
              emptyText="No documents attached yet — attach the agenda, minutes, or slide deck."
              onUpload={onUploadDocs}
              onRemove={onRemoveDoc}
            />
          ) : (
            <CategorizedDocUploader
              docs={stagedAsDocs}
              categories={DECISION_DOC_CATEGORIES}
              categoryLabels={DECISION_DOC_CATEGORY_LABEL}
              emptyText="No documents staged — they upload when the meeting is recorded."
              onUpload={async (entries) => {
                setStagedDocs((prev) => [...prev, ...entries]);
                return { success: true };
              }}
              onRemove={async (docId) => {
                const idx = Number(docId.replace("staged-", ""));
                setStagedDocs((prev) => prev.filter((_, i) => i !== idx));
                return { success: true };
              }}
            />
          )}
        </div>

        {serverError && (
          <p role="alert" className="text-[11px] text-[#ef4444] p-2 rounded-lg" style={{ background: "var(--danger-bg)" }}>
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  );
}
