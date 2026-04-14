import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import type { SubscriptionPlan } from "@/store/auth.slice";

const schema = z
  .object({
    startDate: z.string().min(1, "Start date required"),
    endDate: z.string().min(1, "Expiry date required"),
    maxAccounts: z.coerce.number().min(0, "Must be 0 or more"),
    status: z.enum(["Active", "Inactive"]),
  })
  .refine((d) => dayjs(d.endDate).isAfter(dayjs(d.startDate)), {
    message: "Expiry must be after start date",
    path: ["endDate"],
  });

type FormValues = z.infer<typeof schema>;

const STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

interface AddSubscriptionPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<SubscriptionPlan, "id" | "createdAt">) => void;
}

export function AddSubscriptionPlanModal({ isOpen, onClose, onSave }: AddSubscriptionPlanModalProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      startDate: dayjs().format("YYYY-MM-DD"),
      endDate: dayjs().add(1, "year").format("YYYY-MM-DD"),
      maxAccounts: 15,
      status: "Active",
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = (data: FormValues) => {
    onSave({
      startDate: dayjs(data.startDate).utc().toISOString(),
      endDate: dayjs(data.endDate).utc().toISOString(),
      maxAccounts: data.maxAccounts === 0 ? -1 : data.maxAccounts,
      status: data.status,
    });
    reset();
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="New subscription plan">
      <form onSubmit={handleSubmit(submit as any)} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Start date */}
          <div>
            <label htmlFor="sub-start" className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">
              Start date <span className="text-(--danger)" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="sub-start"
              type="date"
              className="w-full bg-(--bg-elevated) border border-(--bg-border) rounded-lg px-3 py-2 text-[13px] text-(--text-primary) outline-none focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted) transition-all duration-150"
              aria-required="true"
              aria-invalid={errors.startDate ? true : undefined}
              {...register("startDate")}
            />
            {errors.startDate && (
              <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.startDate.message}</p>
            )}
          </div>

          {/* Expiry date */}
          <div>
            <label htmlFor="sub-end" className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">
              Expiry date <span className="text-(--danger)" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="sub-end"
              type="date"
              className="w-full bg-(--bg-elevated) border border-(--bg-border) rounded-lg px-3 py-2 text-[13px] text-(--text-primary) outline-none focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted) transition-all duration-150"
              aria-required="true"
              aria-invalid={errors.endDate ? true : undefined}
              {...register("endDate")}
            />
            {errors.endDate && (
              <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.endDate.message}</p>
            )}
          </div>

          {/* Max accounts */}
          <div>
            <label htmlFor="sub-max" className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">
              Max accounts <span className="text-(--danger)" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="sub-max"
              type="number"
              min="0"
              placeholder="e.g. 15"
              className="w-full bg-(--bg-elevated) border border-(--bg-border) rounded-lg px-3 py-2 text-[13px] text-(--text-primary) outline-none focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted) transition-all duration-150"
              aria-required="true"
              aria-describedby="sub-max-hint"
              aria-invalid={errors.maxAccounts ? true : undefined}
              {...register("maxAccounts")}
            />
            <p id="sub-max-hint" className="text-[10px] mt-1 text-(--text-muted)">Enter 0 for unlimited</p>
            {errors.maxAccounts && (
              <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.maxAccounts.message}</p>
            )}
          </div>

          {/* Status */}
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Status</p>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Dropdown
                  options={STATUS_OPTIONS}
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  width="w-full"
                />
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-(--bg-border)">
          <Button variant="secondary" type="button" onClick={handleClose}>Cancel</Button>
          <Button icon={Save} type="submit" loading={isSubmitting}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
