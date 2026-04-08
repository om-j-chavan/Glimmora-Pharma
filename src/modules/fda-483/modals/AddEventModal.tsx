import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";

const eventSchema = z.object({
  type: z.enum([
    "FDA 483",
    "Warning Letter",
    "EMA Inspection",
    "MHRA Inspection",
    "WHO Inspection",
  ]),
  referenceNumber: z.string().min(1, "Reference required"),
  agency: z.string().min(1, "Agency required"),
  siteId: z.string().min(1, "Site required"),
  inspectionDate: z.string().min(1, "Inspection date required"),
  responseDeadline: z.string().min(1, "Deadline required"),
  status: z.enum(["Open", "Response Due", "Response Submitted", "Closed"]),
});

export type EventFormData = z.infer<typeof eventSchema>;

interface Site {
  id: string;
  name: string;
  status: string;
}

export interface AddEventModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EventFormData) => void;
  sites: Site[];
}

export function AddEventModal({ open, onClose, onSave, sites }: AddEventModalProps) {
  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: { type: "FDA 483", status: "Open" },
  });

  function handleSubmit(data: EventFormData) {
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
      title="Log regulatory event"
    >
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        noValidate
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Event type *
            </label>
            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={field.onChange}
                  width="w-full"
                  options={[
                    "FDA 483",
                    "Warning Letter",
                    "EMA Inspection",
                    "MHRA Inspection",
                    "WHO Inspection",
                  ].map((t) => ({ value: t, label: t }))}
                />
              )}
            />
          </div>
          <div>
            <label
              htmlFor="ev-ref"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Reference number *
            </label>
            <input
              id="ev-ref"
              className="input text-[12px]"
              placeholder="e.g. FEI 3004795103"
              {...form.register("referenceNumber")}
            />
            {form.formState.errors.referenceNumber && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.referenceNumber.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="ev-agency"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Regulatory agency *
            </label>
            <input
              id="ev-agency"
              className="input text-[12px]"
              placeholder="e.g. FDA, EMA, MHRA"
              {...form.register("agency")}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Site *
            </label>
            <Controller
              name="siteId"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select site"
                  width="w-full"
                  options={sites
                    .filter((s) => s.status === "Active")
                    .map((s) => ({ value: s.id, label: s.name }))}
                />
              )}
            />
            {form.formState.errors.siteId && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.siteId.message}
              </p>
            )}
          </div>
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Status *
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
                    "Response Due",
                    "Response Submitted",
                    "Closed",
                  ].map((s) => ({ value: s, label: s }))}
                />
              )}
            />
          </div>
          <div>
            <label
              htmlFor="ev-date"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Inspection date *
            </label>
            <input
              id="ev-date"
              type="date"
              className="input text-[12px]"
              {...form.register("inspectionDate")}
            />
          </div>
          <div>
            <label
              htmlFor="ev-deadline"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Response deadline *
            </label>
            <input
              id="ev-deadline"
              type="date"
              className="input text-[12px]"
              {...form.register("responseDeadline")}
            />
            <p
              className="text-[10px] mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              FDA: 15 working days from receipt
            </p>
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
            Log event
          </Button>
        </div>
      </form>
    </Modal>
  );
}
