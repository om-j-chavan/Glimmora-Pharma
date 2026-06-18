"use client";

import { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { generateStrongPassword } from "@/lib/passwords";
import { type AccountFormData, type AccountFormSetter } from "../../helpers";

const LABEL = "block text-[11px] font-medium mb-1" as const;

interface AccountPasswordFieldsProps {
  form: AccountFormData;
  set: AccountFormSetter;
  /** Sets newPassword + confirmPassword together (used by Generate). */
  setPasswords: (pwd: string) => void;
  markTouched: (field: string) => void;
  errorVisible: (name: string) => boolean;
  errors: Record<string, string>;
  mode: "create" | "edit";
  /** Surfaces the password-generated toast at the drawer root (viewport-anchored). */
  onToast: (message: string) => void;
}

export function AccountPasswordFields({ form, set, setPasswords, markTouched, errorVisible, errors, mode, onToast }: AccountPasswordFieldsProps) {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleGeneratePassword = async () => {
    const pwd = generateStrongPassword(16);
    setPasswords(pwd);
    setShowNewPassword(true);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(pwd);
        onToast("Password generated and copied to clipboard.");
      } else {
        onToast("Password generated. Copy it from the field below.");
      }
    } catch {
      onToast("Password generated (clipboard copy failed — please copy manually).");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Password</h3>
        <button
          type="button"
          onClick={handleGeneratePassword}
          className="inline-flex items-center gap-1 text-[11px] font-semibold border-none bg-transparent cursor-pointer"
          style={{ color: "var(--brand)" }}
          aria-label="Generate strong password"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          Generate
        </button>
      </div>
      {mode === "edit" && <p className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>Leave blank to keep current password</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="pw-new" className={LABEL} style={{ color: "var(--text-secondary)" }}>
            New Password{mode === "create" && <span style={{ color: "var(--danger)" }}> *</span>}
          </label>
          <div className="relative">
            <input
              id="pw-new"
              type={showNewPassword ? "text" : "password"}
              value={form.newPassword}
              onChange={(e) => set("newPassword", e.target.value)}
              onBlur={() => markTouched("newPassword")}
              placeholder={mode === "edit" ? "••••••••" : "Enter password"}
              className={`input ${errorVisible("newPassword") ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              style={{ paddingRight: 36 }}
              aria-invalid={errorVisible("newPassword")}
              aria-describedby={errorVisible("newPassword") ? "pw-new-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((v) => !v)}
              className="absolute top-1/2 -translate-y-1/2 right-2 border-none bg-transparent cursor-pointer p-1 flex items-center"
              style={{ color: "var(--text-muted)" }}
              aria-label={showNewPassword ? "Hide password" : "Show password"}
              aria-pressed={showNewPassword}
            >
              {showNewPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
          {errorVisible("newPassword") && <p id="pw-new-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.newPassword}</p>}
        </div>
        <div>
          <label htmlFor="pw-confirm" className={LABEL} style={{ color: "var(--text-secondary)" }}>
            Confirm{mode === "create" && <span style={{ color: "var(--danger)" }}> *</span>}
          </label>
          <div className="relative">
            <input
              id="pw-confirm"
              type={showConfirmPassword ? "text" : "password"}
              value={form.confirmPassword}
              onChange={(e) => set("confirmPassword", e.target.value)}
              onBlur={() => markTouched("confirmPassword")}
              placeholder={mode === "edit" ? "••••••••" : "Confirm"}
              className={`input ${errorVisible("confirmPassword") ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              style={{ paddingRight: 36 }}
              aria-invalid={errorVisible("confirmPassword")}
              aria-describedby={errorVisible("confirmPassword") ? "pw-confirm-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute top-1/2 -translate-y-1/2 right-2 border-none bg-transparent cursor-pointer p-1 flex items-center"
              style={{ color: "var(--text-muted)" }}
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              aria-pressed={showConfirmPassword}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
          {errorVisible("confirmPassword") && <p id="pw-confirm-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.confirmPassword}</p>}
        </div>
      </div>
    </div>
  );
}
