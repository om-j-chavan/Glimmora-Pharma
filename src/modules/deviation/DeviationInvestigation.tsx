"use client";

/**
 * Tier 2, Items 3 + 4 — Deviation Investigation + CAPA Decision sections.
 *
 * Rendered inside the Deviation detail modal (DeviationPage.tsx), between
 * "Immediate action" and "Linked CAPA". Two stacked, self-contained
 * sections, each a small state machine driven by the deviation's data:
 *
 *   InvestigationSection
 *     A — not started (no rcaMethod)        → intro + [Start Investigation]
 *     B — in progress (rcaMethod, !done)    → method picker + per-method form
 *     C — completed (investigationCompletedAt) → readable RCA + [Edit]
 *
 *   CapaDecisionSection
 *     A — investigation not complete        → hidden
 *     B — complete, no decision             → radios + justification + [Save]
 *     C — required, not yet raised          → justification + [+ Raise CAPA]
 *     D — required + raised                 → justification + linked-CAPA card
 *     E — not required                      → justification + [Edit Decision]
 *
 * SoD (segregation of duties) is enforced server-side in src/actions/
 * deviations.ts and mirrored here: the reporter (createdById) cannot
 * investigate; the CAPA decision must be made by a QA-role user who is
 * neither the reporter nor the investigator (investigationCompletedById).
 *
 * RCA serialization reuses the FDA 483 format verbatim ("Why N: …" /
 * "<Category>: …" + "Root cause: …") so the readable display logic is
 * identical; the structured form buffer is additionally persisted as JSON
 * text in rcaData so editing repopulates without re-parsing.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Search, Save, CheckCircle2, Pencil, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { usePermissions } from "@/hooks/usePermissions";
import type { Deviation, DeviationRCAMethod } from "@/store/deviation.slice";
import {
  saveInvestigationProgress as saveInvestigationProgressAction,
  completeInvestigation as completeInvestigationAction,
  saveCAPADecision as saveCAPADecisionAction,
  editCAPADecision as editCAPADecisionAction,
} from "@/actions/deviations";

/* ── Method metadata ──────────────────────────────────────────────── */

const METHODS: { value: DeviationRCAMethod; label: string }[] = [
  { value: "5 Why", label: "5 Why" },
  { value: "Fishbone", label: "Fishbone" },
  { value: "Fault Tree", label: "Fault Tree" },
  { value: "Barrier Analysis", label: "Barrier Analysis" },
];

const FISHBONE_CATEGORIES = [
  "People", "Process", "Equipment", "Materials", "Environment", "Management",
] as const;

function methodLabel(m?: DeviationRCAMethod): string {
  return METHODS.find((x) => x.value === m)?.label ?? (m ?? "");
}

/* ── Buffer (de)serialization — JSON in rcaData + synthesized rootCause ── */

interface RcaBuffers {
  whys: string[];                 // length 5
  cats: Record<string, string>;   // Fishbone categories
  fishRoot: string;               // Fishbone root-cause summary
  freeform: string;               // Fault Tree / Barrier Analysis
}

function emptyBuffers(): RcaBuffers {
  return { whys: ["", "", "", "", ""], cats: {}, fishRoot: "", freeform: "" };
}

function parseBuffers(rcaData?: string): RcaBuffers {
  const empty = emptyBuffers();
  if (!rcaData) return empty;
  try {
    const d = JSON.parse(rcaData) as Record<string, unknown>;
    return {
      whys: Array.isArray(d.whys)
        ? [0, 1, 2, 3, 4].map((i) => String((d.whys as unknown[])[i] ?? ""))
        : empty.whys,
      cats:
        d.categories && typeof d.categories === "object"
          ? (d.categories as Record<string, string>)
          : {},
      fishRoot: typeof d.root === "string" ? d.root : "",
      freeform: typeof d.freeform === "string" ? d.freeform : "",
    };
  } catch {
    return empty;
  }
}

/** Build the { rcaData, rootCause } payload for a given method + buffers.
 *  rootCause uses the same serialized format the FDA 483 module produces. */
