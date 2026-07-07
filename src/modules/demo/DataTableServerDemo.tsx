"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { PageLayout, TabSection } from "@/components/layout/PageLayout";
import { DataTable, type DataColumn, type RowMenuItem } from "@/components/table/DataTable";
import { demoFetchRows } from "@/actions/datatableDemo";
import { DEMO_ROWS, type DemoRow } from "./demoData";

/**
 * Verification demo for the primitives — NOT linked from any nav.
 *  - CLIENT table (25 in-memory rows): proves 10 + Show more, header-sort,
 *    search/filter/clear, an INLINE toggle (writes immediately), a ⋮ menu with a
 *    VISIBLE-but-disabled Delete, and bulk selection with a guard.
 *  - SERVER table: proves server mode — sorting re-queries the whole set and
 *    Show more appends server pages.
 * Also demonstrates <TabSection> (per-tab description + primary action).
 */
export function DataTableServerDemo() {
  const toast = useToast();
  const [rows, setRows] = useState<DemoRow[]>(DEMO_ROWS);

  // Inline toggle — writes immediately (here: local state; a real page persists
  // to the server, optimistic + revert).
  const toggleEnabled = (r: DemoRow) =>
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));

  const clientColumns: DataColumn<DemoRow>[] = [
    { key: "id", label: "ID", sortable: true, width: "w-[12%]" },
    { key: "name", label: "Name", sortable: true },
    { key: "category", label: "Category", width: "w-[16%]", render: (r) => <Badge variant={r.category === "Alpha" ? "blue" : "gray"}>{r.category}</Badge> },
    { key: "value", label: "Value", sortable: true, align: "right", width: "w-[12%]" },
    { key: "enabled", label: "Enabled", width: "w-[14%]", render: (r) => <Toggle id={`en-${r.id}`} checked={r.enabled} onChange={() => toggleEnabled(r)} label={`${r.name} enabled`} hideLabel /> },
  ];

  const clientMenu = (r: DemoRow): RowMenuItem[] => [
    { label: "Edit", icon: Pencil, onClick: () => toast.success(`Edit ${r.name}`) },
    // Alpha rows: Delete stays VISIBLE but disabled, with a reason.
    r.category === "Alpha"
      ? { label: "Delete", icon: Trash2, danger: true, disabled: true, disabledReason: "Alpha rows are protected and can't be deleted." }
      : { label: "Delete", icon: Trash2, danger: true, onClick: () => setRows((prev) => prev.filter((x) => x.id !== r.id)) },
  ];

  const serverColumns: DataColumn<DemoRow>[] = [
    { key: "id", label: "ID", sortable: true, width: "w-[15%]" },
    { key: "name", label: "Name", sortable: true },
    { key: "category", label: "Category", width: "w-[20%]" },
    { key: "value", label: "Value", sortable: true, align: "right", width: "w-[15%]" },
  ];

  return (
    <PageLayout
      title="DataTable — verification demo"
      description="Proves both data modes of the shared table primitive. Not linked from nav."
      actions={[{ label: "Docs", variant: "secondary", onClick: () => toast.success("(demo secondary action)") }, { label: "New item", variant: "primary", onClick: () => toast.success("(demo primary action)") }]}
    >
      <div className="space-y-8">
        <TabSection description="CLIENT mode — all rows in memory; search / sort / show-more run in-browser." action={{ label: "Add (demo)", variant: "primary", onClick: () => toast.success("(tab primary action)") }}>
          <div data-testid="client-table">
          <DataTable<DemoRow>
            mode="client"
            data={rows}
            rowKey={(r) => r.id}
            ariaLabel="Client demo table"
            columns={clientColumns}
            pageSize={10}
            search={{ placeholder: "Search items…", keys: ["name", "id"] }}
            filters={[{ key: "category", label: "categories", options: [{ value: "Alpha", label: "Alpha" }, { value: "Beta", label: "Beta" }] }]}
            rowMenu={clientMenu}
            bulk={{
              actions: [{
                label: "Delete selected",
                variant: "danger",
                icon: Trash2,
                guard: (sel) => sel.some((r) => r.category === "Alpha") ? { ok: false, reason: "Selection includes protected Alpha rows." } : { ok: true },
                onClick: (sel) => setRows((prev) => prev.filter((x) => !sel.some((s) => s.id === x.id))),
              }],
            }}
          />
          </div>
        </TabSection>

        <TabSection description="SERVER mode — search / SORT / show-more re-query the fetcher (whole-set sort, appended pages).">
          <div data-testid="server-table">
          <DataTable<DemoRow>
            mode="server"
            fetcher={demoFetchRows}
            rowKey={(r) => r.id}
            ariaLabel="Server demo table"
            columns={serverColumns}
            pageSize={10}
            search={{ placeholder: "Search items…" }}
            filters={[{ key: "category", label: "categories", options: [{ value: "Alpha", label: "Alpha" }, { value: "Beta", label: "Beta" }] }]}
          />
          </div>
        </TabSection>
      </div>
    </PageLayout>
  );
}
