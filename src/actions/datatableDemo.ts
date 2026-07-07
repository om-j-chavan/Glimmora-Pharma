"use server";

import { requireAuth } from "@/lib/auth";
import type { ServerQuery } from "@/components/table/DataTable";
import { DEMO_ROWS, type DemoRow } from "@/modules/demo/demoData";

/**
 * Stubbed SERVER-MODE fetcher proving <DataTable mode="server">. Returns one
 * whole-set-sorted, filtered PAGE per call — exactly what a real server
 * (Audit/Support) would do. Critically it SORTS THE FULL SET then paginates, so
 * a sort re-queries the whole set rather than re-ordering only loaded rows.
 */
export async function demoFetchRows(q: ServerQuery): Promise<{ rows: DemoRow[]; total: number }> {
  await requireAuth();
  let rows = [...DEMO_ROWS];

  const search = (q.search ?? "").trim().toLowerCase();
  if (search) rows = rows.filter((r) => r.name.toLowerCase().includes(search) || r.id.toLowerCase().includes(search));

  const cat = q.filters?.category;
  if (cat) rows = rows.filter((r) => r.category === cat);

  if (q.sort) {
    const { key, dir } = q.sort;
    rows.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[key];
      const bv = (b as unknown as Record<string, unknown>)[key];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
  }

  const total = rows.length;
  const start = (q.page - 1) * q.pageSize;
  return { rows: rows.slice(start, start + q.pageSize), total };
}
