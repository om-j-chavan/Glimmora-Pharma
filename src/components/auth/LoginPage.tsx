"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import {
  Shield, Mail, Lock, LogIn, Building2, ChevronDown, KeyRound,
} from "lucide-react";
import clsx from "clsx";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import {
  setCredentials, setActiveSite, setSelectedSite,
  type AuthUser,
} from "@/store/auth.slice";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

/**
 * Seeded credentials shown in the "dev credentials" panel.
 * Mirrors prisma/seed.ts — keep in sync if seed changes.
 */
const CRED_ROWS: { org: string; rows: [string, string, string, string][] }[] = [
  {
    org: "Platform",
    rows: [
      ["Super Admin", "superadmin@glimmora.com", "1", "#ef4444"],
    ],
  },
  {
    org: "Pharma Glimmora International",
    rows: [
      ["Customer Admin", "admin@pharmaglimmora.com", "Admin@123", "#8b6914"],
      ["QA Head", "qa@pharmaglimmora.com", "Demo@123", "#a78bfa"],
      ["Regulatory Affairs", "ra@pharmaglimmora.com", "Demo@123", "#a78bfa"],
      ["CSV/Val Lead", "csv@pharmaglimmora.com", "Demo@123", "#38bdf8"],
      ["QC/Lab Director", "qc@pharmaglimmora.com", "Demo@123", "#10b981"],
      ["IT/CDO", "it@pharmaglimmora.com", "Demo@123", "#94a3b8"],
      ["Operations Head", "ops@pharmaglimmora.com", "Demo@123", "#94a3b8"],
    ],
  },
];

