"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Shield,
  Users,
  LogOut,
  Menu,
  Bell,
} from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { logout } from "@/store/auth.slice";
import { logout as nextAuthLogout } from "@/lib/authClient";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const NAV_ITEMS = [
  { path: "/admin", label: "Customer Accounts", icon: Users, end: true },
];

export function AdminShell({ children }: { children?: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const user = useAppSelector((s) => s.auth.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const initials = mounted && user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "SA";
  const displayName = mounted && user?.name ? user.name : "Super Admin";

  const handleLogout = async () => {
    try { await nextAuthLogout(); } catch { /* ignore */ }
    dispatch(logout());
    router.push("/login");
  };

  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <div className="flex h-screen overflow-hidden">
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
              {NAV_ITEMS.map((item) => {
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
                onClick={handleLogout}
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
        <div className="flex-1 flex flex-col min-w-0">
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
            className="flex-1 overflow-y-auto p-4 sm:p-6"
            style={{ background: "var(--bg-base)" }}
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
