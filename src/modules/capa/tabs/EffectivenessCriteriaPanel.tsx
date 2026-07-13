"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Pencil, Plus, Save, Target, Trash2 } from "lucide-react";
import type { CAPAEffectivenessCriterion } from "@prisma/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import {
  createCriterion,
  updateCriterion,
  deleteCriterion,
  loadCriteriaForCAPA,
} from "@/actions/effectiveness-criteria";
import { LOCKED_CAPA_STATUSES } from "@/lib/evidence-lock";

interface EffectivenessCriteriaPanelProps {
  capaId: string;
  capaStatus: string;
  /** Disables every mutation regardless of lock state. */
  readOnly?: boolean;
  /** Optional callback invoked after every successful items load with the
   *  current count, so the parent can update tab badges without re-querying. */
  onCountChange?: (count: number) => void;
}

// Mirrors the server-side CriterionSchema in src/actions/effectiveness-criteria.ts.
// Kept in sync deliberately so failures show inline pre-submit; server still
// re-validates as the security boundary.
const formSchema = z.object({
  description: z.string().min(5, "Add a description (at least 5 characters)"),
  targetMetric: z.string().min(3, "Add a target metric (at least 3 characters)"),
  measurementMethod: z
    .string()
    .min(5, "Add a measurement method (at least 5 characters)"),
  targetValue: z
    .string()
    .min(1, "Target value is required")
    .max(500, "Target value must be 500 characters or fewer"),
  monitoringPeriod: z
    .string()
    .min(3, "Add a monitoring period (at least 3 characters)"),
});
type CriterionFormValues = z.infer<typeof formSchema>;

const EMPTY_FORM: CriterionFormValues = {
  description: "",
  targetMetric: "",
  measurementMethod: "",
  targetValue: "",
  monitoringPeriod: "",
};

