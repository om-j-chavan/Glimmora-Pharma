"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { ChangeControl as PrismaChangeControl } from "@prisma/client";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { createChangeControl } from "@/actions/change-control";
import {
  CHANGE_CONTROL_RISKS,
  CHANGE_TYPES,
} from "@/lib/change-control-constants";

// Mirrors the server CreateChangeControlSchema in src/actions/change-control.ts.
const formSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(4000),
  changeType: z.enum(CHANGE_TYPES),
  rationale: z
    .string()
    .min(10, "Rationale must be at least 10 characters")
    .max(2000),
  risk: z.enum(CHANGE_CONTROL_RISKS),
  impactAssessment: z.string().max(4000).optional(),
  affectedSystems: z.string().max(1000).optional(),
  targetImplementationDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  onClose: () => void;
  onCreated: (cc: PrismaChangeControl) => void;
}

export function NewChangeControlModal({ onClose, onCreated }: Props) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      changeType: "SOP",
      risk: "Medium",
    },
  });
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = async (data: FormValues) => {
    setBusy(true);
    setServerError(null);
    const result = await createChangeControl({
      title: data.title,
      description: data.description,
      changeType: data.changeType,
      rationale: data.rationale,
      risk: data.risk,
      ...(data.impactAssessment ? { impactAssessment: data.impactAssessment } : {}),
      ...(data.affectedSystems ? { affectedSystems: data.affectedSystems } : {}),
      ...(data.targetImplementationDate
        ? { targetImplementationDate: data.targetImplementationDate }
        : {}),
    });
    setBusy(false);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    onCreated(result.data as PrismaChangeControl);
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="New change control"
    >
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        A reference ID will be assigned on save.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-4"
      >
        {serverError && (
          <div role="alert" className="alert alert-danger text-[12px]">
            {serverError}
          </div>
        )}

        {/* SECTION 1: WHAT'S CHANGING */}
        <fieldset className="space-y-3">
          <legend
            className="text-[10px] font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            What's changing
          </legend>
          <Input
            id="cc-title"
            label="Title *"
            placeholder="e.g. Update SOP-QC-042 to require dual inspection"
            error={errors.title?.message}
            {...register("title")}
          />
          <div>
            <label
              htmlFor="cc-description"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Description *
            </label>
            <textarea
              id="cc-description"
              className="input text-[12px] min-h-[60px]"
              placeholder="What is being changed and how."
              {...register("description")}
            />
            {errors.description && (
              <p
                role="alert"
                className="text-[11px] mt-1"
                style={{ color: "var(--danger)" }}
              >
                {errors.description.message}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                Change type *
              </p>
              <Controller
                name="changeType"
                control={control}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={field.onChange}
                    width="w-full"
                    options={CHANGE_TYPES.map((t) => ({ value: t, label: t }))}
                  />
                )}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="cc-rationale"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Rationale *
            </label>
            <textarea
              id="cc-rationale"
              className="input text-[12px] min-h-[60px]"
              placeholder="Why this change is needed."
              {...register("rationale")}
            />
            {errors.rationale && (
              <p
                role="alert"
                className="text-[11px] mt-1"
                style={{ color: "var(--danger)" }}
              >
                {errors.rationale.message}
              </p>
            )}
          </div>
        </fieldset>

        {/* SECTION 2: RISK & IMPACT */}
        <fieldset className="space-y-3">
          <legend
            className="text-[10px] font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Risk &amp; impact
          </legend>
          <div>
            <p
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Risk *
            </p>
            <Controller
              name="risk"
              control={control}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={field.onChange}
                  width="w-full"
                  options={CHANGE_CONTROL_RISKS.map((r) => ({
                    value: r,
                    label: r,
                  }))}
                />
              )}
            />
          </div>
          <div>
            <label
              htmlFor="cc-impact"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Impact assessment
            </label>
            <textarea
              id="cc-impact"
              className="input text-[12px] min-h-[60px]"
              placeholder="What systems / processes / records are affected. (optional)"
              {...register("impactAssessment")}
            />
          </div>
          <Input
            id="cc-affected"
            label="Affected systems"
            placeholder="e.g. LIMS, MES, SOP-QC-042 (optional)"
            error={errors.affectedSystems?.message}
            {...register("affectedSystems")}
          />
        </fieldset>

        {/* SECTION 3: TIMELINE */}
        <fieldset>
          <legend
            className="text-[10px] font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Timeline
          </legend>
          <div>
            <label
              htmlFor="cc-target"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Target implementation date
            </label>
            <input
              id="cc-target"
              type="date"
              className="input text-[12px]"
              {...register("targetImplementationDate")}
            />
            {errors.targetImplementationDate && (
              <p
                role="alert"
                className="text-[11px] mt-1"
                style={{ color: "var(--danger)" }}
              >
                {errors.targetImplementationDate.message}
              </p>
            )}
          </div>
        </fieldset>

        <div
          className="flex justify-end gap-2 pt-2"
          style={{ borderTop: "1px solid var(--bg-border)" }}
        >
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            icon={Plus}
            loading={busy}
          >
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
