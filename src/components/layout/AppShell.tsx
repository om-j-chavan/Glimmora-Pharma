"use client";

import { useState, useEffect, useRef } from "react";

import Image from "next/image";
import { Mail } from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useNotificationEngine } from "@/hooks/useNotificationEngine";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useRole } from "@/hooks/useRole";
import { logout, setCredentials, setTenants, type AuthUser, type Tenant } from "@/store/auth.slice";
import { setEffectiveFrameworks, resetFrameworks, type FrameworkItem } from "@/store/frameworks.slice";
import { setRegions, type RegionOption } from "@/store/regions.slice";
import { useAppSelector } from "@/hooks/useAppSelector";
import { logout as nextAuthLogout } from "@/lib/authClient";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { SiteFilterBanner } from "./SiteFilterBanner";
import { AIChatbot } from "@/components/chatbot/AIChatbot";

interface AppShellProps {
  children?: React.ReactNode;
  initialTenant?: Tenant | null;
  /** NextAuth session user resolved server-side by app/(app)/layout.tsx.
   *  We dispatch setCredentials with this on mount whenever Redux's
   *  auth.user is missing — the persistMiddleware's 500ms debounce can
   *  miss the post-login dispatch before window.location.assign navigates,
   *  leaving auth.currentTenant null. Without that id, useTenantConfig()
   *  can't find the freshly-dispatched tenant in `tenants[]`, treats the
   *  missing subscription as expired, and the gate fires "No active
   *  subscription" against a perfectly healthy DB row. */
  initialUser?: AuthUser | null;
  /** Server-resolved effective frameworks for this tenant — seeds the
   *  non-persisted frameworks slice synchronously on mount (see the (app)
   *  layout). Guarantees framework-dependent UI is populated on first render. */
  initialFrameworks?: FrameworkItem[];
  /** Server-resolved regions (active options + value→label map incl. archived)
   *  — seeds the non-persisted regions slice on mount (Item #3, Stage 2). */
  initialRegions?: { active: RegionOption[]; labelMap: Record<string, string> };
}

