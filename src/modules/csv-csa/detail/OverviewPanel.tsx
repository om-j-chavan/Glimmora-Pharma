"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Shield, Zap, Server, Info, Pencil, X, Save } from "lucide-react";
import type { GxPSystem } from "@/types/csv-csa";
import { Button } from "@/components/ui/Button";
import { updateSystem as updateSystemServer } from "@/actions/systems";

/* ── Props ── */

type DocFieldKey = "intendedUse" | "gxpScope" | "criticalFunctions";

/** Documentable Assess fields counted by the completion indicator. */
const DOCUMENTABLE_TOTAL = 6;

export interface OverviewPanelProps {
  system: GxPSystem;
  role: string;
  /** Jump to another detail tab (welcome-banner shortcuts). */
  onNavigateTab: (tab: "risk" | "validation") => void;
}

/* ── Inline-editable documentation field ──
 *
 * Empty → "Not yet documented" + [+ Document]. Editing → textarea + Save/Cancel.
 * Documented → text + pencil to re-edit. Saves the single field via
 * updateSystem (partial update). */
function DocField({
  Icon, color, title, value, fieldKey, systemId, canEdit, onSaved, cardRef,
}: {
  Icon: typeof Target;
  color: string;
  title: string;
  value: string;
  fieldKey: DocFieldKey;
  systemId: string;
  canEdit: boolean;
  onSaved: () => void;
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-sync when the underlying value changes (system switch / refresh).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
    setEditing(false);
  }

  const has = !!value.trim();

  async function save() {
    setBusy(true);
    setErr(null);
    const result = await updateSystemServer(systemId, { [fieldKey]: draft });
    setBusy(false);
    if (!result.success) { setErr(result.error || "Failed to save."); return; }
    setEditing(false);
    onSaved();
  }

  /*
   * COMPACT EMPTY ROW (progressive disclosure).
   *
   * An undocumented field renders as ONE line inside the grouped card instead
   * of its own full card reading "Not yet documented" — three of those stacked
   * was most of the fresh-system noise. Documenting one expands it in place;
   * the others stay one-liners.
   *
   * The [+ Document] button is the SAME control as before and opens the SAME
   * editor: `save()` below is untouched, so the field still writes through
   * `updateSystemServer` exactly as it always did. Nothing is hidden — an empty
   * field is still visible and still one click from being filled.
   */
  if (!has && !editing) {
    return (
      <div ref={cardRef} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
        <span className="inline-flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} aria-hidden="true" />
          <span className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{title}</span>
          <span className="text-[11px] italic shrink-0" style={{ color: "var(--text-muted)" }}>Not documented</span>
        </span>
        {canEdit && (
          <Button variant="secondary" size="xs" type="button" icon={Pencil} onClick={() => { setDraft(""); setEditing(true); }}>Document</Button>
        )}
      </div>
    );
  }

  /*
   * FLAT ROW — no nested `.card`.
   *
   * This used to render its own bordered card, which meant three cards sitting
   * inside the "Scope & purpose" card: borders within borders, and each field's
   * card padding stacked on the parent's. It is now a plain row that relies on
   * the parent's `divide-y` for separation, so the three fields read as one
   * dense list.
   *
   * Behaviour is unchanged: documented → text + Edit; editing → the same
   * textarea and Save/Cancel; and `save()` above still calls
   * `updateSystemServer` with the identical arguments. Only the wrapper chrome
   * was removed.
   */
  return (
    <div className="py-3 first:pt-0 last:pb-0" ref={cardRef}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} aria-hidden="true" />
        <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
        {has && canEdit && !editing && (
          <button type="button" onClick={() => { setDraft(value); setEditing(true); }} aria-label={`Edit ${title}`} className="ml-auto flex items-center gap-1 text-[11px] text-[#0ea5e9] hover:opacity-80 border-none bg-transparent cursor-pointer">
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            rows={3}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="input text-[12px] resize-none w-full"
            placeholder={`Document ${title.toLowerCase()}…`}
          />
          {err && <p role="alert" className="text-[11px] text-[#ef4444]">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="xs" type="button" icon={X} onClick={() => { setDraft(value); setEditing(false); setErr(null); }}>Cancel</Button>
            <Button variant="primary" size="xs" type="button" icon={Save} loading={busy} disabled={busy} onClick={save}>Save</Button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{value}</p>
      )}
    </div>
  );
}

