"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { Sparkles } from "lucide-react";
import { Popup } from "@/components/ui/Popup";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { setEffectiveFrameworks } from "@/store/frameworks.slice";
import {
  loadTenantFrameworkSettings,
  setTenantFrameworkEnabled,
  loadEffectiveFrameworks,
} from "@/actions/frameworks";
import type { TenantFrameworkSetting } from "@/lib/queries";
import { RegulatoryAIAssistant } from "@/modules/regulatory-intelligence/RegulatoryAIAssistant";

export function FrameworksTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const toast = useToast();

  // Server-backed per-tenant framework settings (Phase 1, Item 6). The list is
  // already region-filtered + platform-enabled by getTenantFrameworkSettings —
  // platform-disabled / region-mismatched frameworks never appear here. `null`
  // = still loading.
  const [settings, setSettings] = useState<TenantFrameworkSetting[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The framework pending a disable confirmation (the "existing findings stay
  // tagged" warning is shown before a disable persists).
  const [pending, setPending] = useState<TenantFrameworkSetting | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTenantFrameworkSettings()
      .then((s) => { if (!cancelled) setSettings(s); })
      .catch(() => { if (!cancelled) setSettings([]); });
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

  const activeCount = useMemo(() => (settings ?? []).filter((s) => s.enabled).length, [settings]);
  const total = settings?.length ?? 0;

  const applyToggle = async (setting: TenantFrameworkSetting, enabled: boolean) => {
    setBusyId(setting.id);
    // Optimistic — reverted on failure. The server write is the source of truth.
    setSettings((prev) => (prev ? prev.map((s) => (s.id === setting.id ? { ...s, enabled } : s)) : prev));
    const res = await setTenantFrameworkEnabled(setting.id, enabled);
    if (!res.success) {
      setSettings((prev) => (prev ? prev.map((s) => (s.id === setting.id ? { ...s, enabled: !enabled } : s)) : prev));
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

  return (
    <section aria-labelledby="frameworks-heading" className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 id="frameworks-heading" className="text-[15px] font-semibold text-(--text-primary)">
              Regulatory frameworks
            </h2>
            <Badge variant="blue">{activeCount} of {total} active</Badge>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={Sparkles}
            onClick={() => setAiOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={aiOpen}
            title="Ask Regulatory AI about your frameworks, region, and the latest FDA/EMA guidance (Ctrl + Shift + R)"
          >
            Ask Regulatory AI
          </Button>
        </div>
        <p className="mt-1 text-[12px] text-(--text-secondary) max-w-2xl">
          Enabled frameworks appear as tags when raising a Gap and inform CSV/CSA and AGI suggestions.
        </p>
      </div>

      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
        {settings === null ? (
          <p className="text-[12px] text-(--text-muted) px-5 py-6">Loading frameworks…</p>
        ) : settings.length === 0 ? (
          <p className="text-[12px] text-(--text-muted) px-5 py-6">
            No frameworks are available for your region yet. The platform administrator manages the catalog.
          </p>
        ) : (
          <ul role="list" aria-label="Regulatory framework toggles" className="divide-y divide-(--bg-border)">
            {settings.map((fw) => (
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
            ))}
          </ul>
        )}
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