export function EffectivenessCriteriaPanel({
  capaId,
  capaStatus,
  readOnly = false,
  onCountChange,
}: EffectivenessCriteriaPanelProps) {
  const [items, setItems] = useState<CAPAEffectivenessCriterion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CAPAEffectivenessCriterion | null>(null);
  const [deleting, setDeleting] = useState<CAPAEffectivenessCriterion | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [savedPopup, setSavedPopup] = useState(false);
  const [deletedPopup, setDeletedPopup] = useState(false);

  // The whole-tab lock state mirrors EvidenceCollectionPanel's pattern:
  // either the CAPA itself has progressed (status check) or any criterion
  // is individually locked (per-row lockedAt set by lockCriteriaForCAPA).
  // .some() and .every() align in practice — lockCriteriaForCAPA flips
  // every row at once — but .some() defends against partial-lock edge
  // cases.
  const capaLocked = LOCKED_CAPA_STATUSES.has(capaStatus);
  const anyRowLocked = (items ?? []).some((c) => c.lockedAt !== null);
  const isLocked = capaLocked || anyRowLocked;
  const disabled = readOnly || isLocked;

  // Reads via the server-action wrapper (same shape as
  // loadEvidenceForCAPA in src/actions/evidence.ts) — server actions can
  // be invoked directly from client components, so no API route needed.
  const refresh = useCallback(async () => {
    setLoadError(null);
    const result = await loadCriteriaForCAPA(capaId);
    if (!result.success) {
      setLoadError(result.error);
      setItems([]);
      setLoading(false);
      return;
    }
    const data = result.data as CAPAEffectivenessCriterion[];
    setItems(data);
    setLoading(false);
    onCountChange?.(data.length);
  }, [capaId, onCountChange]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  if (loading && items === null) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="py-8 text-center text-[12px]"
        style={{ color: "var(--text-muted)" }}
      >
        Loading effectiveness criteria…
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="alert alert-danger">
        {loadError}
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id="subpanel-criteria"
      aria-labelledby="subtab-criteria"
      tabIndex={0}
      className="space-y-3"
    >
      {isLocked && (
        <div
          role="status"
          className="alert alert-info flex items-start gap-2"
        >
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[12px] font-semibold">
              Effectiveness criteria locked
            </p>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              CAPA has progressed to QA review. Re-open the CAPA to modify.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3
          className="text-[13px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Success criteria
          <span
            className="ml-2 text-[11px] font-normal"
            style={{ color: "var(--text-muted)" }}
          >
            {items?.length ?? 0} defined
          </span>
        </h3>
        {!disabled && (
          <Button
            icon={Plus}
            size="sm"
            onClick={() => {
              setEditing(null);
              setAddOpen(true);
            }}
          >
            Add criterion
          </Button>
        )}
      </div>

      {(items?.length ?? 0) === 0 ? (
        <div
          className="rounded-lg p-6 text-center"
          style={{
            background: "var(--bg-elevated)",
            border: "1px dashed var(--bg-border)",
          }}
        >
          <Target
            className="w-6 h-6 mx-auto mb-2"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <p
            className="text-[12px] font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            How will you know the fix worked?
          </p>
          {/* "Add criteria before submitting for QA review" copy was
              removed — the SubmissionChecklist on the CAPA Overview tab
              and the persistent next-step banner above the tab strip
              both already carry that signal. The empty-state still
              prompts the user to add a criterion via the button below. */}
          <p
            className="text-[11px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Define at least one measurable success criterion (a number + a timeframe). Required before this CAPA can be submitted.
          </p>
          {!disabled && (
            <Button
              icon={Plus}
              size="sm"
              onClick={() => {
                setEditing(null);
                setAddOpen(true);
              }}
            >
              Add first criterion
            </Button>
          )}
        </div>
      ) : (
        <ul role="list" className="space-y-2">
          {(items ?? []).map((c) => (
            <li key={c.id}>
              <CriterionCard
                criterion={c}
                disabled={disabled}
                onEdit={() => {
                  setEditing(c);
                  setAddOpen(true);
                }}
                onDelete={() => setDeleting(c)}
              />
            </li>
          ))}
        </ul>
      )}

      {addOpen && (
        <CriterionFormModal
          mode={editing ? "edit" : "add"}
          initial={editing ? toFormValues(editing) : EMPTY_FORM}
          onClose={() => {
            setAddOpen(false);
            setEditing(null);
          }}
          onSubmit={async (data) => {
            const result = editing
              ? await updateCriterion(editing.id, data)
              : await createCriterion(capaId, data);
            if (!result.success) return result;
            setAddOpen(false);
            setEditing(null);
            setSavedPopup(true);
            await refresh();
            return result;
          }}
        />
      )}

      {deleting && (
        <Popup
          isOpen
          variant="confirmation"
          title="Delete criterion?"
          description={`Delete criterion: "${deleting.description.slice(0, 120)}${deleting.description.length > 120 ? "…" : ""}"? This cannot be undone.`}
          onDismiss={() => {
            if (!deleteBusy) {
              setDeleting(null);
              setDeleteError(null);
            }
          }}
          actions={[
            {
              label: "Cancel",
              style: "ghost",
              onClick: () => {
                if (!deleteBusy) {
                  setDeleting(null);
                  setDeleteError(null);
                }
              },
            },
            {
              label: deleteBusy ? "Deleting…" : "Delete",
              style: "primary",
              onClick: async () => {
                if (!deleting) return;
                setDeleteBusy(true);
                setDeleteError(null);
                const result = await deleteCriterion(deleting.id);
                setDeleteBusy(false);
                if (!result.success) {
                  setDeleteError(result.error);
                  return;
                }
                setDeleting(null);
                setDeletedPopup(true);
                await refresh();
              },
            },
          ]}
        />
      )}

      {deleteError && (
        <div role="alert" className="alert alert-danger">
          {deleteError}
        </div>
      )}

      <Popup
        isOpen={savedPopup}
        variant="success"
        title="Criterion saved"
        description="Effectiveness criterion stored against this CAPA."
        onDismiss={() => setSavedPopup(false)}
      />
      <Popup
        isOpen={deletedPopup}
        variant="success"
        title="Criterion deleted"
        description="The audit log retains a snapshot of the deleted criterion."
        onDismiss={() => setDeletedPopup(false)}
      />
    </div>
  );
}

/* ── Per-criterion card ── */

function CriterionCard({
  criterion,
  disabled,
  onEdit,
  onDelete,
}: {
  criterion: CAPAEffectivenessCriterion;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className="rounded-lg p-3"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
      aria-labelledby={`crit-${criterion.id}-heading`}
    >
      <div className="flex items-start gap-3 mb-2">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "var(--brand-muted)" }}
          aria-hidden="true"
        >
          <Target className="w-4 h-4" style={{ color: "var(--brand)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4
            id={`crit-${criterion.id}-heading`}
            className="text-[13px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {criterion.description}
          </h4>
          <p
            className="text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            Created by {criterion.createdBy}
            {criterion.updatedBy && criterion.updatedBy !== criterion.createdBy
              ? ` · last edited by ${criterion.updatedBy}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {criterion.lockedAt && (
            <Badge variant="amber">
              <Lock className="w-3 h-3" aria-hidden="true" /> Locked
            </Badge>
          )}
          {!disabled && (
            <>
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit criterion: ${criterion.description.slice(0, 60)}`}
                className="p-1 rounded border-none bg-transparent cursor-pointer"
                style={{ color: "var(--brand)" }}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete criterion: ${criterion.description.slice(0, 60)}`}
                className="p-1 rounded border-none bg-transparent cursor-pointer"
                style={{ color: "var(--danger)" }}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <div>
          <dt
            className="font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Target metric
          </dt>
          <dd style={{ color: "var(--text-primary)" }}>{criterion.targetMetric}</dd>
        </div>
        <div>
          <dt
            className="font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Target value
          </dt>
          <dd style={{ color: "var(--text-primary)" }}>{criterion.targetValue}</dd>
        </div>
        <div className="col-span-2">
          <dt
            className="font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Measurement method
          </dt>
          <dd style={{ color: "var(--text-primary)" }}>
            {criterion.measurementMethod}
          </dd>
        </div>
        <div className="col-span-2">
          <dt
            className="font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Monitoring period
          </dt>
          <dd style={{ color: "var(--text-primary)" }}>
            {criterion.monitoringPeriod}
          </dd>
        </div>
      </dl>
    </article>
  );
}

/* ── Add / Edit modal ── */

function CriterionFormModal({
  mode,
  initial,
  onClose,
  onSubmit,
}: {
  mode: "add" | "edit";
  initial: CriterionFormValues;
  onClose: () => void;
  onSubmit: (
    data: CriterionFormValues,
  ) => Promise<{ success: true } | { success: false; error: string; fieldErrors?: Record<string, string[]> }>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CriterionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial,
  });

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={mode === "edit" ? "Edit effectiveness criterion" : "Add effectiveness criterion"}
    >
      <form
        onSubmit={handleSubmit(async (data) => {
          setBusy(true);
          setServerError(null);
          const result = await onSubmit(data);
          setBusy(false);
          if (!result.success) {
            setServerError(result.error);
          }
        })}
        noValidate
        className="space-y-4"
      >
        {serverError && (
          <div role="alert" className="alert alert-danger text-[12px]">
            {serverError}
          </div>
        )}
        <div>
          <label
            htmlFor="crit-description"
            className="block text-[11px] font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Description *
          </label>
          <textarea
            id="crit-description"
            className="input text-[12px] min-h-[60px]"
            placeholder="What outcome we expect, e.g. zero recurrence of OOS results"
            {...register("description")}
          />
          {errors.description && (
            <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
              {errors.description.message}
            </p>
          )}
        </div>

        <Input
          id="crit-target-metric"
          label="Target Metric *"
          placeholder="e.g. recurrence rate, compliance %, cycle time"
          error={errors.targetMetric?.message}
          {...register("targetMetric")}
        />

        <div>
          <label
            htmlFor="crit-measurement-method"
            className="block text-[11px] font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Measurement Method *
          </label>
          <textarea
            id="crit-measurement-method"
            className="input text-[12px] min-h-[60px]"
            placeholder="How we measure it — system / report / cadence"
            {...register("measurementMethod")}
          />
          {errors.measurementMethod && (
            <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
              {errors.measurementMethod.message}
            </p>
          )}
        </div>

        <Input
          id="crit-target-value"
          label="Target Value *"
          placeholder="e.g. ≤ 1 deviation per 100 batches"
          error={errors.targetValue?.message}
          {...register("targetValue")}
        />

        <Input
          id="crit-monitoring-period"
          label="Monitoring Period *"
          placeholder="e.g. 6 months post-implementation"
          error={errors.monitoringPeriod?.message}
          {...register("monitoringPeriod")}
        />

        <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--bg-border)" }}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            icon={mode === "edit" ? Save : Plus}
            type="submit"
            loading={busy}
          >
            {mode === "edit" ? "Save changes" : "Add criterion"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function toFormValues(c: CAPAEffectivenessCriterion): CriterionFormValues {
  return {
    description: c.description,
    targetMetric: c.targetMetric,
    measurementMethod: c.measurementMethod,
    targetValue: c.targetValue,
    monitoringPeriod: c.monitoringPeriod,
  };
}
