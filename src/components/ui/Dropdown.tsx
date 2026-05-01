"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search } from "lucide-react";
import clsx from "clsx";

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: string;
  badgeVariant?: "default" | "red" | "amber" | "green";
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

export interface DropdownSection {
  label?: string;
  options: DropdownOption[];
}

export interface DropdownProps {
  sections?: DropdownSection[];
  options?: DropdownOption[];
  value?: string;
  values?: string[];
  onChange?: (value: string) => void;
  onChangeMulti?: (values: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  multi?: boolean;
  triggerLabel?: ReactNode;
  width?: string;
  menuWidth?: string;
  actionMode?: boolean;
  disabled?: boolean;
  className?: string;
}

const badgeColors: Record<string, string> = {
  red: "bg-(--danger-bg) text-(--danger)",
  amber: "bg-(--warning-bg) text-(--warning)",
  green: "bg-(--success-bg) text-(--success)",
  default: "bg-(--brand-muted) text-(--brand)",
};

export function Dropdown({
  sections,
  options,
  value,
  values = [],
  onChange,
  onChangeMulti,
  placeholder = "Select...",
  searchable = false,
  searchPlaceholder = "Search...",
  multi = false,
  triggerLabel,
  width = "w-48",
  menuWidth,
  actionMode = false,
  disabled = false,
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const allSections: DropdownSection[] =
    sections ?? (options ? [{ options }] : []);

  // Position menu below trigger; flip above only if clearly not enough space.
  // Uses the menu's actual rendered height (if already mounted) so short menus
  // don't float far above the trigger.
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const actualMenuHeight = menuRef.current?.offsetHeight ?? 0;
    const gap = 6;
    const viewportPad = 8;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
    const spaceAbove = rect.top - viewportPad;

    // Prefer below. Only flip up if the menu's actual height doesn't fit below
    // AND there is more room above. Use a small minimum height for the first
    // paint before the menu has rendered (actualMenuHeight === 0).
    const neededHeight = actualMenuHeight > 0 ? actualMenuHeight : 120;
    const flipAbove = neededHeight > spaceBelow && spaceAbove > spaceBelow;

    const top = flipAbove
      ? Math.max(viewportPad, rect.top - neededHeight - gap)
      : rect.bottom + gap;

    setMenuPos({ top, left: rect.left, width: rect.width });
  }, []);