export function LoginPage() {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const [showCreds, setShowCreds] = useState(false);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [loadingName, setLoadingName] = useState("");

  // ── MFA / OTP state ──
  // otpEmail + otpPassword are captured at the moment OTP_REQUIRED is thrown,
  // so we can re-call signIn for resend + verify without forcing the user to
  // re-type credentials. They live only in component state for the duration
  // of the modal flow and are cleared by resetOtpState.
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpPassword, setOtpPassword] = useState("");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const {
    register, handleSubmit, setError, setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const stopCooldownTimer = useCallback(() => {
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
  }, []);

  const startCooldownTimer = useCallback(() => {
    stopCooldownTimer();
    setOtpResendCooldown(60);
    cooldownIntervalRef.current = setInterval(() => {
      setOtpResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
            cooldownIntervalRef.current = null;
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [stopCooldownTimer]);

  // Single reset path used by Esc, backdrop click, Cancel button, and unmount.
  // Stale state across attempts has bitten us before — always reset everything.
  const resetOtpState = useCallback(() => {
    stopCooldownTimer();
    setOtpRequired(false);
    setOtpCode("");
    setOtpError(null);
    setOtpResendCooldown(0);
    setOtpEmail("");
    setOtpPassword("");
    setOtpVerifying(false);
    setOtpResending(false);
  }, [stopCooldownTimer]);

  // Cleanup on unmount.
  useEffect(() => () => stopCooldownTimer(), [stopCooldownTimer]);

  // Auto-focus the OTP input when the modal opens. Defer one frame past
  // Modal's own panel-focus so we end up on the input, not the panel.
  useEffect(() => {
    if (!otpRequired) return;
    const id = setTimeout(() => otpInputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [otpRequired]);

  const finishLogin = useCallback(async (loginEmail: string) => {
    // ── Hydrate Redux from the verified NextAuth session ──
    const sessionRes = await fetch("/api/auth/session", { credentials: "include" });
    const session = await sessionRes.json();
    const u = session?.user;

    if (!u?.id) {
      setError("root", { message: "Session could not be loaded. Try again." });
      return;
    }

    const authUser: AuthUser = {
      id: u.id,
      name: u.name ?? "",
      email: u.email ?? loginEmail,
      role: u.role,
      gxpSignatory: !!u.gxpSignatory,
      orgId: u.orgId ?? u.tenantId,
      tenantId: u.tenantId,
    };
    dispatch(setCredentials({ token: "nextauth-session", user: authUser }));
    if (u.siteId) {
      dispatch(setActiveSite(u.siteId));
      dispatch(setSelectedSite(u.siteId));
    } else {
      dispatch(setSelectedSite(null));
    }

    setLoadingName(u.role === "super_admin" ? "Platform Admin" : "workspace");
    setLoadingTenant(true);

    // Honour ?callbackUrl=... preserved by middleware.ts; otherwise role-default.
    const params = new URLSearchParams(window.location.search);
    const callbackUrl = params.get("callbackUrl");

    if (callbackUrl && callbackUrl.startsWith("/")) {
      window.location.assign(callbackUrl);
    } else if (u.role === "super_admin") {
      window.location.assign("/admin");
    } else if (u.role === "customer_admin" || u.siteId) {
      window.location.assign("/");
    } else {
      window.location.assign("/site-picker");
    }
  }, [dispatch, setError]);

  const onSubmit = async (data: FormValues) => {
    const email = data.email.toLowerCase().trim();

    // ── Single auth path: NextAuth Credentials provider ──
    const result = await signIn("credentials", {
      email,
      password: data.password,
      redirect: false,
    });

    if (!result?.ok) {
      switch (result?.error) {
        case "OTP_REQUIRED":
          setOtpEmail(email);
          setOtpPassword(data.password);
          setOtpRequired(true);
          setOtpCode("");
          setOtpError(null);
          startCooldownTimer();
          return;
        case "AMBIGUOUS_EMAIL":
          // Don't leak the multi-tenant detail — generic guidance only.
          setError("root", { message: "Account lookup failed — please contact support." });
          return;
        case "SUBSCRIPTION_INACTIVE":
          setError("root", { message: "No active subscription. Please contact your administrator to renew." });
          return;
        default:
          setError("root", { message: "Invalid email or password." });
          return;
      }
    }

    await finishLogin(email);
  };

  const handleOtpVerify = async () => {
    if (otpCode.length !== 6 || otpVerifying) return;
    setOtpError(null);
    setOtpVerifying(true);
    try {
      const result = await signIn("credentials", {
        email: otpEmail,
        password: otpPassword,
        otp: otpCode,
        redirect: false,
      });
      if (result?.ok) {
        const email = otpEmail;
        resetOtpState();
        await finishLogin(email);
        return;
      }
      switch (result?.error) {
        case "OTP_INVALID":
          setOtpError("Incorrect code. Please try again.");
          setOtpCode("");
          break;
        case "OTP_EXPIRED":
          setOtpError("Code expired. Click Resend to get a new one.");
          break;
        case "OTP_LOCKED":
          setOtpError("Too many failed attempts. Click Resend to get a new code.");
          break;
        case "OTP_NO_OTP":
          setOtpError("No active code. Click Resend to get one.");
          break;
        default:
          setOtpError("Verification failed. Please try again.");
      }
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleOtpResend = async () => {
    if (otpResendCooldown > 0 || otpResending) return;
    setOtpError(null);
    setOtpResending(true);
    try {
      const result = await signIn("credentials", {
        email: otpEmail,
        password: otpPassword,
        redirect: false,
      });
      if (result?.error === "OTP_REQUIRED") {
        setOtpCode("");
        startCooldownTimer();
        otpInputRef.current?.focus();
        return;
      }
      if (result?.ok) {
        // Edge case: tenant disabled MFA between request and resend; treat as success.
        const email = otpEmail;
        resetOtpState();
        await finishLogin(email);
        return;
      }
      setOtpError("Could not resend code. Please try again.");
    } finally {
      setOtpResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-[420px] pt-12 pb-10 px-10">
        {/* Logo — hidden during loading */}
        {!loadingTenant && (
          <div className="flex flex-col items-start mb-8">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 bg-[#f0a500]">
              <Shield className="w-7 h-7 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-[28px] font-extrabold text-[#302d29] tracking-tight mb-1">
              Welcome Back !
            </h1>
            <p className="text-[14px] text-[#7a736a]">Log into your account</p>
          </div>
        )}

        {/* Loading tenant */}
        {loadingTenant && (
          <div className="flex flex-col items-center justify-center gap-3 py-8" role="status" aria-live="polite">
            <div className="w-8 h-8 rounded-full border-2 border-[#8b6914] border-t-transparent animate-spin" />
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Loading {loadingName}...
            </p>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          aria-label="Sign in to Pharma Glimmora"
          noValidate
          className="w-full space-y-4 mt-8"
          style={{ display: loadingTenant ? "none" : undefined }}
        >
          {/* Root error */}
          {errors.root && (
            <div role="alert" className="rounded-lg px-3 py-2.5 bg-[#fef2f2] border border-[#fecaca] text-[12px] text-[#dc2626] flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5">⚠️</span>
              <div className="min-w-0">
                <p className="font-medium">{errors.root.message}</p>
                {process.env.NODE_ENV === "development" && (
                  <p className="text-[11px] mt-0.5 text-[#ef4444]">
                    Tip: click &quot;Show dev credentials&quot; below to auto-fill a working account.
                  </p>
                )}
              </div>
            </div>
          )}

          <Input
            id="email"
            label="Work email"
            type="email"
            required
            icon={Mail}
            autoComplete="email"
            placeholder="admin@pharmaglimmora.com"
            error={errors.email?.message}
            {...register("email")}
          />

          {/* Password */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="password" className="text-[11px] font-medium text-[#302d29]">
                Passcode <span className="text-[#dc2626]" aria-hidden="true">*</span>
              </label>
              <span className="text-[11px] text-[#8b6914] cursor-pointer underline">Forgot passcode?</span>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-[#a39e96] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your passcode"
                required
                aria-required="true"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
                className="w-full bg-white border border-[#e8e4dd] rounded-lg pl-9.5 pr-3 py-2.5 text-[13px] text-[#302d29] placeholder:text-[#a39e96] outline-none focus:border-[#8b6914] focus:ring-[3px] focus:ring-[rgba(139,105,20,0.12)] transition-all duration-150"
              />
            </div>
            {errors.password && (
              <p id="password-error" role="alert" className="text-[11px] text-[#dc2626] mt-1">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" icon={LogIn} loading={isSubmitting} fullWidth className="py-2.75" suppressHydrationWarning>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#e8e4dd]" />
            <span className="text-[11px] text-[#a39e96]">or continue with</span>
            <div className="flex-1 h-px bg-[#e8e4dd]" />
          </div>

          <Button variant="secondary" icon={Building2} fullWidth suppressHydrationWarning>
            Single Sign-On (SSO)
          </Button>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#e8e4dd]" style={{ display: loadingTenant ? "none" : undefined }}>
          <div className="flex items-center gap-1.5 text-[11px] text-[#a39e96]">
            <Shield className="w-3 h-3" aria-hidden="true" />
            21 CFR Part 11 compliant
          </div>
          <span className="text-[11px] text-[#7a736a]">Privacy · Terms</span>
        </div>

        {/* Dev credentials toggle */}
        <div className="mt-4" style={{ display: loadingTenant ? "none" : undefined }}>
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => setShowCreds((v) => !v)}
            className={clsx(
              "w-full flex items-center justify-center gap-2",
              "py-2 rounded-lg text-[11px] font-medium",
              "border transition-all duration-150 bg-transparent",
              isDark
                ? "border-[#3d362c] text-[#9c8e80] hover:text-[#d5bfb2] hover:border-[#4a4238]"
                : "border-[#e8e4dd] text-[#7a736a] hover:text-[#302d29]",
            )}
          >
            <ChevronDown
              className={clsx("w-3.5 h-3.5 transition-transform", showCreds && "rotate-180")}
              strokeWidth={2}
            />
            {showCreds ? "Hide" : "Show"} dev credentials
          </button>

          {showCreds && (
            <div
              className={clsx(
                "mt-2 rounded-xl overflow-hidden border",
                isDark ? "border-[#3d362c] bg-[#242019]" : "border-[#e8e4dd] bg-white",
              )}
            >
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className={isDark ? "border-b border-[#3d362c]" : "border-b border-[#e8e4dd]"}>
                    <th className="px-2.5 py-2 text-left text-[#a39e96] font-semibold">Role</th>
                    <th className="px-2.5 py-2 text-left text-[#a39e96] font-semibold">Email</th>
                    <th className="px-2.5 py-2 text-left text-[#a39e96] font-semibold">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {CRED_ROWS.map((group) => (
                    <Fragment key={group.org}>
                      <tr><td colSpan={3} className={clsx("px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider", isDark ? "text-[#c9a84c]" : "text-[#8b6914]")}>{group.org}</td></tr>
                      {group.rows.map(([role, email, pass, colour], i) => (
                        <tr key={i} onClick={() => { setValue("email", email); setValue("password", pass); setShowCreds(false); }}
                          className={clsx("cursor-pointer transition-colors", isDark ? "hover:bg-[#2e2820]" : "hover:bg-[#faf9f7]", i < group.rows.length - 1 && (isDark ? "border-b border-[#3d362c]" : "border-b border-[#f5f3ef]"))}>
                          <td className="px-2.5 py-2"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: colour + "1a", color: colour }}>{role}</span></td>
                          <td className={clsx("px-2.5 py-2 font-mono", isDark ? "text-[#9c8e80]" : "text-[#7a736a]")}>{email}</td>
                          <td className={clsx("px-2.5 py-2 font-mono", isDark ? "text-[#9c8e80]" : "text-[#7a736a]")}>{pass}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div className={clsx(
                "px-2.5 py-1.5 text-[10px] text-[#a39e96]",
                isDark ? "border-t border-[#3d362c]" : "border-t border-[#f5f3ef]",
              )}>
                Click any row to auto-fill
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MFA / OTP modal ── */}
      <Modal
        open={otpRequired}
        onClose={resetOtpState}
        title="Enter verification code"
      >
        <div className="space-y-4">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            We sent a 6-digit code to <strong>{otpEmail}</strong>. The code expires in 10 minutes.
          </p>

          <div>
            <label
              htmlFor="otp-input"
              className="block text-[11px] font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Verification code <span className="text-[#dc2626]" aria-hidden="true">*</span>
            </label>
            <div className="relative">
              <KeyRound
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
                aria-hidden="true"
              />
              <input
                id="otp-input"
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && otpCode.length === 6) {
                    e.preventDefault();
                    void handleOtpVerify();
                  }
                }}
                placeholder="123456"
                aria-required="true"
                aria-invalid={otpError ? true : undefined}
                aria-describedby={otpError ? "otp-error" : undefined}
                className="input pl-9 text-center font-mono text-[18px] tracking-[6px]"
              />
            </div>
          </div>

          {otpError && (
            <div
              id="otp-error"
              role="alert"
              className="rounded-lg px-3 py-2 text-[12px]"
              style={{
                background: "var(--danger-bg)",
                color: "var(--danger)",
                border: "1px solid var(--danger)",
              }}
            >
              {otpError}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={resetOtpState} disabled={otpVerifying}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={handleOtpResend}
                disabled={otpResendCooldown > 0 || otpResending || otpVerifying}
                loading={otpResending}
              >
                {otpResendCooldown > 0 ? `Resend in ${otpResendCooldown}s` : "Resend code"}
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleOtpVerify}
                disabled={otpCode.length !== 6 || otpVerifying || otpResending}
                loading={otpVerifying}
              >
                Verify
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
