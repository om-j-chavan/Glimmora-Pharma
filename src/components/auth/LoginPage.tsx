"use client";

import { useState, useEffect, useRef, Fragment } from "react";
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
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { setCredentials, setActiveSite, setSelectedSite, type AuthUser, type Tenant, type TenantSiteConfig } from "@/store/auth.slice";
import { login as nextAuthLogin, fetchCurrentUser } from "@/lib/authClient";
import { flushPersist } from "@/store/persistence";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PillWithBubbles } from "@/components/animations/PillWithBubbles";

// Password resets are handled manually by the Glimmora-Pharma support team
// (no self-service reset on this 21 CFR Part 11 platform).
// TODO: replace placeholder support contact details with the real values.
const SUPPORT_EMAIL = "support@glimmora-pharma.com"; // TODO: placeholder
const SUPPORT_PHONE_DISPLAY = "+1 (555) 014-2273"; // TODO: placeholder
const SUPPORT_PHONE_TEL = "+15550142273"; // TODO: placeholder (E.164 of the above)

// The identifier field accepts EITHER an email or a bare username — the
// NextAuth Credentials provider looks both up (Tenant.username / Tenant.email
// are each @@unique). So we must NOT blanket-require an email shape; doing so
// would lock out "superadmin". Instead: only once the value looks like an email
// attempt (it contains "@") do we check it's a well-formed one. Bare usernames
// pass through untouched, exactly as before.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = z.object({
  email: z
    .string()
    .min(1, "Username or email is required")
    .refine((v) => !v.includes("@") || EMAIL_RE.test(v.trim()), {
      message: "Enter a valid email address",
    }),
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
  // Duplicate-submission latch. A ref, NOT `isSubmitting`: react-hook-form sets
  // isSubmitting via a state update, so two clicks landing in the same tick both
  // observe the stale `false` from their render closure and both fire a sign-in
  // request. A ref flips synchronously, so the second click is dropped.
  const inFlightRef = useRef(false);

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

  /**
   * Duplicate-submission wrapper. The Button is disabled while `loading`, but a
   * rapid double-click (or a password manager auto-submitting) can re-enter
   * handleSubmit before React has re-rendered the disabled state. The ref latch
   * flips synchronously, so exactly ONE sign-in request is ever in flight.
   * Purely a UI concern — runSignIn's auth calls are untouched.
   */
  const onSubmit = async (data: FormValues) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await runSignIn(data);
    } finally {
      inFlightRef.current = false;
    }
  };

  const runSignIn = async (data: FormValues) => {
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
      if (result.error && result.error.includes("ACCOUNT_SUSPENDED")) {
        const msg = "Your account has been suspended. Please contact the Pharma Platform administrator.";
        setError("root", { message: msg });
        toast.error(msg);
        return;
      }
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
      if (result.error && result.error.includes("NO_SITE_ASSIGNED")) {
        const msg = "No site has been assigned to your account. Please contact your Customer Administrator.";
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
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: "var(--bg-base)" }}>
      {/* ── Brand panel (left). Hidden below lg, so mobile collapses to the
             card alone. Colour comes from .login-brand-panel, which is derived
             from var(--brand) and therefore follows the active colour theme. ── */}
      <aside className="login-brand-panel hidden lg:flex flex-col justify-between p-12 xl:p-16">
        {/* Background flourish: a faint tilted pill with bubbles rising from it.
            Sits behind the copy (pill z-0, bubbles z-1); content below is z-2.
            Replaces the former faint logo-mark watermark. */}
        <PillWithBubbles />

        {/* Region-neutral badge: no US-only framing (Part 11 is FDA, Annex 11 is
            EU, GxP is global). Not `uppercase` — the strings are cased on purpose
            ("GxP", not "GXP"). */}
        <div className="relative z-[2] flex items-center gap-2.5 text-white/70">
          <Shield className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-[11px] font-medium tracking-wide">GxP · Part 11 · Annex 11</span>
        </div>

        <div className="relative z-[2] max-w-md">
          <h2 className="text-[30px] xl:text-[34px] font-bold leading-[1.15] tracking-tight text-white">
            Inspection-ready quality, every day.
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-white/70">
            One platform for deviations, CAPA, validation, and inspection response — with an
            immutable audit trail behind every regulated action.
          </p>
        </div>

        <p className="relative z-[2] text-[11px] text-white/45">
          &copy; {new Date().getFullYear()} Pharma Glimmora
        </p>
      </aside>

      {/* ── Card column (right) ── */}
      <div className="flex items-center justify-center px-4 py-8 sm:py-12">
        {/* Login CARD. Tokens only (--card-bg / --card-border / --shadow-card)
            so it tracks light + dark automatically. The `login-card-in`
            entrance is neutralized by the global prefers-reduced-motion block. */}
        <div
          className="login-card-in w-full max-w-[420px] rounded-2xl border px-6 py-8 sm:px-9 sm:py-9"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--card-border)",
            boxShadow: "var(--shadow-card)",
          }}
        >
        {/* Branding — the logo.png wordmark already reads "Pharma Glimmora", so
            there is deliberately NO <h1> repeating it. Logo → tagline. */}
        {!loadingTenant && (
          <div className="flex flex-col items-center text-center mb-6">
            <Image
              src="/logo.png"
              alt="Pharma Glimmora"
              width={220}
              height={57}
              priority
              className="h-auto w-[185px] sm:w-[200px]"
            />
            <p className="mt-3.5 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              GxP quality management, inspection-ready.
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
          aria-busy={isSubmitting || undefined}
          noValidate
          className="w-full space-y-3.5"
          style={{ display: loadingTenant ? "none" : undefined }}
        >
          {/* Root auth error — inline alert. There is no shared <Alert>
              component in this codebase, and the guardrail is to reuse the
              existing primitives rather than introduce a new one, so this stays
              a token-styled role="alert" banner. The matching toast.error() call
              in onSubmit is unchanged. */}
          {errors.root && (
            <div
              role="alert"
              className="rounded-lg px-3 py-2.5 text-[12px] flex items-start gap-2.5"
              style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)", color: "var(--danger)" }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium">{errors.root.message}</p>
                {process.env.NODE_ENV === "development" && (
                  <p className="text-[11px] mt-0.5 opacity-90">
                    Tip: click &quot;Show dev credentials&quot; below to auto-fill a working account.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Username / email — shared <Input>. It owns the label, the leading
              icon, the error text + aria-invalid/aria-describedby wiring.
              suppressHydrationWarning on form fields is intentional:
              password-manager / form-filler browser extensions (Bitwarden,
              LastPass, 1Password, etc.) inject fdprocessedid attributes
              post-SSR, causing a benign hydration mismatch. Do not remove. */}
          <Input
            id="email"
            type="text"
            label="Email or username"
            required
            icon={Mail}
            autoFocus
            autoComplete="username"
            placeholder="admin@pharmaglimmora.com or superadmin"
            disabled={isSubmitting}
            error={errors.email?.message}
            suppressHydrationWarning
            {...register("email")}
          />

          {/* Password. The eye lives in <Input rightAdornment>, which is the
              component's own mechanism: when type="password" AND a rightAdornment
              is present it applies `suppress-native-reveal`, hiding the browser's
              native reveal control. That is what keeps this to exactly ONE eye. */}
          <div>
            {/* Custom label row so "Forgot passcode?" can sit opposite the label.
                <Input> is given no `label` prop here; this <label htmlFor> binds
                to the id it renders on the field, so the association is intact. */}
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="password" className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                Passcode
                <span className="text-(--danger)" aria-hidden="true"> *</span>
                <span className="sr-only"> (required)</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setForgotOpen(true)}
                disabled={isSubmitting}
                className="!h-auto !p-0 text-[11px] underline"
                style={{ color: "var(--brand)" }}
              >
                Forgot passcode?
              </Button>
            </div>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              icon={Lock}
              autoComplete="current-password"
              placeholder="Enter your passcode"
              disabled={isSubmitting}
              error={errors.password?.message}
              suppressHydrationWarning
              rightAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide passcode" : "Show passcode"}
                  aria-pressed={showPassword}
                  tabIndex={-1}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center min-w-[24px] min-h-[24px] rounded transition-colors hover:bg-(--bg-hover) text-(--text-muted) hover:text-(--text-primary) disabled:opacity-50 disabled:cursor-not-allowed border-none bg-transparent cursor-pointer"
                >
                  {showPassword
                    ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                </button>
              }
              {...register("password")}
            />
          </div>

          {/* `login-submit` adds the gradient + hover lift, scoped to this
              button so the shared <Button> primary stays flat app-wide. */}
          <Button
            type="submit"
            icon={LogIn}
            loading={isSubmitting}
            fullWidth
            className="login-submit mt-2 py-2.75"
            suppressHydrationWarning
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>

          {/* SSO / SAML is a Phase-3 feature (not yet implemented). The button +
              "or continue with" divider were removed so logged-out users aren't
              shown a non-working auth option; re-add here when SSO is wired. */}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between mt-7 pt-5 border-t border-(--bg-border)" style={{ display: loadingTenant ? "none" : undefined }}>
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
