"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Shield,
  Users,
  SlidersHorizontal,
  ScrollText,
  LifeBuoy,
  Globe,
  LogOut,
  Menu,
  Bell,
} from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { logout, setCredentials, type UserRole } from "@/store/auth.slice";
import { setRegions } from "@/store/regions.slice";
import { loadRegions } from "@/actions/regions";
import { logout as nextAuthLogout, fetchCurrentUser } from "@/lib/authClient";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ColorThemePicker } from "@/components/ui/ColorThemePicker";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { logoutMessage } from "@/lib/labels/logout";
import { useToast } from "@/components/ui/Toast";

// `roles` gates link VISIBILITY only (hides dead-end links from users who'd be
// denied). The real security guard is each page's requireRoleOrDeny — unchanged.
// No `roles` = shown to everyone allowed in the shell.
const NAV_ITEMS: Array<{
  path: string;
  label: string;
  icon: typeof Users;
  end: boolean;
  roles?: string[];
}> = [
  { path: "/admin", label: "Customer Accounts", icon: Users, end: true },
  { path: "/admin/settings", label: "Platform Settings", icon: SlidersHorizontal, end: false, roles: ["super_admin"] },
  { path: "/admin/regions", label: "Regions & Frameworks", icon: Globe, end: false, roles: ["super_admin"] },
  { path: "/admin/audit", label: "Audit", icon: ScrollText, end: false, roles: ["super_admin"] },
  { path: "/admin/support", label: "Support", icon: LifeBuoy, end: false, roles: ["super_admin"] },
];

