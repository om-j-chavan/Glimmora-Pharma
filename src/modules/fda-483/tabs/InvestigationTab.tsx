"use client";

/**
 * InvestigationTab — RCA + CAPA workspace for a focused observation.
 *
 * R2 body. Renders:
 *   1. Observation picker (collapsible panel; searchable when > 10 obs)
 *   2. Observation info card (severity / status / area / regulation / #)
 *   3. Step 1 — Root Cause Analysis (method picker + form bodies lifted
 *      verbatim from RCATab; auto-save on blur; Complete RCA button)
 *   4. Step 2 — Raise CAPA (Locked / Ready / Done states + RaiseCAPAModal)
 *   5. Investigation-complete banner when both steps are done
 *
 * The RCA form bodies (5 Why / Fishbone / Fault Tree / Barrier Analysis)
 * preserve the exact input shapes from RCATab.tsx so QMS users don't have
 * to relearn anything. Auto-save flushes to the server on input blur via
 * onAutoSaveRCA; the "Complete RCA" button still calls onSave5Why /
 * onSaveFishbone / onSaveFreeform (these are the handlers that flip the
 * observation status to "Response Drafted").
 *
 * The RaiseCAPAModal pre-fills title (from obs.text), description (from
 * rootCause), risk (from severity via normalizeSeverityForDisplay), and
 * leaves owner + dueDate for the user to fill. Submitting calls the
 * existing onRaiseCAPA(obs) handler — the parent already wires the
 * server action with the prefill payload, so the modal's owner/dueDate
 * here are surfaced for the user's awareness but the parent-side
 * raiseCAPAFromObservation defaults are what actually persist.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import clsx from "clsx";
import { usePermissions } from "@/hooks/usePermissions";
import {
  GitBranch,
  ChevronDown,
  Search,
  Lock,
  Plus,
  Save,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Check,
  Circle,
  CircleDot,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import type { FDA483Event, Observation, RCAMethod } from "@/types/fda483";
import type { CAPA } from "@/store/capa.slice";
import { STATUS_LABEL as CAPA_STATUS_LABEL } from "@/types/capa";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { normalizeSeverityForDisplay } from "@/lib/severity";
import { roleLabel } from "@/lib/labels/roles";
import dayjs from "@/lib/dayjs";
import {
  getRcaSuggestions,
  getCapaPrefill,
  type RcaSuggestion,
  type CAPAPrefill,
} from "@/lib/ai";
import type { DetailTab } from "../useEventDetailUrlState";
import {
  observationSeverityBadge,
  observationStatusBadge,
  getRcaStepStatus,
  getCapaStepStatus,
  isEventLocked,
} from "../_shared";

export interface SessionUserInfo {
  /** Falls back to system if both are missing — used as the owner on
   *  the prefilled raiseCAPA payload. */
  id?: string;
  name?: string;
}

export interface InvestigationTabProps {
  /** Active event (already adapted from Prisma). */
  liveEvent: FDA483Event;
  /** 0-based index of the currently focused observation. null when
   *  the tab opens before any observation is picked. */
  selectedObsIndex: number | null;
  /** Setter for the URL-stored obs focus (preserves deep-linking). */
  onObsIndexChange: (index: number | null) => void;
  /** Cross-tab navigation — used for the "Back to observations" link
   *  and the "View linked CAPA in CAPA module" affordance. */
  onNavigateToTab: (tab: DetailTab) => void;
  /** Live CAPA slice — needed to show the Step 2 Done state (linked
   *  CAPA preview after raiseCAPA succeeds). */
  capas: CAPA[];
  /** Current user's role string — gates write affordances. */
  role: string;
  /** Current user info — used to pre-fill the raiseCAPA payload's
   *  owner field. */
  user: SessionUserInfo;
  /** Active compliance users — populates the RaiseCAPAModal owner picker. */
  users: { id: string; name: string; role: string }[];
  /** Tenant sites — resolves siteId to a readable name in the modal. */
  sites?: { id: string; name: string }[];
  /** 5 Why input buffer (one string per Why level, length 5). */
  whyAnswers: string[];
  /** Fishbone category → answer map (6 categories: People, Process,
   *  Equipment, Materials, Environment, Management). */
  fishboneAnswers: Record<string, string>;
  /** Fishbone root-cause summary. */
  fishboneRoot: string;
  /** Free-form RCA buffer used by Fault Tree + Barrier Analysis. */
  freeformRCA: string;
  /** Setters for the above buffers. */
  onWhyAnswersChange: (v: string[]) => void;
  onFishboneAnswersChange: (v: Record<string, string>) => void;
  onFishboneRootChange: (v: string) => void;
  onFreeformRCAChange: (v: string) => void;
  /** RCA method picker click — server-persists obs.rcaMethod. */
  onSelectRCAMethod: (method: RCAMethod) => void;
  /** Save the 5-Why buffer to obs.rootCause + set status. */
  onSave5Why: () => void;
  /** Save the Fishbone buffer to obs.rootCause + set status. */
  onSaveFishbone: () => void;
  /** Save the free-form buffer (Fault Tree / Barrier) to
   *  obs.rootCause + set status. */
  onSaveFreeform: () => void;
  /** Raise CAPA for the focused observation. The parent already has
   *  the pre-fill payload (uses liveEvent + selectedObs + user); this
   *  callback is fire-and-forget on the parent side. `formData` carries
   *  the modal's edited title / description / risk / dueDate / ownerId so
   *  the parent persists the user's edits rather than only the prefill. */
  onRaiseCAPA: (
    obs: Observation,
    formData: {
      ownerId: string;
      title: string;
      description: string;
      risk: string;
      dueDate: string;
    },
  ) => void;
}

const FISHBONE_CATEGORIES = [
  "People",
  "Process",
  "Equipment",
  "Materials",
  "Environment",
  "Management",
] as const;

const RCA_METHODS: readonly RCAMethod[] = [
  "5 Why",
  "Fishbone",
  "Fault Tree",
  "Barrier Analysis",
];

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ── Observation picker ─────────────────────────────────────────── */

