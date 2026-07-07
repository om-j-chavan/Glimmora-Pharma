"use client";

import { AlertTriangle } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { Dropdown } from "@/components/ui/Dropdown";
import { type AccountFormData, type AccountFormSetter } from "../../helpers";
import { RegulatoryRegionField } from "./RegulatoryRegionField";

const LABEL = "block text-[11px] font-medium mb-1" as const;

const LANGUAGE_OPTIONS = [
  { value: "English, United States", label: "English, United States" },
  { value: "English, United Kingdom", label: "English, United Kingdom" },
  { value: "Hindi", label: "Hindi" },
  { value: "Arabic", label: "Arabic" },
];

const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata" },
  { value: "Asia/Qatar", label: "Asia/Qatar" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
];

interface AccountSettingsFieldsProps {
  form: AccountFormData;
  set: AccountFormSetter;
  mode: "create" | "edit";
  isSuperAdmin: boolean;
  /** Inline validation error for the required region (Stage 5). */
  regionError?: string;
}

export function AccountSettingsFields({ form, set, mode, isSuperAdmin, regionError }: AccountSettingsFieldsProps) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Settings</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Language</label><Dropdown value={form.language} onChange={(v) => set("language", v)} options={LANGUAGE_OPTIONS} width="w-full" size="sm" /></div>
        <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Time Zone</label><Dropdown value={form.timezone} onChange={(v) => set("timezone", v)} options={TIMEZONE_OPTIONS} width="w-full" size="sm" /></div>
      </div>

      {/* Regulatory Region — super_admin owned, backed by the fixed central
          list. Select an existing value (no runtime add). */}
      <div className="mb-3">
        <RegulatoryRegionField
          value={form.regulatoryRegion}
          onChange={(v) => set("regulatoryRegion", v)}
          required={mode === "create"}
          error={regionError}
        />
      </div>

      {/* Toggle settings — each in its own bordered row for clear separation, using
          Toggle's label + description so the helper aligns consistently. */}
      <div className="space-y-3">
        {/* Active toggle: edit mode only (create defaults to active=true). */}
        {mode === "edit" && (
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--bg-border)" }}>
            <Toggle
              id="toggle-active"
              label="Active"
              description="When off, the account is suspended and all users lose access."
              checked={form.active}
              onChange={(v) => set("active", v)}
            />
            {/* Inline suspend warning — shown before Save whenever the toggle is
                off, mirroring the dedicated Suspend modal's consequence text. The
                actual TENANT_SUSPENDED / TENANT_REACTIVATED audit still fires in
                the updateTenant action on the isActive change. */}
            {!form.active && (
              <div className="mt-3 flex items-start gap-2 rounded-lg p-2.5" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--warning)" }} aria-hidden="true" />
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <span className="font-semibold" style={{ color: "var(--warning)" }}>Suspending this account.</span>{" "}
                  All users in this tenant lose access until reactivated. No data is deleted; audit history is preserved.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Require MFA — super_admin only. Helper moved into the Toggle's
            description so it aligns the same way as the Active row. */}
        {isSuperAdmin && (
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--bg-border)" }}>
            <Toggle
              id="toggle-mfa"
              label="Require MFA"
              description="User receives an email verification code on every login. Enabling on an existing tenant signs out all active sessions."
              checked={form.mfaEnabled}
              onChange={(v) => set("mfaEnabled", v)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
