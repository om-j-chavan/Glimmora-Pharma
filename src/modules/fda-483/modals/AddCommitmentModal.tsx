import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { roleLabel } from "@/lib/labels/roles";
import { truncate } from "@/lib/format/text";

// Internal form shape. linkType drives which (optional) source id applies;
// the refinements make the matching id required.
const formSchema = z
  .object({
    text: z.string().min(5, "Commitment text required"),
    dueDate: z.string().min(1, "Due date required"),
    owner: z.string().min(1, "Owner required"),
    linkType: z.enum(["event", "observation", "capa"]),
    observationId: z.string().optional(),
    capaId: z.string().optional(),
  })
  .refine((d) => d.linkType !== "observation" || !!d.observationId, {
    message: "Select an observation",
    path: ["observationId"],
  })
  .refine((d) => d.linkType !== "capa" || !!d.capaId, {
    message: "Select a CAPA",
    path: ["capaId"],
  });

type FormValues = z.infer<typeof formSchema>;

// What the parent receives on save — source linkage already resolved to a
// single (optional) id; linkType is an internal concern.
export interface CommitFormData {
  text: string;
  dueDate: string;
  owner: string;
  observationId?: string;
  capaId?: string;
}

interface User {
  id: string;
  name: string;
  status: string;
  role: string;
}

export interface CommitObservationOption {
  id: string;
  number: number;
  text: string;
}

export interface CommitCapaOption {
  id: string;
  reference?: string;
  description: string;
}

export interface AddCommitmentModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: CommitFormData) => void;
  users: User[];
  /** This event's observations (for the "from observation" sub-dropdown). */
  observations: CommitObservationOption[];
  /** CAPAs linked to this event (for the "from CAPA" sub-dropdown). */
  capas: CommitCapaOption[];
}

export function AddCommitmentModal({ open, onClose, onSave, users, observations, capas }: AddCommitmentModalProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { linkType: "event" },
  });
  const linkType = form.watch("linkType");

  function handleSubmit(data: FormValues) {
    onSave({
      text: data.text,
      dueDate: data.dueDate,
      owner: data.owner,
      observationId: data.linkType === "observation" ? data.observationId : undefined,
      capaId: data.linkType === "capa" ? data.capaId : undefined,
    });
    form.reset();
  }

  function handleClose() {
    onClose();
    form.reset();
  }

  const labelCls = "text-[11px] font-semibold uppercase tracking-wider block mb-1";

  return (
    <Modal open={open} onClose={handleClose} title="Add commitment">
      <form onSubmit={form.handleSubmit(handleSubmit)} noValidate className="space-y-4">
        <div>
          <label htmlFor="cm-text" className={labelCls} style={{ color: "var(--text-muted)" }}>
            Commitment *
          </label>
          <textarea
            id="cm-text"
            rows={2}
            className="input text-[12px] resize-none w-full"
            placeholder="e.g. Submit validation protocol by 15 Apr 2026"
            {...form.register("text")}
          />
          {form.formState.errors.text && (
            <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.text.message}</p>
          )}
        </div>

        {/* Linkage */}
        <div>
          <label className={labelCls} style={{ color: "var(--text-muted)" }}>Source *</label>
          <Controller
            name="linkType"
            control={form.control}
            render={({ field }) => (
              <Dropdown
                value={field.value}
                onChange={(v) => {
                  field.onChange(v);
                  // Clear the now-irrelevant sub-selection.
                  form.setValue("observationId", undefined);
                  form.setValue("capaId", undefined);
                }}
                width="w-full"
                options={[
                  { value: "event", label: "Event-level commitment (no specific source)" },
                  { value: "observation", label: "From a specific observation" },
                  { value: "capa", label: "From a specific CAPA" },
                ]}
              />
            )}
          />
        </div>

        {linkType === "observation" && (
          <div>
            <label className={labelCls} style={{ color: "var(--text-muted)" }}>Observation *</label>
            <Controller
              name="observationId"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder={observations.length ? "Select observation" : "No observations on this event"}
                  width="w-full"
                  options={observations.map((o) => ({ value: o.id, label: `Obs #${o.number} — ${truncate(o.text, 60)}` }))}
                />
              )}
            />
            {form.formState.errors.observationId && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.observationId.message}</p>
            )}
          </div>
        )}

        {linkType === "capa" && (
          <div>
            <label className={labelCls} style={{ color: "var(--text-muted)" }}>CAPA *</label>
            <Controller
              name="capaId"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder={capas.length ? "Select CAPA" : "No CAPAs linked to this event"}
                  width="w-full"
                  options={capas.map((c) => ({ value: c.id, label: `${c.reference ?? c.id.slice(0, 8)} — ${truncate(c.description, 50)}` }))}
                />
              )}
            />
            {form.formState.errors.capaId && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.capaId.message}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={{ color: "var(--text-muted)" }}>Owner *</label>
            <Controller
              name="owner"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select owner"
                  width="w-full"
                  options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: `${u.name} (${roleLabel(u.role)})` }))}
                />
              )}
            />
            {form.formState.errors.owner && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.owner.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="cm-due" className={labelCls} style={{ color: "var(--text-muted)" }}>Due date *</label>
            <Controller
              name="dueDate"
              control={form.control}
              render={({ field }) => (
                <DatePicker
                  id="cm-due"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  required
                  placeholder="Select due date"
                  error={form.formState.errors.dueDate?.message}
                />
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" type="submit" loading={form.formState.isSubmitting}>Add commitment</Button>
        </div>
      </form>
    </Modal>
  );
}