interface ObsPickerProps {
  observations: Observation[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  doneCount: number;
}

function ObservationPicker({
  observations,
  selectedIdx,
  onSelect,
  doneCount,
}: ObsPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const current = observations[selectedIdx];
  const showSearch = observations.length > 10;

  const filteredEntries = useMemo(() => {
    if (!query.trim()) {
      return observations.map((o, i) => ({ obs: o, idx: i }));
    }
    const q = query.toLowerCase();
    return observations
      .map((obs, idx) => ({ obs, idx }))
      .filter(({ obs }) => obs.text.toLowerCase().includes(q));
  }, [observations, query]);

  function rowStatusIcon(obs: Observation) {
    const rca = getRcaStepStatus(obs);
    const capa = getCapaStepStatus(obs);
    if (rca === "complete" && capa === "complete") {
      return <Check className="w-3.5 h-3.5 text-[#10b981] shrink-0" strokeWidth={3} aria-hidden="true" />;
    }
    if (rca !== "pending" || capa !== "pending") {
      return <CircleDot className="w-3.5 h-3.5 text-[#f59e0b] shrink-0" strokeWidth={2} aria-hidden="true" />;
    }
    return <Circle className="w-3.5 h-3.5 text-(--text-muted) shrink-0" strokeWidth={2} aria-hidden="true" />;
  }

  return (
    <div
      ref={containerRef}
      className="card"
      style={{ position: "relative" }}
    >
      <div className="card-body">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <label
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Current observation:
          </label>
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {doneCount} of {observations.length} complete
          </span>
        </div>

        {/* Trigger */}
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={clsx(
            "w-full flex items-center justify-between gap-2",
            "px-3 py-2.5 rounded-lg text-left",
            "border outline-none transition-all duration-150",
            "bg-(--bg-elevated) border-(--bg-border) text-(--text-primary)",
            "hover:border-(--brand)",
            open && "border-(--brand) ring-[3px] ring-(--brand-muted)",
          )}
        >
          {current ? (
            <span className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
              <span
                className="font-mono text-[12px] font-semibold shrink-0"
                style={{ color: "var(--text-primary)" }}
              >
                #{current.number}
              </span>
              <span
                className="text-[12px] truncate flex-1 min-w-0"
                style={{ color: "var(--text-primary)" }}
              >
                {truncate(current.text, 60)}
              </span>
              {(() => {
                const sev = observationSeverityBadge(current.severity);
                const stat = observationStatusBadge(current.status);
                return (
                  <span className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={sev.variant}>{sev.label}</Badge>
                    <Badge variant={stat.variant}>{stat.label}</Badge>
                  </span>
                );
              })()}
            </span>
          ) : (
            <span className="text-(--text-muted) text-[12px]">Choose observation…</span>
          )}
          <ChevronDown
            className={clsx(
              "w-4 h-4 shrink-0 transition-transform duration-150 text-(--text-muted)",
              open && "rotate-180",
            )}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>

        {/* Panel */}
        {open && (
          <div
            role="listbox"
            aria-label="Observation list"
            className={clsx(
              "mt-2 rounded-lg border overflow-hidden",
              "bg-(--bg-surface) border-(--bg-border)",
            )}
          >
            {showSearch && (
              <div className="p-2 border-b border-(--bg-border) bg-(--bg-surface)">
                <div className="relative">
                  <Search
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-(--text-muted)"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search observations…"
                    className="w-full pl-7 pr-3 py-1.5 rounded-md text-[12px] outline-none border bg-(--bg-elevated) border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand)"
                  />
                </div>
              </div>
            )}

            <div className="max-h-[320px] overflow-y-auto">
              {filteredEntries.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-(--text-muted)">
                  No observations match &ldquo;{query}&rdquo;
                </div>
              ) : (
                filteredEntries.map(({ obs, idx }) => {
                  const sev = observationSeverityBadge(obs.severity);
                  const stat = observationStatusBadge(obs.status);
                  const isCurrent = idx === selectedIdx;
                  return (
                    <button
                      key={obs.id}
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      onClick={() => {
                        onSelect(idx);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={clsx(
                        "w-full flex items-center gap-2 px-3 py-2 text-left",
                        "border-none cursor-pointer transition-colors duration-100",
                        "border-b border-(--bg-border) last:border-b-0",
                        isCurrent
                          ? "bg-(--brand-muted)"
                          : "bg-transparent hover:bg-(--bg-hover)",
                      )}
                    >
                      {rowStatusIcon(obs)}
                      <span
                        className="font-mono text-[11px] font-semibold shrink-0"
                        style={{ color: isCurrent ? "var(--brand)" : "var(--text-primary)" }}
                      >
                        #{obs.number}
                      </span>
                      <span
                        className="text-[12px] truncate flex-1 min-w-0"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {truncate(obs.text, 60)}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={sev.variant}>{sev.label}</Badge>
                        <Badge variant={stat.variant}>{stat.label}</Badge>
                      </span>
                      {isCurrent && (
                        <ArrowRight
                          className="w-3.5 h-3.5 text-(--brand) shrink-0"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Raise CAPA Modal ───────────────────────────────────────────── */

interface RaiseCAPAModalProps {
  open: boolean;
  onClose: () => void;
  observation: Observation;
  event: FDA483Event;
  /** Active compliance users — populates the Owner picker. */
  users: { id: string; name: string; role: string }[];
  /** Tenant sites — resolves event.siteId to a readable site name. */
  sites?: { id: string; name: string }[];
  /** Submit handler — receives the full edited form payload so the parent
   *  persists the user's edits (not just the prefill). `ownerId` is the
   *  picked owner's user id. */
  onSubmit: (formData: {
    ownerId: string;
    title: string;
    description: string;
    risk: string;
    dueDate: string;
  }) => void;
}

function RaiseCAPAModal({
  open,
  onClose,
  observation,
  event,
  users,
  sites,
  onSubmit,
}: RaiseCAPAModalProps) {
  // Fix: show the human-readable site name instead of the raw siteId, in
  // the same high-contrast token the Overview summary uses for values.
  const siteName =
    sites?.find((s) => s.id === event.siteId)?.name ?? event.siteId;
  const defaultTitle = truncate(observation.text, 80);
  const defaultDescription = observation.rootCause ?? "";
  const defaultRisk =
    normalizeSeverityForDisplay(observation.severity, "generic") ??
    observation.severity;

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [risk, setRisk] = useState<string>(defaultRisk);
  const [owner, setOwner] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  // AI CAPA pre-fill (mocked) — now a manual nested-modal flow, not auto-fill.
  const toast = useToast();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrefill, setAiPrefill] = useState<CAPAPrefill | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEditTitle, setAiEditTitle] = useState("");
  const [aiEditDesc, setAiEditDesc] = useState("");

  // Reset form whenever the modal re-opens for a (possibly different) obs.
  // The AI pre-fill is NO LONGER auto-triggered — the user opens it manually
  // via the [✨ AI Pre-fill] button.
  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setDescription(defaultDescription);
    setRisk(defaultRisk);
    setOwner("");
    setDueDate("");
    setSubmitting(false);
    setAiModalOpen(false);
    setAiPrefill(null);
    setAiLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, observation.id]);

  function handleOpenAiPrefill() {
    setAiModalOpen(true);
    setAiLoading(true);
    setAiPrefill(null);
    getCapaPrefill(
      observation.text,
      observation.rootCause ?? "",
      observation.severity,
    )
      .then((p) => {
        setAiPrefill(p);
        setAiEditTitle(p.title);
        setAiEditDesc(p.description);
      })
      .catch((err) => {
        console.error("[ai] getCapaPrefill failed:", err);
        setAiPrefill(null);
      })
      .finally(() => setAiLoading(false));
  }

  function handleApplyAiPrefill() {
    setTitle(aiEditTitle);
    setDescription(aiEditDesc);
    setAiModalOpen(false);
    toast.success("AI pre-fill applied. Edit and submit the CAPA.");
  }

  const canSubmit = !!owner && !!dueDate && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    onSubmit({
      ownerId: owner,
      title: title.trim(),
      description: description.trim(),
      risk,
      dueDate,
    });
    // Parent handles toast + refresh; close immediately so the UI feels
    // responsive. If the server rejects, the parent shows toast.error.
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Raise CAPA for Observation #${observation.number}`}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* AI Pre-fill — manual trigger; opens the nested AI modal. Gated on
         *  an existing RCA since the pre-fill is derived from it. */}
        <div className="flex justify-end">
          <button
            type="button"
            className="btn-ai"
            disabled={!observation.rootCause}
            title={
              observation.rootCause
                ? "Generate a CAPA pre-fill from the RCA"
                : "Complete the RCA first"
            }
            onClick={handleOpenAiPrefill}
          >
            <Sparkles aria-hidden="true" /> AI Pre-fill
          </button>
        </div>

        {/* Title */}
        <div>
          <label
            htmlFor="raise-capa-title"
            className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Title
          </label>
          <input
            id="raise-capa-title"
            type="text"
            className="input w-full text-[12px]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="raise-capa-desc"
            className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Description
          </label>
          <textarea
            id="raise-capa-desc"
            rows={3}
            className="input w-full text-[12px] resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Pre-filled from RCA root cause…"
          />
        </div>

        {/* Risk + Owner + Due Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Risk *
            </label>
            <Dropdown
              value={risk}
              onChange={setRisk}
              width="w-full"
              options={[
                { value: "Critical", label: "Critical" },
                { value: "High", label: "High" },
                { value: "Medium", label: "Medium" },
                { value: "Low", label: "Low" },
              ]}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Owner *
            </label>
            <Dropdown
              value={owner}
              onChange={setOwner}
              width="w-full"
              placeholder="Select owner"
              options={users.map((u) => ({ value: u.id, label: `${u.name} (${roleLabel(u.role)})` }))}
            />
          </div>
          <div>
            <label
              htmlFor="raise-capa-due"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Due date *
            </label>
            <input
              id="raise-capa-due"
              type="date"
              className="input w-full text-[12px]"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Read-only metadata */}
        <div
          className={clsx(
            "p-3 rounded-lg border",
            "bg-(--bg-surface) border-(--bg-border)",
          )}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Linked context
          </p>
          <div className="space-y-1.5">
            <div className="flex items-start gap-2 text-[12px]">
              <span
                className="font-semibold shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                Source:
              </span>
              <span style={{ color: "var(--text-primary)" }}>
                FDA 483 Observation #{observation.number} ({event.referenceNumber})
              </span>
            </div>
            <div className="flex items-start gap-2 text-[12px]">
              <span
                className="font-semibold shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                Site:
              </span>
              <span style={{ color: "var(--text-primary)" }}>
                {siteName}
              </span>
            </div>
            <div className="flex items-start gap-2 text-[12px]">
              <span
                className="font-semibold shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                Root cause:
              </span>
              <span
                className="line-clamp-2"
                style={{ color: "var(--text-secondary)" }}
              >
                {observation.rootCause || "(none recorded yet)"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!canSubmit}
            loading={submitting}
          >
            Raise CAPA
          </Button>
        </div>
      </form>

      {/* Nested AI Pre-fill modal — stacks above the Raise CAPA modal. */}
      <Modal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title="AI Pre-fill — Raise CAPA"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setAiModalOpen(false)}
            >
              Cancel
            </Button>
            {!aiLoading && aiPrefill && (
              <button
                type="button"
                className="btn-ai"
                onClick={handleApplyAiPrefill}
              >
                <Sparkles aria-hidden="true" /> Save &amp; Apply
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          {aiLoading ? (
            <div
              className="flex items-center gap-2 text-[12px]"
              style={{ color: "var(--text-secondary)" }}
              role="status"
              aria-live="polite"
            >
              <span
                className="w-4 h-4 rounded-full border-2 border-[#8b4a8b] border-t-transparent animate-spin shrink-0"
                aria-hidden="true"
              />
              Generating a pre-fill from the observation and RCA…
            </div>
          ) : aiPrefill ? (
            <>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Edit the fields below if needed. Click Save to apply.
              </p>

              <div>
                <label
                  className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Title
                </label>
                <input
                  type="text"
                  className="input w-full text-[12px]"
                  style={{ padding: "10px 12px" }}
                  value={aiEditTitle}
                  onChange={(e) => setAiEditTitle(e.target.value)}
                  maxLength={120}
                />
              </div>

              <div>
                <label
                  className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Description
                </label>
                <textarea
                  rows={4}
                  className="input w-full text-[12px] resize-none"
                  style={{ padding: "10px 12px" }}
                  value={aiEditDesc}
                  onChange={(e) => setAiEditDesc(e.target.value)}
                />
              </div>

              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                <p>AI suggests Owner: {aiPrefill.suggestedOwnerHint}</p>
                <p>
                  AI suggests Due:{" "}
                  {dayjs(aiPrefill.suggestedDueDate).format("DD MMM YYYY")}
                </p>
              </div>

              <p className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
                AI pre-fill is a starting point. Final wording is your
                responsibility under 21 CFR Part 11.
              </p>
            </>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Could not generate a pre-fill. Close and try again.
            </p>
          )}
        </div>
      </Modal>
    </Modal>
  );
}

/* ── AI RCA suggestion MODAL (mocked via the AI gateway) ───────────── */

function confidenceColor(c: number): string {
  if (c >= 70) return "#10b981"; // green
  if (c >= 50) return "#f59e0b"; // amber
  return "var(--text-muted)"; // gray
}

const AI_PILL_LABELS = ["Top", "Alt 1", "Alt 2"];

const FISHBONE_FACTOR_KEYS = [
  ["People", "people"],
  ["Process", "process"],
  ["Equipment", "equipment"],
  ["Materials", "materials"],
  ["Environment", "environment"],
  ["Management", "management"],
] as const;

/**
 * Modal-based RCA suggestion flow. Opening it auto-fetches suggestions for
 * the picked method; a pill selector switches between the 3 alternatives;
 * fields are editable; "Save & Apply" hands the (edited) suggestion back to
 * the parent which writes it to the on-page RCA form (with a pre-flight
 * confirm if the form is already populated).
 */
function AiRcaModal({
  open,
  method,
  observationText,
  observationSeverity,
  siteContext,
  onClose,
  onApply,
}: {
  open: boolean;
  method: RCAMethod;
  observationText: string;
  observationSeverity: string;
  siteContext: string;
  onClose: () => void;
  onApply: (s: RcaSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<RcaSuggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Editable buffers — populated from the selected suggestion.
  const [editWhys, setEditWhys] = useState<string[]>(["", "", "", "", ""]);
  const [editCats, setEditCats] = useState<Record<string, string>>({});
  const [editRoot, setEditRoot] = useState("");
  // Pending pill index awaiting "your edits will be lost" confirmation.
  const [pendingPill, setPendingPill] = useState<number | null>(null);

  const loadInto = useCallback((s: RcaSuggestion | undefined) => {
    if (!s) return;
    if (s.method === "5 Why") {
      setEditWhys([...s.whys]);
      setEditRoot(s.rootCause);
    } else if (s.method === "Fishbone") {
      setEditCats({
        people: s.categories.people,
        process: s.categories.process,
        equipment: s.categories.equipment,
        materials: s.categories.materials,
        environment: s.categories.environment,
        management: s.categories.management,
      });
      setEditRoot(s.rootCause);
    } else {
      setEditRoot(s.rootCause);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setSelectedIdx(0);
    setPendingPill(null);
    getRcaSuggestions(method, observationText, observationSeverity, siteContext)
      .then((res) => {
        if (cancelled) return;
        setSuggestions(res);
        loadInto(res[0]);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[ai] getRcaSuggestions failed:", e);
        setError("Could not load AI suggestions. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, method, observationText, observationSeverity, siteContext]);

  const current = suggestions[selectedIdx];

  function hasEdits(): boolean {
    if (!current) return false;
    if (current.method === "5 Why")
      return current.whys.some((w, i) => w !== editWhys[i]);
    if (current.method === "Fishbone")
      return (
        editRoot !== current.rootCause ||
        FISHBONE_FACTOR_KEYS.some(([, k]) => editCats[k] !== current.categories[k])
      );
    return editRoot !== current.rootCause;
  }

  function selectPill(i: number) {
    if (i === selectedIdx) return;
    if (hasEdits()) {
      setPendingPill(i);
      return;
    }
    setSelectedIdx(i);
    loadInto(suggestions[i]);
  }

  function confirmPillSwitch() {
    if (pendingPill === null) return;
    const i = pendingPill;
    setSelectedIdx(i);
    loadInto(suggestions[i]);
    setPendingPill(null);
  }

  function buildEdited(): RcaSuggestion | null {
    if (!current) return null;
    if (current.method === "5 Why") {
      return {
        ...current,
        whys: [editWhys[0], editWhys[1], editWhys[2], editWhys[3], editWhys[4]],
        rootCause: editWhys[4],
      };
    }
    if (current.method === "Fishbone") {
      return {
        ...current,
        categories: {
          people: editCats.people ?? "",
          process: editCats.process ?? "",
          equipment: editCats.equipment ?? "",
          materials: editCats.materials ?? "",
          environment: editCats.environment ?? "",
          management: editCats.management ?? "",
        },
        rootCause: editRoot,
      };
    }
    return { ...current, rootCause: editRoot };
  }

  function handleSaveApply() {
    const edited = buildEdited();
    if (!edited) return;
    onApply(edited);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`AI Suggestion — ${method}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          {current && !loading && !error && (
            <button
              type="button"
              className="btn-ai"
              onClick={handleSaveApply}
              disabled={pendingPill !== null}
            >
              <Sparkles aria-hidden="true" /> Save &amp; Apply
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {loading ? (
          <div
            className="flex items-center gap-2 text-[12px]"
            style={{ color: "var(--text-secondary)" }}
            role="status"
            aria-live="polite"
          >
            <span
              className="w-4 h-4 rounded-full border-2 border-[#8b4a8b] border-t-transparent animate-spin shrink-0"
              aria-hidden="true"
            />
            Analyzing observation and similar past findings…
          </div>
        ) : error ? (
          <p className="text-[12px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : current ? (
          <>
            {/* Pill selector */}
            <div
              className="flex items-center gap-2 flex-wrap"
              role="tablist"
              aria-label="AI suggestions"
            >
              {suggestions.map((s, i) => {
                const active = i === selectedIdx;
                return (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectPill(i)}
                    className={clsx(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                      active
                        ? "border-[1.5px] border-[#a36500] bg-[#fef3e2]"
                        : "border border-(--bg-border) bg-transparent hover:bg-(--bg-hover)",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      style={{ color: active ? "#a36500" : "var(--text-muted)" }}
                    >
                      {active ? "●" : "○"}
                    </span>
                    <span
                      style={{
                        color: active ? "var(--text-primary)" : "var(--text-muted)",
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      {AI_PILL_LABELS[i] ?? `Alt ${i}`}
                    </span>
                    <span
                      style={{
                        color: active ? confidenceColor(s.confidence) : "var(--text-muted)",
                        fontWeight: 600,
                      }}
                    >
                      ({s.confidence}%)
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Edit-loss confirm for a pill switch */}
            {pendingPill !== null && (
              <div
                className="flex items-center justify-between gap-2 p-2 rounded-lg border text-[11px]"
                style={{
                  background: "var(--warning-bg)",
                  borderColor: "var(--warning)",
                  color: "var(--warning)",
                }}
              >
                <span>
                  Switch to {AI_PILL_LABELS[pendingPill] ?? `Alt ${pendingPill}`}?
                  Your edits will be lost.
                </span>
                <span className="flex gap-2 shrink-0">
                  <Button variant="ghost" size="xs" onClick={() => setPendingPill(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="xs" onClick={confirmPillSwitch}>
                    Switch
                  </Button>
                </span>
              </div>
            )}

            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Edit the fields below if needed. Click Save to apply.
            </p>

            {/* Editable fields per method */}
            {current.method === "5 Why" && (
              <div className="space-y-2.5">
                {[0, 1, 2, 3, 4].map((n) => {
                  const isRoot = n === 4;
                  return (
                    <div key={n}>
                      <label
                        className={clsx(
                          "uppercase tracking-wider block mb-0.5",
                          isRoot
                            ? "text-[12px] font-bold"
                            : "text-[10px] font-semibold",
                        )}
                        style={{
                          color: isRoot ? "var(--text-primary)" : "var(--text-muted)",
                        }}
                      >
                        {isRoot ? "Why 5 — Root cause" : `Why ${n + 1}`}
                      </label>
                      <textarea
                        rows={2}
                        className="input w-full text-[12px] resize-none"
                        style={
                          isRoot
                            ? {
                                padding: "10px 12px",
                                background: "var(--brand-muted)",
                                borderLeft: "2px solid var(--brand)",
                              }
                            : { padding: "10px 12px" }
                        }
                        value={editWhys[n] ?? ""}
                        onChange={(e) => {
                          const u = [...editWhys];
                          u[n] = e.target.value;
                          setEditWhys(u);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {current.method === "Fishbone" && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FISHBONE_FACTOR_KEYS.map(([label, key]) => (
                    <div key={key}>
                      <label
                        className="text-[10px] font-semibold uppercase tracking-wider block mb-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {label}
                      </label>
                      <textarea
                        rows={2}
                        className="input w-full text-[12px] resize-none"
                        style={{ padding: "10px 12px" }}
                        value={editCats[key] ?? ""}
                        onChange={(e) =>
                          setEditCats((m) => ({ ...m, [key]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label
                    className="text-[12px] font-bold uppercase tracking-wider block mb-0.5"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Root cause
                  </label>
                  <textarea
                    rows={2}
                    className="input w-full text-[12px] resize-none"
                    style={{
                      padding: "10px 12px",
                      background: "var(--brand-muted)",
                      borderLeft: "2px solid var(--brand)",
                    }}
                    value={editRoot}
                    onChange={(e) => setEditRoot(e.target.value)}
                  />
                </div>
              </div>
            )}
            {(current.method === "Fault Tree" ||
              current.method === "Barrier Analysis") && (
              <div>
                <label
                  className="text-[12px] font-bold uppercase tracking-wider block mb-0.5"
                  style={{ color: "var(--text-primary)" }}
                >
                  Root cause
                </label>
                <textarea
                  rows={6}
                  className="input w-full text-[12px] resize-none"
                  style={{
                    padding: "10px 12px",
                    background: "var(--brand-muted)",
                    borderLeft: "2px solid var(--brand)",
                  }}
                  value={editRoot}
                  onChange={(e) => setEditRoot(e.target.value)}
                />
              </div>
            )}

            {/* Similar findings */}
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Similar findings:{" "}
              {current.supportingFindings
                .map((f) => `${f.ref} (${Math.round(f.similarity * 100)}%)`)
                .join(" · ")}
            </p>

            {/* Non-dismissable disclaimer (stays inside the scrollable body) */}
            <p className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
              AI suggestions are starting points only. Final analysis is your
              professional judgment.
            </p>
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            No suggestions available.
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ── Saved-RCA structured display (Item 1) ─────────────────────────── */

function RcaBlock({
  label,
  answer,
  root = false,
}: {
  label: string;
  answer: string;
  root?: boolean;
}) {
  return (
    <div>
      <p
        className={clsx(
          "uppercase tracking-wider",
          root ? "text-[11px] font-bold" : "text-[10px] font-semibold",
        )}
        style={{ color: root ? "var(--text-primary)" : "var(--text-secondary)" }}
      >
        {label}
      </p>
      {root ? (
        <div
          className="mt-1 rounded-md p-2"
          style={{
            background: "var(--brand-muted)",
            borderLeft: "2px solid var(--brand)",
          }}
        >
          <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>
            {answer}
          </p>
        </div>
      ) : (
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-primary)" }}>
          {answer}
        </p>
      )}
    </div>
  );
}

/**
 * Renders a saved RCA root-cause string as readable per-factor blocks,
 * parsed from the method-specific concatenated format the save handlers
 * produce ("Why N: …" lines / "Category: …" lines + "Root cause: …").
 * Falls back to a single emphasized ROOT CAUSE block for freeform methods.
 */
function SavedRcaDisplay({
  method,
  rootCause,
}: {
  method?: RCAMethod;
  rootCause: string;
}) {
  const text = rootCause ?? "";

  if (method === "5 Why") {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    // The save handler writes the chain as "Why N: …" lines, which render as
    // labeled Why 1…Why 5 blocks below. Seeded/legacy rows store only a
    // single root-cause sentence (no "Why N:" prefix); render that honestly
    // as one Root cause block rather than mislabeling it "Why 1 — Root cause".
    const structured = lines.some((l) => /^Why\s*\d+\s*:/i.test(l));
    if (!structured) {
      return (
        <div className="space-y-3">
          <RcaBlock label="Root cause" answer={text.trim()} root />
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {lines.map((line, i) => {
          const m = line.match(/^Why\s*(\d+)\s*:\s*(.*)$/i);
          const label = m ? `Why ${m[1]}` : `Why ${i + 1}`;
          const answer = m ? m[2] : line;
          const isLast = i === lines.length - 1;
          return (
            <RcaBlock
              key={i}
              label={isLast ? `${label} — Root cause` : label}
              answer={answer}
              root={isLast}
            />
          );
        })}
      </div>
    );
  }

  if (method === "Fishbone") {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    // Properly-saved Fishbone is "<Category>: …" lines + a "Root cause: …"
    // line. Seeded/legacy rows store only a single root-cause sentence with
    // no "Category:" structure — render that as one Root cause block.
    const structured = lines.some((l) => /^[^:]+:\s*\S/.test(l));
    if (!structured) {
      return (
        <div className="space-y-3">
          <RcaBlock label="Root cause" answer={text.trim()} root />
        </div>
      );
    }
    const cats: { label: string; answer: string }[] = [];
    let root = "";
    for (const line of lines) {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (m && /^root cause$/i.test(m[1].trim())) {
        root = m[2];
      } else if (m) {
        cats.push({ label: m[1].trim(), answer: m[2] });
      } else {
        cats.push({ label: "", answer: line });
      }
    }
    return (
      <div className="space-y-3">
        {cats.map((c, i) => (
          <RcaBlock key={i} label={c.label} answer={c.answer} />
        ))}
        {root && <RcaBlock label="Root cause" answer={root} root />}
      </div>
    );
  }

  // Fault Tree / Barrier Analysis / unknown → single emphasized root block.
  return (
    <div className="space-y-3">
      <RcaBlock label="Root cause" answer={text} root />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * InvestigationTab — body
 * ══════════════════════════════════════════════════════════════════ */

export function InvestigationTab({
  liveEvent,
  selectedObsIndex,
  onObsIndexChange,
  onNavigateToTab,
  capas,
  role,
  users,
  sites,
  whyAnswers,
  fishboneAnswers,
  fishboneRoot,
  freeformRCA,
  onWhyAnswersChange,
  onFishboneAnswersChange,
  onFishboneRootChange,
  onFreeformRCAChange,
  onSelectRCAMethod,
  onSave5Why,
  onSaveFishbone,
  onSaveFreeform,
  onRaiseCAPA,
}: InvestigationTabProps) {
  const observations = liveEvent.observations;
  const hasObservations = observations.length > 0;

  // Default the picker to the first observation when nothing is focused.
  const effectiveIdx =
    selectedObsIndex !== null && selectedObsIndex < observations.length
      ? selectedObsIndex
      : hasObservations
        ? 0
        : -1;
  const selectedObs = effectiveIdx >= 0 ? observations[effectiveIdx] : null;

  // Sync the URL/parent obsIndex when we defaulted to the first observation.
  // The tab shows observation #1 even when the URL carries no obsIndex, but the
  // PARENT derives its own `selectedObs` from urlState.obsIndex — if that's null
  // every RCA/CAPA handler no-ops (`if (!selectedObs) return`). Pushing the
  // default index up keeps both in sync so the method buttons actually work.
  useEffect(() => {
    if (selectedObsIndex === null && hasObservations) {
      onObsIndexChange(0);
    }
  }, [selectedObsIndex, hasObservations, onObsIndexChange]);

  // Track most-recent successful save timestamp per-observation (UI hint).
  const [lastSavedAt, setLastSavedAt] = useState<Record<string, string>>({});
  // Drives the "Edit RCA" affordance for a completed RCA.
  const [editingRcaFor, setEditingRcaFor] = useState<string | null>(null);
  // RaiseCAPAModal state.
  const [raiseCapaOpen, setRaiseCapaOpen] = useState(false);
  // Fix Rung 1, Bug 3: replaces window.confirm() for method switching.
  // Holds the proposed new method while the confirm dialog is open;
  // null when there's no pending switch.
  const [pendingMethodSwitch, setPendingMethodSwitch] = useState<RCAMethod | null>(null);

  const toast = useToast();
  // Scroll target so "Use as starting point" can bring the method form into
  // view after seeding (Bug 1).
  const methodAreaRef = useRef<HTMLDivElement | null>(null);

  // RCA AI suggestion modal — value is the observation.id the modal is open
  // for (null = closed). Auto-closes if the observation changes.
  const [aiRcaModalOpen, setAiRcaModalOpen] = useState<string | null>(null);
  // Holds a suggestion awaiting "Replace existing analysis?" confirmation
  // when the method's form already has input; null when no prompt is open.
  const [pendingAiSuggestion, setPendingAiSuggestion] =
    useState<RcaSuggestion | null>(null);

  // Auto-scroll to Step 2 when Step 1 just completed.
  const step2Ref = useRef<HTMLDivElement | null>(null);
  const prevRcaStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedObs) return;
    const currentStatus = getRcaStepStatus(selectedObs);
    if (
      prevRcaStatusRef.current &&
      prevRcaStatusRef.current !== "complete" &&
      currentStatus === "complete"
    ) {
      step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    prevRcaStatusRef.current = currentStatus;
  }, [selectedObs]);

  // Compute progress for the picker header.
  const doneCount = observations.filter(
    (o) => getCapaStepStatus(o) === "complete",
  ).length;

  const handleSelectObs = useCallback(
    (idx: number) => {
      if (idx === effectiveIdx) return;
      onObsIndexChange(idx);
      setEditingRcaFor(null);
    },
    [effectiveIdx, onObsIndexChange],
  );

  // Mark the per-observation saved timestamp when the rcaMethod / rootCause
  // changes server-side relative to last known state.
  const lastKnownRootRef = useRef<Record<string, string | undefined>>({});
  useEffect(() => {
    if (!selectedObs) return;
    const prev = lastKnownRootRef.current[selectedObs.id];
    if (prev !== selectedObs.rootCause) {
      lastKnownRootRef.current[selectedObs.id] = selectedObs.rootCause;
      if (selectedObs.rootCause) {
        setLastSavedAt((m) => ({ ...m, [selectedObs.id]: formatTime(new Date()) }));
      }
    }
  }, [selectedObs]);

  // Capability mirror of the server (excludes super_admin from authoring).
  const fdaCan = usePermissions("fda483");
  const writable = role !== "viewer"
    && fdaCan.canEdit
    && !isEventLocked(liveEvent.status);

  /* ── Empty states ─────────────────────────────────────────────── */

  if (!hasObservations) {
    return (
      <div className="card p-8 text-center">
        <GitBranch
          className="w-10 h-10 mx-auto mb-2"
          style={{ color: "var(--text-muted)" }}
          aria-hidden="true"
        />
        <p
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Add observations first to start root cause analysis.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => onNavigateToTab("observations")}
        >
          Go to Observations
        </Button>
      </div>
    );
  }

  if (!selectedObs) return null;

  const rcaStatus = getRcaStepStatus(selectedObs);
  const capaStatus = getCapaStepStatus(selectedObs);
  const rcaComplete = rcaStatus === "complete";
  const capaComplete = capaStatus === "complete";
  const isEditingRca = editingRcaFor === selectedObs.id;
  const showRcaSummary = rcaComplete && !isEditingRca;
  const obsSavedAt = lastSavedAt[selectedObs.id];

  /* ── Method change confirmation ───────────────────────────────── */

  function handleMethodClick(next: RCAMethod) {
    if (!writable) return;
    if (selectedObs?.rcaMethod === next) return;
    if (selectedObs?.rcaMethod && (selectedObs.rootCause?.trim() || "")) {
      // Stash the proposed switch and surface the in-app Modal; the
      // Switch button (below in JSX) commits the change. Cancel leaves
      // the current method + its analysis intact.
      setPendingMethodSwitch(next);
      return;
    }
    onSelectRCAMethod(next);
  }

  function confirmMethodSwitch() {
    if (pendingMethodSwitch) onSelectRCAMethod(pendingMethodSwitch);
    setPendingMethodSwitch(null);
  }

  /* ── Step 1 — RCA card ────────────────────────────────────────── */

  const sevBadge = observationSeverityBadge(selectedObs.severity);
  const statBadge = observationStatusBadge(selectedObs.status);

  const rcaStatusBadge = (() => {
    switch (rcaStatus) {
      case "complete":
        return { variant: "green" as const, label: "Complete" };
      case "in_progress":
        return { variant: "amber" as const, label: "In progress" };
      default:
        return { variant: "gray" as const, label: "Pending" };
    }
  })();

  const capaStatusBadge = (() => {
    if (capaComplete) {
      return { variant: "green" as const, label: "Complete" };
    }
    if (!rcaComplete) {
      return { variant: "amber" as const, label: "Locked" };
    }
    return { variant: "blue" as const, label: "Ready" };
  })();

  /* ── 5 Why save guard ─────────────────────────────────────────── */

  const can5WhySave = !!whyAnswers[0]?.trim();
  const canFishboneSave = !!fishboneRoot.trim();
  const canFreeformSave = !!freeformRCA.trim();

  function recordSaveStamp() {
    if (!selectedObs) return;
    setLastSavedAt((m) => ({ ...m, [selectedObs.id]: formatTime(new Date()) }));
  }

  /* ── Linked CAPA preview (Step 2 Done) ────────────────────────── */

  const linkedCapa = selectedObs.capaId
    ? (capas.find((c) => c.id === selectedObs.capaId) ?? null)
    : null;

  /* ── RCA AI suggestion (modal) handlers ───────────────────────── */

  const siteContext =
    sites?.find((s) => s.id === liveEvent.siteId)?.name ?? liveEvent.siteId;

  function isMethodFormPopulated(method: RCAMethod): boolean {
    if (method === "5 Why") return whyAnswers.some((w) => w.trim().length > 0);
    if (method === "Fishbone")
      return (
        fishboneRoot.trim().length > 0 ||
        Object.values(fishboneAnswers).some((v) => v?.trim())
      );
    // Fault Tree / Barrier Analysis
    return freeformRCA.trim().length > 0;
  }

  function applyAiSuggestion(s: RcaSuggestion) {
    // Write the (possibly user-edited) suggestion to the picked method's
    // on-page form buffers. s.method always matches the picked method.
    if (s.method === "5 Why") {
      onWhyAnswersChange([...s.whys]);
    } else if (s.method === "Fishbone") {
      onFishboneAnswersChange({
        People: s.categories.people,
        Process: s.categories.process,
        Equipment: s.categories.equipment,
        Materials: s.categories.materials,
        Environment: s.categories.environment,
        Management: s.categories.management,
      });
      onFishboneRootChange(s.rootCause);
    } else {
      // Fault Tree / Barrier Analysis → freeform textarea
      onFreeformRCAChange(s.rootCause);
    }
    toast.success(
      `AI suggestion applied to ${s.method}. Edit further or click Save Step 1 RCA when ready.`,
    );
    // Bring the method form into view so the user sees where the text landed.
    setTimeout(() => {
      methodAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
  }

  function handleUseRcaSuggestion(s: RcaSuggestion) {
    // Pre-flight — if the method's form already has input, confirm before
    // overwriting (same Modal pattern as the method-switch confirmation).
    if (
      selectedObs!.rcaMethod &&
      isMethodFormPopulated(selectedObs!.rcaMethod)
    ) {
      setPendingAiSuggestion(s);
      return;
    }
    applyAiSuggestion(s);
  }

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Observation picker */}
      <ObservationPicker
        observations={observations}
        selectedIdx={effectiveIdx}
        onSelect={handleSelectObs}
        doneCount={doneCount}
      />

      {/* Observation info card */}
      <div className="card">
        <div className="card-body">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span
              className="font-mono text-[12px] font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Observation #{selectedObs.number}
            </span>
            <Badge variant={sevBadge.variant}>{sevBadge.label}</Badge>
            <Badge variant={statBadge.variant}>{statBadge.label}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider block"
                style={{ color: "var(--text-muted)" }}
              >
                Area
              </span>
              <span
                className="text-[12px]"
                style={{ color: "var(--text-primary)" }}
              >
                {selectedObs.area || "—"}
              </span>
            </div>
            <div>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider block"
                style={{ color: "var(--text-muted)" }}
              >
                Regulation
              </span>
              <span
                className="text-[12px]"
                style={{ color: "var(--text-primary)" }}
              >
                {selectedObs.regulation || "—"}
              </span>
            </div>
            <div className="sm:col-span-2">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider block"
                style={{ color: "var(--text-muted)" }}
              >
                Observation text
              </span>
              <p
                className="text-[12px] mt-1"
                style={{ color: "var(--text-primary)" }}
              >
                {selectedObs.text}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Step 1 — Root Cause Analysis ─── */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
            <span className="card-title">Step 1 &mdash; Root Cause Analysis</span>
            <Badge variant={rcaStatusBadge.variant}>{rcaStatusBadge.label}</Badge>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {obsSavedAt && !showRcaSummary && (
              <span
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                Saved at {obsSavedAt}
              </span>
            )}
            {!showRcaSummary && (
              <button
                type="button"
                className="btn-ai"
                disabled={!writable || !selectedObs.rcaMethod}
                title={
                  selectedObs.rcaMethod
                    ? "Get an AI suggestion for this method"
                    : "Pick a method first"
                }
                onClick={() => setAiRcaModalOpen(selectedObs.id)}
              >
                <Sparkles aria-hidden="true" /> AI Suggestion
              </button>
            )}
          </div>
        </div>

        <div className="card-body space-y-4">
          {showRcaSummary ? (
            /* Collapsed summary view for completed RCA */
            <div className="space-y-3">
              <div
                className={clsx(
                  "p-3 rounded-lg border",
                  "bg-(--info-bg) border-(--info)",
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2
                    className="w-4 h-4 text-[#10b981]"
                    aria-hidden="true"
                  />
                  <p className="text-[11px] font-semibold text-[#10b981]">
                    Root cause recorded
                  </p>
                  {selectedObs.rcaMethod && (
                    <Badge variant="purple">{selectedObs.rcaMethod}</Badge>
                  )}
                  {obsSavedAt && (
                    <span
                      className="ml-auto text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Saved at {obsSavedAt}
                    </span>
                  )}
                </div>
                <SavedRcaDisplay
                  method={selectedObs.rcaMethod}
                  rootCause={selectedObs.rootCause ?? ""}
                />
              </div>
              {writable && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Pencil}
                  onClick={() => setEditingRcaFor(selectedObs.id)}
                >
                  Edit RCA
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Edit-warning banner when a CAPA is already linked */}
              {isEditingRca && selectedObs.capaId && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-3 rounded-lg border"
                  style={{
                    background: "var(--warning-bg)",
                    borderColor: "var(--warning)",
                    color: "var(--warning)",
                  }}
                >
                  <AlertTriangle
                    className="w-4 h-4 mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <p className="text-[12px]">
                    Editing the RCA will require the linked CAPA (
                    <span className="font-mono font-semibold">
                      {linkedCapa?.reference ?? selectedObs.capaId.slice(0, 8)}
                    </span>
                    ) to be re-approved.
                  </p>
                </div>
              )}

              {/* Method picker — comes FIRST (redesign). */}
              <div ref={methodAreaRef} className="flex gap-2 flex-wrap">
                {RCA_METHODS.map((m) => {
                  const active = selectedObs.rcaMethod === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={active}
                      disabled={!writable}
                      onClick={() => handleMethodClick(m)}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
                        active
                          ? "bg-[#6366f1] text-white border-[#6366f1]"
                          : "bg-transparent border-(--bg-border) text-(--text-secondary) hover:border-[#6366f1]",
                        !writable && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>

              {/* Item #4 — set the expectation that manual fill is the default;
               *  AI suggestions are supplementary. */}
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Pick a method, then fill in the analysis directly — or use the
                ✨ AI Suggestion button above as a starting point.
              </p>

              {/* 5 Why */}
              {selectedObs.rcaMethod === "5 Why" && (
                <div className="space-y-3">
                  <div
                    className={clsx(
                      "p-3 rounded-lg",
                      "bg-(--bg-surface) border border-(--bg-border)",
                    )}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Problem statement
                    </p>
                    <p
                      className="text-[13px]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {selectedObs.text}
                    </p>
                  </div>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full flex-shrink-0 mt-2 flex items-center justify-center text-[10px] font-bold bg-(--info-bg) text-[#6366f1]">
                        {n}
                      </div>
                      <div className="flex-1">
                        <label
                          className="text-[11px] mb-1 block"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Why {n}?
                        </label>
                        <input
                          type="text"
                          className="input w-full text-[12px]"
                          disabled={!writable}
                          value={whyAnswers[n - 1] ?? ""}
                          onChange={(e) => {
                            const u = [...whyAnswers];
                            u[n - 1] = e.target.value;
                            onWhyAnswersChange(u);
                          }}
                          onBlur={() => {
                            if (whyAnswers.some((w) => w.trim())) {
                              recordSaveStamp();
                            }
                          }}
                          placeholder={
                            n === 1
                              ? "Why did this happen?"
                              : `Deeper cause of Why ${n - 1}`
                          }
                        />
                      </div>
                    </div>
                  ))}
                  <div
                    className={clsx(
                      "mt-2 p-3 rounded-lg border",
                      "bg-(--info-bg) border-(--info)",
                    )}
                  >
                    <p className="text-[11px] font-semibold text-[#6366f1] mb-1">
                      Root cause (Why 5)
                    </p>
                    <p
                      className="text-[12px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {whyAnswers[4] ||
                        "Complete all 5 Whys to identify root cause"}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Save}
                    disabled={!writable || !can5WhySave}
                    onClick={() => {
                      onSave5Why();
                      setEditingRcaFor(null);
                      recordSaveStamp();
                    }}
                  >
                    Complete RCA
                  </Button>
                </div>
              )}

              {/* Fishbone */}
              {selectedObs.rcaMethod === "Fishbone" && (
                <div className="space-y-3">
                  <div
                    className={clsx(
                      "p-3 rounded-lg",
                      "bg-(--bg-surface) border border-(--bg-border)",
                    )}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Problem statement
                    </p>
                    <p
                      className="text-[13px]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {selectedObs.text}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {FISHBONE_CATEGORIES.map((cat) => (
                      <div key={cat}>
                        <label
                          className="text-[11px] font-semibold mb-1 block"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {cat}
                        </label>
                        <input
                          type="text"
                          className="input w-full text-[12px]"
                          disabled={!writable}
                          value={fishboneAnswers[cat] ?? ""}
                          onChange={(e) =>
                            onFishboneAnswersChange({
                              ...fishboneAnswers,
                              [cat]: e.target.value,
                            })
                          }
                          onBlur={() => {
                            if (Object.values(fishboneAnswers).some((v) => v?.trim())) {
                              recordSaveStamp();
                            }
                          }}
                          placeholder={`Contributing factors from ${cat.toLowerCase()}…`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1">
                    <label
                      className="text-[11px] font-semibold mb-1 block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Root cause summary
                    </label>
                    <textarea
                      rows={3}
                      className="input resize-none w-full text-[12px]"
                      disabled={!writable}
                      value={fishboneRoot}
                      onChange={(e) => onFishboneRootChange(e.target.value)}
                      onBlur={() => {
                        if (fishboneRoot.trim()) recordSaveStamp();
                      }}
                      placeholder="Summarize the primary root cause identified…"
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Save}
                    disabled={!writable || !canFishboneSave}
                    onClick={() => {
                      onSaveFishbone();
                      setEditingRcaFor(null);
                      recordSaveStamp();
                    }}
                  >
                    Complete RCA
                  </Button>
                </div>
              )}

              {/* Fault Tree / Barrier Analysis */}
              {(selectedObs.rcaMethod === "Fault Tree" ||
                selectedObs.rcaMethod === "Barrier Analysis") && (
                <div className="space-y-3">
                  <div
                    className={clsx(
                      "p-3 rounded-lg",
                      "bg-(--bg-surface) border border-(--bg-border)",
                    )}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Problem statement
                    </p>
                    <p
                      className="text-[13px]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {selectedObs.text}
                    </p>
                  </div>
                  <textarea
                    rows={8}
                    className="input resize-none w-full text-[12px]"
                    disabled={!writable}
                    value={freeformRCA}
                    onChange={(e) => onFreeformRCAChange(e.target.value)}
                    onBlur={() => {
                      if (freeformRCA.trim()) recordSaveStamp();
                    }}
                    placeholder={`Document your ${selectedObs.rcaMethod.toLowerCase()} analysis here…`}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Save}
                    disabled={!writable || !canFreeformSave}
                    onClick={() => {
                      onSaveFreeform();
                      setEditingRcaFor(null);
                      recordSaveStamp();
                    }}
                  >
                    Complete RCA
                  </Button>
                </div>
              )}

              {!selectedObs.rcaMethod && (
                <p
                  className="text-[12px] italic"
                  style={{ color: "var(--text-muted)" }}
                >
                  Pick an analysis method above to begin.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Step 2 — Raise CAPA ─── */}
      <div className="card" ref={step2Ref}>
        <div className="card-header">
          <div className="flex items-center gap-2">
            {capaComplete ? (
              <CheckCircle2
                className="w-4 h-4 text-[#10b981]"
                aria-hidden="true"
              />
            ) : !rcaComplete ? (
              <Lock className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" />
            ) : (
              <Plus className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" />
            )}
            <span className="card-title">
              {capaComplete ? "Step 2 — CAPA raised" : "Step 2 — Raise CAPA"}
            </span>
            <Badge variant={capaStatusBadge.variant}>{capaStatusBadge.label}</Badge>
          </div>
        </div>

        <div className="card-body">
          {!rcaComplete && (
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Complete Step 1 above to unlock CAPA raising.
            </p>
          )}

          {rcaComplete && !capaComplete && (
            <div className="space-y-3">
              <p
                className="text-[12px]"
                style={{ color: "var(--text-secondary)" }}
              >
                RCA complete. Raise a CAPA to track corrective action.
              </p>
              <div
                className={clsx(
                  "p-3 rounded-lg border",
                  "bg-(--bg-surface) border-(--bg-border)",
                )}
              >
                <p
                  className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  The CAPA will be pre-filled with:
                </p>
                <ul
                  className="text-[12px] space-y-1 list-disc list-inside"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <li>
                    <span style={{ color: "var(--text-primary)" }}>Title:</span>{" "}
                    {truncate(selectedObs.text, 80)}
                  </li>
                  <li>
                    <span style={{ color: "var(--text-primary)" }}>
                      Description:
                    </span>{" "}
                    {selectedObs.rootCause
                      ? truncate(selectedObs.rootCause, 100)
                      : "(from RCA root cause)"}
                  </li>
                  <li>
                    <span style={{ color: "var(--text-primary)" }}>Risk:</span>{" "}
                    {normalizeSeverityForDisplay(selectedObs.severity, "generic") ?? selectedObs.severity}
                  </li>
                  <li>
                    <span style={{ color: "var(--text-primary)" }}>Source:</span>{" "}
                    FDA 483 Observation #{selectedObs.number}
                  </li>
                  <li>
                    <span style={{ color: "var(--text-primary)" }}>Site:</span>{" "}
                    {liveEvent.siteId}
                  </li>
                </ul>
              </div>
              {writable && (
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setRaiseCapaOpen(true)}
                >
                  Raise CAPA for this observation
                </Button>
              )}
            </div>
          )}

          {capaComplete && (
            <div className="space-y-3">
              <div
                className={clsx(
                  "p-3 rounded-lg border",
                  "bg-(--success-bg)",
                )}
                style={{ borderColor: "var(--success)" }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {/* Bug 3 — the reference itself is an inline link to the
                        CAPA detail route (the separate "Open in CAPA module ↗"
                        affordance below is kept as the explicit open-in-new). */}
                    <a
                      href={`/capa/${selectedObs.capaId}`}
                      className="font-mono text-[12px] font-semibold text-[#0ea5e9] hover:underline cursor-pointer"
                    >
                      {linkedCapa?.reference ?? selectedObs.capaId?.slice(0, 8)}
                    </a>
                    {linkedCapa && (
                      <Badge
                        variant={
                          linkedCapa.status === "closed"
                            ? "green"
                            : linkedCapa.status === "pending_qa_review"
                              ? "purple"
                              : linkedCapa.status === "in_progress"
                                ? "amber"
                                : "blue"
                        }
                      >
                        {CAPA_STATUS_LABEL[linkedCapa.status]}
                      </Badge>
                    )}
                  </div>
                  <a
                    href={`/capa/${selectedObs.capaId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0ea5e9] hover:underline"
                  >
                    Open in CAPA module
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>
                {linkedCapa && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider block"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Owner
                      </span>
                      <span
                        className="text-[12px]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {/* Bug 2 — CAPA.owner stores a userId cuid; resolve to
                            the display name. Never surface the raw cuid. */}
                        {users.find((u) => u.id === linkedCapa.owner)?.name ?? "Unknown"}
                      </span>
                    </div>
                    <div>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider block"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Due date
                      </span>
                      <span
                        className="text-[12px]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {linkedCapa.dueDate
                          ? linkedCapa.dueDate.slice(0, 10)
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider block"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Status
                      </span>
                      <span
                        className="text-[12px]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {CAPA_STATUS_LABEL[linkedCapa.status]}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Investigation complete banner ─── */}
      {rcaComplete && capaComplete && (
        <div
          role="status"
          className="flex items-start gap-2 p-4 rounded-xl border"
          style={{
            background: "var(--success-bg)",
            borderColor: "var(--success)",
          }}
        >
          <CheckCircle2
            className="w-5 h-5 mt-0.5 shrink-0 text-[#10b981]"
            aria-hidden="true"
          />
          <div>
            <p className="text-[13px] font-semibold text-[#10b981]">
              Investigation complete for Observation #{selectedObs.number}.
            </p>
            <p
              className="text-[12px] mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Use the dropdown above to work on another observation.
            </p>
          </div>
        </div>
      )}

      {/* RaiseCAPAModal */}
      <RaiseCAPAModal
        open={raiseCapaOpen}
        onClose={() => setRaiseCapaOpen(false)}
        observation={selectedObs}
        event={liveEvent}
        users={users}
        sites={sites}
        onSubmit={(formData) => onRaiseCAPA(selectedObs, formData)}
      />

      {/* Method-switch confirmation (Fix Rung 1, Bug 3 — replaces
       *  window.confirm). Cancel preserves the current method + its
       *  rootCause text; Switch commits the change via onSelectRCAMethod
       *  which the parent wires to updateObservation. */}
      <Modal
        open={pendingMethodSwitch !== null}
        onClose={() => setPendingMethodSwitch(null)}
        title="Switch RCA method?"
      >
        {selectedObs?.capaId ? (
          /* Escalated — a CAPA has already been raised, so switching the
           *  method invalidates it and forces QA re-approval. Destructive
           *  primary button to match the weight of the consequence. */
          <>
            <p
              className="text-[13px] mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              A CAPA has already been raised for this observation (
              <span
                className="font-mono font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {linkedCapa?.reference ?? selectedObs.capaId.slice(0, 8)}
              </span>
              ). Switching the RCA method will:
            </p>
            <ul
              className="text-[13px] mb-4 space-y-1.5 list-disc list-inside"
              style={{ color: "var(--text-secondary)" }}
            >
              <li>
                Discard the current{" "}
                <span
                  className="font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {selectedObs.rcaMethod}
                </span>{" "}
                analysis
              </li>
              <li>
                Invalidate the linked CAPA — it will need to be re-approved by
                QA
              </li>
            </ul>
            <p
              className="text-[13px] mb-4 font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Are you sure?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingMethodSwitch(null)}
              >
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={confirmMethodSwitch}>
                I understand, switch method
              </Button>
            </div>
          </>
        ) : (
          /* Standard — no CAPA raised yet (Fix Rung 1 behaviour, unchanged). */
          <>
            <p
              className="text-[13px] mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              Discard the{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {selectedObs?.rcaMethod}
              </span>{" "}
              analysis and switch to{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {pendingMethodSwitch}
              </span>
              ? The current root-cause text will be cleared.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingMethodSwitch(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={confirmMethodSwitch}
              >
                Switch
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Pre-flight — confirm before an AI suggestion overwrites existing
       *  analysis the user already entered. */}
      <Modal
        open={pendingAiSuggestion !== null}
        onClose={() => setPendingAiSuggestion(null)}
        title="Replace existing analysis?"
      >
        <p
          className="text-[13px] mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          Your current input will be overwritten with the AI suggestion. This
          cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPendingAiSuggestion(null)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (pendingAiSuggestion) applyAiSuggestion(pendingAiSuggestion);
              setPendingAiSuggestion(null);
            }}
          >
            Replace
          </Button>
        </div>
      </Modal>

      {/* AI RCA suggestion modal — opens from the [✨ AI Suggestion] button in
       *  the Step 1 header. Only mounts when a method is picked. */}
      {selectedObs.rcaMethod && (
        <AiRcaModal
          open={aiRcaModalOpen === selectedObs.id}
          method={selectedObs.rcaMethod}
          observationText={selectedObs.text}
          observationSeverity={selectedObs.severity}
          siteContext={siteContext}
          onClose={() => setAiRcaModalOpen(null)}
          onApply={handleUseRcaSuggestion}
        />
      )}
    </div>
  );
}
