import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Observation } from "@/types/fda483";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { useAppSelector } from "@/hooks/useAppSelector";
import { frameworkLabel } from "@/constants/frameworks";
import {
  USER_PICKABLE_OBSERVATION_STATUSES,
  isServerOnlyObservationStatus,
} from "../_shared";

/* Area is a fixed picklist; Regulation Cited is now driven by the tenant's
 * enabled frameworks (Settings > Frameworks), read from the same Redux source
 * (s.frameworks.list) the rest of the app uses — see the component body. The
 * form schema still stores a plain string — the Dropdown writes the chosen
 * label, and "Other" reveals a free-text input for anything outside the list. */
const AREA_OPTIONS = [
  "QC", "QA", "Production", "Packaging", "Warehouse", "Lab", "Engineering",
  "Materials Management", "IT/CSV", "Quality Engineering", "Validation", "Other",
].map((v) => ({ value: v, label: v }));

const AREA_PRESETS = AREA_OPTIONS.map((o) => o.value).filter((v) => v !== "Other");

const obsSchema = z.object({
  number: z.coerce.number().min(1, "Number required"),
  text: z.string().min(5, "Observation text required"),
  area: z.string().optional(),
  regulation: z.string().optional(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]),
  status: z.enum(["Open", "In Progress", "CAPA Linked", "Response Drafted", "Closed"]),
});

export type ObsFormData = z.infer<typeof obsSchema>;

export interface AddObservationModalProps {
  open: boolean;
  editingObs: Observation | null;
  defaultNumber: number;
  onClose: () => void;
  onSave: (data: ObsFormData) => void;
}

export function AddObservationModal({
  open,
  editingObs,
  defaultNumber,
  onClose,
  onSave,
}: AddObservationModalProps) {
  const form = useForm({
    resolver: zodResolver(obsSchema),
    defaultValues: { number: defaultNumber, text: "", area: "", regulation: "", severity: "High" as const, status: "Open" as const },
  });

  // Regulation Cited options = the tenant's ENABLED frameworks (Settings >
  // Frameworks), from the same Redux source (hydrated app-wide in AppShell)
  // that the Settings tab and other modules read. Each option's value === its
  // display label (a plain string), matching what the observation record stores.
  const frameworkList = useAppSelector((s) => s.frameworks.list);
  const regulationPresets = useMemo(
    () => frameworkList.map((f) => frameworkLabel(f.key, f.name)),
    [frameworkList],
  );
  const regulationOptions = useMemo(
    () => [
      ...regulationPresets.map((label) => ({ value: label, label })),
      { value: "Other", label: "Other" },
    ],
    [regulationPresets],
  );

  // When the stored value isn't one of the presets (and isn't empty), the
  // "Other" branch is active and its free-text input carries the value.
  const [areaOther, setAreaOther] = useState(false);
  const [regOther, setRegOther] = useState(false);

  useEffect(() => {
    if (open) {
      if (editingObs) {
        form.reset({
          number: editingObs.number,
          text: editingObs.text,
          area: editingObs.area,
          regulation: editingObs.regulation,
          severity: editingObs.severity,
          status: editingObs.status,
        });
        setAreaOther(!!editingObs.area && !AREA_PRESETS.includes(editingObs.area));
        setRegOther(!!editingObs.regulation && !regulationPresets.includes(editingObs.regulation));
      } else {
        form.reset({
          number: defaultNumber,
          severity: "High",
          status: "Open",
        });
        setAreaOther(false);
        setRegOther(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingObs?.id]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleSubmit(data: any) {
    onSave(data);
    form.reset();
  }

  function handleClose() {
    onClose();
    form.reset();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={editingObs ? "Edit observation" : "Add observation"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            loading={form.formState.isSubmitting}
            onClick={form.handleSubmit(handleSubmit)}
          >
            {editingObs ? "Save" : "Add observation"}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        noValidate
        className="space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="obs-num"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Observation number *
            </label>
            <input
              id="obs-num"
              type="number"
              min={1}
              className="input text-[12px]"
              {...form.register("number")}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Severity *
            </label>
            <Controller
              name="severity"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={field.onChange}
                  width="w-full"
                  options={[
                    { value: "Critical", label: "Critical" },
                    { value: "High", label: "High" },
                    { value: "Medium", label: "Medium" },
                    { value: "Low", label: "Low" },
                  ]}
                />
              )}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Area
            </label>
            <Controller
              name="area"
              control={form.control}
              render={({ field }) => (
                <div className="space-y-2">
                  <Dropdown
                    value={areaOther ? "Other" : (field.value ?? "")}
                    onChange={(v) => {
                      if (v === "Other") { setAreaOther(true); field.onChange(""); }
                      else { setAreaOther(false); field.onChange(v); }
                    }}
                    width="w-full"
                    placeholder="Select area..."
                    options={AREA_OPTIONS}
                  />
                  {areaOther && (
                    <input
                      className="input text-[12px]"
                      placeholder="Specify area"
                      aria-label="Specify area"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  )}
                </div>
              )}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Regulation cited
            </label>
            <Controller
              name="regulation"
              control={form.control}
              render={({ field }) => (
                <div className="space-y-2">
                  <Dropdown
                    value={regOther ? "Other" : (field.value ?? "")}
                    onChange={(v) => {
                      if (v === "Other") { setRegOther(true); field.onChange(""); }
                      else { setRegOther(false); field.onChange(v); }
                    }}
                    width="w-full"
                    placeholder="Select regulation..."
                    options={regulationOptions}
                  />
                  {regOther && (
                    <input
                      className="input text-[12px]"
                      placeholder="Specify regulation"
                      aria-label="Specify regulation"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  )}
                </div>
              )}
            />
          </div>
          <div className="col-span-2">
            <label
              htmlFor="obs-text"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Observation text *
            </label>
            <textarea
              id="obs-text"
              rows={3}
              className="input text-[12px] resize-none"
              placeholder="Enter the exact observation text from the 483..."
              {...form.register("text")}
            />
            {form.formState.errors.text && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.text.message}
              </p>
            )}
          </div>
          <div className="col-span-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Observation status
            </label>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => {
                // When editing an observation whose current status is
                // server-only ("CAPA Linked", "Response Drafted"), the
                // picker is locked — those states are reached via
                // workflow actions (Raise CAPA, Save RCA), not by manual
                // selection. The user can still see what the current
                // value is.
                const currentLocked = isServerOnlyObservationStatus(field.value);
                const pickable = USER_PICKABLE_OBSERVATION_STATUSES.map((s) => ({ value: s, label: s }));
                const options = currentLocked
                  ? [{ value: field.value, label: `${field.value} (set by workflow)` }]
                  : pickable;
                return (
                  <Dropdown
                    value={field.value}
                    onChange={field.onChange}
                    width="w-full"
                    options={options}
                    disabled={currentLocked}
                  />
                );
              }}
            />
            {isServerOnlyObservationStatus(form.watch("status")) && (
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                This status was set automatically by a workflow action and can&rsquo;t be changed here.
              </p>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
