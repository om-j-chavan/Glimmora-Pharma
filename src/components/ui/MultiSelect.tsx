"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { DURATION, EASE } from "@/lib/motion/tokens";

/**
 * <MultiSelect> — the shared many-of-N picker.
 *
 * `ui/Dropdown` already has a `multi` mode, but its trigger only ever says
 * "3 selected": there is no way to see or remove an individual choice without
 * reopening the menu, and it has no keyboard traversal. This component is the
 * form-field counterpart — selections are visible as removable chips, the list is
 * searchable, and it is fully operable from the keyboard.
 *
 * ACCESSIBILITY — the ARIA 1.2 combobox-with-listbox-popup pattern:
 *   • the trigger is a real <button role="combobox"> carrying `aria-expanded`,
 *     `aria-controls` and (when open) `aria-activedescendant`;
 *   • the popup is `role="listbox" aria-multiselectable`, its rows `role="option"`
 *     with `aria-selected` — so a screen reader announces both the option and
 *     whether it is currently chosen;
 *   • every chip's remove control is a real button with its own accessible name
 *     ("Remove FDA"), so chips are reachable by Tab, not just by mouse;
 *   • the search box takes focus on open and owns `aria-activedescendant`, which
 *     lets a user type to filter and arrow through results without losing focus;
 *   • `aria-invalid` + `aria-describedby` wire the inline error to the control.
 *
 * KEYBOARD
 *   ↓ / ↑        open the menu, then move the active option (wraps)
 *   Home / End   first / last option
 *   Enter/Space  toggle the active option (menu stays open — this is a MULTI select)
 *   Backspace    with an empty search box, removes the last chip
 *   Escape       close and return focus to the trigger
 *
 * The menu is portalled to <body> so it escapes the `overflow` of a modal or a
 * scroll container, and repositions on scroll/resize exactly like `ui/Dropdown`.
 */

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional second line — searched alongside the label. */
  description?: string;
}

export interface MultiSelectProps {
  /** Currently selected values. Order is preserved as given. */
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  /** Field label. Rendered as a real <label> bound to the trigger. */
  label?: string;
  required?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Show the "Select all" action. Hide it when selecting everything is not a
   *  meaningful thing to do. */
  allowSelectAll?: boolean;
  /** Inline validation message. Also flips `aria-invalid` on the trigger. */
  error?: string;
  /** Helper text under the control (hidden while an error is showing). */
  hint?: string;
  disabled?: boolean;
  /** Trigger height: 'sm' matches ui/Input + DatePicker; 'md' matches Dropdown. */
  size?: "sm" | "md";
  className?: string;
}

