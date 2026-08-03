"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Check, ChevronDown, X, Search } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";

const LABEL = "block text-[11px] font-medium mb-1" as const;

/**
 * Regulatory Region picker for the Super Admin tenant create/edit modal — now
 * MULTI-SELECT. Backed by the DB-sourced ACTIVE regions (regions slice), whose
 * initial state is the REGULATORY_REGIONS constant so the picker is never empty.
 * Super Admin selects one or more existing values; the first selected becomes the
 * primary (shim) server-side. There is no runtime "add new value" path here.
 */
export function RegulatoryRegionField({
  value,
  onChange,
  required = false,
  error,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  /** Show the required marker (Stage 5 — ≥1 required on tenant create). */
  required?: boolean;
  /** Inline validation error (e.g. "At least one Regulatory Region is required"). */
  error?: string;
}) {
  // ACTIVE regions only (archivedAt=null), DB-sourced via getActiveRegions →
  // regions slice. GLOBAL is active + protected so it appears.
  const regions = useAppSelector((s) => s.regions.active);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Ensure a legacy/archived stored value (not in the active list) is still
  // selectable/removable, rather than vanishing from the option list.
  const options = useMemo(() => {
    const known = new Set(regions.map((r) => r.value));
    const extras = value.filter((v) => !known.has(v)).map((v) => ({ value: v, label: v }));
    return [...regions.map((r) => ({ value: r.value, label: r.label })), ...extras];
  }, [regions, value]);

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]); // append → order preserved; value[0] is primary
  };
  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  return (
    <div ref={wrapRef}>
      <label className={LABEL} style={{ color: "var(--text-secondary)" }}>
        Regulatory Regions {required && <span style={{ color: "var(--danger)" }}>*</span>}
        {value.length > 0 && <span style={{ color: "var(--text-muted)" }}> · primary: {labelOf(value[0])}</span>}
      </label>

      {/* Selected chips — click × to remove; the first is the primary (shim). */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {value.map((v, i) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: "var(--bg-border)", color: "var(--text-secondary)" }}
            >
              {i === 0 && <span aria-hidden="true" title="Primary region" style={{ color: "var(--brand)" }}>★</span>}
              {labelOf(v)}
              <button type="button" onClick={() => remove(v)} aria-label={`Remove ${labelOf(v)}`} className="border-none bg-transparent cursor-pointer p-0 leading-none" style={{ color: "var(--text-muted)" }}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-[13px]"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: value.length ? "var(--text-primary)" : "var(--text-muted)" }}
      >
        <span>{value.length ? `${value.length} region${value.length === 1 ? "" : "s"} selected` : "Select regions"}</span>
        <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
      </button>

      {/* Dropdown — searchable checkbox list. */}
      {open && (
        <div className="mt-1 rounded-lg overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }} role="listbox" aria-multiselectable="true">
          <div className="relative border-b" style={{ borderColor: "var(--bg-border)" }}>
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search regions…"
              aria-label="Search regions"
              className="w-full py-1.5 pl-8 pr-2 text-[12px] outline-none bg-transparent"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>No regions match.</li>
            ) : (
              filtered.map((o) => {
                const checked = value.includes(o.value);
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(o.value)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded" style={{ border: `1px solid ${checked ? "var(--brand)" : "var(--bg-border)"}`, background: checked ? "var(--brand)" : "transparent" }}>
                        {checked && <Check className="w-3 h-3" style={{ color: "var(--bg-surface)" }} aria-hidden="true" />}
                      </span>
                      {o.label}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {error && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
