"use client";

/**
 * Feature 2 — Plain-English Record Search (generic, reusable).
 *
 * Drives the AI-marked search bar on the CAPA list, the Dashboard, and any
 * other list screen. Each "source" supplies its records, a field accessor,
 * and table columns. With one source it behaves like a single-module search;
 * with several it can search "across all modules" (the spec's advanced
 * option) and renders grouped results. Translation happens server-side via
 * /api/ai/search (audited, never executes); execution is client-side.
 */

import { useState, useMemo, useEffect, type CSSProperties, type ReactNode } from "react";
import { Search, Sparkles, X, FileText, Download, ListFilter, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AIButton } from "@/components/ai";
import { aiSearchSend, AiChatError, type SearchResultResponse } from "@/lib/aiChat";
import { executeSearch, type SearchCondition, type SearchFilters } from "@/lib/aiSearch";
import { friendlyAiError } from "@/lib/friendlyError";

const SAVED_KEY = "glimmora-saved-searches";
const SCOPE_ALL = "all";

const EXAMPLES: Record<string, string[]> = {
  capa: ["open CAPAs at Site B", "closed CAPAs last quarter", "high risk open CAPAs"],
  deviation: ["open critical deviations", "unplanned deviations last month", "overdue deviations"],
  finding: ["open Part 11 findings", "critical findings this quarter", "overdue findings"],
  system: ["systems due for revalidation", "high risk systems", "not validated systems"],
  all: ["overdue items everywhere", "critical open records", "anything closed late last quarter"],
};

// Method syntax (not arrow properties) so a SearchSource<CAPA> is assignable
// to SearchSource<unknown> — TS treats method params bivariantly, which is
// what lets the typed builders feed the generic component's sources array.
export interface SearchColumn<T = unknown> {
  key: string;
  header: string;
  value(r: T): string;                // used for CSV + default cell
  render?(r: T): ReactNode;           // optional rich cell (chips, badges)
}

export interface SearchSource<T = unknown> {
  module: string;                     // "capa" | "deviation" | "finding" | "system"
  label: string;                      // "CAPA", "Deviation", …
  records: T[];
  getValue(rec: T, field: string): unknown;
  columns: SearchColumn<T>[];
  rowId(r: T): string;
  onOpen?(id: string): void;
}

interface Entry {
  result: SearchResultResponse;
  conditions: SearchCondition[];      // editable copy (Edit filters)
}

