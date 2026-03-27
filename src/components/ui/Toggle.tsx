interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id: string;
  disabled?: boolean;
  hideLabel?: boolean;
}

export function Toggle({ checked, onChange, label, description, id, disabled, hideLabel }: ToggleProps) {
  const labelId = `${id}-label`;
  const descId = description ? `${id}-desc` : undefined;

  const toggle = (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={descId}
      disabled={disabled}
      className={`toggle-track ${checked ? "on" : "off"}${disabled ? " opacity-60 cursor-not-allowed" : ""}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="toggle-thumb" />
    </button>
  );

  if (hideLabel) {
    return (
      <>
        {toggle}
        <span id={labelId} className="sr-only">{label}</span>
        {description && <span id={descId} className="sr-only">{description}</span>}
      </>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {toggle}
      <div>
        <span id={labelId} className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        {description && (
          <p id={descId} className="text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
