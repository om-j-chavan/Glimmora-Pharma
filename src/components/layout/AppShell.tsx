import { useState } from "react";
import { Outlet } from "react-router";
import { Mail } from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useNotificationEngine } from "@/hooks/useNotificationEngine";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useRole } from "@/hooks/useRole";
import { logout } from "@/store/auth.slice";
import { Button } from "@/components/ui/Button";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { SiteFilterBanner } from "./SiteFilterBanner";

export function AppShell() {
  useNotificationEngine();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const dispatch = useAppDispatch();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { activePlan, tenantName, isExpired, isNearExpiry, daysRemaining } = useTenantConfig();
  const { isSuperAdmin } = useRole();

  const isBlocked = isExpired && !isSuperAdmin;

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
            isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-white border-[#e2e8f0]",
          )}
        >
          {/* Logo */}
          <div
            aria-hidden="true"
            className="w-16 h-16 rounded-2xl bg-[#0ea5e9] flex items-center justify-center mx-auto mb-6 text-white text-[20px] font-bold"
          >
            PG
          </div>

          {/* Tenant name */}
          <p className="text-[13px] font-semibold text-[#0ea5e9] mb-2">{tenantName}</p>

          {/* Title */}
          <h1 className="text-[20px] font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {activePlan ? "Your subscription has ended" : "No active subscription"}
          </h1>

          {/* Expiry info */}
          {activePlan && (
            <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
              Your plan expired on {dayjs.utc(activePlan.endDate).format("DD MMM YYYY")}
            </p>
          )}

          {/* Message */}
          <p className="text-[13px] mb-6" style={{ color: "var(--text-secondary)" }}>
            To continue using Pharma Glimmora, please contact us to renew your subscription.
          </p>

          {/* Contact card */}
          <div
            className={clsx(
              "rounded-xl p-4 mb-6 text-left",
              isDark ? "bg-[#071526]" : "bg-[#f8fafc]",
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
                      : `1px solid ${isDark ? "#1e3a5a" : "#e2e8f0"}`,
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

          {/* Buttons */}
          <div className="flex gap-3">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                dispatch(logout());
                window.location.href = "/login";
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
                  `mailto:sales@pharmaglimmora.com?subject=Subscription renewal — ${encodeURIComponent(tenantName)}`,
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

  const showWarning = isNearExpiry && !isExpired && !isSuperAdmin;
  const isCritical = (daysRemaining ?? 0) <= 3;

  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <div className="flex h-screen overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
        )}

        {/* Sidebar — hidden on mobile, slide-in drawer when open */}
        <div className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>

        <div className="flex-1 flex flex-col min-w-0 h-screen">
          {/* Topbar — fixed, never scrolls */}
          <div className="shrink-0">
            <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
          </div>

          {/* Banners — fixed below topbar */}
          <div className="shrink-0">
            <SiteFilterBanner />
          </div>

          {showWarning && (
            <div
              role="alert"
              className={clsx(
                "shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b",
                isCritical
                  ? isDark
                    ? "bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.2)]"
                    : "bg-[#fef2f2] border-[#fca5a5]"
                  : isDark
                    ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.2)]"
                    : "bg-[#fffbeb] border-[#fde68a]",
              )}
            >
              <div className="min-w-0">
                <p
                  className="text-[12px] font-medium"
                  style={{ color: isCritical ? "#ef4444" : "#f59e0b" }}
                >
                  {daysRemaining === 0
                    ? "Your subscription expires today"
                    : `Subscription expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Contact Pharma Glimmora to renew your subscription and avoid service interruption.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={Mail}
                onClick={() =>
                  window.open(
                    `mailto:sales@pharmaglimmora.com?subject=Subscription renewal — ${encodeURIComponent(tenantName)}`,
                    "_blank",
                  )
                }
              >
                Contact us
              </Button>
            </div>
          )}

          {/* Main content — ONLY this area scrolls */}
          <main
            id="main-content"
            aria-label="Pharma Glimmora main content"
            className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 lg:p-5 bg-(--bg-base)"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
