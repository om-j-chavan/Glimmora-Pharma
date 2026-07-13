import clsx from "clsx";

/**
 * Token-styled checkbox. Prop shape mirrors Toggle.tsx (checked / onChange /
 * label / id / description / disabled) so the two are drop-in interchangeable,
 * plus an optional `error` like Input.tsx. Renders a real
 * `<input type="checkbox">` with a `<label htmlFor={id}>` for accessibility.
 */
interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id: string;
  description?: string;
  disabled?: boolean;
  error?: string;
}

export function Checkbox({ checked, onChange, label, id, description, disabled, error }: CheckboxProps) {
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.checked)}
          className={clsx(
            // Native control tinted with the brand token (checked = brand fill).
            "mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-(--brand)",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        />
        <label htmlFor={id} className={clsx("select-none", disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}>
          <span className="text-sm font-medium text-(--text-primary)">{label}</span>
          {description && (
            <p id={descId} className="text-xs text-(--text-muted)">{description}</p>
          )}
        </label>
      </div>
      {error && (
        <p id={errId} role="alert" className="text-[11px] text-(--danger) ml-[26px]">{error}</p>
      )}
    </div>
  );
}
