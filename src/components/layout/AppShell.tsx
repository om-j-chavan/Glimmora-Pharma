import { useState } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { SiteFilterBanner } from "./SiteFilterBanner";
import { useNotificationEngine } from "@/hooks/useNotificationEngine";

export function AppShell() {
  useNotificationEngine();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

        <div className="flex-1 flex flex-col min-w-0">
          <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
          <SiteFilterBanner />
          <main
            id="main-content"
            aria-label="Pharma Glimmora main content"
            className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 bg-(--bg-base)"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