export function AdminShell({ children }: { children?: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const user = useAppSelector((s) => s.auth.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [credentialsLoadError, setCredentialsLoadError] = useState<string | null>(null);
  // Bumped by [Retry] on the failure banner to refire the fetchCurrentUser
  // effect — lets the user recover from a transient /api/auth/me failure
  // without a full page reload.
  const [retryNonce, setRetryNonce] = useState(0);
  // Flips true as soon as user is observed truthy. Used to distinguish
  // "session expired mid-flow" (toast + redirect) from "anon visitor hit
  // /admin directly" (silent — the proxy handles the redirect).
  const hadSessionRef = useRef(false);
  // Set by handleLogout BEFORE dispatch(logout) so the fetchCurrentUser
  // null-branch can tell intentional sign-out apart from cookie expiry.
  // Without this we'd double-toast on every logout.
  const intentionalLogoutRef = useRef(false);

  useEffect(() => {
    // SSR-safe mount flag — intentionally syncs on mount only.

    setMounted(true);
  }, []);

  // DB-backed regions (Item #3, Stage 2). The (admin) layout is a client
  // component, so — unlike (app) which seeds from the server layout — we hydrate
  // the regions slice via a server action on mount. Until it resolves the slice
  // keeps its constant-fallback initial state, so region dropdowns/labels (e.g.
  // the Tenant Edit region picker) are correct on first render regardless.
  useEffect(() => {
    let live = true;
    loadRegions()
      .then((r) => { if (live) dispatch(setRegions(r)); })
      .catch((err) => console.error("[AdminShell] loadRegions failed — keeping constant fallback:", err));
    return () => { live = false; };
  }, [dispatch]);

  // Track that we DID have an authenticated user at some point. This ref is
  // load-bearing for the session-expired toast below: when the auth effect
  // later observes user=null AND fetchCurrentUser returns null, the only
  // way that can happen is (a) the cookie expired / was cleared externally,
  // or (b) the user clicked Logout. (a) deserves a toast; (b) handles its
  // own toast via handleLogout. The ref pins (a) vs (b) apart.
  useEffect(() => {
    if (user) hadSessionRef.current = true;
  }, [user]);

  // Hydrate Redux auth.user from the NextAuth session cookie when it's missing.
  // The session cookie can outlive the localStorage-persisted Redux state
  // (version bump, incognito, new tab, debounced write missed by a fast
  // reload). Without this, role-gated UI like the MFA toggle silently hides
  // even though the user is fully authenticated server-side.
  //
  // On rejection (network failure, /api/auth/me 5xx, etc.) we surface a
  // visible banner instead of failing silently — silent failure plus
  // invisible role-gated buttons is exactly the bug this effect was added
  // to prevent in the first place. The banner offers a [Retry] that
  // re-runs this effect via retryNonce.
  useEffect(() => {
    if (user) return;
    let cancelled = false;
    setCredentialsLoadError(null);
    fetchCurrentUser()
      .then((u) => {
        if (cancelled) return;
        if (!u) {
          // /api/auth/me returned 401. If we'd previously had a session
          // and the user didn't just click Logout, this is a session-
          // expired transition — surface it instead of leaving the user
          // stranded on /admin with no feedback. ?session=expired is
          // what LoginPage reads to show the toast.
          if (hadSessionRef.current && !intentionalLogoutRef.current) {
            router.push("/login?session=expired");
          }
          return;
        }
        dispatch(
          setCredentials({
            token: "nextauth-session",
            user: {
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role as UserRole,
              gxpSignatory: u.gxpSignatory,
              orgId: u.orgId,
              tenantId: u.tenantId,
            },
          }),
        );
      })
      .catch((reason) => {
        if (cancelled) return;
        console.error("[AdminShell] fetchCurrentUser failed:", reason);
        setCredentialsLoadError(
          "Couldn't load your full profile — some controls may be hidden.",
        );
      });
    return () => { cancelled = true; };
  }, [user, dispatch, retryNonce, router]); // retryNonce: bumped by [Retry] to refire

  const initials = mounted && user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "SA";
  const displayName = mounted && user?.name ? user.name : "Super Admin";

  const handleLogout = async () => {
    intentionalLogoutRef.current = true;
    toast.info("Signing out…");
    try { await nextAuthLogout(); } catch { /* ignore */ }
    dispatch(logout());
    toast.success("Signed out.");
    // Slight delay so the success toast renders on /admin before the
    // route transition. ToastProvider is at the root so the toast itself
    // would persist across navigation, but the visual landing on /login
    // reads cleaner when it's already visible at nav time.
    setTimeout(() => router.push("/login"), 500);
  };

  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <div className="flex h-full overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          aria-label="Platform administration navigation"
          className={`fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col shrink-0 transition-transform duration-200 lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 16px",
              borderBottom: "1px solid var(--sidebar-border)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#f0a500",
                flexShrink: 0,
              }}
            >
              <Shield size={16} style={{ color: "#ffffff" }} aria-hidden="true" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--sidebar-text)", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                Pharma Glimmora
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  marginTop: 3,
                  padding: "1px 8px",
                  borderRadius: 20,
                  display: "inline-block",
                  background: "var(--danger-bg)",
                  color: "var(--danger)",
                }}
              >
                Platform Admin
              </div>
            </div>
          </div>

          {/* Nav items */}
          <nav aria-label="Admin navigation" style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
            <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {NAV_ITEMS.filter(
                (item) => !item.roles || (user?.role != null && item.roles.includes(user.role)),
              ).map((item) => {
                const isActive = item.end
                  ? pathname === item.path
                  : pathname?.startsWith(item.path) ?? false;
                return (
                  <li key={item.path}>
                    <Link
                      href={item.path}
                      className={`nav-item${isActive ? " active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      {item.label}
                      {isActive && <span className="sr-only">(current page)</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Footer */}
          <div style={{ borderTop: "1px solid var(--sidebar-border)" }}>
            <div style={{ padding: "8px 8px 4px" }}>
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(true)}
                className="nav-item"
                style={{ width: "100%" }}
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                Log Out
              </button>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 16px 10px",
                fontSize: 10,
                color: "var(--sidebar-text-muted)",
              }}
            >
              <span>© {new Date().getFullYear()} Glimmora International</span>
              <span>v2.0</span>
            </div>
          </div>
        </aside>

        {/* Right side */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {/* Topbar */}
          <header
            role="banner"
            className="flex items-center gap-3 px-4 sm:px-6 h-16 shrink-0"
            style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--bg-border)" }}
          >
            {/* Hamburger (mobile) */}
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border-none cursor-pointer shrink-0"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
            >
              <Menu size={18} aria-hidden="true" />
            </button>

            <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Administration Console
            </span>

            <div className="flex-1" />

            <div className="hidden md:block"><ColorThemePicker /></div>
            <ThemeToggle />

            {/* Notifications */}
            <button
              type="button"
              aria-label="Notifications"
              className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-all"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}
            >
              <Bell size={15} aria-hidden="true" />
            </button>

            {/* User */}
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold shrink-0"
                style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "2px solid rgba(239,68,68,0.25)" }}
              >
                {initials}
              </div>
              <span className="hidden sm:block text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                {displayName}
              </span>
            </div>
          </header>

          {/* Main content */}
          <main
            id="main-content"
            aria-label="Platform administration content"
            className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6"
            style={{ background: "var(--bg-base)" }}
          >
            {credentialsLoadError && (
              <div
                role="alert"
                className="alert alert-warning mb-4 flex items-center justify-between gap-3 text-[12px]"
              >
                <span>{credentialsLoadError}</span>
                <button
                  type="button"
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="font-medium border-none bg-transparent cursor-pointer underline shrink-0"
                  style={{ color: "var(--warning)" }}
                >
                  Retry
                </button>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
      {/* Reusable logout confirmation (context copy passed in — the modal
          itself hardcodes nothing). */}
      <ConfirmModal
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => { setLogoutConfirmOpen(false); handleLogout(); }}
        title="Log out?"
        message={logoutMessage("super_admin")}
        confirmLabel="Log out"
        variant="danger"
        icon={LogOut}
      />

      {/* The AI assistant is intentionally NOT mounted in the platform admin
          shell — the super_admin console manages tenant containers, not
          compliance work, so the chatbot stays scoped to the app shell. */}
    </>
  );
}
