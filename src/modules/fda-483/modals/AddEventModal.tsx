import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import {
  deriveAgency,
  computeResponseDeadline,
  DEADLINE_FORMULA_BY_EVENT_TYPE,
  REFERENCE_LABEL_BY_EVENT_TYPE,
} from "../_shared";

const eventSchema = z.object({
  type: z.enum([
    "FDA 483",
    "Warning Letter",
    "EMA Inspection",
    "MHRA Inspection",
    "WHO Inspection",
  ]),
  referenceNumber: z.string().min(1, "Reference required"),
  siteId: z.string().min(1, "Site required"),
  inspectionDate: z.string().min(1, "Inspection start date required"),
  inspectionEndDate: z.string().optional(),
  responseDeadline: z.string().min(1, "Deadline required"),
  internalOwnerId: z.string().min(1, "Internal owner required"),
  leadInvestigator: z.string().optional(),
  status: z.enum(["Open", "Response Due", "Response Submitted", "Closed"]),
})
  // Date ordering invariants (YYYY-MM-DD compares lexicographically). No
  // past-date checks — back-dating a historical inspection is legitimate.
  .refine((d) => !d.inspectionEndDate || d.inspectionEndDate >= d.inspectionDate, {
    message: "Inspection end date cannot be before the start date",
    path: ["inspectionEndDate"],
  })
  .refine((d) => !d.responseDeadline || d.responseDeadline >= d.inspectionDate, {
    message: "Response deadline cannot be before the inspection start date",
    path: ["responseDeadline"],
  });

export type EventFormData = z.infer<typeof eventSchema>;

interface Site {
  id: string;
  name: string;
  status: string;
}

interface User {
  id: string;
  name: string;
}

export interface AddEventModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EventFormData) => void;
  sites: Site[];
  users: User[];
  /** Pre-selected internal owner (the current user when they're a
   *  compliance role); blank otherwise. */
  defaultOwnerId?: string;
  lockedSiteId?: string | null;
}

/* ── Local date-input helpers — keep all working-day math in LOCAL time so
 *    getDay()/setDate() are consistent (avoids UTC-midnight off-by-one). ── */