function buildPayload(method: DeviationRCAMethod, b: RcaBuffers): { rcaData: string; rootCause: string } {
  if (method === "5 Why") {
    const rootCause = b.whys
      .filter((w) => w.trim())
      .map((w, i) => `Why ${i + 1}: ${w}`)
      .join("\n");
    return { rcaData: JSON.stringify({ whys: b.whys }), rootCause };
  }
  if (method === "Fishbone") {
    const cats = FISHBONE_CATEGORIES
      .filter((c) => b.cats[c]?.trim())
      .map((c) => `${c}: ${b.cats[c]}`)
      .join("\n");
    const rootCause = `${cats}\n\nRoot cause: ${b.fishRoot}`.trim();
    return { rcaData: JSON.stringify({ categories: b.cats, root: b.fishRoot }), rootCause };
  }
  // Fault Tree / Barrier Analysis
  return { rcaData: JSON.stringify({ freeform: b.freeform }), rootCause: b.freeform.trim() };
}

function canComplete(method: DeviationRCAMethod, b: RcaBuffers): boolean {
  if (method === "5 Why") return !!b.whys[0]?.trim() && !!b.whys[4]?.trim();
  if (method === "Fishbone") return !!b.fishRoot.trim();
  return !!b.freeform.trim();
}

/* ── Readable saved-RCA display (duplicated from FDA 483's SavedRcaDisplay,
 *    adapted to Deviation method values) ─────────────────────────────── */

function RcaBlock({ label, answer, root = false }: { label: string; answer: string; root?: boolean }) {
  return (
    <div>
      <p
        className={clsx("uppercase tracking-wider", root ? "text-[11px] font-bold" : "text-[10px] font-semibold")}
        style={{ color: root ? "var(--text-primary)" : "var(--text-secondary)" }}
      >
        {label}
      </p>
      {root ? (
        <div className="mt-1 rounded-md p-2" style={{ background: "var(--brand-muted)", borderLeft: "2px solid var(--brand)" }}>
          <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>{answer}</p>
        </div>
      ) : (
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-primary)" }}>{answer}</p>
      )}
    </div>
  );
}

function SavedDeviationRcaDisplay({ method, rootCause }: { method?: DeviationRCAMethod; rootCause: string }) {
  const text = rootCause ?? "";

  if (method === "5 Why") {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    // Only "Why N:" lines are numbered whys. A 5-Why has exactly N whys and the
    // LAST why IS the root cause — so we drop any trailing "Root cause: …" line
    // (some formats append one) rather than mislabelling it "Why N+1". Fixes the
    // off-by-one where the root cause rendered as "Why 6 — Root cause".
    const whyLines = lines.filter((l) => /^Why\s*\d+\s*:/i.test(l));
    if (whyLines.length === 0) {
      return <div className="space-y-3"><RcaBlock label="Root cause" answer={text.trim()} root /></div>;
    }
    return (
      <div className="space-y-3">
        {whyLines.map((line, i) => {
          const m = line.match(/^Why\s*(\d+)\s*:\s*(.*)$/i);
          const label = m ? `Why ${m[1]}` : `Why ${i + 1}`;
          const answer = m ? m[2] : line;
          const isLast = i === whyLines.length - 1;
          return <RcaBlock key={i} label={isLast ? `${label} — Root cause` : label} answer={answer} root={isLast} />;
        })}
      </div>
    );
  }

  if (method === "Fishbone") {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const structured = lines.some((l) => /^[^:]+:\s*\S/.test(l));
    if (!structured) {
      return <div className="space-y-3"><RcaBlock label="Root cause" answer={text.trim()} root /></div>;
    }
    const cats: { label: string; answer: string }[] = [];
    let root = "";
    for (const line of lines) {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (m && /^root cause$/i.test(m[1].trim())) root = m[2];
      else if (m) cats.push({ label: m[1].trim(), answer: m[2] });
      else cats.push({ label: "", answer: line });
    }
    return (
      <div className="space-y-3">
        {cats.map((c, i) => <RcaBlock key={i} label={c.label} answer={c.answer} />)}
        {root && <RcaBlock label="Root cause" answer={root} root />}
      </div>
    );
  }

  // Fault Tree / Barrier Analysis / unknown → single emphasized root block.
  return <div className="space-y-3"><RcaBlock label="Root cause" answer={text.trim()} root /></div>;
}

/* ── Section header ───────────────────────────────────────────────── */

