"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";

/**
 * Themed date picker — a custom popover calendar (NOT `<input type="date">`, so
 * no OS-native browser chrome). Value in/out is a plain `"YYYY-MM-DD"` string
 * (matching what a native date input emits), so it's a drop-in for existing
 * handlers. Pure presentational primitive — no business logic.
 *
 * Styling mirrors ui/Input.tsx (Tailwind v4 + CSS-variable tokens, clsx); the
 * popover reuses the Dropdown portal + outside-click + Escape pattern. Amber
 * (--brand) marks the selected day + today indicator (never browser blue).
 */
export interface DatePickerProps {
  id: string;
  /** "YYYY-MM-DD" or "" */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** "YYYY-MM-DD" — days before this are disabled. */
  min?: string;
  /** "YYYY-MM-DD" — days after this are disabled. */
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const baseField =
  "w-full bg-(--bg-surface) border rounded-lg py-2.5 px-3 text-[13px] outline-none transition-all duration-150 flex items-center justify-between gap-2 text-left";
const normalBorder =
  "border-(--bg-border) hover:border-(--brand) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)";
const errorBorder =
  "border-(--danger) focus:border-(--danger) focus:ring-[3px] focus:ring-(--danger-bg)";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export function DatePicker({
  id,
  value,
  onChange,
  label,
  error,
  hint,
  required,
  min,
  max,
  disabled,
  placeholder = "Select date",
  className,
}: DatePickerProps) {
  const selected = value && dayjs(value).isValid() ? dayjs(value) : null;
  const minD = min && dayjs(min).isValid() ? dayjs(min) : null;
  const maxD = max && dayjs(max).isValid() ? dayjs(max) : null;

  const [open, setOpen] = useState(false);
  // The month shown in the grid (first-of-month). Seeded from the value/today.
  const [viewMonth, setViewMonth] = useState(() => (selected ?? dayjs()).startOf("month"));
  // Roving-focus day for keyboard navigation.
  const [focusedDate, setFocusedDate] = useState(() => selected ?? dayjs());
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const isDisabledDay = useCallback(
    (d: dayjs.Dayjs) => (minD ? d.isBefore(minD, "day") : false) || (maxD ? d.isAfter(maxD, "day") : false),
    [minD, maxD],
  );

  // Position the popover below the trigger (flip up if it doesn't fit).
  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const calHeight = 340;
    const gap = 6;
    const pad = 8;
    const spaceBelow = window.innerHeight - r.bottom - pad;
    const flipUp = calHeight > spaceBelow && r.top - pad > spaceBelow;
    const left = Math.max(pad, Math.min(r.left, window.innerWidth - 288 - pad));
    setPos({ top: flipUp ? Math.max(pad, r.top - calHeight - gap) : r.bottom + gap, left });
  }, []);

  const openCalendar = () => {
    if (disabled) return;
    setViewMonth((selected ?? dayjs()).startOf("month"));
    setFocusedDate(selected ?? dayjs());
    updatePos();
    setOpen(true);
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const selectDay = (d: dayjs.Dayjs) => {
    if (isDisabledDay(d)) return;
    onChange(d.format("YYYY-MM-DD"));
    close();
  };

  // Outside-click + reposition while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollResize = () => updatePos();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [open, updatePos]);

  // Move keyboard focus to the focused day button.
  useEffect(() => {
    if (!open) return;
    const sel = `[data-day="${focusedDate.format("YYYY-MM-DD")}"]`;
    popoverRef.current?.querySelector<HTMLButtonElement>(sel)?.focus();
  }, [open, focusedDate, viewMonth]);

  const moveFocus = (next: dayjs.Dayjs) => {
    setFocusedDate(next);
    if (!next.isSame(viewMonth, "month")) setViewMonth(next.startOf("month"));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "Escape": e.preventDefault(); close(); break;
      case "ArrowLeft": e.preventDefault(); moveFocus(focusedDate.subtract(1, "day")); break;
      case "ArrowRight": e.preventDefault(); moveFocus(focusedDate.add(1, "day")); break;
      case "ArrowUp": e.preventDefault(); moveFocus(focusedDate.subtract(7, "day")); break;
      case "ArrowDown": e.preventDefault(); moveFocus(focusedDate.add(7, "day")); break;
      case "PageUp": e.preventDefault(); moveFocus(focusedDate.subtract(1, "month")); break;
      case "PageDown": e.preventDefault(); moveFocus(focusedDate.add(1, "month")); break;
      case "Home": e.preventDefault(); moveFocus(focusedDate.startOf("week")); break;
      case "End": e.preventDefault(); moveFocus(focusedDate.endOf("week")); break;
      case "Enter":
      case " ": e.preventDefault(); selectDay(focusedDate); break;
      default: break;
    }
  };

  // 6-week grid starting on the Sunday on/before the 1st.
  const gridStart = viewMonth.startOf("month").subtract(viewMonth.startOf("month").day(), "day");
  const days = Array.from({ length: 42 }, (_, i) => gridStart.add(i, "day"));
  const today = dayjs();

  const popover = open && (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-label="Choose date"
      onKeyDown={onKeyDown}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 288 }}
      className="z-9999 rounded-2xl border p-3 shadow-lg bg-(--bg-elevated) border-(--bg-border)"
    >
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setViewMonth((m) => m.subtract(1, "month"))}
          className="w-7 h-7 rounded-md flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-(--bg-hover) text-(--text-secondary)"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="text-[13px] font-semibold text-(--text-primary)" aria-live="polite">
          {viewMonth.format("MMMM YYYY")}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setViewMonth((m) => m.add(1, "month"))}
          className="w-7 h-7 rounded-md flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-(--bg-hover) text-(--text-secondary)"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-(--text-muted) py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5" role="grid">
        {days.map((d) => {
          const inMonth = d.isSame(viewMonth, "month");
          const isSelected = !!selected && d.isSame(selected, "day");
          const isToday = d.isSame(today, "day");
          const dayDisabled = isDisabledDay(d);
          const isFocused = d.isSame(focusedDate, "day");
          return (
            <button
              key={d.format("YYYY-MM-DD")}
              type="button"
              role="gridcell"
              data-day={d.format("YYYY-MM-DD")}
              aria-selected={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={d.format("dddd, MMMM D, YYYY")}
              disabled={dayDisabled}
              tabIndex={isFocused ? 0 : -1}
              onClick={() => selectDay(d)}
              className={clsx(
                "h-8 rounded-md text-[12px] flex items-center justify-center border-none cursor-pointer disabled:cursor-not-allowed transition-colors",
                !inMonth && "opacity-40",
                dayDisabled && "opacity-30",
                isSelected
                  ? "bg-(--brand) text-white font-semibold"
                  : isToday
                    ? "bg-transparent text-(--brand) font-semibold ring-1 ring-(--brand)"
                    : "bg-transparent text-(--text-primary) hover:bg-(--bg-hover)",
              )}
            >
              {d.date()}
            </button>
          );
        })}
      </div>
    </div>
  );

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

      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          baseField,
          error ? errorBorder : normalBorder,
          // Interactive → pointer; disabled → not-allowed (the disabled: variant
          // wins over cursor-pointer by :disabled specificity).
          "cursor-pointer disabled:cursor-not-allowed",
          disabled && "opacity-50",
        )}
      >
        <span className={selected ? "text-(--text-primary)" : "text-(--text-muted)"}>
          {selected ? selected.format("MMM D, YYYY") : placeholder}
        </span>
        <Calendar className="w-3.5 h-3.5 shrink-0 text-(--text-muted)" aria-hidden="true" />
      </button>

      {hint && !error && <p id={hintId} className="text-[11px] text-(--text-muted) mt-1">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-[11px] text-(--danger) mt-1">{error}</p>}

      {popover && typeof document !== "undefined" && createPortal(popover, document.body)}
    </div>
  );
}
