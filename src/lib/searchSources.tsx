"use client";

/**
 * Feature 2 — source builders for the SmartRecordSearch component.
 *
 * Each builder turns a record list + sites into a SearchSource (records,
 * field accessor, table columns, row id, open handler) for CAPA, Deviation,
 * and Gap-Assessment Finding. Field accessors live in aiSearch.ts; this file
 * owns presentation (columns, chips, badges).
 */

import type { CSSProperties, ReactNode } from "react";
import dayjs from "@/lib/dayjs";
import { CAPA_STATUSES, DEVIATION_STATUSES } from "@/constants/statusTaxonomy";
import type { CAPA } from "@/store/capa.slice";
import type { Deviation } from "@/store/deviation.slice";
import type { Finding } from "@/store/findings.slice";
import {
  capaFieldValue, deviationFieldValue, findingFieldValue, capaClosedLate, type SiteRef,
} from "@/lib/aiSearch";
import type { SearchSource, SearchColumn } from "@/components/search/SmartRecordSearch";

const fmt = (d?: string) => (d ? dayjs.utc(d).format("DD MMM") : "—");

function chip(label: string, bg: string, fg: string): ReactNode {
  const style: CSSProperties = { background: bg, color: fg, padding: "1px 7px", borderRadius: 6, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" };
  return <span style={style}>{label}</span>;
}

function taxonomyChip(taxonomy: Record<string, { label: string; color: string; bg: string }>, status: string): ReactNode {
  const def = taxonomy[status];
  return chip(def?.label ?? status, def?.bg ?? "var(--bg-surface)", def?.color ?? "var(--text-muted)");
}

const SEVERITY_COLORS: Record<string, [string, string]> = {
  critical: ["#fee2e2", "#b91c1c"], high: ["#ffedd5", "#c2410c"], major: ["#ffedd5", "#c2410c"],
  medium: ["#fef3c7", "#b45309"], minor: ["#e0f2fe", "#0369a1"], low: ["#e0f2fe", "#0369a1"],
};
function severityChip(sev: string): ReactNode {
  const [bg, fg] = SEVERITY_COLORS[sev.toLowerCase()] ?? ["var(--bg-surface)", "var(--text-muted)"];
  return chip(sev, bg, fg);
}

/* ── CAPA ─────────────────────────────────────────────────────── */
export function buildCapaSource(capas: CAPA[], sites: SiteRef[], onOpen?: (id: string) => void): SearchSource<CAPA> {
  const columns: SearchColumn<CAPA>[] = [
    { key: "ref", header: "Ref", value: (c) => c.reference ?? c.id.slice(0, 8), render: (c) => <span style={{ color: "var(--brand)", fontWeight: 500 }}>{c.reference ?? c.id.slice(0, 8)}</span> },
    { key: "title", header: "Title", value: (c) => c.title, render: (c) => <span style={{ color: "var(--text-primary)" }}>{c.title}</span> },
    { key: "due", header: "Due", value: (c) => (c.dueDate ? dayjs.utc(c.dueDate).format("YYYY-MM-DD") : ""), render: (c) => fmt(c.dueDate) },
    {
      key: "closed", header: "Closed",
      value: (c) => (c.closedAt ? dayjs.utc(c.closedAt).format("YYYY-MM-DD") : "") + (capaClosedLate(c) ? " (Late)" : ""),
      render: (c) => (
        <span className="inline-flex items-center gap-1.5">
          {fmt(c.closedAt)}
          {capaClosedLate(c) && <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "0 6px", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>Late</span>}
        </span>
      ),
    },
    { key: "status", header: "Status", value: (c) => CAPA_STATUSES[c.status]?.label ?? c.status, render: (c) => taxonomyChip(CAPA_STATUSES, c.status) },
  ];
  return { module: "capa", label: "CAPA", records: capas, getValue: capaFieldValue(sites), columns, rowId: (c) => c.id, onOpen };
}

/* ── Deviation ────────────────────────────────────────────────── */
export function buildDeviationSource(deviations: Deviation[], sites: SiteRef[], onOpen?: (id: string) => void): SearchSource<Deviation> {
  const columns: SearchColumn<Deviation>[] = [
    { key: "ref", header: "Ref", value: (d) => d.reference ?? d.id.slice(0, 8), render: (d) => <span style={{ color: "var(--brand)", fontWeight: 500 }}>{d.reference ?? d.id.slice(0, 8)}</span> },
    { key: "title", header: "Title", value: (d) => d.title, render: (d) => <span style={{ color: "var(--text-primary)" }}>{d.title}</span> },
    { key: "severity", header: "Severity", value: (d) => d.severity, render: (d) => severityChip(d.severity) },
    { key: "detected", header: "Detected", value: (d) => (d.detectedDate ? dayjs.utc(d.detectedDate).format("YYYY-MM-DD") : ""), render: (d) => fmt(d.detectedDate) },
    { key: "due", header: "Due", value: (d) => (d.dueDate ? dayjs.utc(d.dueDate).format("YYYY-MM-DD") : ""), render: (d) => fmt(d.dueDate) },
    { key: "status", header: "Status", value: (d) => DEVIATION_STATUSES[d.status]?.label ?? d.status, render: (d) => taxonomyChip(DEVIATION_STATUSES, d.status) },
  ];
  return { module: "deviation", label: "Deviation", records: deviations, getValue: deviationFieldValue(sites), columns, rowId: (d) => d.id, onOpen };
}

/* ── Gap-Assessment Finding ───────────────────────────────────── */
export function buildFindingSource(findings: Finding[], sites: SiteRef[], onOpen?: (id: string) => void): SearchSource<Finding> {
  const columns: SearchColumn<Finding>[] = [
    { key: "ref", header: "Ref", value: (f) => f.reference ?? f.id.slice(0, 8), render: (f) => <span style={{ color: "var(--brand)", fontWeight: 500 }}>{f.reference ?? f.id.slice(0, 8)}</span> },
    { key: "requirement", header: "Requirement", value: (f) => f.requirement, render: (f) => <span style={{ color: "var(--text-primary)" }}>{f.requirement}</span> },
    { key: "framework", header: "Framework", value: (f) => f.framework },
    { key: "severity", header: "Severity", value: (f) => f.severity, render: (f) => severityChip(f.severity) },
    { key: "target", header: "Target", value: (f) => (f.targetDate ? dayjs.utc(f.targetDate).format("YYYY-MM-DD") : ""), render: (f) => fmt(f.targetDate) },
    { key: "status", header: "Status", value: (f) => f.status, render: (f) => chip(f.status, "var(--bg-surface)", "var(--text-secondary)") },
  ];
  return { module: "finding", label: "Finding", records: findings, getValue: findingFieldValue(sites), columns, rowId: (f) => f.id, onOpen };
}
