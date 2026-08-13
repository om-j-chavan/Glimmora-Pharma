"use client";

/**
 * AI activity — the Part 11 trail for AI calls.
 *
 * ── Why this exists ───────────────────────────────────────────
 * The AI service has written an audit row for every AI call for some time, but
 * nothing in the product ever read it: `aiAuditList`/`aiAuditForRecord` were
 * exported from the transport layer with no caller. So the trail was
 * write-only — recorded, retained, and impossible to produce during an
 * inspection, which is precisely what §11.10(b) requires it not to be.
 *
 * Scoping is enforced upstream from the caller's signed token, so this view can
 * only ever show the caller's own organisation. The filters narrow that set;
 * they cannot widen it.
 *
 * Payloads are deliberately NOT listed here. The list shows operational
 * metadata (who, what, which model, which prompt version, how long, success or
 * fallback); the input/output detail for one record is fetched on demand via
 * /api/v1/audit/record/{id}. A list view should never bulk-export prompt text.
 */

import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/table/DataTable";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { aiAuditList, aiUsage, type AiAuditRow, type AiUsageRow } from "@/lib/aiBackend";
import { friendlyAiError } from "@/lib/friendlyError";

const PAGE_SIZE = 50;

/** Feature id → the surface a user recognises. An id like "AI-TRIAGE-I" means
 *  nothing to a QA reviewer reading their own audit trail. */
const FEATURE_LABELS: Record<string, string> = {
  ASSISTANT_ROUTER: "Compliance Assistant",
  "AI-HELP-01": "Compliance Assistant (help)",
  "AI-REGULATORY-01": "Ask Regulatory AI",
  "AI-SEARCH-02": "Smart Record Search",
  "AI-SUMMARY-03": "Document Summary",
  "AI-DRAFT-05": "Draft Helper",
  "AI-RECUR-01": "CAPA Recurrence Analysis",
  "AI-RCA-A": "RCA Suggestions",
  "AI-PREFILL-B": "CAPA Pre-fill",
  "AI-RESPONSE-C": "FDA-483 Response Draft",
  "AI-DOCREV-D": "Validation Document Review",
  "AI-REG-E": "Regulatory Intelligence",
  "AI-DEVINT-F": "Deviation Intelligence",
  "AI-DRIFT-H": "Drift Detection",
  "AI-TRIAGE-I": "Finding Triage",
  "AI-BRIEF-J": "CAPA Approval Brief",
  "AI-READY-K": "Readiness Copilot",
  "AI-SUPPORT-L": "Support Triage",
  "AI-483EXT-M": "FDA-483 Extraction",
  "AI-DEVRCA-N": "Deviation RCA Intelligence",
  "AI-REWORK-O": "Rework Task Suggestions",
  "AI-VOICE-STT": "Voice — transcription",
  "AI-VOICE-TTS": "Voice — playback",
};

function featureLabel(id: string): string {
  return FEATURE_LABELS[id] ?? id;
}

const STATUS_VARIANT: Record<string, "green" | "amber" | "red" | "gray"> = {
  success: "green",
  fallback: "amber",
  error: "red",
};

