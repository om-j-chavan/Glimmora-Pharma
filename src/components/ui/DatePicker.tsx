"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";

/**
 * Themed date pickers — a custom popover calendar (NOT `<input type="date">`, so
 * no OS-native browser chrome). Value in/out is a plain `"YYYY-MM-DD"` string
 * (matching what a native date input emits), so it's a drop-in for existing
 * handlers. Pure presentational primitives — no business logic.
 *
 * Two exports, ONE calendar implementation:
 *   • {@link DatePicker}      — single day.
 *   • {@link DateRangePicker} — start + end pair, for workflows that span days
 *     (e.g. an inspection's start/end). The end is optional so a single-day
 *     range can be committed without a second click.
 *
 * Styling mirrors ui/Input.tsx (Tailwind v4 + CSS-variable tokens, clsx); the
 * popover reuses the Dropdown portal + outside-click + Escape pattern. Amber
 * (--brand) marks the selected day + today indicator (never browser blue).
 *
 * Accessibility: the trigger is a real button with `aria-haspopup="dialog"`; the
 * grid supports arrow/PageUp/PageDown/Home/End roving focus, Enter/Space to
 * select and Escape to dismiss (returning focus to the trigger).
 */

/* ══════════════════════════════════════════════════════════════════════════
 * Shared internals
 * ══════════════════════════════════════════════════════════════════════════ */

const baseField =
  "w-full bg-(--bg-surface) border rounded-lg py-2.5 px-3 text-[13px] outline-none transition-all duration-150 flex items-center justify-between gap-2 text-left";
const normalBorder =
  "border-(--bg-border) hover:border-(--brand) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)";
const errorBorder =
  "border-(--danger) focus:border-(--danger) focus:ring-[3px] focus:ring-(--danger-bg)";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

/** DD/MM/YYYY is the app-wide display format (the tenant default in
 *  useTenantConfig, and what every read surface renders). Display only — value
 *  in/out stays "YYYY-MM-DD". */
const DISPLAY_FORMAT = "DD/MM/YYYY";

const POPOVER_WIDTH = 288;
const POPOVER_HEIGHT = 372; // grid + month nav + footer

/** Parse a "YYYY-MM-DD" string, tolerating empty/null/invalid input. */
function parse(value: string | null | undefined): dayjs.Dayjs | null {
  if (!value) return null;
  const d = dayjs(value);
  return d.isValid() ? d : null;
}

/** Format for display; empty string when there is no valid date. */
function display(d: dayjs.Dayjs | null): string {
  return d ? d.format(DISPLAY_FORMAT) : "";
}

/**
 * Fixed-position popover placement below the trigger, flipping above when the
 * calendar would overflow the viewport. Shared by both pickers.
 */
function usePopoverPosition(
  open: boolean,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  popoverRef: React.RefObject<HTMLDivElement | null>,
  onDismiss: () => void,
) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const gap = 6;
    const pad = 8;
    const spaceBelow = window.innerHeight - r.bottom - pad;
    const flipUp = POPOVER_HEIGHT > spaceBelow && r.top - pad > spaceBelow;
    const left = Math.max(
      pad,
      Math.min(r.left, window.innerWidth - POPOVER_WIDTH - pad),
    );
    setPos({
      top: flipUp ? Math.max(pad, r.top - POPOVER_HEIGHT - gap) : r.bottom + gap,
      left,
    });
  }, [triggerRef]);

  // Outside-click + reposition while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      onDismiss();
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
  }, [open, updatePos, onDismiss, triggerRef, popoverRef]);

  return { pos, updatePos };
}

interface CalendarPopoverProps {
  ariaLabel: string;
  viewMonth: dayjs.Dayjs;
  onViewMonthChange: (m: dayjs.Dayjs) => void;
  focusedDate: dayjs.Dayjs;
  onFocusedDateChange: (d: dayjs.Dayjs) => void;
  isDisabledDay: (d: dayjs.Dayjs) => boolean;
  /** Solid amber fill — the selected day, or a range endpoint. */
  isSelectedDay: (d: dayjs.Dayjs) => boolean;
  /** Soft tint — a day strictly between the range endpoints. */
  isInRange?: (d: dayjs.Dayjs) => boolean;
  onSelectDay: (d: dayjs.Dayjs) => void;
  onEscape: () => void;
  /** Optional footer row (hint text, Clear/Done actions). */
  footer?: ReactNode;
}

