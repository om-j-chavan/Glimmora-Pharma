import { type TextareaHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  id: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

const baseCls =
  "w-full bg-(--bg-surface) border rounded-lg py-2.5 px-3 text-[13px] text-(--text-primary) placeholder:text-(--text-muted) outline-none transition-all duration-150 resize-none";

const normalBorder =
  "border-(--bg-border) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)";

const errorBorder =
  "border-(--danger) focus:border-(--danger) focus:ring-[3px] focus:ring-(--danger-bg)";

/**
 * <Textarea> — the shared multi-line counterpart to <Input>, with the same
 * label / hint / error / required affordances. Replaces the module's
 * hand-rolled `<textarea className="input">` blocks.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, id, error, hint, required, className, disabled, rows = 2, ...rest }, ref) {
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const describedBy = error ? errorId : hint ? hintId : undefined;

    return (
      <div className={className}>
        {label && (
          <label htmlFor={id} className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">
            {label}
            {required && (
              <>
                <span className="text-(--danger)" aria-hidden="true"> *</span>
                <span className="sr-only"> (required)</span>
              </>
            )}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          disabled={disabled}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(baseCls, error ? errorBorder : normalBorder, disabled && "opacity-50 cursor-not-allowed")}
          {...rest}
        />
        {hint && !error && <p id={hintId} className="text-[11px] text-(--text-muted) mt-1">{hint}</p>}
        {error && <p id={errorId} role="alert" className="text-[11px] text-(--danger) mt-1">{error}</p>}
      </div>
    );
  },
);
