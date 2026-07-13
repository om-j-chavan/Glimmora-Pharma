/**
 * Shared synthetic data for the <DataTable> verification demo (client + server
 * tables). Plain module (no "use server") so both the client demo component and
 * the server-action fetcher import the same 25 rows.
 *
 * Value distribution is deliberate: rows 0–9 (the first unsorted server page)
 * carry 100…109; rows 10–24 carry 15…1. So the GLOBAL minimum value (1) is NOT
 * on page 1 — proving a server sort must re-query the whole set, not re-order
 * only the loaded rows.
 */
export interface DemoRow {
  id: string;
  name: string;
  category: string;
  value: number;
  enabled: boolean;
}

export const DEMO_ROWS: DemoRow[] = Array.from({ length: 25 }, (_, i) => ({
  id: `R${String(i + 1).padStart(2, "0")}`,
  name: `Item ${i + 1}`,
  category: i % 2 === 0 ? "Alpha" : "Beta",
  value: i < 10 ? 100 + i : 25 - i,
  enabled: i % 3 !== 0,
}));
