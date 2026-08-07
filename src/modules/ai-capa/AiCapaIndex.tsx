"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles, AlertTriangle, Search, ChevronRight, Plus, Loader2 } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Button } from "@/components/ui/Button";
import { PageLayout } from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataColumn } from "@/components/table/DataTable";
import {
  capaListAll,
  capaListByCustomer,
  selectAiCustomerId,
} from "@/lib/aiBackend";
import { friendlyAiError } from "@/lib/friendlyError";
import { formatDate as fmtDate } from "@/lib/dates";

/**
 * AI CAPA index — lists every CAPA the AI backend knows about for the
 * current customer (or all customers if the user is super_admin and
 * toggles "All customers"). Click-through opens the lifecycle dashboard
 * at /ai-capa/[capaId].
 *
 * Uses capaListByCustomer by default; capaListAll is only available to
 * super_admin (the backend doesn't currently scope it, so anyone with a
 * token gets every customer's CAPAs — restrict client-side to super_admin
 * to avoid a confusing leak).
 */

interface AiCapaRow {
  capa_id: string;
  problem_statement: string;
  source: string;
  severity: string;
  status: string;
  is_recurring: boolean;
  risk_score: number;
  created_at: string;
}

export function AiCapaIndex() {
  const customerId = useAppSelector(selectAiCustomerId);
  const userRole = useAppSelector((s) => s.auth.user?.role ?? "");
  const isSuperAdmin = userRole === "super_admin";
  const router = useRouter();

  const [scope, setScope] = useState<"customer" | "all">("customer");
  const [rows, setRows] = useState<AiCapaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res =
        scope === "all" && isSuperAdmin
          ? await capaListAll()
          : await capaListByCustomer(customerId ?? "");
      const list = (res && typeof res === "object" && "capas" in res && Array.isArray((res as { capas?: unknown }).capas))
        ? (res as { capas: AiCapaRow[] }).capas
        : [];
      setRows(list);
    } catch (e) {
      console.error("[ai-capa] list fetch failed", e); setError(friendlyAiError(e, "Couldn't load the CAPA list. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [customerId, scope, isSuperAdmin]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return (
          r.capa_id.toLowerCase().includes(q) ||
          r.problem_statement.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q)
        );
      })
    : rows;

  const stats = {
    total: rows.length,
    open: rows.filter((r) => /open/i.test(r.status)).length,
    recurring: rows.filter((r) => r.is_recurring).length,
    highRisk: rows.filter((r) => r.risk_score >= 0.75).length,
  };

  return (
    <PageLayout
      title="AI CAPAs"
      titleIcon={Sparkles}
      description={`Backend-tracked CAPAs · ${scope === "all" ? "all customers" : `customer ${customerId ?? "—"}`}`}
      headerRight={
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refresh} loading={loading}>Refresh</Button>
      }
    >
      <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Open" value={stats.open} valueColor="var(--brand)" />
        <Stat label="Recurring" value={stats.recurring} valueColor={stats.recurring > 0 ? "var(--warning)" : undefined} />
        <Stat label="High risk" value={stats.highRisk} valueColor={stats.highRisk > 0 ? "var(--danger)" : undefined} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
          <input
            type="search"
            className="input pl-8 text-[12px]"
            placeholder="Search CAPAs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search CAPAs"
          />
        </div>

        {isSuperAdmin && (
          <div role="tablist" aria-label="Scope" className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
            {[
              { value: "customer", label: "My customer" },
              { value: "all", label: "All customers" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={scope === opt.value}
                onClick={() => setScope(opt.value as "customer" | "all")}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-md cursor-pointer border-0"
                style={{
                  background: scope === opt.value ? "var(--brand)" : "transparent",
                  color: scope === opt.value ? "#fff" : "var(--text-secondary)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <Link href="/capa" className="ml-auto">
          <Button variant="primary" size="sm" icon={Plus}>New AI CAPA</Button>
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
          {error}
        </div>
      )}

      {/* Table — canonical DataTable widget (uncontrolled client mode). The page
          keeps ownership of scope + search + refresh; the widget only renders the
          rows it is handed (already narrowed by the scope fetch + client search).
          No widget `search`/`filters` props: search stays external and feeds
          `data` pre-filtered, exactly as before. Loading is folded into the
          empty state because the widget has no client-mode `loading` prop. */}
      <DataTable
        ariaLabel="AI CAPAs"
        data={filtered}
        rowKey={(r) => r.capa_id}
        density="compact"
        minWidth={1000}
        pageSize={25}
        onRowClick={(r) => router.push(`/ai-capa/${encodeURIComponent(r.capa_id)}`)}
        emptyState={() => (
          <div className="text-center py-8">
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Loading CAPAs…</p>
              </>
            ) : (
              <>
                <Sparkles className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {search.trim()
                    ? `No CAPAs match “${search.trim()}”.`
                    : "No AI CAPAs yet — create one from the CAPA Tracker."}
                </p>
              </>
            )}
          </div>
        )}
        columns={[
          {
            key: "capa_id",
            label: "CAPA ID",
            sortable: true,
            cellClassName: "font-mono text-[11px] font-semibold",
            render: (r) => (
              <Link href={`/ai-capa/${encodeURIComponent(r.capa_id)}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--brand)", textDecoration: "none" }}>
                {r.capa_id}
              </Link>
            ),
          },
          {
            key: "problem",
            label: "Problem",
            cellClassName: "text-[12px]",
            render: (r) => (
              <>
                <p className="line-clamp-2" style={{ color: "var(--text-primary)", maxWidth: 360 }}>{r.problem_statement}</p>
                {r.is_recurring && (
                  <span className="inline-flex items-center gap-1 text-[10px] mt-0.5" style={{ color: "var(--warning)" }}>
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" /> recurring
                  </span>
                )}
              </>
            ),
          },
          {
            key: "source",
            label: "Source",
            sortable: true,
            cellClassName: "text-[11px] text-(--text-secondary)",
            render: (r) => r.source,
          },
          {
            key: "severity",
            label: "Severity",
            sortable: true,
            render: (r) => (
              <Badge variant={
                /critical/i.test(r.severity) ? "red" :
                /high|major/i.test(r.severity) ? "amber" :
                /low/i.test(r.severity) ? "green" : "gray"
              }>{r.severity}</Badge>
            ),
          },
          {
            key: "status",
            label: "Status",
            sortable: true,
            render: (r) => (
              <Badge variant={
                /closed/i.test(r.status) ? "green" :
                /review|pending/i.test(r.status) ? "purple" :
                /progress|submitted/i.test(r.status) ? "amber" : "blue"
              }>{r.status}</Badge>
            ),
          },
          {
            key: "risk",
            label: "Risk",
            sortable: true,
            sortValue: (r) => r.risk_score,
            render: (r) => {
              const riskPct = Math.round(r.risk_score * 100);
              const riskColor = r.risk_score >= 0.75 ? "var(--danger)" : r.risk_score >= 0.4 ? "var(--warning)" : "var(--success)";
              return (
                <div className="flex items-center gap-2">
                  <div className="rounded-full overflow-hidden" style={{ width: 50, height: 4, background: "var(--bg-border)" }}>
                    <div style={{ width: `${riskPct}%`, height: "100%", background: riskColor }} />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums" style={{ color: riskColor }}>{riskPct}%</span>
                </div>
              );
            },
          },
          {
            key: "created",
            label: "Created",
            sortable: true,
            sortValue: (r) => r.created_at,
            cellClassName: "text-[11px] whitespace-nowrap text-(--text-muted)",
            render: (r) => formatDate(r.created_at),
          },
          {
            key: "open",
            label: "Open",
            headerSrOnly: true,
            render: (r) => (
              <Link href={`/ai-capa/${encodeURIComponent(r.capa_id)}`} onClick={(e) => e.stopPropagation()} aria-label={`Open ${r.capa_id}`}>
                <ChevronRight className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              </Link>
            ),
          },
        ] satisfies DataColumn<AiCapaRow>[]}
      />
      </div>
    </PageLayout>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: number; valueColor?: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-[18px] font-bold" style={{ color: valueColor ?? "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function formatDate(v: string): string {
  return fmtDate(v);
}
