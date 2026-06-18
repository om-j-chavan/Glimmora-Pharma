/**
 * Feature 2 — Plain-English Record Search: client-side filter executor.
 *
 * The backend /api/ai/search endpoint only TRANSLATES a sentence into a
 * filter spec — it never touches records. This module executes that spec
 * against records already in Redux, scoped to the current tenant. Field
 * names match the translator's registry (app/search_service.py) and each
 * frontend record model exactly, so no remapping is needed.
 */

import type { CAPA } from "@/store/capa.slice";
import type { Deviation } from "@/store/deviation.slice";
import type { Finding } from "@/store/findings.slice";
import { isOverdue } from "@/types/capa";

export type SearchOp = "eq" | "in" | "gte" | "lte" | "gt" | "lt" | "between";

export interface SearchCondition {
  field: string;
  op: SearchOp;
  value: unknown;
}

export interface SearchFilters {
  logic: "AND" | "OR";
  conditions: SearchCondition[];
}

/** Minimal site shape needed to resolve a "Site B" name → siteId. */
export interface SiteRef {
  id: string;
  name: string;
}

/** Resolves a record's value for a registered filter field. */
export type FieldAccessor<T> = (rec: T, field: string) => unknown;

function toTime(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

function eqLoose(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function matchValue(actual: unknown, cond: SearchCondition): boolean {
  if (actual === undefined) return false; // unknown field never matches
  const { op, value } = cond;
  switch (op) {
    case "eq":
      return eqLoose(actual, value);
    case "in":
      return Array.isArray(value) && value.some((v) => eqLoose(actual, v));
    case "gte": case "lte": case "gt": case "lt": {
      const a = typeof actual === "number" ? actual : toTime(actual);
      const b = typeof value === "number" ? value : toTime(value);
      if (a === null || b === null) return false;
      return op === "gte" ? a >= b : op === "lte" ? a <= b : op === "gt" ? a > b : a < b;
    }
    case "between": {
      if (!Array.isArray(value) || value.length !== 2) return false;
      const a = typeof actual === "number" ? actual : toTime(actual);
      const lo = typeof value[0] === "number" ? value[0] : toTime(value[0]);
      const hi = typeof value[1] === "number" ? value[1] : toTime(value[1]);
      if (a === null || lo === null || hi === null) return false;
      return a >= lo && a <= hi;
    }
    default:
      return false;
  }
}

/**
 * Run a translated filter spec against any record list, given a field
 * accessor for that module. Empty condition list matches nothing (the caller
 * shows the resting/unclear state instead of "everything").
 */
export function executeSearch<T>(records: T[], filters: SearchFilters, getValue: FieldAccessor<T>): T[] {
  const conds = filters?.conditions ?? [];
  if (conds.length === 0) return [];
  const test = filters.logic === "OR"
    ? (r: T) => conds.some((c) => matchValue(getValue(r, c.field), c))
    : (r: T) => conds.every((c) => matchValue(getValue(r, c.field), c));
  return records.filter(test);
}

/* ── Derived-field helpers ─────────────────────────────────────── */

export function capaClosedLate(c: CAPA): boolean {
  return c.status === "closed" && !!c.closedAt && !!c.dueDate && new Date(c.closedAt) > new Date(c.dueDate);
}

function deviationOverdue(d: Deviation): boolean {
  if (d.status !== "open" && d.status !== "under_investigation") return false;
  return !!d.dueDate && new Date(d.dueDate) < new Date();
}

function findingOverdue(f: Finding): boolean {
  if (f.status === "Closed") return false;
  return !!f.targetDate && new Date(f.targetDate) < new Date();
}

const siteName = (sites: SiteRef[], siteId: string | undefined) =>
  sites.find((s) => s.id === siteId)?.name ?? siteId;

/* ── Per-module field accessors ────────────────────────────────── */

export const capaFieldValue = (sites: SiteRef[]): FieldAccessor<CAPA> => (c, field) => {
  switch (field) {
    case "status": return c.status;
    case "risk": return c.risk;
    case "source": return c.source;
    case "owner": return c.owner;
    case "site": return siteName(sites, c.siteId);
    case "createdAt": return c.createdAt;
    case "dueDate": return c.dueDate;
    case "closedAt": return c.closedAt;
    case "is_overdue": return isOverdue(c);
    case "closed_late": return capaClosedLate(c);
    case "effectiveness_check": return c.effectivenessCheck;
    case "di_gate": return c.diGate;
    default: return undefined;
  }
};

export const deviationFieldValue = (sites: SiteRef[]): FieldAccessor<Deviation> => (d, field) => {
  switch (field) {
    case "status": return d.status;
    case "severity": return d.severity;
    case "type": return d.type;
    case "category": return d.category;
    case "area": return d.area;
    case "owner": return d.owner;
    case "site": return siteName(sites, d.siteId);
    case "detectedDate": return d.detectedDate;
    case "reportedDate": return d.reportedDate;
    case "dueDate": return d.dueDate;
    case "is_overdue": return deviationOverdue(d);
    default: return undefined;
  }
};

export const findingFieldValue = (sites: SiteRef[]): FieldAccessor<Finding> => (f, field) => {
  switch (field) {
    case "status": return f.status;
    case "severity": return f.severity;
    case "framework": return f.framework;
    case "area": return f.area;
    case "owner": return f.owner;
    case "site": return siteName(sites, f.siteId);
    case "targetDate": return f.targetDate;
    case "createdAt": return f.createdAt;
    case "is_overdue": return findingOverdue(f);
    default: return undefined;
  }
};

/** Back-compat convenience wrapper for the CAPA-only call site. */
export function executeCapaSearch(capas: CAPA[], filters: SearchFilters, sites: SiteRef[] = []): CAPA[] {
  return executeSearch(capas, filters, capaFieldValue(sites));
}
