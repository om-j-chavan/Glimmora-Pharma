"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { roleLabel } from "@/lib/labels/roles";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import { moduleLabel } from "@/lib/labels/modules";
import type { PlatformAuditRow } from "@/lib/queries";
import dayjs from "@/lib/dayjs";
import { categoryOf, actorOf } from "./PlatformAuditTable";

/**
 * Read-only detail for a single audit record — "Audit Record Detail". Presents
 * the immutable AuditLog row in human-readable form: friendly action + module,
 * resolved actor + target (raw CUIDs only as secondary tooltips), a meaningful
 * IP, and a readable before/after diff. NO edit/delete affordance; nothing here
 * mutates the stored record — this is display-only.
 */
export function AuditDetailModal({
  row,
  onClose,
}: {
  row: PlatformAuditRow | null;
  onClose: () => void;
}) {
  if (!row) return null;
  const cat = categoryOf(row.action);
  // Target: when the affected record is a tenant we resolve its name and label
  // it as such; otherwise fall back to the human recordTitle. The raw recordId
  // is kept only as a hover tooltip, never the primary value.
  const target = row.accountName ? `Tenant: ${row.accountName}` : (row.recordTitle || "—");

  return (
    <Modal open onClose={onClose} title="Audit Record Detail">
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{auditEventLabel(row.action)}</span>
          <Badge variant={cat === "Account" ? "blue" : cat === "Plan" ? "green" : cat === "Security" ? "amber" : "gray"}>{cat}</Badge>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <Field label="When" value={dayjs(row.createdAt).format("DD MMM YYYY, HH:mm:ss")} />
          <Field label="Module" value={moduleLabel(row.module)} />
          <Field
            label="Actor"
            value={actorOf(row)}
            sub={row.userRole ? roleLabel(row.userRole) : undefined}
            title={row.userId ?? undefined}
          />
          <Field label="Target" value={target} title={row.recordId ?? undefined} />
          <Field label="IP address" value={ipLabel(row.ipAddress)} />
        </dl>

        {/* Before / after — a readable diff (or key-value list for a create),
            never a raw JSON dump. Only shown when the record captured a payload. */}
        {(row.oldValue || row.newValue) && (
          <div>
            <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Changes</p>
            <ChangePayload oldRaw={row.oldValue} newRaw={row.newValue} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, value, sub, title }: { label: string; value: string; sub?: string; title?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="text-[13px]" style={{ color: "var(--text-primary)" }} title={title}>
        {value}
        {sub && <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</span>}
      </dd>
    </div>
  );
}

/* ── IP presentation (item 5) ── */
function ipLabel(ip: string | null): string {
  if (!ip) return "—";
  const v = ip.trim();
  if (v === "::1" || v === "127.0.0.1" || v === "::ffff:127.0.0.1") return "Localhost (server)";
  return v;
}

/* ── Before/After rendering (item 6) ── */

type Parsed = { obj: Record<string, unknown> | null; text: string | null };

/** Parse a stored value: JSON object → keyed map; JSON scalar/array or plain
 *  string → text; null/empty → nothing. Never throws (audit values vary). */
function parseValue(raw: string | null): Parsed {
  if (raw == null || raw === "") return { obj: null, text: null };
  try {
    const p: unknown = JSON.parse(raw);
    if (p && typeof p === "object" && !Array.isArray(p)) return { obj: p as Record<string, unknown>, text: null };
    return { obj: null, text: scalarText(p) };
  } catch {
    return { obj: null, text: raw };
  }
}

function scalarText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** camelCase / snake_case / kebab → spaced Title Case. */
function prettifyKey(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ChangePayload({ oldRaw, newRaw }: { oldRaw: string | null; newRaw: string | null }) {
  const before = parseValue(oldRaw);
  const after = parseValue(newRaw);

  // Both sides are objects → a field-level before→after diff table.
  if (before.obj && after.obj) {
    const keys = Array.from(new Set([...Object.keys(before.obj), ...Object.keys(after.obj)]));
    return (
      <Panel>
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-3 gap-y-1.5 text-[12px]">
          <HeadCell>Field</HeadCell>
          <HeadCell>Before</HeadCell>
          <HeadCell>After</HeadCell>
          {keys.map((k) => (
            <Row key={k} label={prettifyKey(k)} left={scalarText(before.obj![k])} right={scalarText(after.obj![k])} />
          ))}
        </div>
      </Panel>
    );
  }

  // Otherwise render whichever side(s) exist as a clean key-value list (object)
  // or a single value (scalar). A create typically has only an "after".
  const sides = [
    { label: "Before", p: before },
    { label: "After", p: after },
  ].filter((s) => s.p.obj || s.p.text);

  if (sides.length === 0) return <Panel><span className="text-[12px]" style={{ color: "var(--text-muted)" }}>—</span></Panel>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {sides.map(({ label, p }) => (
        <Panel key={label} label={label}>
          {p.obj ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
              {Object.entries(p.obj).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt style={{ color: "var(--text-muted)" }}>{prettifyKey(k)}</dt>
                  <dd className="break-words" style={{ color: "var(--text-primary)" }}>{scalarText(v)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[12px] break-words" style={{ color: "var(--text-primary)" }}>{p.text}</p>
          )}
        </Panel>
      ))}
    </div>
  );
}

function Panel({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
      {label && <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>{label}</p>}
      {children}
    </div>
  );
}

function HeadCell({ children }: { children: ReactNode }) {
  return <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>{children}</span>;
}

function Row({ label, left, right }: { label: string; left: string; right: string }) {
  const changed = left !== right;
  return (
    <>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="break-words" style={{ color: "var(--text-muted)" }}>{left}</span>
      <span className="break-words" style={{ color: changed ? "var(--text-primary)" : "var(--text-muted)", fontWeight: changed ? 600 : 400 }}>{right}</span>
    </>
  );
}
