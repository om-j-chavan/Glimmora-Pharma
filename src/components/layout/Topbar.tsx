import { Calendar, Clock, Menu, MapPin } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useRole, ROLE_LABELS } from "@/hooks/useRole";
import type { UserRole } from "@/hooks/useRole";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ColorThemePicker } from "@/components/ui/ColorThemePicker";
import { NotificationBell } from "./NotificationBell";
import dayjs from "@/lib/dayjs";

const roleBadge: Record<UserRole, { bg: string; color: string }> = {
  super_admin:        { bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  customer_admin:     { bg: "rgba(139,105,20,0.12)",  color: "#8b6914" },
  qa_head:            { bg: "rgba(139,92,246,0.12)",  color: "#a78bfa" },
  qc_lab_director:    { bg: "rgba(16,185,129,0.12)",  color: "#10b981" },
  regulatory_affairs: { bg: "rgba(236,72,153,0.12)",  color: "#f472b6" },
  csv_val_lead:       { bg: "rgba(14,165,233,0.12)",  color: "#38bdf8" },
  it_cdo:             { bg: "rgba(20,184,166,0.12)",  color: "#2dd4bf" },
  operations_head:    { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
  viewer:             { bg: "rgba(148,163,184,0.1)",   color: "#94a3b8" },
};

function DateTimeBlock() {
  const [now, setNow] = useState(dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 px-3.5 h-9 rounded-lg shrink-0" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
      <div className="flex items-center gap-2">
        <Calendar size={13} aria-hidden="true" style={{ color: "var(--brand)" }} />
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{now.format("DD MMM YYYY")}</span>
      </div>
      <div aria-hidden="true" className="w-px h-4" style={{ background: "var(--bg-border)" }} />
      <div className="flex items-center gap-2">
        <Clock size={13} aria-hidden="true" style={{ color: "var(--brand)" }} />
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{now.format("h:mm A")}</span>
      </div>
    </div>
  );
}

export function Topbar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { org, tenantName, allSites } = useTenantConfig();
  const companyName = org.companyName || tenantName;
  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { role } = useRole();

  const selectedSite = selectedSiteId ? allSites.find((s) => s.id === selectedSiteId) ?? null : null;

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const badge = roleBadge[role as UserRole] ?? roleBadge.viewer;

  return (
    <header
      role="banner"
      className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-5 h-14 shrink-0"
      style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--bg-border)" }}
    >
      {/* ── Hamburger (mobile only) ── */}
      {onMenuToggle && (
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border-none cursor-pointer shrink-0"
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      )}

      {/* ── Company name ── */}
      <div className="flex items-center gap-2 shrink-0 min-w-0">
        <span className="text-[13px] font-semibold truncate max-w-[120px] sm:max-w-none" style={{ color: "var(--text-primary)" }}>
          {companyName || "Pharma Glimmora"}
        </span>
        <span className="hidden sm:inline text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
          GxP Live
        </span>
      </div>

      {/* ── Date / Time (hidden below md) ── */}
      <div className="hidden md:block">
        <DateTimeBlock />
      </div>

      {/* ── Site display — read-only for all roles ── */}
      <div
        className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] shrink-0"
        style={{ background: isDark ? "var(--bg-elevated)" : "#f1f5f9", color: "var(--text-secondary)" }}
        aria-label={selectedSite ? `Current site: ${selectedSite.name}` : "All sites"}
      >
        <MapPin size={12} aria-hidden="true" className="shrink-0" style={{ color: "var(--text-muted)" }} />
        <span className="font-medium">{selectedSite ? selectedSite.name : "All sites"}</span>
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1 min-w-0" />

      {/* ── Right actions ── */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div className="hidden md:block"><ColorThemePicker /></div>
        <ThemeToggle />

        {/* Help (hidden below sm) */}
        {/* <button
          type="button"
          aria-label="Help and documentation"
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-all"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}
        >
          <HelpCircle size={13} aria-hidden="true" />
          <span className="hidden md:inline">Help</span>
        </button> */}

        {/* Divider */}
        <div aria-hidden="true" className="hidden sm:block w-px h-5.5 mx-0.5" style={{ background: "var(--bg-border)" }} />

        {/* Notifications */}
        <NotificationBell />

        {/* Divider */}
        <div aria-hidden="true" className="w-px h-5.5 mx-0.5" style={{ background: "var(--bg-border)" }} />

        {/* User */}
        <div className="flex items-center gap-2">
          <div
            aria-label={user?.name ?? "User avatar"}
            className="flex items-center justify-center w-8 h-8 sm:w-[34px] sm:h-[34px] rounded-full text-[11px] sm:text-[12px] font-bold shrink-0"
            style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "2px solid var(--brand-border)" }}
          >
            {initials}
          </div>
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-[12px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {user?.name ?? "—"}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-px rounded-full" style={{ background: badge.bg, color: badge.color }}>
              {ROLE_LABELS[role as UserRole]}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