/**
 * The calendar surface itself — month/year navigation, weekday headers and the
 * 6-week day grid. Owns no selection state: every visual decision is delegated
 * to the predicate props so the single and range pickers share one grid.
 */
function CalendarPopover({
  ariaLabel,
  viewMonth,
  onViewMonthChange,
  focusedDate,
  onFocusedDateChange,
  isDisabledDay,
  isSelectedDay,
  isInRange,
  onSelectDay,
  onEscape,
  footer,
}: CalendarPopoverProps) {
  const moveFocus = (next: dayjs.Dayjs) => {
    onFocusedDateChange(next);
    if (!next.isSame(viewMonth, "month")) onViewMonthChange(next.startOf("month"));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "Escape": e.preventDefault(); onEscape(); break;
      case "ArrowLeft": e.preventDefault(); moveFocus(focusedDate.subtract(1, "day")); break;
      case "ArrowRight": e.preventDefault(); moveFocus(focusedDate.add(1, "day")); break;
      case "ArrowUp": e.preventDefault(); moveFocus(focusedDate.subtract(7, "day")); break;
      case "ArrowDown": e.preventDefault(); moveFocus(focusedDate.add(7, "day")); break;
      case "PageUp": e.preventDefault(); moveFocus(focusedDate.subtract(e.shiftKey ? 12 : 1, "month")); break;
      case "PageDown": e.preventDefault(); moveFocus(focusedDate.add(e.shiftKey ? 12 : 1, "month")); break;
      case "Home": e.preventDefault(); moveFocus(focusedDate.startOf("week")); break;
      case "End": e.preventDefault(); moveFocus(focusedDate.endOf("week")); break;
      case "Enter":
      case " ": e.preventDefault(); onSelectDay(focusedDate); break;
      default: break;
    }
  };

  // 6-week grid starting on the Sunday on/before the 1st.
  const gridStart = viewMonth
    .startOf("month")
    .subtract(viewMonth.startOf("month").day(), "day");
  const days = Array.from({ length: 42 }, (_, i) => gridStart.add(i, "day"));
  const today = dayjs();

  const navBtn =
    "w-7 h-7 rounded-md flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-(--bg-hover) text-(--text-secondary)";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="rounded-2xl border p-3 shadow-lg bg-(--bg-elevated) border-(--bg-border)"
    >
      {/* Month + year navigation. Double chevrons jump a year so a distant
          inspection date is 2 clicks away instead of 12. */}
      <div className="flex items-center justify-between mb-2 gap-1">
        <div className="flex items-center">
          <button type="button" aria-label="Previous year" className={navBtn}
            onClick={() => onViewMonthChange(viewMonth.subtract(1, "year"))}>
            <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Previous month" className={navBtn}
            onClick={() => onViewMonthChange(viewMonth.subtract(1, "month"))}>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <span
          className="text-[13px] font-semibold text-(--text-primary) whitespace-nowrap"
          aria-live="polite"
        >
          {viewMonth.format("MMMM YYYY")}
        </span>
        <div className="flex items-center">
          <button type="button" aria-label="Next month" className={navBtn}
            onClick={() => onViewMonthChange(viewMonth.add(1, "month"))}>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next year" className={navBtn}
            onClick={() => onViewMonthChange(viewMonth.add(1, "year"))}>
            <ChevronsRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
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
          const selected = isSelectedDay(d);
          const inRange = !selected && (isInRange?.(d) ?? false);
          const isToday = d.isSame(today, "day");
          const dayDisabled = isDisabledDay(d);
          const isFocused = d.isSame(focusedDate, "day");
          return (
            <button
              key={d.format("YYYY-MM-DD")}
              type="button"
              role="gridcell"
              data-day={d.format("YYYY-MM-DD")}
              aria-selected={selected}
              aria-current={isToday ? "date" : undefined}
              aria-label={d.format("dddd, MMMM D, YYYY")}
              disabled={dayDisabled}
              tabIndex={isFocused ? 0 : -1}
              onClick={() => onSelectDay(d)}
              className={clsx(
                "h-8 rounded-md text-[12px] flex items-center justify-center border-none cursor-pointer disabled:cursor-not-allowed transition-colors",
                !inMonth && "opacity-40",
                dayDisabled && "opacity-30",
                selected
                  ? "bg-(--brand) text-white font-semibold"
                  : inRange
                    ? "bg-(--brand-muted) text-(--text-primary)"
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

      {footer}
    </div>
  );
}

/** Shared label + hint/error chrome so both pickers render identical form rows. */
function FieldShell({
  id,
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
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
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-[11px] text-(--text-muted) mt-1">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-[11px] text-(--danger) mt-1">{error}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * DatePicker — single day
 * ══════════════════════════════════════════════════════════════════════════ */

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
  /** Renders a small ✕ to reset the field to "" once a date is set. */
  clearable?: boolean;
}

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
  clearable,
}: DatePickerProps) {
  const selected = parse(value);
  const minD = parse(min);
  const maxD = parse(max);

  const [open, setOpen] = useState(false);
  // The month shown in the grid (first-of-month). Seeded from the value/today.
  const [viewMonth, setViewMonth] = useState(() => (selected ?? dayjs()).startOf("month"));
  // Roving-focus day for keyboard navigation.
  const [focusedDate, setFocusedDate] = useState(() => selected ?? dayjs());

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const isDisabledDay = useCallback(
    (d: dayjs.Dayjs) =>
      (minD ? d.isBefore(minD, "day") : false) || (maxD ? d.isAfter(maxD, "day") : false),
    [minD, maxD],
  );

  const dismiss = useCallback(() => setOpen(false), []);
  const { pos, updatePos } = usePopoverPosition(open, triggerRef, popoverRef, dismiss);

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

  // Move keyboard focus to the focused day button.
  useEffect(() => {
    if (!open) return;
    const sel = `[data-day="${focusedDate.format("YYYY-MM-DD")}"]`;
    popoverRef.current?.querySelector<HTMLButtonElement>(sel)?.focus();
  }, [open, focusedDate, viewMonth]);

  const popover = open && (
    <div
      ref={popoverRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
      className="z-9999"
    >
      <CalendarPopover
        ariaLabel="Choose date"
        viewMonth={viewMonth}
        onViewMonthChange={setViewMonth}
        focusedDate={focusedDate}
        onFocusedDateChange={setFocusedDate}
        isDisabledDay={isDisabledDay}
        isSelectedDay={(d) => !!selected && d.isSame(selected, "day")}
        onSelectDay={selectDay}
        onEscape={() => close()}
      />
    </div>
  );

  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
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
          {selected ? display(selected) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onChange(""); }
              }}
              className="rounded p-0.5 cursor-pointer text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-hover)"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </span>
          )}
          <Calendar className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
        </span>
      </button>

      {popover && typeof document !== "undefined" && createPortal(popover, document.body)}
    </FieldShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * DateRangePicker — start + optional end
 * ══════════════════════════════════════════════════════════════════════════ */

