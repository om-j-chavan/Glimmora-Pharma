"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { type AccountFormData, type AccountFormSetter } from "../../helpers";

const LABEL = "block text-[11px] font-medium mb-1" as const;

interface AccountPasswordFieldsProps {
  form: AccountFormData;
  set: AccountFormSetter;
  markTouched: (field: string) => void;
  errorVisible: (name: string) => boolean;
  errors: Record<string, string>;
  mode: "create" | "edit";
}

export function AccountPasswordFields({ form, set, markTouched, errorVisible, errors, mode }: AccountPasswordFieldsProps) {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Password</h3>
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