export function AppShell({ children, initialTenant, initialUser, initialFrameworks, initialRegions }: AppShellProps) {
  // 🔒 Prevent hydration mismatch
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // SSR-safe mount flag — intentionally syncs on mount only.

    setMounted(true);
  }, []);

  useNotificationEngine();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const dispatch = useAppDispatch();
  const toast = useToast();
  const reduxUser = useAppSelector((s) => s.auth.user);
  const reduxCurrentTenant = useAppSelector((s) => s.auth.currentTenant);

  // Hydrate Redux with the current user's own tenant so useTenantConfig()
  // can resolve subscription/site/user state. Without this, customer_admin
  // and site users would have an empty tenants array (only /admin's
  // CustomerAccountsPage dispatches setTenants), the subscription gate
  // would fire as "expired", and the entire app would be blocked.
  const initialSeeded = useRef(false);
  useEffect(() => {
    if (initialTenant && !initialSeeded.current) {
      dispatch(setTenants([initialTenant]));
      initialSeeded.current = true;
    }
  }, [dispatch, initialTenant]);

  // Self-heal Redux's auth.user / currentTenant from the server-rendered
  // session. The post-login dispatch in LoginPage.finishLogin() lands in
  // Redux but the persistMiddleware debounces writes by 500ms, so a
  // window.location.assign("/") that fires immediately after can leave
  // localStorage holding a stale (or missing) currentTenant. The next
  // page load's loadPersistedState() then rebuilds the store with that
  // stale state, useTenantConfig() finds no tenant for currentTenant,
  // activePlan is null, isExpired collapses to true, and the gate fires.
  // Mirroring AdminShell's self-heal closes that race for /(app) too.
  const credentialsSeeded = useRef(false);
  useEffect(() => {
    if (credentialsSeeded.current) return;
    if (!initialUser) return;
    if (reduxUser && reduxCurrentTenant === initialUser.tenantId) {
      credentialsSeeded.current = true;
      return;
    }
    dispatch(setCredentials({ token: "nextauth-session", user: initialUser }));
    credentialsSeeded.current = true;
  }, [dispatch, initialUser, reduxUser, reduxCurrentTenant]);

  // Per-tenant framework hydration (Phase 1, Item 4). Seeds the NON-persisted
  // `frameworks` slice from the SERVER-resolved list passed by the (app) layout
  // — populated on the first client render (no async round-trip), so the Gap
  // dropdown / CSV columns never read an empty slice. The layout re-runs per
  // request (per login), so a tenant switch always re-seeds from the server and
  // one tenant's enablement can never leak to another. Resets on logout.
  const fwUserId = reduxUser?.id ?? initialUser?.id ?? null;
  useEffect(() => {
    if (!fwUserId) { dispatch(resetFrameworks()); return; }
    dispatch(setEffectiveFrameworks(initialFrameworks ?? []));
  }, [dispatch, fwUserId, initialFrameworks]);

  // DB-backed regions (Item #3, Stage 2) — seed from the server list. If absent
  // the slice keeps its constant-fallback initial state, so dropdowns/labels
  // still work (parity by construction).
  useEffect(() => {
    if (initialRegions) dispatch(setRegions(initialRegions));
  }, [dispatch, initialRegions]);

  const { plan, tenantName, isExpired, isNearExpiry, daysRemaining } =
    useTenantConfig();
  const { isSuperAdmin, isViewOnly } = useRole();

  // ⛔ Wait until client is ready
  if (!mounted) return null;

  // The plan gate must NOT evaluate during the logout transition. Logout
  // dispatches `logout()` (nulling auth.user + currentTenant) but defers the
  // /login navigation ~500ms, so this shell re-renders while still mounted with
  // no session: useTenantConfig() then sees no tenant → plan=null → isExpired,
  // and useRole() defaults to "viewer" → !isSuperAdmin — which previously
  // flashed the "No plan assigned" blocked screen at every non-SA logout.
  // Requiring a live session user (`reduxUser`) skips the gate whenever the
  // session is clearing / absent, without touching the SA exemption
  // (`!isSuperAdmin`) or a real authenticated plan-less/expired tenant (which
  // always has a user, so it still sees the card in normal use).
  const isBlocked = isExpired && !isSuperAdmin && !!reduxUser;

  // =========================
  // 🚫 BLOCKED SCREEN
  // =========================
  if (isBlocked) {
    return (
      <main
        id="main-content"
        aria-label="Subscription expired"
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "var(--bg-base)" }}
      >
        <div
          className={clsx(
            "rounded-2xl p-8 w-full max-w-md text-center border",
            "bg-(--bg-elevated) border-(--bg-border)",
          )}
        >
          <Image
            src="/app-icon.png"
            alt=""
            width={64}
            height={64}
            aria-hidden="true"
            className="w-16 h-16 object-contain mx-auto mb-6"
          />

          <p className="text-[13px] font-semibold text-[#0ea5e9] mb-2">
            {tenantName}
          </p>

          <h1
            className="text-[20px] font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {plan
              ? "Your plan has expired"
              : "No plan assigned"}
          </h1>

          {plan && (
            <p
              className="text-[13px] mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              Your plan expired on{" "}
              {dayjs.utc(plan.expiryDate).format("DD MMM YYYY")}
            </p>
          )}

          <p
            className="text-[13px] mb-6"
            style={{ color: "var(--text-secondary)" }}
          >
            To continue using Pharma Glimmora, please contact us to renew your
            subscription.
          </p>

          <div
            className={clsx(
              "rounded-2xl p-4 mb-6 text-left",
              "bg-(--bg-surface)",
            )}
          >
            {[
              { label: "Email", value: "sales@pharmaglimmora.com" },
              { label: "Phone", value: "+91 98765 43210" },
              { label: "Website", value: "pharmaglimmora.com" },
            ].map((c, i, arr) => (
              <div
                key={c.label}
                className="flex items-center gap-3 py-2"
                style={{
                  borderBottom:
                    i === arr.length - 1
                      ? "none"
                      : `1px solid var(--bg-border)`,
                }}
              >
                <span
                  className="text-[11px] font-semibold w-14 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {c.label}
                </span>
                <span className="text-[12px] text-[#0ea5e9]">{c.value}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button
              variant="ghost"
              fullWidth
              onClick={async () => {
                toast.info("Signing out…");
                try {
                  await nextAuthLogout();
                } catch { /* ignore — fall through to local logout */ }
                dispatch(logout());
                // Clear per-tenant framework state on sign-out so nothing can
                // carry into the next login in the same browser (belt-and-braces
                // on top of the hard nav + non-persisted slice).
                dispatch(resetFrameworks());
                toast.success("Signed out.");
                // Hard nav (this surface used window.location to defeat any
                // stale SPA state). Slight delay so the toast renders.
                setTimeout(() => { window.location.href = "/login"; }, 500);
              }}
            >
              Logout
            </Button>

            <Button
              variant="primary"
              fullWidth
              icon={Mail}
              onClick={() =>
                window.open(
                  `mailto:sales@pharmaglimmora.com?subject=Subscription renewal — ${encodeURIComponent(
                    tenantName,
                  )}`,
                  "_blank",
                )
              }
            >
              Contact us
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // =========================
  // ⚠️ WARNING BANNER
  // =========================
  const showWarning = isNearExpiry && !isExpired && !isSuperAdmin;
  const isCritical = (daysRemaining ?? 0) <= 3;

  // =========================
  // 🧱 MAIN APP SHELL
  // =========================
  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>

      <div className="flex h-full overflow-hidden">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <div
          className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:static lg:translate-x-0 print:hidden ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>

        <div className="flex-1 flex flex-col min-w-0 h-full">
          <div className="shrink-0 print:hidden">
            <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
          </div>

          <div className="shrink-0 print:hidden">
            <SiteFilterBanner />
          </div>

          {showWarning && (
            <div
              role="alert"
              className={clsx(
                "shrink-0 print:hidden flex items-center justify-between gap-3 px-4 py-2.5 border-b",
                isCritical
                  ? "bg-(--danger-bg) border-(--danger)"
                  : "bg-(--warning-bg) border-(--warning)",
              )}
            >
              <div className="min-w-0">
                <p
                  className="text-[12px] font-medium"
                  style={{
                    color: isCritical ? "#b91c1c" : "#b45309",
                  }}
                >
                  {daysRemaining === 0
                    ? "Your subscription expires today"
                    : `Subscription expires in ${daysRemaining} day${
                        daysRemaining !== 1 ? "s" : ""
                      }`}
                </p>

                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Contact Pharma Glimmora to renew your subscription and avoid
                  service interruption.
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                icon={Mail}
                onClick={() =>
                  window.open(
                    `mailto:sales@pharmaglimmora.com?subject=Subscription renewal — ${encodeURIComponent(
                      tenantName,
                    )}`,
                    "_blank",
                  )
                }
              >
                Contact us
              </Button>
            </div>
          )}

          <main
            id="main-content"
            aria-label="Pharma Glimmora main content"
            className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 lg:p-5 bg-(--bg-base)"
          >
            {children}
          </main>
        </div>
      </div>

      {/* Floating AI assistant — available on every authed page except for
          read-only viewers. Right-click + drag the bubble to move it. */}
      {!isViewOnly && <AIChatbot />}
    </>
  );
}