function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromDateInput(s: string): Date | null {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function AddEventModal({
  open,
  onClose,
  onSave,
  sites,
  users,
  defaultOwnerId,
  lockedSiteId,
}: AddEventModalProps) {
  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      type: "FDA 483",
      referenceNumber: "",
      siteId: lockedSiteId ?? "",
      inspectionDate: "",
      inspectionEndDate: "",
      responseDeadline: "",
      internalOwnerId: defaultOwnerId ?? "",
      leadInvestigator: "",
      status: "Open",
    },
  });

  // When false (the default) the deadline is auto-managed from the dates +
  // event type; [Override] flips it to manual editing and freezes recompute.
  const [deadlineOverride, setDeadlineOverride] = useState(false);

  const eventType = form.watch("type");
  const inspectionDate = form.watch("inspectionDate");
  const inspectionEndDate = form.watch("inspectionEndDate");

  const agency = deriveAgency(eventType);
  const refLabel = REFERENCE_LABEL_BY_EVENT_TYPE[eventType] ?? {
    label: "Reference number",
    placeholder: "",
  };
  const deadlineHint = DEADLINE_FORMULA_BY_EVENT_TYPE[eventType]?.hintText ?? "";

  // Reset the override flag whenever the modal (re)opens.
  useEffect(() => {
    if (open) setDeadlineOverride(false);
  }, [open]);

  // Auto-calculate the deadline from the end date (or start date) + event
  // type. Skipped entirely while the user has overridden it.
  useEffect(() => {
    if (deadlineOverride) return;
    const baseStr = inspectionEndDate || inspectionDate;
    if (!baseStr) return;
    const base = fromDateInput(baseStr);
    if (!base) return;
    const deadline = computeResponseDeadline(eventType, base);
    form.setValue("responseDeadline", toDateInput(deadline), {
      shouldValidate: true,
    });
  }, [inspectionDate, inspectionEndDate, eventType, deadlineOverride, form]);

  function handleSubmit(data: EventFormData) {
    onSave(data);
    form.reset();
    setDeadlineOverride(false);
  }

  function handleClose() {
    form.reset();
    setDeadlineOverride(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Register Regulatory Event">
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        noValidate
        className="space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          </div>

          {/* Agency — derived, read-only */}
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Agency
            </label>
            <div
              className="input text-[12px] flex items-center justify-between"
              style={{ color: "var(--text-primary)" }}
            >
              <span>{agency}</span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                read-only
              </span>
            </div>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Derived from Event Type
            </p>
          </div>

          {/* Reference number — dynamic label/placeholder */}
          <div>
            <label
              htmlFor="ev-ref"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              {refLabel.label} <span className="text-(--danger)" aria-hidden="true">*</span>
            </label>
            <input
              id="ev-ref"
              className="input text-[12px]"
              placeholder={refLabel.placeholder}
              aria-required="true"
              {...form.register("referenceNumber")}
            />
            {form.formState.errors.referenceNumber && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.referenceNumber.message}
              </p>
            )}
          </div>

          {/* Site — hidden for non-admin (auto-assigned), visible for admin */}
          {!lockedSiteId && (
            <div className="col-span-2">
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

          {/* Inspection start date */}
          <div>
            <label
              htmlFor="ev-date"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Inspection start date{" "}
              <span className="text-(--danger)" aria-hidden="true">*</span>
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

          {/* Inspection end date */}
          <div>
            <label
              htmlFor="ev-end-date"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Inspection end date
            </label>
            <input
              id="ev-end-date"
              type="date"
              className="input text-[12px]"
              {...form.register("inspectionEndDate")}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Optional · defaults to start date if blank
            </p>
          </div>

          {/* Response deadline — auto / override */}
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="ev-deadline"
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Response deadline{" "}
                <span className="text-(--danger)" aria-hidden="true">*</span>
              </label>
              <div className="flex items-center gap-2">
                {deadlineOverride && <Badge variant="amber">Manually overridden</Badge>}
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  onClick={() => setDeadlineOverride((v) => !v)}
                >
                  {deadlineOverride ? "Auto" : "Override"}
                </Button>
              </div>
            </div>
            <input
              id="ev-deadline"
              type="date"
              className="input text-[12px]"
              readOnly={!deadlineOverride}
              aria-required="true"
              {...form.register("responseDeadline")}
            />
            {form.formState.errors.responseDeadline && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.responseDeadline.message}
              </p>
            )}
            {deadlineHint && (
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                {deadlineHint}
              </p>
            )}
          </div>

          {/* Internal owner */}
          <div className="col-span-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Internal owner{" "}
              <span className="text-(--danger)" aria-hidden="true">*</span>
            </label>
            <Controller
              name="internalOwnerId"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select QA owner"
                  width="w-full"
                  options={users.map((u) => ({ value: u.id, label: u.name }))}
                />
              )}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Notifications + reminders will go to this person
            </p>
            {form.formState.errors.internalOwnerId && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.internalOwnerId.message}
              </p>
            )}
          </div>

          {/* Lead investigator */}
          <div className="col-span-2">
            <label
              htmlFor="ev-investigator"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Lead investigator{" "}
              <span className="text-[10px] normal-case" style={{ color: "var(--text-muted)" }}>
                (optional)
              </span>
            </label>
            <input
              id="ev-investigator"
              className="input text-[12px]"
              placeholder="e.g. Dr. James Smith"
              {...form.register("leadInvestigator")}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              The investigator named on the inspection form
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={form.formState.isSubmitting}
          >
            Register Event
          </Button>
        </div>
      </form>
    </Modal>
  );
}