function bandStyle(band: string): CSSProperties {
  const map: Record<string, [string, string]> = {
    HIGH: ["#dcfce7", "#15803d"], MEDIUM: ["#fef3c7", "#b45309"], LOW: ["#fee2e2", "#b91c1c"],
  };
  const [bg, fg] = map[band] ?? ["var(--bg-surface)", "var(--text-muted)"];
  return { background: bg, color: fg, padding: "1px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700 };
}

function condLabel(c: SearchCondition): string {
  const v = Array.isArray(c.value) ? c.value.join(" – ") : String(c.value);
  const opTxt: Record<string, string> = { eq: "=", in: "∈", gte: "≥", lte: "≤", gt: ">", lt: "<", between: "between" };
  return `${c.field} ${opTxt[c.op] ?? c.op} ${v}`;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

interface Props {
  sources: SearchSource[];
  title?: string;
  defaultScope?: string;
  allowCrossModule?: boolean;
}

export function SmartRecordSearch({ sources, title = "Search", defaultScope, allowCrossModule }: Props) {
  // No AI credential is read here: calls go to the same-origin proxy, which
  // authenticates the session and attaches the upstream token server-side.

  const multi = sources.length > 1;
  const crossOk = allowCrossModule ?? multi;

  const [scope, setScope] = useState(defaultScope ?? (multi ? SCOPE_ALL : sources[0]?.module ?? "capa"));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [showEditFor, setShowEditFor] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSavedSearches(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
  }, []);

  function persistSaved(next: string[]) {
    setSavedSearches(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  const activeSources = useMemo(
    () => (scope === SCOPE_ALL ? sources : sources.filter((s) => s.module === scope)),
    [scope, sources],
  );
  // Matched rows per module, recomputed when conditions/records change.
  const rowsByModule = useMemo(() => {
    const out: Record<string, unknown[]> = {};
    for (const src of activeSources) {
      const entry = entries[src.module];
      if (entry?.result.status === "understood") {
        out[src.module] = executeSearch(
          src.records,
          { logic: (entry.result.filters.logic as "AND" | "OR") ?? "AND", conditions: entry.conditions } as SearchFilters,
          src.getValue,
        );
      }
    }
    return out;
  }, [activeSources, entries]);

  const hasResults = Object.keys(entries).length > 0;
  const totalCount = activeSources.reduce((n, s) => n + (rowsByModule[s.module]?.length ?? 0), 0);

  async function runSearch(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true); setError(null); setShowEditFor(null);
    try {
      const results = await Promise.all(activeSources.map((s) => aiSearchSend(q, s.module)));
      const next: Record<string, Entry> = {};
      activeSources.forEach((s, i) => {
        next[s.module] = { result: results[i], conditions: (results[i].filters?.conditions ?? []) as SearchCondition[] };
      });
      setEntries(next);
    } catch (e) {
      console.error("[smart-search] failed", e);
      if (e instanceof AiChatError && e.status === 503) setError("Search is unavailable right now. Please try again shortly.");
      else setError(friendlyAiError(e, "Couldn't run that search. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function clearAll() { setQuery(""); setEntries({}); setShowEditFor(null); setError(null); }

  function removeCondition(module: string, idx: number) {
    setEntries((prev) => {
      const e = prev[module];
      if (!e) return prev;
      return { ...prev, [module]: { ...e, conditions: e.conditions.filter((_, i) => i !== idx) } };
    });
  }

  function saveCurrentSearch() {
    const q = query.trim();
    if (!q || savedSearches.includes(q)) return;
    persistSaved([q, ...savedSearches].slice(0, 8));
  }

  function exportModule(src: SearchSource, rows: unknown[]) {
    if (!rows.length) return;
    downloadCsv(
      `${src.module}-search-${Date.now()}.csv`,
      src.columns.map((c) => c.header),
      rows.map((r) => src.columns.map((c) => c.value(r))),
    );
  }

  const restingExamples = EXAMPLES[scope] ?? EXAMPLES.all;

  function renderTable(src: SearchSource, rows: unknown[]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
              {src.columns.map((c) => (
                <th key={c.key} className="py-1.5 pr-3 font-semibold uppercase text-[10px] tracking-wide">{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={src.rowId(r)} onClick={() => src.onOpen?.(src.rowId(r))} className={src.onOpen ? "cursor-pointer" : ""} style={{ borderTop: "1px solid var(--bg-border)" }}>
                {src.columns.map((c) => (
                  <td key={c.key} className="py-2 pr-3" style={{ color: "var(--text-secondary)" }}>{c.render ? c.render(r) : c.value(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderModuleBlock(src: SearchSource) {
    const entry = entries[src.module];
    if (!entry) return null;
    const { result } = entry;
    const rows = rowsByModule[src.module] ?? [];

    if (result.status === "unclear") {
      return (
        <div key={src.module} className="space-y-2">
          {multi && <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>{src.label}</p>}
          <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--bg-surface)", color: "var(--text-secondary)" }}>
            <span className="font-semibold" style={{ color: "var(--ai-accent)" }}>AI </span>
            I’m not sure what you meant for {src.label}. Try naming a status, date, severity, or site.
          </p>
          <div className="flex flex-wrap gap-2">
            {(result.suggestions.length ? result.suggestions : EXAMPLES[src.module] ?? []).map((s, i) => (
              <button key={i} type="button" onClick={() => { setQuery(s); void runSearch(s); }} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border cursor-pointer" style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)", background: "var(--bg-surface)" }}>
                <FileText className="w-3 h-3" aria-hidden="true" /> {s}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (result.status !== "understood") return null;

    return (
      <div key={src.module} className="space-y-2">
        {/* Understood-as line + confidence + Edit filters */}
        <div className="rounded-lg px-3 py-2 text-[12px] flex items-start gap-2 flex-wrap" style={{ background: "var(--ai-muted)", color: "var(--text-primary)" }}>
          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--ai-accent)" }}>
            <Sparkles className="w-3 h-3" aria-hidden="true" /> {multi ? `${src.label} —` : "Understood as:"}
          </span>
          <span className="flex-1">{result.understood_as}</span>
          <span style={bandStyle(result.confidence_band)}>{result.confidence_band} · {Math.round(result.confidence * 100)}%</span>
          <button type="button" onClick={() => setShowEditFor((m) => (m === src.module ? null : src.module))} className="underline cursor-pointer border-0 bg-transparent p-0" style={{ color: "var(--ai-accent)" }}>Edit filters</button>
        </div>

        {/* Editable filter pills */}
        {showEditFor === src.module && (
          <div className="flex flex-wrap items-center gap-2">
            {entry.conditions.length === 0 && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>No filters.</span>}
            {entry.conditions.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}>
                {condLabel(c)}
                <button type="button" aria-label={`Remove filter ${c.field}`} onClick={() => removeCondition(src.module, i)} className="border-0 bg-transparent cursor-pointer p-0 opacity-70"><X className="w-3 h-3" aria-hidden="true" /></button>
              </span>
            ))}
          </div>
        )}

        {result.unsupported_terms.length > 0 && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Couldn’t apply: {result.unsupported_terms.join(", ")} — refine if needed.</p>
        )}

        {rows.length > 0 ? (
          <>
            {renderTable(src, rows)}
            <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Found {rows.length} {src.label}{rows.length === 1 ? "" : "s"}.</p>
              <Button type="button" variant="secondary" size="xs" icon={Download} onClick={() => exportModule(src, rows)}>Export</Button>
            </div>
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>No {src.label}s matched that. Try a wider date range, or remove a filter.</p>
        )}
      </div>
    );
  }

  return (
    <section aria-label="Plain-English record search" className="rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--card-border)" }}>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--card-text)" }}>
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" style={{ color: "var(--ai-accent)" }} /> {title}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: "var(--ai-muted)", color: "var(--ai-accent)" }}>
          {hasResults ? `${totalCount} result${totalCount === 1 ? "" : "s"}` : "List"}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Resting state — example chips + saved searches */}
        {!hasResults && !busy && !error && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {restingExamples.map((c) => (
                <button key={c} type="button" onClick={() => { setQuery(c); void runSearch(c); }} className="text-[11px] px-2.5 py-1 rounded-full border cursor-pointer" style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)", background: "var(--bg-surface)" }}>“{c}”</button>
              ))}
            </div>
            {savedSearches.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Saved</span>
                {savedSearches.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full" style={{ background: "var(--ai-muted)", color: "var(--ai-accent)" }}>
                    <button type="button" onClick={() => { setQuery(s); void runSearch(s); }} className="border-0 bg-transparent cursor-pointer p-0" style={{ color: "inherit" }}><Bookmark className="w-3 h-3 inline mr-1" aria-hidden="true" />{s}</button>
                    <button type="button" aria-label={`Remove saved ${s}`} onClick={() => persistSaved(savedSearches.filter((x) => x !== s))} className="border-0 bg-transparent cursor-pointer p-0 opacity-60" style={{ color: "inherit" }}><X className="w-3 h-3" aria-hidden="true" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {busy && <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Reading your request…</p>}
        {error && <p role="alert" className="text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}

        {/* Results — one block per active module */}
        {hasResults && !busy && (
          <div className="space-y-4">
            {activeSources.map((src) => renderModuleBlock(src))}
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="xs" icon={Bookmark} onClick={saveCurrentSearch} disabled={!query.trim()}>Save this search</Button>
              <Button type="button" variant="primary" size="xs" icon={ListFilter} onClick={clearAll}>Open full list</Button>
            </div>
          </div>
        )}

        {/* Search bar + scope — anchored at the bottom, chat-input style, so
            typing and results both read top-to-bottom above it instead of
            the input sitting above an empty resting state. */}
        <div className="flex items-center gap-2">
          {crossOk && (
            <select value={scope} onChange={(e) => { setScope(e.target.value); clearAll(); }} className="input text-[12px]" aria-label="Search scope" style={{ maxWidth: 150 }}>
              <option value={SCOPE_ALL}>All modules</option>
              {sources.map((s) => <option key={s.module} value={s.module}>{s.label}</option>)}
            </select>
          )}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              className="input text-[13px] w-full pl-9 pr-9"
              placeholder="Ask in plain words…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runSearch(query); } }}
              disabled={busy}
              aria-label="Search records in plain English"
            />
            {(query || hasResults) && (
              <button type="button" aria-label="Clear search" onClick={clearAll} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded border-0 cursor-pointer bg-transparent" style={{ color: "var(--text-muted)" }}><X className="w-3.5 h-3.5" aria-hidden="true" /></button>
            )}
          </div>
          {/* The search itself is an AI call (NL → filter translation), so the
              trigger wears the AI accent. Icon-only: the placeholder already
              says "Ask in plain words…". */}
          <AIButton iconOnly loading={busy} aria-label="Run search" onClick={() => runSearch(query)} disabled={!query.trim()} />
        </div>
      </div>
    </section>
  );
}
