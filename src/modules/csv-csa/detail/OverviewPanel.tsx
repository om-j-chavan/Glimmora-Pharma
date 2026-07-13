"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Shield, Zap, Server, Info, Pencil, X, Save } from "lucide-react";
import type { GxPSystem } from "@/types/csv-csa";
import { Button } from "@/components/ui/Button";
import { updateSystem as updateSystemServer } from "@/actions/systems";

/* ── Props ── */

type DocFieldKey = "intendedUse" | "gxpScope" | "criticalFunctions";

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

  return (
    <div className="card" ref={cardRef}>
      <div className="card-header">
        <div className="flex items-center gap-2"><Icon className="w-4 h-4" style={{ color }} aria-hidden="true" /><span className="card-title">{title}</span></div>
        {has && canEdit && !editing && (
          <button type="button" onClick={() => { setDraft(value); setEditing(true); }} aria-label={`Edit ${title}`} className="ml-auto flex items-center gap-1 text-[11px] text-[#0ea5e9] hover:opacity-80 border-none bg-transparent cursor-pointer">
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Edit
          </button>
        )}
      </div>
      <div className="card-body">
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
        ) : has ? (
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{value}</p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] italic" style={{ color: "var(--text-muted)" }}>Not yet documented</p>
            {canEdit && (
              <Button variant="secondary" size="xs" type="button" icon={Pencil} onClick={() => { setDraft(""); setEditing(true); }}>Document</Button>
            )}
          </div>
        )}
      </div>
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

      <div className="col-span-full">
        <DocField Icon={Target} color="#0ea5e9" title="Intended use" value={system.intendedUse ?? ""} fieldKey="intendedUse" systemId={system.id} canEdit={canEdit} onSaved={onSaved} cardRef={intendedUseRef} />
      </div>
      <DocField Icon={Shield} color="#6366f1" title="GxP scope" value={system.gxpScope ?? ""} fieldKey="gxpScope" systemId={system.id} canEdit={canEdit} onSaved={onSaved} />
      <DocField Icon={Zap} color="#f59e0b" title="Critical GxP functions" value={system.criticalFunctions ?? ""} fieldKey="criticalFunctions" systemId={system.id} canEdit={canEdit} onSaved={onSaved} />

      <div className="card col-span-full"><div className="card-header"><div className="flex items-center gap-2"><Server className="w-4 h-4" style={{ color: "#64748b" }} aria-hidden="true" /><span className="card-title">System information</span></div></div><div className="card-body">
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
    </div>
  );
}