function SectionHeader({ title, status, action }: { title: string; status?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {title}
        {status && <span style={{ color: "var(--text-secondary)" }}> · {status}</span>}
      </p>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

/* ── Shared props ─────────────────────────────────────────────────── */

interface WorkflowProps {
  deviation: Deviation;
  currentUserId?: string;
  isQA: boolean;
  /** status not closed/rejected AND user is not a viewer. */
  writable: boolean;
  /** Resolve a userId → display name. */
  resolveUser: (id: string) => string;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}

/* ══════════════════════════════════════════════════════════════════
 * INVESTIGATION SECTION
 * ══════════════════════════════════════════════════════════════════ */

export function InvestigationSection({
  deviation,
  currentUserId,
  writable,
  resolveUser,
  onChanged,
  onError,
}: WorkflowProps) {
  // Capability mirror of the server (excludes super_admin from authoring).
  const devCan = usePermissions("deviation");
  const completed = !!deviation.investigationCompletedAt;
  const isReporter = !!deviation.createdById && deviation.createdById === currentUserId;
  // The reporter may never perform the investigation (SoD).
  const canInvestigate = writable && !isReporter && devCan.canEdit;

  const [method, setMethod] = useState<DeviationRCAMethod | null>(deviation.rcaMethod ?? null);
  const [buffers, setBuffers] = useState<RcaBuffers>(() => parseBuffers(deviation.rcaData));
  const [started, setStarted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Cancel-edit discard-confirmation strip (Fix 1).
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Re-seed local state whenever a different deviation is opened, or the
  // server row changes (after router.refresh()).
  useEffect(() => {
    setMethod(deviation.rcaMethod ?? null);
    setBuffers(parseBuffers(deviation.rcaData));
    setStarted(false);
    setEditing(false);
    setConfirmCancel(false);
  }, [deviation.id, deviation.rcaMethod, deviation.rcaData, deviation.investigationCompletedAt]);

  const showForm = (!completed && (started || !!method)) || editing;

  // Dirty check — compare the working buffers/method to the persisted
  // baseline so Cancel can skip the confirmation when nothing changed (Fix 1).
  const dirty =
    JSON.stringify({ method, buffers }) !==
    JSON.stringify({ method: deviation.rcaMethod ?? null, buffers: parseBuffers(deviation.rcaData) });

  // Revert local edits to the persisted state and leave the form. Returns to
  // STATE C (completed) when editing a completed investigation, or STATE A
  // ("Not yet started") when abandoning a brand-new one (baseline method null).
  function exitEditing() {
    setMethod(deviation.rcaMethod ?? null);
    setBuffers(parseBuffers(deviation.rcaData));
    setEditing(false);
    setStarted(false);
    setConfirmCancel(false);
  }
  function handleCancel() {
    if (dirty) {
      setConfirmCancel(true);
      return;
    }
    exitEditing();
  }

  async function persist(complete: boolean) {
    if (!method) return;
    const { rcaData, rootCause } = buildPayload(method, buffers);
    setBusy(true);
    const result = complete
      ? await completeInvestigationAction(deviation.id, { rcaMethod: method, rcaData, rootCause })
      : await saveInvestigationProgressAction(deviation.id, { rcaMethod: method, rcaData, rootCause });
    setBusy(false);
    if (!result.success) {
      onError(result.error || "Failed to save investigation.");
      return;
    }
    setEditing(false);
    setStarted(false);
    onChanged(complete ? "Investigation completed." : "Investigation progress saved.");
  }

  /* ── STATE C — completed (and not editing) ── */
  if (completed && !editing) {
    return (
      <div>
        <SectionHeader
          title="Investigation"
          status="Completed"
          action={
            canInvestigate ? (
              <Button variant="ghost" size="sm" icon={Pencil} onClick={() => { setEditing(true); setMethod(deviation.rcaMethod ?? null); }}>
                Edit Investigation
              </Button>
            ) : undefined
          }
        />
        <div className="p-3 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-[#10b981]" aria-hidden="true" />
            <p className="text-[11px] font-semibold text-[#10b981]">Root cause recorded</p>
            {deviation.rcaMethod && <Badge variant="purple">{methodLabel(deviation.rcaMethod)}</Badge>}
            {deviation.investigationCompletedById && (
              <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
                by {resolveUser(deviation.investigationCompletedById)}
              </span>
            )}
          </div>
          <SavedDeviationRcaDisplay method={deviation.rcaMethod} rootCause={deviation.rootCause ?? ""} />
        </div>
      </div>
    );
  }

  /* ── STATE A — not started, and the user cannot investigate (reporter) ── */
  if (!showForm && isReporter) {
    return (
      <div>
        <SectionHeader title="Investigation" />
        <div role="note" className="flex items-start gap-2 p-3 rounded-lg border" style={{ background: "var(--warning-bg)", borderColor: "var(--warning)" }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden="true" />
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Investigation must be performed by someone other than the reporter. Reassign or have a colleague complete this step.
          </p>
        </div>
      </div>
    );
  }

  /* ── STATE A — not started, user can investigate ── */
  if (!showForm) {
    return (
      <div>
        <SectionHeader title="Investigation" />
        <div className="p-3 rounded-lg border space-y-2" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Pick an analysis method to begin.</p>
          <Button variant="primary" size="sm" icon={Search} disabled={!canInvestigate} onClick={() => setStarted(true)}>
            Start Investigation
          </Button>
        </div>
      </div>
    );
  }

  /* ── STATE B — in progress (method picker + per-method form) ── */
  return (
    <div>
      {/* TODO: AI Suggestion button — see roadmap Tier 4 Item 10 */}
      <SectionHeader
        title="Investigation"
        status="In progress"
      />
      <div className="space-y-3">
        {/* Method picker */}
        <div className="flex gap-2 flex-wrap">
          {METHODS.map((m) => {
            const active = method === m.value;
            return (
              <button
                key={m.value}
                type="button"
                aria-pressed={active}
                disabled={!canInvestigate}
                onClick={() => setMethod(m.value)}
                className={clsx("px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all", !canInvestigate && "opacity-50 cursor-not-allowed")}
                style={
                  active
                    ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                    : { background: "transparent", borderColor: "var(--bg-border)", color: "var(--text-secondary)" }
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {!method && (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Pick an analysis method above to begin.</p>
        )}

        {/* 5 Why — Why 5 is emphasized as the root cause (tinted background +
            brand border-left + bolder label), matching FDA 483's editing view. */}
        {method === "5 Why" && (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => {
              const isRoot = i === 4;
              return (
                <div key={i}>
                  <label
                    className={clsx("uppercase tracking-wider block mb-0.5", isRoot ? "text-[11px] font-bold" : "text-[10px] font-semibold")}
                    style={{ color: isRoot ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {isRoot ? "Why 5 — Root cause" : `Why ${i + 1}${i === 0 ? " *" : ""}`}
                  </label>
                  <textarea
                    rows={2}
                    disabled={!canInvestigate}
                    className="input w-full text-[12px] resize-none"
                    style={isRoot ? { background: "var(--brand-muted)", borderLeft: "2px solid var(--brand)" } : undefined}
                    value={buffers.whys[i] ?? ""}
                    onChange={(e) => setBuffers((b) => { const whys = [...b.whys]; whys[i] = e.target.value; return { ...b, whys }; })}
                    placeholder={i === 0 ? "Why did this happen?" : isRoot ? "Root cause" : `Deeper cause of Why ${i}`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Fishbone */}
        {method === "Fishbone" && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FISHBONE_CATEGORIES.map((c) => (
                <div key={c}>
                  <label className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5" style={{ color: "var(--text-muted)" }}>{c}</label>
                  <textarea
                    rows={2}
                    disabled={!canInvestigate}
                    className="input w-full text-[12px] resize-none"
                    value={buffers.cats[c] ?? ""}
                    onChange={(e) => setBuffers((b) => ({ ...b, cats: { ...b.cats, [c]: e.target.value } }))}
                    placeholder={`Contributing factors from ${c.toLowerCase()}…`}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: "var(--text-primary)" }}>Root cause summary *</label>
              <textarea
                rows={2}
                disabled={!canInvestigate}
                className="input w-full text-[12px] resize-none"
                style={{ background: "var(--brand-muted)", borderLeft: "2px solid var(--brand)" }}
                value={buffers.fishRoot}
                onChange={(e) => setBuffers((b) => ({ ...b, fishRoot: e.target.value }))}
                placeholder="Summarize the primary root cause identified…"
              />
            </div>
          </div>
        )}

        {/* Fault Tree / Barrier Analysis — the single freeform block IS the
            root cause, so it always carries the emphasized treatment. */}
        {(method === "Fault Tree" || method === "Barrier Analysis") && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: "var(--text-primary)" }}>
              {methodLabel(method)} analysis — Root cause *
            </label>
            <textarea
              rows={6}
              disabled={!canInvestigate}
              className="input w-full text-[12px] resize-none"
              style={{ background: "var(--brand-muted)", borderLeft: "2px solid var(--brand)" }}
              value={buffers.freeform}
              onChange={(e) => setBuffers((b) => ({ ...b, freeform: e.target.value }))}
              placeholder={`Document your ${methodLabel(method).toLowerCase()} analysis here…`}
            />
          </div>
        )}

        {method && (
          <div className="space-y-2">
            {/* Discard-confirmation strip — only shown when there are unsaved
                changes (pristine Cancel skips straight to exit). No server
                action runs on Cancel/Discard. */}
            {confirmCancel && (
              <div
                role="alertdialog"
                className="flex items-center justify-between gap-2 p-2 rounded-lg border text-[11px]"
                style={{ background: "var(--warning-bg)", borderColor: "var(--warning)", color: "var(--warning)" }}
              >
                <span>Discard unsaved changes? This cannot be undone.</span>
                <span className="flex gap-2 shrink-0">
                  <Button variant="ghost" size="xs" onClick={() => setConfirmCancel(false)}>Cancel</Button>
                  <Button variant="danger" size="xs" onClick={exitEditing}>Discard</Button>
                </span>
              </div>
            )}
            <div className="flex gap-2">
              {/* Cancel — leftmost, text-only (not filled). Exits edit mode
                  without persisting; confirms first if there are unsaved edits. */}
              <Button variant="ghost" size="sm" disabled={busy} onClick={handleCancel}>
                Cancel
              </Button>
              <Button variant="secondary" size="sm" icon={Save} disabled={!canInvestigate || busy} loading={busy} onClick={() => persist(false)}>
                Save progress
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                disabled={!canInvestigate || busy || !canComplete(method, buffers)}
                loading={busy}
                onClick={() => persist(true)}
              >
                Complete Investigation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * CAPA DECISION SECTION
 * ══════════════════════════════════════════════════════════════════ */

interface CapaDecisionProps extends WorkflowProps {
  /** Navigate to the linked CAPA in the CAPA module. */
  linkedCapaId?: string;
  linkedCapaRef?: string;
}

export function CapaDecisionSection({
  deviation,
  currentUserId,
  isQA,
  writable,
  resolveUser,
  onChanged,
  onError,
  linkedCapaId,
  linkedCapaRef,
}: CapaDecisionProps) {
  const router = useRouter();
  const completed = !!deviation.investigationCompletedAt;
  const decided = !!deviation.capaDecisionMade;

  // Capability mirror of the server (excludes super_admin from authoring).
  const devCan = usePermissions("deviation");
  const isReporter = !!deviation.createdById && deviation.createdById === currentUserId;
  const isInvestigator = !!deviation.investigationCompletedById && deviation.investigationCompletedById === currentUserId;
  // QA-role, not the reporter, not the investigator.
  const canDecide = writable && isQA && !isReporter && !isInvestigator && devCan.canReview;

  const [required, setRequired] = useState<boolean | null>(deviation.capaDecisionRequired ?? null);
  const [reason, setReason] = useState(deviation.capaDecisionReason ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRequired(deviation.capaDecisionRequired ?? null);
    setReason(deviation.capaDecisionReason ?? "");
    setEditing(false);
  }, [deviation.id, deviation.capaDecisionMade, deviation.capaDecisionRequired, deviation.capaDecisionReason]);

  /* ── STATE A — investigation not complete → hidden ── */
  if (!completed) return null;

  async function persist(isEdit: boolean) {
    if (required === null || !reason.trim()) return;
    setBusy(true);
    const result = isEdit
      ? await editCAPADecisionAction(deviation.id, { capaRequired: required, reason: reason.trim() })
      : await saveCAPADecisionAction(deviation.id, { capaRequired: required, reason: reason.trim() });
    setBusy(false);
    if (!result.success) {
      onError(result.error || "Failed to save CAPA decision.");
      return;
    }
    setEditing(false);
    onChanged(isEdit ? "CAPA decision updated." : "CAPA decision recorded.");
  }

  /* ── Decision form (STATE B, or editing in STATE E) ── */
  const showForm = (!decided || editing) && canDecide;

  if (showForm) {
    return (
      <div>
        <SectionHeader title="CAPA Decision" status="Required" />
        <div className="p-3 rounded-lg border space-y-3" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Based on the root cause analysis above, does this deviation require a corrective and preventive action (CAPA)?
          </p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-[12px]" style={{ color: "var(--text-primary)" }}>
              <input type="radio" name={`capa-decision-${deviation.id}`} className="accent-[var(--brand)]" checked={required === true} onChange={() => setRequired(true)} />
              CAPA required
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-[12px]" style={{ color: "var(--text-primary)" }}>
              <input type="radio" name={`capa-decision-${deviation.id}`} className="accent-[var(--brand)]" checked={required === false} onChange={() => setRequired(false)} />
              CAPA not required
            </label>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>
              Explain your decision *
            </label>
            <textarea
              rows={3}
              className="input w-full text-[12px] resize-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Justification (recorded in the audit trail for either choice)…"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" icon={CheckCircle2} disabled={busy || required === null || reason.trim().length < 5} loading={busy} onClick={() => persist(editing)}>
              Save Decision
            </Button>
            {editing && <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </div>
      </div>
    );
  }

  /* ── STATE B (no decision) but the current user cannot decide → SoD note ── */
  if (!decided) {
    const reasonMsg = !isQA
      ? `CAPA decision requires QA approval.${deviation.owner ? ` Assigned to: ${resolveUser(deviation.owner)}` : ""}`
      : "CAPA decision needs a QA reviewer who is neither the reporter nor the investigator (segregation of duties).";
    return (
      <div>
        <SectionHeader title="CAPA Decision" status="Required" />
        <div role="note" className="flex items-start gap-2 p-3 rounded-lg border" style={{ background: "var(--warning-bg)", borderColor: "var(--warning)" }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden="true" />
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{reasonMsg}</p>
        </div>
      </div>
    );
  }

  /* ── Decision made — render the verdict + justification ── */
  const decidedBy = deviation.capaDecisionById ? resolveUser(deviation.capaDecisionById) : null;
  const justification = (
    <div className="p-3 rounded-lg border space-y-1.5" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Justification</p>
      <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{deviation.capaDecisionReason}</p>
      {decidedBy && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Decided by {decidedBy}</p>}
    </div>
  );

  /* ── STATE E — CAPA not required ── */
  if (deviation.capaDecisionRequired === false) {
    return (
      <div>
        <SectionHeader
          title="CAPA Decision"
          status="No CAPA required"
          action={canDecide ? <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit Decision</Button> : undefined}
        />
        {justification}
      </div>
    );
  }

  /* ── STATE D — CAPA required + already raised ── */
  if (linkedCapaId) {
    return (
      <div>
        <SectionHeader title="CAPA Decision" status="CAPA raised" />
        <div className="space-y-2">
          {justification}
          <div className="flex items-center justify-between gap-2 p-3 rounded-lg border" style={{ background: "var(--success-bg)", borderColor: "var(--success)" }}>
            <span className="font-mono text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {linkedCapaRef ?? linkedCapaId.slice(0, 8)}
            </span>
            <button
              type="button"
              onClick={() => router.push(`/capa/${linkedCapaId}`)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0"
            >
              Open in CAPA module
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── STATE C — CAPA required, not yet raised. CONSOLIDATION: the Raise-CAPA
   *  action now lives ONLY on the priority-disposition banner (DeviationPage),
   *  the single high/med raise surface. This section keeps the decision record
   *  + justification and points to that banner. ── */
  return (
    <div>
      <SectionHeader title="CAPA Decision" status="CAPA required" />
      <div className="space-y-2">
        {justification}
        <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Raise the CAPA from the priority disposition below.</p>
      </div>
    </div>
  );
}