export function AiActivityPanel() {
  const { org } = useTenantConfig();
  const tz = org.timezone;

  const [rows, setRows] = useState<AiAuditRow[]>([]);
  const [usage, setUsage] = useState<AiUsageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [page, use] = await Promise.all([
        aiAuditList({ limit: PAGE_SIZE }),
        aiUsage().catch(() => ({ usage: [] })),
      ]);
      setRows(page.audit_logs);
      setTotal(page.total);
      setUsage(use.usage);
    } catch (e) {
      console.error("[ai-activity] load failed", e);
      setError(friendlyAiError(e, "Couldn't load AI activity. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataColumn<AiAuditRow>[] = [
    {
      key: "timestamp",
      label: "Timestamp",
      sortable: true,
      sortValue: (r) => r.timestamp,
      exportValue: (r) => dayjs.utc(r.timestamp).tz(tz).format("YYYY-MM-DD HH:mm:ss"),
      render: (r) => (
        <time
          dateTime={r.timestamp}
          className="font-mono text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {dayjs.utc(r.timestamp).tz(tz).format("DD MMM YYYY, HH:mm")}
        </time>
      ),
    },
    {
      key: "feature",
      label: "AI feature",
      sortable: true,
      sortValue: (r) => featureLabel(r.feature_id),
      exportValue: (r) => featureLabel(r.feature_id),
      render: (r) => (
        <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
          {featureLabel(r.feature_id)}
        </span>
      ),
    },
    {
      key: "actor",
      label: "Actor",
      sortable: true,
      exportValue: (r) => r.username,
      render: (r) => (
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{r.username}</span>
      ),
    },
    {
      key: "record",
      label: "Record",
      exportValue: (r) => r.record_id,
      render: (r) => (
        <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
          {r.record_id === "-" ? "—" : r.record_id}
        </span>
      ),
    },
    {
      key: "model",
      label: "Model",
      sortable: true,
      exportValue: (r) => r.model ?? "",
      render: (r) => (
        <div className="text-[11px]">
          <p className="font-mono" style={{ color: "var(--text-secondary)" }}>{r.model ?? "—"}</p>
          {/* Which prompt produced this. Without it, an answer recorded here
              could not be reproduced after the prompt was edited. */}
          {r.prompt_version && (
            <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
              {r.prompt_version}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "tokens",
      label: "Tokens",
      sortable: true,
      sortValue: (r) => (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0),
      exportValue: (r) => String((r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0)),
      render: (r) => (
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: "var(--text-muted)" }}
          title={`${r.prompt_tokens ?? 0} in / ${r.completion_tokens ?? 0} out`}
        >
          {(r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0) || "—"}
        </span>
      ),
    },
    {
      key: "latency",
      label: "Latency",
      sortable: true,
      sortValue: (r) => r.latency_ms ?? 0,
      exportValue: (r) => (r.latency_ms == null ? "" : `${r.latency_ms}ms`),
      render: (r) => (
        <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
          {r.latency_ms == null ? "—" : `${(r.latency_ms / 1000).toFixed(1)}s`}
        </span>
      ),
    },
    {
      key: "status",
      label: "Result",
      sortable: true,
      exportValue: (r) => r.status,
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status] ?? "gray"}>
          {r.status === "fallback" ? "Not live AI" : r.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-[12px] max-w-[70ch]" style={{ color: "var(--text-secondary)" }}>
          Every AI call made in your organisation — who made it, which feature and
          model answered, which prompt version produced it, and whether the answer
          was live AI or a deterministic fallback. Read-only and append-only.
        </p>
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={load} loading={loading}>
          Refresh
        </Button>
      </div>

      {usage.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {usage
            .slice()
            .sort((a, b) => b.calls - a.calls)
            .slice(0, 4)
            .map((u) => (
              <div
                key={`${u.feature_id}-${u.model ?? "none"}`}
                className="rounded-lg px-3 py-2.5"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider mb-1 truncate"
                  style={{ color: "var(--text-muted)" }}
                  title={featureLabel(u.feature_id)}
                >
                  {featureLabel(u.feature_id)}
                </p>
                <p className="text-[18px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {u.calls}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {(u.prompt_tokens + u.completion_tokens).toLocaleString()} tokens ·{" "}
                  {(u.avg_latency_ms / 1000).toFixed(1)}s avg
                </p>
              </div>
            ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}
        >
          {error}
        </div>
      )}

      <DataTable<AiAuditRow>
        ariaLabel="AI activity"
        data={rows}
        rowKey={(r) => r.audit_id}
        columns={columns}
        density="compact"
        pageSize={25}
        minWidth={980}
        defaultSort={{ key: "timestamp", dir: "desc" }}
        exportOptions={{
          filename: `ai-activity-${dayjs().format("YYYY-MM-DD")}`,
          title: "AI activity",
        }}
        emptyState={() => (
          <div className="text-center py-8">
            <Bot className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {loading ? "Loading AI activity…" : "No AI activity recorded yet."}
            </p>
          </div>
        )}
      />

      {total > rows.length && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Showing the {rows.length} most recent of {total} recorded AI calls.
        </p>
      )}
    </div>
  );
}