export interface DateRange {
  /** "YYYY-MM-DD" or "" */
  start: string;
  /** "YYYY-MM-DD" or "" — always "" while only a start is chosen. */
  end: string;
}

export interface DateRangePickerProps {
  id: string;
  value: DateRange;
  onChange: (value: DateRange) => void;
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

/**
 * Start/end pair on ONE calendar. First click sets the start and clears the
 * end; the second click sets the end (a click before the start restarts the
 * range there instead of producing an inverted one, so an invalid range is
 * unreachable through the UI). The end stays optional — "Done" commits a
 * start-only range for a single-day event, which is why `end` is a plain ""
 * rather than a required second value.
 */
export function DateRangePicker({
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
  placeholder = "Select date range",
  className,
}: DateRangePickerProps) {
  const start = parse(value.start);
  const end = parse(value.end);
  const minD = parse(min);
  const maxD = parse(max);

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => (start ?? dayjs()).startOf("month"));
  const [focusedDate, setFocusedDate] = useState(() => start ?? dayjs());
  // True once a start has been picked in THIS session and the next click should
  // land the end. Reset whenever the popover opens.
  const [pickingEnd, setPickingEnd] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const isDisabledDay = useCallback(
    (d: dayjs.Dayjs) =>
      (minD ? d.isBefore(minD, "day") : false) || (maxD ? d.isAfter(maxD, "day") : false),
    [minD, maxD],
  );

