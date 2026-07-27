"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  ClipboardList,
  ListChecks,
  Monitor,
  FileText,
  AlertTriangle,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Layers,
  FlaskConical,
  SlidersHorizontal,
  GraduationCap,
  LifeBuoy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { CAPA_MODULE_VIEW_ROLES, canViewGovernance } from "@/lib/permissions/roleSets";
import { logout } from "@/store/auth.slice";
import { logout as nextAuthLogout } from "@/lib/authClient";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { logoutMessage } from "@/lib/labels/logout";
import { useToast } from "@/components/ui/Toast";

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "qms",
    label: "Core Compliance",
    icon: Layers,
    items: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard },
      { path: "gap-assessment", label: "Gap Assessment", icon: Search },
      { path: "deviation", label: "Deviation Management", icon: AlertTriangle },
      { path: "capa", label: "CAPA Tracker", icon: ClipboardList },
      { path: "worklist", label: "Worklist", icon: ListChecks },
      { path: "csv-csa", label: "CSV/CSA Validation", icon: Monitor },
      { path: "fda-483", label: "Inspections & Regulatory", icon: Building2 },
      { path: "evidence", label: "Evidence & Documents", icon: FileText },
    ],
  },
  {
    id: "readiness",
    label: "Readiness & Governance",
    icon: FlaskConical,
    items: [
      { path: "readiness", label: "Training & Awareness", icon: GraduationCap },
      { path: "governance", label: "Governance & KPIs", icon: BarChart3 },
      { path: "audit-trail", label: "Audit Trail", icon: ClipboardList },
    ],
  },
  {
    id: "admin",
    label: "System & Config",
    icon: SlidersHorizontal,
    items: [
      { path: "settings", label: "Settings", icon: Settings },
      { path: "support", label: "Support", icon: LifeBuoy },
    ],
  },
];

