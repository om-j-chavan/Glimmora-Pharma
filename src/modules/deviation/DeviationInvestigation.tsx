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
import { Search, Save, CheckCircle2, Pencil, AlertTriangle, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AIButton } from "@/components/ai";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppSelector } from "@/hooks/useAppSelector";
import type { RcaSuggestion } from "@/lib/ai";
import { DeviationRcaAiModal } from "./DeviationRcaAiModal";
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

/** Does the working buffer already hold analysis for this method? Drives the
 *  "replace your existing analysis?" pre-flight before an AI draft is applied —
 *  AI output must never silently overwrite what the investigator wrote. */
function hasAnalysis(method: DeviationRCAMethod, b: RcaBuffers): boolean {
  if (method === "5 Why") return b.whys.some((w) => w.trim());
  if (method === "Fishbone") return !!b.fishRoot.trim() || FISHBONE_CATEGORIES.some((c) => b.cats[c]?.trim());
  return !!b.freeform.trim();
}

/** Write an (already user-reviewed) AI suggestion into the RCA buffers.
 *  Fishbone needs a key remap: the AI contract uses lowercase category keys
 *  (people/process/…), the form buffer uses the TitleCase display labels. */
function applySuggestionToBuffers(b: RcaBuffers, s: RcaSuggestion): RcaBuffers {
  if (s.method === "5 Why") return { ...b, whys: [...s.whys] };
  if (s.method === "Fishbone") {
    return {
      ...b,
      cats: {
        ...b.cats,
        People: s.categories.people,
        Process: s.categories.process,
        Equipment: s.categories.equipment,
        Materials: s.categories.materials,
        Environment: s.categories.environment,
        Management: s.categories.management,
      },
      fishRoot: s.rootCause,
    };
  }
  return { ...b, freeform: s.rootCause };
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
  isQA,
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

  // ── Deviation RCA Intelligence (AI investigation assist) ──────────────
  // Gated by the same AGI policy every other agent reads: the deviation agent
  // must be enabled and the tenant must not be in manual mode.
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiDeviationAgent = useAppSelector((s) => s.settings.agi.agents.deviation);
  const aiAvailable = agiMode !== "manual" && agiDeviationAgent;
  const [aiOpen, setAiOpen] = useState(false);
  // An AI draft awaiting the "replace your existing analysis?" confirmation.
  const [pendingAi, setPendingAi] = useState<{ method: DeviationRCAMethod; suggestion: RcaSuggestion } | null>(null);
  // True once an AI draft has been written into the buffers — drives the
  // provenance banner in the RCA modal, so a reviewer can always tell the form
  // was seeded by the agent rather than typed from scratch.
  const [aiApplied, setAiApplied] = useState(false);

  // Re-seed local state whenever a different deviation is opened, or the
  // server row changes (after router.refresh()).
  useEffect(() => {
    setMethod(deviation.rcaMethod ?? null);
    setBuffers(parseBuffers(deviation.rcaData));
    setStarted(false);
    setEditing(false);
    setConfirmCancel(false);
    setAiOpen(false);
    setPendingAi(null);
    setAiApplied(false);
  }, [deviation.id, deviation.rcaMethod, deviation.rcaData, deviation.investigationCompletedAt]);

  // The RCA form is now entered in a MODAL (Add/Edit RCA), opened explicitly.
  const modalOpen = started || editing;
  // Fix 5 — RCA becomes READ-ONLY once a CAPA has been raised from this
  // deviation: the CAPA was authored from this root cause, so editing it
  // retroactively would break traceability. The RCA DISPLAY stays visible; only
  // the Edit affordance is gated. (Client mirror; a matching server-side gate in
  // completeInvestigation is intentionally out of scope for this UI pass.)
  const rcaEditable = canInvestigate && !deviation.linkedCAPAId;

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
    setAiApplied(false);
  }
  function handleCancel() {
    if (dirty) {
      setConfirmCancel(true);
      return;
    }
    exitEditing();
  }

  /** Write a reviewed AI draft into the RCA form and open it for editing. The
   *  investigator still has to click Save RCA — applying never persists. */
  function applyAiDraft(m: DeviationRCAMethod, s: RcaSuggestion) {
    setMethod(m);
    setBuffers((b) => applySuggestionToBuffers(b, s));
    // Surface the populated form straight away, in whichever mode fits the
    // deviation's state (edit for a completed investigation, add otherwise).
    if (completed) setEditing(true);
    else setStarted(true);
    // Deliberately NOT onChanged(): that reports a persisted change and calls
    // router.refresh(). Nothing has been written yet — the banner inside the
    // RCA modal is the honest signal.
    setAiApplied(true);
  }

  /** Apply entry point — confirms first when it would overwrite existing work. */
  function handleAiApply(m: DeviationRCAMethod, s: RcaSuggestion) {
    if (hasAnalysis(m, buffers)) {
      setPendingAi({ method: m, suggestion: s });
      return;
    }
    applyAiDraft(m, s);
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

  /* ── Summary view (always visible) + RCA modal ── */
  return (
    <div>
      <SectionHeader
        title="Investigation"
        status={completed ? "Completed" : undefined}
        action={
          <span className="flex items-center gap-2">
            {/* AI investigation assist — read-only analysis, so it is offered to
                anyone who can see the deviation (the reporter included: SoD bars
                them from AUTHORING the RCA, not from reading an analysis). The
                Apply action inside the panel is gated on canInvestigate. */}
            {aiAvailable && (
              <AIButton size="sm" onClick={() => setAiOpen(true)} aria-label="Analyse this deviation with AI">
                AI RCA
              </AIButton>
            )}
            {completed
              ? (canInvestigate ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Pencil}
                    disabled={!rcaEditable}
                    title={!rcaEditable ? "RCA cannot be edited after a CAPA is linked" : undefined}
                    onClick={() => { if (!rcaEditable) return; setEditing(true); setMethod(deviation.rcaMethod ?? null); }}
                  >
                    Edit RCA
                  </Button>
                ) : null)
              : (!isReporter ? (
                  <Button variant="primary" size="sm" icon={Search} disabled={!canInvestigate} onClick={() => setStarted(true)}>
                    Add RCA
                  </Button>
                ) : null)}
          </span>
        }
      />

      {/* Body — the saved RCA (read-only), the reporter SoD note, or an
          "add RCA" prompt. The RCA FORM itself lives in the modal below. */}
      {completed ? (
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
      ) : isReporter ? (
        <div role="note" className="flex items-start gap-2 p-3 rounded-lg border" style={{ background: "var(--warning-bg)", borderColor: "var(--warning)" }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden="true" />
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Investigation must be performed by someone other than the reporter. Reassign or have a colleague complete this step.
          </p>
        </div>
      ) : (
        <div className="p-3 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            No root cause analysis recorded yet. Add the RCA to document the investigation.
          </p>
        </div>
      )}

      {/* Tier 2, Item 3 — CAPA Decision. MOVED here from the deviation detail page so
          it lives in the investigation flow (the decision is made AFTER investigation
          completes). CapaDecisionSection self-gates on investigationCompletedAt (returns
          null until then), so it appears for exactly the same deviations at the same
          timing as before — only its render LOCATION changed, in one place. Every prop
          it needs is already an InvestigationSection prop; linkedCapa* come off the
          deviation. */}
      <CapaDecisionSection
        deviation={deviation}
        currentUserId={currentUserId}
        isQA={isQA}
        writable={writable}
        resolveUser={resolveUser}
        onChanged={onChanged}
        onError={onError}
        linkedCapaId={deviation.linkedCAPAId}
        linkedCapaRef={deviation.linkedCAPARef}
      />

      {/* RCA modal — method picker + per-method form (was rendered inline). Save
          completes the investigation (persist(true) → completeInvestigation),
          closes the modal, and refreshes via onChanged. */}
      <Modal
        open={modalOpen}
        onClose={handleCancel}
        title={editing ? "Edit RCA" : "Add RCA"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={handleCancel}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              icon={Save}
              disabled={!canInvestigate || busy || !method || !canComplete(method, buffers)}
              loading={busy}
              onClick={() => persist(true)}
            >
              Save RCA
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {/* Discard-confirmation strip — only shown when there are unsaved
              changes. No server action runs on Cancel/Discard. */}
          {confirmCancel && (
            <div
              role="alertdialog"
              className="flex items-center justify-between gap-2 p-2 rounded-lg border text-[11px]"
              style={{ background: "var(--warning-bg)", borderColor: "var(--warning)", color: "var(--warning)" }}
            >
              <span>Discard unsaved changes? This cannot be undone.</span>
              <span className="flex gap-2 shrink-0">
                <Button variant="ghost" size="xs" onClick={() => setConfirmCancel(false)}>Keep editing</Button>
                <Button variant="danger" size="xs" onClick={exitEditing}>Discard</Button>
              </span>
            </div>
          )}

          {/* AI provenance — the form was seeded by the agent, not typed. Stays
              visible until the draft is saved or the edit is abandoned, so a
              reviewer can always tell AI-drafted text from user-written text. */}
          {aiApplied && (
            <div
              role="status"
              className="flex items-start gap-2 p-2 rounded-lg border text-[11px]"
              style={{ background: "var(--ai-muted)", borderColor: "var(--ai-border)", color: "var(--text-secondary)" }}
            >
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--ai-accent)" }} aria-hidden="true" />
              <span>
                These fields were pre-filled from an AI draft. Edit anything you disagree with — nothing is recorded until you click <strong>Save RCA</strong>.
              </span>
            </div>
          )}

          {/* Method picker + the AI assist trigger for the picked method. */}
          <div className="flex gap-2 flex-wrap items-center">
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
            {aiAvailable && (
              <AIButton
                variant="subtle"
                size="sm"
                className="ml-auto"
                onClick={() => setAiOpen(true)}
                aria-label={method ? `Draft the ${method} analysis with AI` : "Analyse this deviation with AI"}
              >
                {method ? `AI draft — ${method}` : "AI RCA"}
              </AIButton>
            )}
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
        </div>
      </Modal>

      {/* AI investigation assist. Mounted after the RCA modal so its portal
          paints on top when opened from inside it; opened from the section
          header it is the only dialog on screen. */}
      {aiAvailable && (
        <DeviationRcaAiModal
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          deviation={deviation}
          method={method}
          canApply={canInvestigate && (!completed || rcaEditable)}
          onApply={handleAiApply}
        />
      )}

      {/* Pre-flight before an AI draft overwrites analysis already in the form.
          Nothing is persisted either way — this guards the investigator's
          unsaved work, which is exactly what AI output must never clobber. */}
      <ConfirmModal
        open={pendingAi !== null}
        onClose={() => setPendingAi(null)}
        onConfirm={() => {
          if (pendingAi) applyAiDraft(pendingAi.method, pendingAi.suggestion);
          setPendingAi(null);
        }}
        title="Replace your current analysis?"
        message="The RCA fields already contain analysis. Applying the AI draft overwrites them. Nothing is saved until you click Save RCA."
        confirmLabel="Replace"
        cancelLabel="Keep mine"
        variant="warning"
        icon={AlertTriangle}
      />
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
        <SectionHeader title="CAPA Decision" />
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
        <SectionHeader title="CAPA Decision" />
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
