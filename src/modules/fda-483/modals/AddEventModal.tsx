import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import dayjs from "@/lib/dayjs";
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
  lockedSiteId?: string | null;
}

/** Add N working days (skip weekends) to a date */
function addWorkingDays(date: dayjs.Dayjs, days: number): dayjs.Dayjs {
  let count = 0;
  let current = date.clone();
  while (count < days) {
    current = current.add(1, "day");
    const d = current.day();
    if (d !== 0 && d !== 6) count++;
  }
  return current;
}

export function AddEventModal({ open, onClose, onSave, sites, lockedSiteId }: AddEventModalProps) {
  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      type: "FDA 483",
      referenceNumber: "",
      agency: "",
      siteId: lockedSiteId ?? "",
      inspectionDate: "",
      responseDeadline: "",
      status: "Open",
    },
  });

  // Auto-calculate response deadline when inspection date or event type changes
  const inspectionDate = form.watch("inspectionDate");
  const eventType = form.watch("type");

  useEffect(() => {
    if (!inspectionDate) return;
    const workingDays =
      eventType === "Warning Letter" ? 30 :
      eventType === "FDA 483" ? 15 : 15;
    const deadline = addWorkingDays(dayjs(inspectionDate), workingDays);
    form.setValue("responseDeadline", deadline.format("YYYY-MM-DD"), { shouldValidate: true });
  }, [inspectionDate, eventType, form]);

  function handleSubmit(data: EventFormData) {
    onSave(data);
    form.reset();
  }

  function handleClose() {
    form.reset();
    onClose();
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
          {/* Event type */}
          <div className="col-span-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Event type <span className="text-(--danger)" aria-hidden="true">*</span>
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
            {form.formState.errors.type && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.type.message}
              </p>
            )}
          </div>

          {/* Reference number */}
          <div>
            <label
              htmlFor="ev-ref"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Reference number <span className="text-(--danger)" aria-hidden="true">*</span>
            </label>
            <input
              id="ev-ref"
              className="input text-[12px]"
              placeholder="e.g. FEI 3004795103"
              aria-required="true"
              {...form.register("referenceNumber")}
            />
            {form.formState.errors.referenceNumber && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.referenceNumber.message}
              </p>
            )}
          </div>

          {/* Agency */}
          <div>
            <label
              htmlFor="ev-agency"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Regulatory agency <span className="text-(--danger)" aria-hidden="true">*</span>
            </label>
            <input
              id="ev-agency"
              className="input text-[12px]"
              placeholder="e.g. FDA, EMA, MHRA"
              aria-required="true"
              {...form.register("agency")}
            />
            {form.formState.errors.agency && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.agency.message}
              </p>
            )}
          </div>

          {/* Site — hidden for non-admin (auto-assigned), visible for admin */}
          {!lockedSiteId && (
            <div>
              <label
                className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Site <span className="text-(--danger)" aria-hidden="true">*</span>
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
          )}

          {/* Inspection date */}
          <div>
            <label
              htmlFor="ev-date"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Inspection date <span className="text-(--danger)" aria-hidden="true">*</span>
            </label>
            <input
              id="ev-date"
              type="date"
              className="input text-[12px]"
              aria-required="true"
              {...form.register("inspectionDate")}
            />
            {form.formState.errors.inspectionDate && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.inspectionDate.message}
              </p>
            )}
          </div>

          {/* Response deadline */}
          <div>
            <label
              htmlFor="ev-deadline"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Response deadline <span className="text-(--danger)" aria-hidden="true">*</span>
            </label>
            <input
              id="ev-deadline"
              type="date"
              className="input text-[12px]"
              aria-required="true"
              {...form.register("responseDeadline")}
            />
            {form.formState.errors.responseDeadline && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.responseDeadline.message}
              </p>
            )}
            <p
              className="text-[10px] mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              {eventType === "Warning Letter"
                ? "Warning Letter: 30 working days"
                : "FDA: 15 working days from receipt"}
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
