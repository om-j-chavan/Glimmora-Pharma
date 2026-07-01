"use client";

import { useState, useEffect, Fragment } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Shield,
  Mail,
  Lock,
  LogIn,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import clsx from "clsx";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { setCredentials, setActiveSite, setSelectedSite, type AuthUser, type Tenant, type TenantSiteConfig } from "@/store/auth.slice";
import { login as nextAuthLogin, fetchCurrentUser } from "@/lib/authClient";
import { flushPersist } from "@/store/persistence";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

// Password resets are handled manually by the Glimmora-Pharma support team
// (no self-service reset on this 21 CFR Part 11 platform).
// TODO: replace placeholder support contact details with the real values.
const SUPPORT_EMAIL = "support@glimmora-pharma.com"; // TODO: placeholder
const SUPPORT_PHONE_DISPLAY = "+1 (555) 014-2273"; // TODO: placeholder
const SUPPORT_PHONE_TEL = "+15550142273"; // TODO: placeholder (E.164 of the above)

const schema = z.object({
  email: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

// Every row below must correspond to a real seeded account in prisma/seed.ts.
// Two tables back this: Tenant (super_admin, customer_admin) and User (site users).
const CRED_ROWS: { org: string; rows: [string, string, string, string][] }[] = [
  {
    org: "Platform (bootstrap)",
    rows: [
      // Single Super Admin row using email format for UX consistency with the
      // PGI rows below. The NextAuth Credentials provider accepts both
      // "superadmin" and "superadmin@glimmora.com" (Tenant.username and
      // Tenant.email are both @@unique on the same seeded row).
      ["Super Admin", "superadmin@glimmora.com", "1", "#ef4444"],
    ],
  },
  {
    org: "Pharma Glimmora International",
    rows: [
      ["Customer Admin", "admin@pharmaglimmora.com", "Admin@123", "#8b6914"],
      ["QA Head", "qa@pharmaglimmora.com", "Demo@123", "#a78bfa"],
      ["Quality Assurance", "qa.exec@pharmaglimmora.com", "Demo@123", "#818cf8"],
      ["Regulatory Affairs", "ra@pharmaglimmora.com", "Demo@123", "#fb923c"],
      ["CSV/Val Lead", "csv@pharmaglimmora.com", "Demo@123", "#38bdf8"],
      ["QC/Lab Director", "qc@pharmaglimmora.com", "Demo@123", "#10b981"],
      ["IT/CDO", "it@pharmaglimmora.com", "Demo@123", "#06b6d4"],
      ["Operations Head", "ops@pharmaglimmora.com", "Demo@123", "#84cc16"],
    ],
  },
];

export function LoginPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const toast = useToast();
  const [showCreds, setShowCreds] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [loadingName, setLoadingName] = useState("");

  // Session-expired toast handoff. AdminShell navigates to
  // /login?session=expired on a 401 from /api/auth/me; this effect
  // surfaces the toast and strips the param so a refresh doesn't
  // re-show it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("session") === "expired") {
      toast.error("Your session expired. Please sign in again.");
      params.delete("session");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
    // Mount-only — runs once when the LoginPage first renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  /**
   * Get the sites a user can access. allSites / customer_admin / qa_head
   * see all active sites; others see only their assignedSites.
   */
  const getAccessibleSites = (user: AuthUser, tenant: Tenant | undefined): TenantSiteConfig[] => {
    const tenantSites = tenant?.config?.sites?.filter((s) => s.status === "Active") ?? [];
    const tenantUser = tenant?.config?.users?.find(
      (u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase(),
    );

    // Super admin and customer admin always see all sites
    if (user.role === "super_admin" || user.role === "customer_admin") {
      return tenantSites;
    }

    // allSites flag — see everything
    if (tenantUser?.allSites === true) {
      return tenantSites;
    }

    // Otherwise only show the sites assigned to this user
    if (tenantUser && tenantUser.assignedSites.length > 0) {
      return tenantSites.filter((s) => tenantUser.assignedSites.includes(s.id));
    }

    // No user record or no sites assigned — empty
    return [];
  };

  /**
   * Non-super-admin login: auto-select the first accessible site and go
   * directly to the dashboard. Users with multiple sites can switch via
   * the site dropdown in the topbar header.
   */
  const finishLogin = async (
    user: AuthUser,
    tenant: Tenant | undefined,
    displayName: string,
  ) => {
    const accessible = getAccessibleSites(user, tenant);

    if (accessible.length === 0) {
      // No sites at all — go straight to dashboard with no site filter
      dispatch(setSelectedSite(null));
      const anySite = tenant?.config?.sites?.[0];
      if (anySite) dispatch(setActiveSite(anySite.id));
    } else if (accessible.length === 1) {
      // Exactly one site — auto-select it (no switcher will be shown)
      const only = accessible[0];
      dispatch(setActiveSite(only.id));
      dispatch(setSelectedSite(only.id));
    } else {
      // Multiple sites — default to "All Sites" and keep first as the active fallback
      dispatch(setActiveSite(accessible[0].id));
      dispatch(setSelectedSite(null));
    }

    setLoadingName(displayName);
    setLoadingTenant(true);
    router.push("/");
  };

  const onSubmit = async (data: FormValues) => {
    // Single source of truth: NextAuth's authorize() callback verifies
    // credentials against the Tenant / User tables (bcrypt) and applies
    // subscription + MFA gates. No fallback chains — if NextAuth rejects,
    // the user cannot sign in. Test access uses seeded accounts in
    // prisma/seed.ts authenticating through this same path.
    let result;
    try {
      result = await nextAuthLogin(data.email.trim(), data.password, /* silent */ true);
    } catch (err) {
      console.warn("[login] next-auth signIn threw", err);
      const msg = "Sign-in failed. Please try again or contact support.";
      setError("root", { message: msg });
      toast.error(msg);
      return;
    }

    if (!result.ok) {
      // Specific, actionable errors first.
      if (result.error && result.error.includes("SUBSCRIPTION_INACTIVE")) {
        const msg = "Your subscription has expired or no active plan is configured. Please contact your administrator.";
        setError("root", { message: msg });
        toast.error(msg);
        return;
      }
      if (result.error && result.error.includes("USER_INACTIVE")) {
        const msg = "Your account is inactive. Please contact your administrator to reactivate it.";
        setError("root", { message: msg });
        toast.error(msg);
        return;
      }
      // Generic case: CredentialsSignin (wrong password) AND no-such-email
      // share the same message to prevent account enumeration.
      const msg = "Incorrect email or password";
      setError("root", { message: msg });
      toast.error(msg);
      return;
    }

    // NextAuth accepted credentials — fetch the canonical user profile.
    const me = await fetchCurrentUser();
    if (!me) {
      // Cookie/session race — extremely rare. Don't try to recover; tell
      // the user and let them retry.
      const msg = "Sign-in succeeded but the profile could not be loaded. Please try again.";
      setError("root", { message: msg });
      toast.error(msg);
      return;
    }

    const user: AuthUser = {
      id: me.id,
      name: me.name,
      email: me.email,
      role: me.role as AuthUser["role"],
      gxpSignatory: me.gxpSignatory,
      tenantId: me.tenantId,
      orgId: me.orgId,
    };
    dispatch(setCredentials({ token: "nextauth-token-" + Date.now(), user }));
    try {
      if (typeof window !== "undefined" && window.location.search) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch { /* ignore */ }
    toast.success(`Signed in as ${me.name || "team"}.`);

    // Defense-in-depth: router.push (SPA navigation) preserves React state
    // across the navigation so that if the proxy ever bounces this request
    // back to /login, errors.root and the toast survive the round-trip
    // instead of disappearing into a fresh page load.
    if (user.role === "super_admin") {
      setLoadingName("Platform Admin");
      setLoadingTenant(true);
      flushPersist();
      router.push("/admin");
      return;
    }
    if (user.role === "customer_admin") {
      setLoadingName("workspace");
      setLoadingTenant(true);
      flushPersist();
      router.push("/");
      return;
    }
    await finishLogin(user, undefined, me.name);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--bg-base)" }}>

      <div className="w-full max-w-[420px] pt-12 pb-10 px-10">
        {/* Logo — hidden during loading */}
        {!loadingTenant && (
          <div className="flex flex-col items-start mb-8">
            <Image
              src="/logo.png"
              alt="Pharma Glimmora"
              width={220}
              height={57}
              priority
              className="h-auto w-[220px] mb-5"
            />
            <h1 className="text-[28px] font-extrabold tracking-tight mb-1" style={{ color: "var(--text-primary)" }}>
              Welcome !
            </h1>
            <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
              Log into your account
            </p>
          </div>
        )}

        {/* Loading tenant */}
        {loadingTenant && (
          <div className="flex flex-col items-center justify-center gap-3 py-8" role="status" aria-live="polite">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--brand)", borderTopColor: "transparent" }} />
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Loading {loadingName}...
            </p>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          method="post"
          // method="post" is purely defensive: handleSubmit() preventDefault()s
          // every real submission. But if the user clicks Sign in BEFORE React
          // hydration finishes (slow dev server, race with password-manager
          // auto-submit), the native browser submission runs. Without method
          // set the default is GET — which leaks email + password to the URL
          // as ?email=…&password=…. Forcing POST keeps the values in the
          // request body even on pre-hydration submits.
          aria-label="Sign in to Pharma Glimmora"
          noValidate
          className="w-full space-y-4 mt-8"
          style={{ display: loadingTenant ? "none" : undefined }}
        >
          {/* Root error */}
          {errors.root && (
            <div role="alert" className="rounded-lg px-3 py-2.5 text-[12px] flex items-start gap-2" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
              <span aria-hidden="true" className="mt-0.5">⚠️</span>
              <div className="min-w-0">
                <p className="font-medium">{errors.root.message}</p>
                {process.env.NODE_ENV === "development" && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--danger)" }}>
                    Tip: click &quot;Show dev credentials&quot; below to auto-fill a working account.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Username / email — token-themed so it follows the active theme. */}
          <div>
            <label htmlFor="email" className="text-[11px] font-medium block mb-1.5" style={{ color: "var(--text-primary)" }}>
              Email or username <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            {/* suppressHydrationWarning on form fields is intentional:
                password-manager / form-filler browser extensions (Bitwarden,
                LastPass, 1Password, etc.) inject fdprocessedid attributes
                post-SSR, causing a benign hydration mismatch. Do not remove. */}
            <div className="relative">
              <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <input
                id="email"
                type="text"
                autoComplete="username"
                placeholder="admin@pharmaglimmora.com or superadmin"
                required
                aria-required="true"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "email-error" : undefined}
                suppressHydrationWarning
                {...register("email")}
                className="w-full rounded-lg pl-9.5 pr-3 py-2.5 text-[13px] outline-none transition-all duration-150 bg-(--bg-surface) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
              />
            </div>
            {errors.email && (
              <p id="email-error" role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="password" className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
                Passcode <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>
              </label>
              <Button type="button" variant="ghost" size="xs" onClick={() => setForgotOpen(true)} className="!h-auto !p-0 text-[11px] underline" style={{ color: "var(--brand)" }}>Forgot passcode?</Button>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your passcode"
                required
                aria-required="true"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
                suppressHydrationWarning
                {...register("password")}
                className="w-full rounded-lg pl-9.5 pr-9 py-2.5 text-[13px] outline-none transition-all duration-150 bg-(--bg-surface) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide passcode" : "Show passcode"}
                aria-pressed={showPassword}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-[24px] min-h-[24px] rounded transition-colors hover:bg-(--bg-hover) text-(--text-muted) hover:text-(--text-primary)"
              >
                {showPassword
                  ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" icon={LogIn} loading={isSubmitting} fullWidth className="py-2.75" suppressHydrationWarning>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>

          {/* SSO / SAML is a Phase-3 feature (not yet implemented). The button +
              "or continue with" divider were removed so logged-out users aren't
              shown a non-working auth option; re-add here when SSO is wired. */}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-(--bg-border)" style={{ display: loadingTenant ? "none" : undefined }}>
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <Shield className="w-3 h-3" aria-hidden="true" />
            21 CFR Part 11 compliant
          </div>
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Privacy · Terms</span>
        </div>

        {/* Dev credentials toggle — gated to non-production builds so production
            users never see seed passwords. NODE_ENV is inlined at build time so
            this entire block (plus CRED_ROWS data downstream) is tree-shaken
            out of the production bundle. */}
        {process.env.NODE_ENV !== "production" && (
        <div className="mt-4" style={{ display: loadingTenant ? "none" : undefined }}>
          <button
            type="button"
            onClick={() => setShowCreds((v) => !v)}
            suppressHydrationWarning
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-medium border transition-all duration-150 bg-transparent border-(--bg-border) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--brand)"
          >
            <ChevronDown
              className={clsx("w-3.5 h-3.5 transition-transform", showCreds && "rotate-180")}
              strokeWidth={2}
            />
            {showCreds ? "Hide" : "Show"} dev credentials
          </button>

          {showCreds && (
            <div className="mt-2 rounded-xl overflow-hidden border border-(--bg-border) bg-(--bg-surface)">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-(--bg-border)">
                    <th className="px-2.5 py-2 text-left font-semibold text-(--text-muted)">Role</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-(--text-muted)">Email</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-(--text-muted)">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {CRED_ROWS.map((group) => (
                    <Fragment key={group.org}>
                      <tr><td colSpan={3} className="px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-(--brand)">{group.org}</td></tr>
                      {group.rows.map(([role, email, pass, colour], i) => (
                        <tr key={i} onClick={() => { setValue("email", email); setValue("password", pass); setShowCreds(false); }}
                          className={clsx("cursor-pointer transition-colors hover:bg-(--bg-elevated)", i < group.rows.length - 1 && "border-b border-(--bg-border)")}>
                          <td className="px-2.5 py-2"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: colour + "1a", color: colour }}>{role}</span></td>
                          <td className="px-2.5 py-2 font-mono text-(--text-secondary)">{email}</td>
                          <td className="px-2.5 py-2 font-mono text-(--text-secondary)">{pass}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div className="px-2.5 py-1.5 text-[10px] border-t border-(--bg-border) text-(--text-muted)">
                Click any row to auto-fill
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Forgot-password → contact support. Resets are handled manually by the
          support team (no self-service reset on this Part 11 platform). The
          Modal handles backdrop/Esc dismissal, the Close (X) button,
          aria-labelledby via `title`, and focus-return to the trigger. */}
      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Forgot your password?"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="primary"
              icon={Mail}
              onClick={() => {
                window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Password reset request")}`;
              }}
            >
              Email support
            </Button>
            <Button variant="secondary" onClick={() => setForgotOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          <p>
            To keep GxP records secure, our team handles password resets directly.
            Reach out and we&apos;ll verify you and get you back in.
          </p>
          <p>
            Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline" style={{ color: "var(--brand)" }}>
              {SUPPORT_EMAIL}
            </a>{" "}
            or call{" "}
            <a href={`tel:${SUPPORT_PHONE_TEL}`} className="underline" style={{ color: "var(--brand)" }}>
              {SUPPORT_PHONE_DISPLAY}
            </a>
            .
          </p>
        </div>
      </Modal>
    </div>
  );
}