export function MultiSelect({
  values,
  onChange,
  options,
  label,
  required = false,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  allowSelectAll = true,
  error,
  hint,
  disabled = false,
  size = "sm",
  className,
}: MultiSelectProps) {
  const reactId = useId();
  const triggerId = `${reactId}-trigger`;
  const listboxId = `${reactId}-listbox`;
  const errorId = `${reactId}-error`;
  const hintId = `${reactId}-hint`;
  const optionId = (index: number) => `${reactId}-opt-${index}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const reduced = usePrefersReducedMotion();

  const selected = useMemo(() => new Set(values), [values]);

  const labelOf = useCallback(
    (value: string) => options.find((o) => o.value === value)?.label ?? value,
    [options],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q),
    );
  }, [options, query]);

  /* ── Positioning (mirrors ui/Dropdown so both popups behave identically) ── */

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 6;
    const pad = 8;
    const measured = menuRef.current?.offsetHeight ?? 0;
    const needed = measured > 0 ? measured : 200;
    const spaceBelow = window.innerHeight - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    const flipAbove = needed > spaceBelow && spaceAbove > spaceBelow;
    const top = flipAbove ? Math.max(pad, rect.top - needed - gap) : rect.bottom + gap;

    const menuW = menuRef.current?.offsetWidth || rect.width;
    let left = rect.left;
    const maxLeft = window.innerWidth - pad - menuW;
    if (left > maxLeft) left = Math.max(pad, maxLeft);

    setMenuPos({ top, left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(raf);
  }, [open, updatePosition, filtered.length]);

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

  // Close on outside click.
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

  // Focus the search box on open so typing filters immediately.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Keep the active option in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)
      ?.scrollIntoView({ block: "nearest" });
    // optionId is derived from a stable id; activeIndex is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  // A filter change can leave the cursor past the end of the list.
  useEffect(() => {
    setActiveIndex((i) => (i >= filtered.length ? 0 : i));
  }, [filtered.length]);

  /* ── Mutations ── */

  const toggle = (value: string) => {
    onChange(selected.has(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  const remove = (value: string) => onChange(values.filter((v) => v !== value));

  const openMenu = () => {
    if (disabled) return;
    updatePosition();
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  /** One key handler for the trigger and the search box — the interaction model
   *  is the same wherever focus happens to be. */
  function handleKeyDown(e: KeyboardEvent) {
    if (disabled) return;

    if (e.key === "Escape") {
      if (open) { e.preventDefault(); closeMenu(); }
      return;
    }

    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(Math.max(0, filtered.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[activeIndex]) toggle(filtered[activeIndex].value);
        break;
      case " ":
        // Space types a space in the search box; only treat it as "toggle" when
        // the search box is empty (i.e. the user is browsing, not typing).
        if (query === "") {
          e.preventDefault();
          if (filtered[activeIndex]) toggle(filtered[activeIndex].value);
        }
        break;
      case "Backspace":
        if (query === "" && values.length > 0) {
          e.preventDefault();
          remove(values[values.length - 1]);
        }
        break;
      default:
        break;
    }
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.value));

  /* ── Popup ── */

  const menu = open && (
    <motion.div
      ref={menuRef}
      style={{
        position: "fixed",
        top: menuPos.top,
        left: menuPos.left,
        minWidth: menuPos.width,
        maxWidth: "calc(100vw - 16px)",
        maxHeight: Math.min(320, window.innerHeight - menuPos.top - 8),
        transformOrigin: "top",
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.fast, ease: EASE.out }}
      className="z-9999 flex flex-col rounded-[10px] border p-1 shadow-lg bg-(--bg-surface) border-(--bg-border)"
    >
      {/* Search + bulk actions */}
      <div className="p-1 pb-1.5 shrink-0">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-(--text-muted)"
            strokeWidth={2}
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={filtered.length ? optionId(activeIndex) : undefined}
            aria-label={label ? `Search ${label}` : "Search options"}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="w-full pl-7 pr-3 py-1.5 rounded-md text-[12px] outline-none border transition-all duration-150 bg-(--bg-elevated) border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand)"
          />
        </div>

        {(allowSelectAll || values.length > 0) && (
          <div className="flex items-center justify-between gap-2 mt-1.5 px-0.5">
            <span className="text-[10px] text-(--text-muted)">
              {values.length} selected
            </span>
            <div className="flex items-center gap-2">
              {allowSelectAll && (
                <button
                  type="button"
                  disabled={allVisibleSelected}
                  onClick={() => onChange([...new Set([...values, ...filtered.map((o) => o.value)])])}
                  className="text-[10px] font-semibold text-(--brand) hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {query ? "Select all matching" : "Select all"}
                </button>
              )}
              <button
                type="button"
                disabled={values.length === 0}
                onClick={() => onChange([])}
                className="text-[10px] font-semibold text-(--text-secondary) hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
              >
                Clear all
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="h-px my-1 bg-(--bg-border) shrink-0" />

      {/* Options */}
      <div
        id={listboxId}
        role="listbox"
        aria-multiselectable="true"
        aria-label={label ?? "Options"}
        className="overflow-y-auto min-h-0"
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-(--text-muted)">No results</div>
        ) : (
          filtered.map((opt, i) => {
            const isSelected = selected.has(opt.value);
            const isActive = i === activeIndex;
            return (
              <div
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => toggle(opt.value)}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left",
                  "text-[12px] font-medium cursor-pointer transition-colors duration-100",
                  isSelected ? "text-(--brand)" : "text-(--text-primary)",
                  isActive && (isSelected ? "bg-(--brand-muted)" : "bg-(--bg-hover)"),
                )}
              >
                <span
                  className={clsx(
                    "w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all duration-150",
                    isSelected ? "bg-(--brand) border-(--brand)" : "border-(--bg-border) bg-transparent",
                  )}
                  aria-hidden="true"
                >
                  {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{opt.label}</span>
                  {opt.description && (
                    <span className="block text-[11px] truncate mt-0.5 text-(--text-muted)">{opt.description}</span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );

  /* ── Control ── */

  return (
    <div className={clsx("w-full", className)}>
      {label && (
        <label htmlFor={triggerId} className="block text-[11px] font-medium mb-1 text-(--text-secondary)">
          {label} {required && <span className="text-(--danger)">*</span>}
        </label>
      )}

      {/*
        The chip strip and the open-affordance live in ONE bordered control so it
        reads as a single form field, but each chip's × is its own <button> — a
        button inside a button is invalid, which is why the container is a <div>
        and only the trailing "open" affordance is the real trigger.
      */}
      <div
        onClick={(e) => {
          // A click on the padding opens the menu; a click on a chip's × must not.
          if ((e.target as HTMLElement).closest("[data-chip-remove]")) return;
          if (!open) openMenu();
        }}
        className={clsx(
          "w-full flex items-center flex-wrap gap-1.5 rounded-lg border px-2 transition-all duration-150",
          size === "sm" ? "py-1.5 min-h-[38px]" : "py-1 min-h-[34px]",
          "bg-(--bg-elevated) text-(--text-primary)",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-(--brand)",
          error ? "border-(--danger)" : "border-(--bg-border)",
          open && !error && "border-(--brand) ring-[3px] ring-(--brand-muted)",
        )}
      >
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 max-w-full rounded-md pl-2 pr-1 py-0.5 text-[11px] font-medium bg-(--brand-muted) text-(--brand)"
          >
            <span className="truncate">{labelOf(value)}</span>
            <button
              type="button"
              data-chip-remove
              disabled={disabled}
              aria-label={`Remove ${labelOf(value)}`}
              onClick={(e) => { e.stopPropagation(); remove(value); }}
              className="shrink-0 rounded-sm p-0.5 hover:bg-(--brand) hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--brand) disabled:cursor-not-allowed"
            >
              <X className="w-2.5 h-2.5" strokeWidth={2.5} aria-hidden="true" />
            </button>
          </span>
        ))}

        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); if (open) closeMenu(); else openMenu(); }}
          onKeyDown={handleKeyDown}
          className={clsx(
            "flex-1 min-w-[7rem] flex items-center justify-between gap-2 text-left text-[13px] py-1",
            "bg-transparent border-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--brand) rounded",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <span className={clsx("truncate", values.length === 0 && "text-(--text-muted)")}>
            {values.length === 0 ? placeholder : ""}
          </span>
          <ChevronDown
            className={clsx("w-3.5 h-3.5 shrink-0 transition-transform duration-150 text-(--text-muted)", open && "rotate-180")}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-[11px] mt-1 text-(--danger)">{error}</p>
      ) : hint ? (
        <p id={hintId} className="text-[11px] mt-1 text-(--text-muted)">{hint}</p>
      ) : null}

      {menu && createPortal(menu, document.body)}
    </div>
  );
}