  const dismiss = useCallback(() => setOpen(false), []);
  const { pos, updatePos } = usePopoverPosition(open, triggerRef, popoverRef, dismiss);

  const openCalendar = () => {
    if (disabled) return;
    setViewMonth((start ?? dayjs()).startOf("month"));
    setFocusedDate(start ?? dayjs());
    setPickingEnd(false);
    updatePos();
    setOpen(true);
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    setPickingEnd(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const selectDay = (d: dayjs.Dayjs) => {
    if (isDisabledDay(d)) return;
    const iso = d.format("YYYY-MM-DD");
    // Second click AFTER a start that exists → close the range.
    if (pickingEnd && start && !d.isBefore(start, "day")) {
      onChange({ start: start.format("YYYY-MM-DD"), end: iso });
      close();
      return;
    }
    // First click, or a click before the current start → (re)start here.
    onChange({ start: iso, end: "" });
    setPickingEnd(true);
  };

  useEffect(() => {
    if (!open) return;
    const sel = `[data-day="${focusedDate.format("YYYY-MM-DD")}"]`;
    popoverRef.current?.querySelector<HTMLButtonElement>(sel)?.focus();
  }, [open, focusedDate, viewMonth]);

  const triggerText = useMemo(() => {
    if (!start) return placeholder;
    if (!end) return `${display(start)} → …`;
    return `${display(start)} → ${display(end)}`;
  }, [start, end, placeholder]);

  const footer = (
    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-(--bg-border)">
      <span className="text-[10px] text-(--text-muted)">
        {pickingEnd || (start && !end) ? "Pick an end date, or Done" : "Pick a start date"}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => { onChange({ start: "", end: "" }); setPickingEnd(false); }}
          className="text-[11px] px-2 py-1 rounded-md border-none bg-transparent cursor-pointer text-(--text-secondary) hover:bg-(--bg-hover)"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => close()}
          className="text-[11px] px-2 py-1 rounded-md border-none cursor-pointer bg-(--brand) text-white font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );

  const popover = open && (
    <div
      ref={popoverRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
      className="z-9999"
    >
      <CalendarPopover
        ariaLabel="Choose date range"
        viewMonth={viewMonth}
        onViewMonthChange={setViewMonth}
        focusedDate={focusedDate}
        onFocusedDateChange={setFocusedDate}
        isDisabledDay={isDisabledDay}
        isSelectedDay={(d) =>
          (!!start && d.isSame(start, "day")) || (!!end && d.isSame(end, "day"))
        }
        isInRange={(d) => !!start && !!end && d.isAfter(start, "day") && d.isBefore(end, "day")}
        onSelectDay={selectDay}
        onEscape={() => close()}
        footer={footer}
      />
    </div>
  );

  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
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
          "cursor-pointer disabled:cursor-not-allowed",
          disabled && "opacity-50",
        )}
      >
        <span className={start ? "text-(--text-primary)" : "text-(--text-muted)"}>
          {triggerText}
        </span>
        <Calendar className="w-3.5 h-3.5 shrink-0 text-(--text-muted)" aria-hidden="true" />
      </button>

      {popover && typeof document !== "undefined" && createPortal(popover, document.body)}
    </FieldShell>
  );
}
