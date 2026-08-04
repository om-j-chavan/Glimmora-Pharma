"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Popup } from "@/components/ui/Popup";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { AIButton } from "@/components/ai";
import { useToast } from "@/components/ui/Toast";
import { setEffectiveFrameworks } from "@/store/frameworks.slice";
import {
  loadTenantFrameworkSettings,
  setTenantFrameworkEnabled,
  loadEffectiveFrameworks,
} from "@/actions/frameworks";
import type { TenantFrameworkGroups, TenantFrameworkSetting } from "@/lib/queries";
import { RegulatoryAIAssistant } from "@/modules/regulatory-intelligence/RegulatoryAIAssistant";

export function FrameworksTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const toast = useToast();
  // Region value → display label (DB-sourced; falls back to the value).
  const regionLabelMap = useAppSelector((s) => s.regions.labelMap);

  // Server-backed per-tenant framework settings, GROUPED for the by-region tab:
  // { regions: the tenant's TenantRegion set (ordered), frameworks: the flat list
  // each tagged appliesToAllRegions + matchedRegions }. Already region-filtered +
  // platform-enabled by getTenantFrameworkSettings. `null` = still loading.
  const [data, setData] = useState<TenantFrameworkGroups | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The framework pending a disable confirmation (the "existing findings stay
  // tagged" warning is shown before a disable persists).
  const [pending, setPending] = useState<TenantFrameworkSetting | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTenantFrameworkSettings()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ regions: [], frameworks: [] }); });
    return () => { cancelled = true; };
  }, []);

  // Keyboard shortcut: Ctrl/Cmd + Shift + R opens the Regulatory AI assistant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        setAiOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const frameworks = useMemo(() => data?.frameworks ?? [], [data]);
  const activeCount = useMemo(() => frameworks.filter((s) => s.enabled).length, [frameworks]);
  const total = frameworks.length;

  // Grouping is presentation-only: GLOBAL frameworks in their own section (once,
  // never in a region section); every other framework under the FIRST of the
  // tenant's regions (in tenant order) that it links to — so a framework linked to
  // multiple regions appears exactly once.
  const groups = useMemo(() => {
    if (!data) return null;
    const global = data.frameworks.filter((f) => f.appliesToAllRegions);
    const byRegion: Record<string, TenantFrameworkSetting[]> = {};
    for (const r of data.regions) byRegion[r] = [];
    for (const f of data.frameworks) {
      if (f.appliesToAllRegions) continue; // GLOBAL never lands in a region section
      const target = data.regions.find((r) => f.matchedRegions.includes(r));
      if (target) byRegion[target].push(f);
    }
    return { global, byRegion };
  }, [data]);

  const regionLabel = (v: string) => regionLabelMap[v] ?? v;

  const applyToggle = async (setting: TenantFrameworkSetting, enabled: boolean) => {
    setBusyId(setting.id);
    // Optimistic — reverted on failure. The server write is the source of truth.
    setData((prev) => prev ? { ...prev, frameworks: prev.frameworks.map((s) => (s.id === setting.id ? { ...s, enabled } : s)) } : prev);
    const res = await setTenantFrameworkEnabled(setting.id, enabled);
    if (!res.success) {
      setData((prev) => prev ? { ...prev, frameworks: prev.frameworks.map((s) => (s.id === setting.id ? { ...s, enabled: !enabled } : s)) } : prev);
      setBusyId(null);
      toast.error(res.error);
      return;
    }
    // Re-hydrate the (Gap dropdown / CSV) slice from the server so it reflects
    // this change immediately — the server is authoritative.
    try {
      const eff = await loadEffectiveFrameworks();
      dispatch(setEffectiveFrameworks(eff));
    } catch { /* non-fatal — a page reload would re-seed anyway */ }
    setBusyId(null);
    toast.success(`${setting.label} ${enabled ? "enabled" : "disabled"}.`);
  };

  const handleToggle = (setting: TenantFrameworkSetting) => {
    if (readOnly || busyId) return;
    if (setting.enabled) {
      // Disabling → route through the confirm popup first.
      setPending(setting);
    } else {
      applyToggle(setting, true);
    }
  };

  // One toggle row — reused UNCHANGED by the Global section and every region section.
  const renderRow = (fw: TenantFrameworkSetting) => (
    <li key={fw.id} className="flex items-center justify-between px-5 py-4">
      <div className="flex-1 pr-4">
        <p className="text-[13px] font-semibold text-(--text-primary) mb-0.5">{fw.name}</p>
        {fw.description && <p className="text-[11px] text-(--card-muted)">{fw.description}</p>}
      </div>
      <Toggle
        id={`fw-${fw.key}`}
        checked={fw.enabled}
        onChange={() => handleToggle(fw)}
        label={fw.name}
        description={fw.description ?? fw.name}
        disabled={readOnly || busyId === fw.id}
        hideLabel
      />
    </li>
  );

  const sectionHeader = (title: string) => (
    <p className="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">{title}</p>
  );

  return (
    <section aria-labelledby="frameworks-heading" className="flex flex-col h-full min-h-0">
      <div className="shrink-0 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 id="frameworks-heading" className="text-[15px] font-semibold text-(--text-primary)">
              Regulatory frameworks
            </h2>
            <Badge variant="blue">{activeCount} of {total} active</Badge>
          </div>
          <AIButton
            size="sm"
            onClick={() => setAiOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={aiOpen}
            title="Ask Regulatory AI about your frameworks, region, and the latest FDA/EMA guidance (Ctrl + Shift + R)"
          >
            Ask Regulatory AI
          </AIButton>
        </div>
        <p className="mt-1 text-[12px] text-(--text-secondary) max-w-2xl">
          Enabled frameworks appear as tags when raising a Gap and inform CSV/CSA and AGI suggestions.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-2xl overflow-hidden">
        {groups === null ? (
          <p className="text-[12px] text-(--text-muted) px-5 py-6">Loading frameworks…</p>
        ) : total === 0 && (data?.regions.length ?? 0) === 0 ? (
          <p className="text-[12px] text-(--text-muted) px-5 py-6">
            No frameworks are available for your region yet. The platform administrator manages the catalog.
          </p>
        ) : (
          <div className="divide-y divide-(--bg-border)">
            {/* Global — appliesToAllRegions frameworks, shown once. */}
            <div>
              {sectionHeader("Global")}
              {groups.global.length === 0 ? (
                <p className="px-5 pb-4 text-[12px] text-(--text-muted)">No global frameworks.</p>
              ) : (
                <ul role="list" aria-label="Global framework toggles">{groups.global.map(renderRow)}</ul>
              )}
            </div>

            {/* One section per tenant region — its region-specific frameworks only.
                Empty sections are kept (expected until catalog data is attached). */}
            {(data?.regions ?? []).map((region) => (
              <div key={region}>
                {sectionHeader(regionLabel(region))}
                {groups.byRegion[region]?.length ? (
                  <ul role="list" aria-label={`${regionLabel(region)} framework toggles`}>{groups.byRegion[region].map(renderRow)}</ul>
                ) : (
                  <p className="px-5 pb-4 text-[12px] text-(--text-muted)">
                    No region-specific frameworks assigned to {regionLabel(region)}.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Disable-confirm — the "existing findings stay tagged" warning, kept from
          the previous behaviour, now gating the server write. */}
      <Popup
        isOpen={pending !== null}
        variant="warning"
        title="Disable this framework?"
        description="The regulation tag will be removed from Gap Assessment dropdowns and the AGI ruleset will be unloaded for your organisation. Existing findings tagged to this framework are NOT deleted and keep their label."
        onDismiss={() => setPending(null)}
        actions={[
          { label: "Cancel", style: "ghost", onClick: () => setPending(null) },
          {
            label: "Yes, disable",
            style: "primary",
            onClick: () => {
              const target = pending;
              setPending(null);
              if (target) applyToggle(target, false);
            },
          },
        ]}
      />

      <RegulatoryAIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
    </section>
  );
}