function getGroupForPath(pathname: string): string {
  const current = pathname === "/" ? "/" : pathname.slice(1);
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => item.path === current)) return group.id;
  }
  return "qms";
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const toast = useToast();
  const pathname = usePathname();
  const { allowedPaths, role } = useRole();

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set([getGroupForPath(pathname ?? "")]),
  );

  // Sign-out confirmation modal. `signingOut` keeps the confirm button in a
  // loading state (and prevents a double-submit) while the session is cleared.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Auto-expand the group containing the active page on route change
  useEffect(() => {
    const active = getGroupForPath(pathname ?? "");
    setOpenGroups((prev) => {
      if (prev.has(active)) return prev;
      return new Set([...prev, active]);
    });
  }, [pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bright line: super_admin's world is the admin console only — it must never
  // see any customer/compliance module in this (customer-app) sidebar. The
  // (app) layout + proxy already redirect super_admin to /admin so this sidebar
  // shouldn't render for it at all; blanking the nav here is defense-in-depth.
  const visibleGroups = role === "super_admin"
    ? []
    : NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => {
          // Phase 5 — the Worklist is the fixer's surface; it reaches CAPA work
          // through the owner/driver paths, NOT the capa matrix entry. Visible
          // to every non-super_admin role (viewer gets a read-only page).
          if (item.path === "worklist") return true;
          // Support desk is available to every customer role (viewers included).
          if (item.path === "support") return true;
          // Phase 6 cleanup FIX 1 — CAPA module locked to the shared
          // CAPA_MODULE_VIEW_ROLES (qa_head + customer_admin); other roles use
          // the Worklist. super_admin already returned [] above. Imported from
          // roleSets so nav + routes share one source of truth (no drift).
          if (item.path === "capa") return CAPA_MODULE_VIEW_ROLES.includes(role);
          // Deviation module is visible to all non-super_admin roles.
          // (Regulatory Intelligence is no longer a sidebar module — it now
          // lives as the "Ask Regulatory AI" assistant on Settings →
          // Frameworks. The /regulatory-intelligence route still resolves for
          // Dashboard deep-links; it's just removed from the nav.)
          if (item.path === "readiness" || item.path === "deviation")
            return true;
          if (item.path === "audit-trail")
            // super_admin already returned [] above, so it's excluded here.
            return role === "qa_head" || role === "customer_admin";
          // Governance & KPIs — restricted to qa_head + customer_admin (the two
          // tenant quality-oversight identities). super_admin already returned []
          // above; every other role is excluded. Mirrors the route-level gate.
          if (item.path === "governance") return canViewGovernance(role);
          return allowedPaths.includes(item.path);
        }),
      })).filter((g) => g.items.length > 0);

  const handleLogout = async () => {
    // AUTH-03: Clear next-auth session cookie first (server-side), then
    // reset Redux state, then navigate. Errors are non-fatal — we still
    // want to clear local state and navigate if the network call fails.
    setSigningOut(true);
    toast.info("Signing out…");
    try {
      await nextAuthLogout();
    } catch (err) {
      console.warn("[logout] next-auth signOut failed", err);
    }
    dispatch(logout());
    toast.success("Signed out.");
    // Slight delay so the success toast renders before the route transition;
    // ToastProvider lives at the root so the toast persists across the nav.
    setTimeout(() => router.push("/login"), 500);
  };

  return (
    <>
    <aside
      aria-label="Application navigation"
      className="w-60 h-full flex flex-col shrink-0"
      style={{
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--bg-border)",
      }}
    >
      {/* ── Logo ── */}
      {/* Fixed height matches the Topbar (h-14 = 56px) so the sidebar header and
          topbar share one continuous bottom edge across the top of the app.
          justifyContent centers the logo vertically. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 6,
          height: 56,
          padding: "0 29px",
          borderBottom: "1px solid var(--bg-border)",
        }}
      >
        {/* h-10 caps the rendered height at 40px so it sits comfortably inside the
            56px header; w-auto keeps the real 2.69:1 aspect (props match it). */}
        <Image
          src="/app-logo.png"
          alt="Pharma Glimmora"
          width={108}
          height={40}
          priority
          className="h-10 w-auto"
        />
      </div>

      {/* ── Nav groups ── */}
      <nav
        aria-label="Main navigation"
        style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}
      >
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visibleGroups.map((group) => {
            const isOpen = openGroups.has(group.id);
            return (
              <li key={group.id}>
                {/* Group header */}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "calc(100% - 16px)",
                    padding: "8px 12px",
                    margin: "2px 8px",
                    borderRadius: 8,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    color: "var(--sidebar-text-muted)",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    textTransform: "uppercase" as const,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--sidebar-accent)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "none";
                  }}
                >
                  <group.icon
                    size={14}
                    aria-hidden="true"
                    style={{ flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {group.label}
                  </span>
                  <ChevronDown
                    size={13}
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      transition: "transform 0.2s",
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    }}
                  />
                </button>

                {/* Group items */}
                {isOpen && (
                  <ul
                    role="list"
                    style={{
                      listStyle: "none",
                      margin: "2px 0 4px 0",
                      padding: 0,
                      borderLeft: "1px solid var(--bg-border)",
                      marginLeft: 24,
                    }}
                  >
                    {group.items.map((item) => {
                      const href = item.path === "/" ? "/" : `/${item.path}`;
                      const isActive =
                        item.path === "/"
                          ? pathname === "/"
                          : pathname === href ||
                            (pathname?.startsWith(`${href}/`) ?? false);
                      return (
                        <li key={item.path}>
                          <Link
                            href={href}
                            className={`nav-item${isActive ? " active" : ""}`}
                            aria-current={isActive ? "page" : undefined}
                            style={{
                              marginLeft: 0,
                              marginRight: 8,
                              paddingLeft: 10,
                            }}
                            onClick={() => onNavigate?.()}  
                          >
                            <item.icon className="w-4 h-4" aria-hidden="true" />
                            {item.label}
                            {isActive && (
                              <span className="sr-only">(current page)</span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Footer ── */}
      <div style={{ borderTop: "1px solid var(--bg-border)" }}>
        <div style={{ padding: "8px 8px 4px" }}>
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="nav-item"
            style={{ width: "100%" }}
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 16px 10px",
            fontSize: 10,
            color: "var(--text-muted)",
          }}
        >
          <span>© {new Date().getFullYear()} Glimmora International</span>
          {/* <span>v2.0</span> */}
        </div>
      </div>
    </aside>

    {/* Sign-out confirmation — the shared square ConfirmModal (matches the admin
        console). While signing out the modal blocks backdrop/Escape dismissal
        (ConfirmModal disables both when `loading`). The message is role-aware,
        passed in via props. */}
    <ConfirmModal
      open={confirmSignOut}
      onClose={() => { if (!signingOut) setConfirmSignOut(false); }}
      onConfirm={handleLogout}
      title="Log out?"
      message={logoutMessage(role)}
      confirmLabel="Log out"
      variant="danger"
      icon={LogOut}
      loading={signingOut}
    />
    </>
  );
}