export function OverviewPanel({ system, role, onNavigateTab }: OverviewPanelProps) {
  const router = useRouter();
  const canEdit = role !== "viewer";
  const intendedUseRef = useRef<HTMLDivElement>(null);
  const onSaved = () => router.refresh();

  // "Fresh" system: no documentation yet AND no validation stage activity.
  // Trimmed checks so a stray space doesn't count as documented.
  /*
   * Completion tally — READ-ONLY derivation over values already on `system`.
   * Six documentable Assess fields. Nothing here writes, and none of these
   * expressions feeds a KPI or a signature; `part11Status` / `annex11Status`
   * are only READ (their hashed values are written by RiskControlsPanel, which
   * this does not touch).
   */
  const riskClassified = [
    system.patientSafetyRisk, system.productQualityImpact,
    system.diImpact, system.regulatoryExposure,
  ].some((v) => !!String(v ?? "").trim());
  const complianceSet =
    (system.part11Status ?? "N/A") !== "N/A" || (system.annex11Status ?? "N/A") !== "N/A";
  const documentedCount = [
    !!system.intendedUse?.trim(),
    !!system.gxpScope?.trim(),
    !!system.criticalFunctions?.trim(),
    riskClassified,
    !!system.riskFactors?.trim(),
    complianceSet,
  ].filter(Boolean).length;

  const noDocs = !system.intendedUse?.trim() && !system.gxpScope?.trim() && !system.criticalFunctions?.trim();
  const noStageActivity = !(system.validationStages ?? []).some((s) => s.status !== "not_started");
  const isFresh = noDocs && noStageActivity;

  const welcomeItems: { n: number; label: string; action: () => void; cta: string }[] = [
    { n: 1, label: "Document the intended use", cta: "Add", action: () => intendedUseRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }) },
    { n: 2, label: "Set Part 11 / Annex 11 compliance status", cta: "Add", action: () => onNavigateTab("risk") },
    { n: 3, label: "Plan your validation stages (URS → RTR)", cta: "Plan", action: () => onNavigateTab("validation") },
    { n: 4, label: "Document risk factors and planned actions", cta: "Add", action: () => onNavigateTab("risk") },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {isFresh && (
        <div className="card col-span-full" style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}>
          <div className="card-body">
            <div className="flex items-start gap-2 mb-3">
              <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>Welcome to your new system. To complete its profile:</p>
            </div>
            <ol className="space-y-1.5 mb-3">
              {/* eslint-disable-next-line react-hooks/refs -- false positive: intendedUseRef.current is read only inside item 1's onClick handler (deferred), never during render; the ref is otherwise just passed as a prop. */}
              {welcomeItems.map((it) => (
                <li key={it.n} className="flex items-center justify-between gap-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  <span>{it.n}. {it.label}</span>
                  <Button variant="secondary" size="xs" type="button" onClick={it.action}>{it.cta}</Button>
                </li>
              ))}
            </ol>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>These can be filled now or later — the system is created and findable.</p>
          </div>
        </div>
      )}

      {/* ── COMPLETION INDICATOR ──────────────────────────────────────────
          "N of 6 documented" across the Assess tab's documentable fields.
          DISPLAY ONLY and derived entirely from values already on `system` —
          no new data, no query, nothing written. Compliance status counts as
          documented once Part 11 / Annex 11 move off the schema default "N/A"
          (schema.prisma:1348-1349); risk classification once any of its four
          dimensions is set. */}
      <div className="col-span-full flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
            {documentedCount} of {DOCUMENTABLE_TOTAL} sections documented
          </span>
          <span className="inline-flex h-1.5 w-28 rounded-full overflow-hidden" style={{ background: "var(--bg-border)" }} aria-hidden="true">
            <span className="h-full rounded-full" style={{ width: `${(documentedCount / DOCUMENTABLE_TOTAL) * 100}%`, background: documentedCount === DOCUMENTABLE_TOTAL ? "#10b981" : "var(--brand)" }} />
          </span>
        </div>
        {documentedCount < DOCUMENTABLE_TOTAL && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Undocumented fields show as a single row until filled.</span>
        )}
      </div>

      {/* ── GROUP 1 — SYSTEM BASICS (the facts; always visible) ── */}
      <div className="card col-span-full"><div className="card-header"><div className="flex items-center gap-2"><Server className="w-4 h-4" style={{ color: "#64748b" }} aria-hidden="true" /><span className="card-title">System basics</span></div></div><div className="card-body">
        {/* Identity fields (type/site/GAMP/GxP relevance/owner) live in the header card — not repeated here. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-6 text-[12px]">
          {([
            ["Vendor", system.vendor], ["Version", system.version],
            ["Risk level", system.riskLevel],
          ] as const).map(([l, v]) => (
            <div key={l} className="border-b pb-2" style={{ borderColor: "var(--bg-border)" }}><span className="text-[10px] uppercase tracking-wider font-semibold block mb-0.5" style={{ color: "var(--text-muted)" }}>{l}</span><span className="font-medium" style={{ color: "var(--text-primary)" }}>{v}</span></div>
          ))}
        </div>
      </div></div>

      {/* ── GROUP 2 — SCOPE & PURPOSE ─────────────────────────────────────
          The three narrative fields in ONE card instead of three stacked
          cards. Each renders full when documented and as a compact row when
          not (see DocField). Same fields, same editors, same save path. */}
      <div className="card col-span-full">
        <div className="card-header"><div className="flex items-center gap-2"><Target className="w-4 h-4" style={{ color: "#0ea5e9" }} aria-hidden="true" /><span className="card-title">Scope &amp; purpose</span></div></div>
        <div className="card-body divide-y" style={{ borderColor: "var(--bg-border)" }}>
          <DocField Icon={Target} color="#0ea5e9" title="Intended use" value={system.intendedUse ?? ""} fieldKey="intendedUse" systemId={system.id} canEdit={canEdit} onSaved={onSaved} cardRef={intendedUseRef} />
          <DocField Icon={Shield} color="#6366f1" title="GxP scope" value={system.gxpScope ?? ""} fieldKey="gxpScope" systemId={system.id} canEdit={canEdit} onSaved={onSaved} />
          <DocField Icon={Zap} color="#f59e0b" title="Critical GxP functions" value={system.criticalFunctions ?? ""} fieldKey="criticalFunctions" systemId={system.id} canEdit={canEdit} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}
