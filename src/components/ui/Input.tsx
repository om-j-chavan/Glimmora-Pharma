import { type InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export type InputType = "text" | "email" | "password" | "search" | "url" | "tel" | "number";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  id: string;
  type?: InputType;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  /** Optional element rendered inside the field on the right edge (e.g. a
   *  password show/hide toggle). The input gains right padding so its text
   *  never sits under the adornment. */
  rightAdornment?: React.ReactNode;
}

const baseCls =
  "w-full bg-(--bg-surface) border rounded-lg py-2.5 text-[13px] text-(--text-primary) placeholder:text-(--text-muted) outline-none transition-all duration-150";

const normalBorder =
  "border-(--bg-border) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)";

const errorBorder =
  "border-(--danger) focus:border-(--danger) focus:ring-[3px] focus:ring-(--danger-bg)";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { label, id, type = "text", error, hint, required, icon: Icon, rightAdornment, className, disabled, ...rest },
    ref,
  ) {
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const describedBy = error ? errorId : hint ? hintId : undefined;
    const hasIcon = !!Icon;

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

        <div className="relative">
          {Icon && (
            <Icon
              className="w-3.5 h-3.5 text-(--text-muted) absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
          )}
          <input
            ref={ref}
            id={id}
            type={type}
            disabled={disabled}
            required={required}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={clsx(
              baseCls,
              hasIcon ? "pl-9.5" : "pl-3",
              rightAdornment ? "pr-9" : "pr-3",
              error ? errorBorder : normalBorder,
              disabled && "opacity-50 cursor-not-allowed",
              // When the app supplies its own show/hide control (rightAdornment)
              // on a password field, hide the browser-native reveal (Edge/IE
              // ::-ms-reveal) so only ONE eye shows. Password fields WITHOUT a
              // custom toggle keep the native reveal as their sole control.
              type === "password" && rightAdornment && "suppress-native-reveal",
            )}
            {...rest}
          />
          {rightAdornment && (
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
              {rightAdornment}
            </div>
          )}
        </div>

        {hint && !error && (
          <p id={hintId} className="text-[11px] text-(--text-muted) mt-1">{hint}</p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-[11px] text-(--danger) mt-1">{error}</p>
        )}
      </div>
    );
  },
);
