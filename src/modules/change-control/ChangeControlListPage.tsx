"use client";

import { useMemo, useState } from "react";
import {
  Filter,
  GitMerge,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import type { ChangeControl as PrismaChangeControl } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DataTable, type Column } from "@/components/shared";
import {
  CHANGE_CONTROL_RISKS,
  CHANGE_CONTROL_STATUSES,
  CHANGE_TYPES,
} from "@/lib/change-control-constants";
import { CC_STATUS_VARIANT, getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { NewChangeControlModal } from "./NewChangeControlModal";
import { ChangeControlDetailModal } from "./ChangeControlDetailModal";

type CCRow = PrismaChangeControl & {
  _count: { capaLinks: number };
};

// Risk + status badge variants moved to src/lib/badgeVariants.ts so the
// list page and detail modal share one source of truth.

interface Props {
  initial: CCRow[];
}

export function ChangeControlListPage({ initial }: Props) {
  const [items, setItems] = useState<CCRow[]>(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { org } = useTenantConfig();
  const dateFormat = org.dateFormat;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((cc) => {
      if (statusFilter && cc.status !== statusFilter) return false;
      if (riskFilter && cc.risk !== riskFilter) return false;
      if (typeFilter && cc.changeType !== typeFilter) return false;
      if (q) {
        const hay = `${cc.reference ?? ""} ${cc.title} ${cc.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, riskFilter, typeFilter]);

  return (
    <main
      id="main-content"
      aria-label="Change Control"
      className="w-full space-y-5"
    >
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Settings
            className="w-5 h-5"
            style={{ color: "var(--brand)" }}
            aria-hidden="true"
          />
          <div>
            <h1 className="page-title">Change Control</h1>
            <p className="page-subtitle mt-1">
              SOP, equipment, process, and product changes — with bidirectional
              CAPA traceability.
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setCreateOpen(true)}
        >
          New change control
        </Button>
      </header>

      {/* Filters */}
      <section
        aria-label="Change control filters"
        className="flex items-center gap-3 flex-wrap p-3 rounded-xl"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--bg-border)",
        }}
      >
        <Filter
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: "var(--text-muted)" }}
          aria-hidden="true"
        />
        <span
          className="text-[12px] font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Filters
        </span>
        <Dropdown
          placeholder="All statuses"
          value={statusFilter}
          onChange={setStatusFilter}
          width="w-44"
          options={[
            { value: "", label: "All statuses" },
            ...CHANGE_CONTROL_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
        <Dropdown
          placeholder="All risks"
          value={riskFilter}
          onChange={setRiskFilter}
          width="w-32"
          options={[
            { value: "", label: "All risks" },
            ...CHANGE_CONTROL_RISKS.map((r) => ({ value: r, label: r })),
          ]}
        />
        <Dropdown
          placeholder="All types"
          value={typeFilter}
          onChange={setTypeFilter}
          width="w-44"
          options={[
            { value: "", label: "All types" },
            ...CHANGE_TYPES.map((t) => ({ value: t, label: t })),
          ]}
        />
        <div className="relative ml-auto flex-1 min-w-[200px] max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <input
            type="search"
            className="input w-full pl-10 text-[12px]"
            placeholder="Search change controls…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search change controls"
          />
        </div>
      </section>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <Settings
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <p
            className="text-[13px] font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            {items.length === 0
              ? "No change controls yet"
              : "No change controls match the current filters"}
          </p>
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            {items.length === 0
              ? "Click 'New change control' to create one."
              : "Adjust the filters or clear them to see more rows."}
          </p>
          {items.length === 0 && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setCreateOpen(true)}
            >
              New change control
            </Button>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
          }}
        >
          <DataTable
            ariaLabel="Change control register"
            caption="Change controls with risk, status, owner, and CAPA link counts"
            data={filtered}
            rowKey={(cc) => cc.id}
            onRowClick={(cc) => setDetailId(cc.id)}
            columns={[
              {
                key: "reference",
                header: "Reference",
                render: (cc) => (
                  <span
                    className="font-mono text-[12px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {cc.reference ?? cc.id.slice(0, 8)}
                  </span>
                ),
              },
              {
                key: "title",
                header: "Title",
                render: (cc) => <span className="text-[12px]">{cc.title}</span>,
              },
              {
                key: "type",
                header: "Type",
                render: (cc) => <Badge variant="gray">{cc.changeType}</Badge>,
              },
              {
                key: "risk",
                header: "Risk",
                render: (cc) => (
                  <Badge variant={getSeverityVariant(cc.risk, "generic")}>
                    {normalizeSeverityForDisplay(cc.risk, "generic") ?? cc.risk}
                  </Badge>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (cc) => (
                  <Badge variant={CC_STATUS_VARIANT[cc.status as keyof typeof CC_STATUS_VARIANT] ?? "gray"}>
                    {cc.status}
                  </Badge>
                ),
              },
              {
                key: "owner",
                header: "Owner",
                render: (cc) => (
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {cc.ownerName}
                  </span>
                ),
              },
              {
                key: "targetDate",
                header: "Target date",
                render: (cc) => (
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {cc.targetImplementationDate
                      ? dayjs.utc(cc.targetImplementationDate).format(dateFormat)
                      : "—"}
                  </span>
                ),
              },
              {
                key: "linkedCapas",
                header: "Linked CAPAs",
                render: (cc) => (
                  <span
                    className="inline-flex items-center gap-1 text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <GitMerge
                      className="w-3.5 h-3.5"
                      aria-hidden="true"
                    />
                    {cc._count?.capaLinks ?? 0}
                  </span>
                ),
              },
            ] satisfies Column<CCRow>[]}
          />
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <NewChangeControlModal
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setItems((prev) => [
              { ...created, _count: { capaLinks: 0 } } as CCRow,
              ...prev,
            ]);
            setCreateOpen(false);
            // Auto-open the newly-created CC's detail modal so the user can
            // immediately link it to a CAPA.
            setDetailId(created.id);
          }}
        />
      )}

      {/* Detail modal */}
      {detailId && (
        <ChangeControlDetailModal
          ccId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={async () => {
            // The detail modal mutated something — refresh the list. We
            // don't want a full router.refresh() if we can avoid it (the
            // detail modal owns its own data); instead, hit the same
            // server action the page used.
            const { loadChangeControls } = await import(
              "@/actions/change-control"
            );
            const result = await loadChangeControls();
            if (result.success) setItems(result.data as CCRow[]);
          }}
        />
      )}
    </main>
  );
}
