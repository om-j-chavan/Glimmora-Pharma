"use client";

import { Minus, Plus } from "lucide-react";

/**
 * Shared – / + numeric stepper atom. Value is always clamped to [min, max];
 * the buttons and the (still-editable) number input both go through the same
 * clamp, so a caller never sees an out-of-range value. Presentational only.
 */
export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
  /** Red border when the current value violates a caller rule (e.g. < usage). */
  invalid?: boolean;
}

export function Stepper({ value, onChange, min = 0, max = Number.POSITIVE_INFINITY, step = 1, disabled = false, ariaLabel, invalid = false }: StepperProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const set = (v: number) => onChange(clamp(Number.isFinite(v) ? Math.round(v) : min));

  return (
    <div
      className="inline-flex items-center rounded-lg border overflow-hidden"
      style={{ borderColor: invalid ? "var(--danger)" : "var(--bg-border)" }}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => set(value - step)}
        disabled={disabled || value <= min}
        aria-label="Decrease"
        className="w-7 h-7 flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-(--bg-hover) text-(--text-secondary) disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => set(e.target.valueAsNumber)}
        className="w-11 text-center text-[12px] tabular-nums border-none bg-transparent outline-none text-(--text-primary) disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => set(value + step)}
        disabled={disabled || value >= max}
        aria-label="Increase"
        className="w-7 h-7 flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-(--bg-hover) text-(--text-secondary) disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