  // Open handler
  const toggleOpen = () => {
    if (disabled) return;
    if (!open) updatePosition();
    setOpen((o) => !o);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const update = () => updatePosition();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, updatePosition]);

  // Re-measure once the menu has rendered so the flip-up position uses the
  // real menu height instead of the 120px pre-render estimate.
  useEffect(() => {
    if (!open) return;
    // requestAnimationFrame ensures the menu has painted and offsetHeight is accurate
    const raf = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(raf);
  }, [open, updatePosition]);

  // Filter by search
  const filtered: DropdownSection[] = allSections
    .map((s) => ({
      ...s,
      options: s.options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.description?.toLowerCase().includes(query.toLowerCase()),
      ),
    }))
    .filter((s) => s.options.length > 0);

  // Trigger display text
  const triggerText = (() => {
    if (triggerLabel) return null;
    if (multi) {
      if (values.length === 0) return null;
      if (values.length === 1) {
        return allSections.flatMap((s) => s.options).find((o) => o.value === values[0])?.label;
      }
      return `${values.length} selected`;
    }
    if (!value) return null;
    return allSections.flatMap((s) => s.options).find((o) => o.value === value)?.label;
  })();

  function handleSelect(opt: DropdownOption) {
    if (opt.disabled) return;
    if (actionMode) {
      opt.onClick?.();
      setOpen(false);
      return;
    }
    if (multi) {
      const next = values.includes(opt.value)
        ? values.filter((v) => v !== opt.value)
        : [...values, opt.value];
      onChangeMulti?.(next);
    } else {
      onChange?.(opt.value);
      setOpen(false);
      setQuery("");
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const menu = open && (
    <div
      ref={menuRef}
      role="listbox"
      aria-multiselectable={multi || undefined}
      onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQuery(""); } }}
      style={{
        position: "fixed",
        top: menuPos.top,
        left: menuPos.left,
        minWidth: menuPos.width,
        maxHeight: Math.min(256, window.innerHeight - menuPos.top - 8),
      }}
      className={clsx(
        "z-9999 rounded-[10px] border p-1 shadow-lg",
        "overflow-y-auto",
        menuWidth,
        "bg-(--bg-surface) border-(--bg-border)",
      )}
    >
      {/* Search */}
      {searchable && (
        <div className="p-1 pb-0.5 mb-1 sticky top-0 bg-(--bg-surface)">
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-(--text-muted)"
              strokeWidth={2}
            />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-7 pr-3 py-1.5 rounded-md text-[12px] outline-none border transition-all duration-150 bg-(--bg-elevated) border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand)"
            />
          </div>
        </div>
      )}

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="px-3 py-4 text-center text-[12px] text-(--text-muted)">
          No results
        </div>
      )}

      {/* Sections */}
      {filtered.map((section, si) => (
        <div key={si}>
          {si > 0 && <div className="h-px my-1 bg-(--bg-border)" />}

          {section.label && (
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
              {section.label}
            </div>
          )}

          {section.options.map((opt) => {
            const isSelected = multi
              ? values.includes(opt.value)
              : value === opt.value;

            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onClick={() => handleSelect(opt)}
                className={clsx(
                  "w-full flex items-center gap-2.5",
                  "px-2 py-2 rounded-md text-left",
                  "text-[12px] font-medium",
                  "border-none outline-none",
                  "transition-colors duration-100",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  opt.danger && "text-(--danger) hover:bg-(--danger-bg)",
                  !opt.danger && isSelected && "bg-(--brand-muted) text-(--brand)",
                  !opt.danger && !isSelected && "text-(--text-primary) hover:bg-(--bg-hover)",
                )}
              >
                {multi && (
                  <div
                    className={clsx(
                      "w-4 h-4 rounded flex items-center justify-center shrink-0",
                      "border transition-all duration-150",
                      isSelected
                        ? "bg-(--brand) border-(--brand)"
                        : "border-(--bg-border) bg-transparent",
                    )}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>
                )}

                {opt.icon && (
                  <opt.icon
                    className={clsx(
                      "w-3.5 h-3.5 shrink-0",
                      opt.danger ? "text-(--danger)" : isSelected ? "text-(--brand)" : "text-(--text-muted)",
                    )}
                    strokeWidth={2}
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="truncate">{opt.label}</div>
                  {opt.description && (
                    <div className="text-[11px] truncate mt-0.5 text-(--text-muted)">{opt.description}</div>
                  )}
                </div>

                {opt.badge && (
                  <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto shrink-0", badgeColors[opt.badgeVariant ?? "default"])}>
                    {opt.badge}
                  </span>
                )}

                {!multi && isSelected && !actionMode && (
                  <Check className="w-3.5 h-3.5 shrink-0 text-(--brand)" strokeWidth={2.5} />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className={clsx("relative inline-block", width, className)} onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          "w-full flex items-center justify-between gap-2",
          "px-3 py-2 rounded-lg text-[13px] font-medium",
          "border outline-none transition-all duration-150",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "bg-(--bg-elevated) border-(--bg-border) text-(--text-primary)",
          "hover:border-(--brand)",
          open && "border-(--brand) ring-[3px] ring-(--brand-muted)",
        )}
      >
        <span className="flex-1 text-left truncate">
          {triggerLabel ?? (
            triggerText ? (
              <span>{triggerText}</span>
            ) : (
              <span className="text-(--text-muted)">{placeholder}</span>
            )
          )}
        </span>
        <ChevronDown
          className={clsx(
            "w-3.5 h-3.5 shrink-0 transition-transform duration-150 text-(--text-muted)",
            open && "rotate-180",
          )}
          strokeWidth={2}
        />
      </button>

      {/* Menu rendered via portal to escape overflow clipping */}
      {menu && createPortal(menu, document.body)}
    </div>
  );
}