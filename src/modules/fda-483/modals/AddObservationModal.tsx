import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Observation } from "@/store/fda483.slice";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";

const obsSchema = z.object({
  number: z.coerce.number().min(1, "Number required"),
  text: z.string().min(5, "Observation text required"),
  area: z.string().optional(),
  regulation: z.string().optional(),
  severity: z.enum(["Critical", "High", "Low"]),
  status: z.enum(["Open", "In Progress", "RCA In Progress", "CAPA Linked", "Response Ready", "Response Drafted", "Closed"]),
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
      } else {
        form.reset({
          number: defaultNumber,
          severity: "High",
          status: "Open",
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingObs?.id]);

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
    >
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        noValidate
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
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
                    { value: "Low", label: "Low" },
                  ]}
                />
              )}
            />
          </div>
          <div>
            <label
              htmlFor="obs-area"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Area
            </label>
            <input
              id="obs-area"
              className="input text-[12px]"
              placeholder="e.g. QC Lab"
              {...form.register("area")}
            />
          </div>
          <div>
            <label
              htmlFor="obs-reg"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Regulation cited
            </label>
            <input
              id="obs-reg"
              className="input text-[12px]"
              placeholder="e.g. 21 CFR 211.68"
              {...form.register("regulation")}
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
              Status
            </label>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={field.onChange}
                  width="w-full"
                  options={[
                    "Open",
                    "RCA In Progress",
                    "Response Drafted",
                    "Closed",
                  ].map((s) => ({ value: s, label: s }))}
                />
              )}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            type="button"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={form.formState.isSubmitting}
          >
            {editingObs ? "Save" : "Add observation"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
