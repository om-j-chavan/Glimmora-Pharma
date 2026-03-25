import { Bell, Search, HelpCircle, Calendar, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole, ROLE_LABELS } from "@/hooks/useRole";
import type { UserRole } from "@/hooks/useRole";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ColorThemePicker } from "@/components/ui/ColorThemePicker";
import dayjs from "@/lib/dayjs";

const roleBadge: Record<UserRole, { bg: string; color: string }> = {
  super_admin:        { bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        height: 36,
        borderRadius: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--bg-border)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Calendar size={12} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Date</span>
        <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>
          {now.format("DD MMM YYYY")}
        </span>
      </div>
      <div
        aria-hidden="true"
        style={{ width: 1, height: 14, background: "var(--bg-border)" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Clock size={12} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Time</span>
        <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>
          {now.format("h:mm A")}
        </span>
      </div>
    </div>
  );
}

export function Topbar() {
  const companyName = useAppSelector((s) => s.settings.org.companyName);
  const user = useAppSelector((s) => s.auth.user);
  const { role } = useRole();

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const badge = roleBadge[role as UserRole] ?? roleBadge.viewer;

  return (
    <header
      role="banner"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 20px",
        height: 56,
        flexShrink: 0,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--bg-border)",
      }}
    >
      {/* ── Left: company + env ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
          {companyName || "Pharma Glimmora"}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            padding: "2px 8px",
            borderRadius: 20,
            background: "var(--success-bg)",
            color: "var(--success)",
            whiteSpace: "nowrap",
          }}
        >
          GxP Live
        </span>
      </div>

      {/* ── Date / Time ── */}
      <DateTimeBlock />

      {/* ── Centre: search ── */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            maxWidth: 440,
            padding: "0 12px",
            height: 36,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--bg-border)",
            cursor: "text",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onFocus={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = "var(--brand)";
            el.style.boxShadow = "0 0 0 3px var(--brand-muted)";
          }}
          onBlur={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = "var(--bg-border)";
            el.style.boxShadow = "none";
          }}
        >
          <Search size={14} aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            type="search"
            aria-label="Search modules, CAPAs, findings"
            placeholder="Search..."
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: "var(--text-primary)",
              minWidth: 0,
            }}
          />
          <kbd
            aria-hidden="true"
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              background: "var(--bg-border)",
              padding: "2px 6px",
              borderRadius: 4,
              fontFamily: "IBM Plex Mono, monospace",
              flexShrink: 0,
            }}
          >
            Ctrl K
          </kbd>
        </label>
      </div>

      {/* ── Right: actions ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <ColorThemePicker />
        <ThemeToggle />

        {/* Help */}
        <button
          type="button"
          aria-label="Help and documentation"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 10px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.15s",
            background: "var(--bg-elevated)",
            border: "1px solid var(--bg-border)",
            color: "var(--text-secondary)",
          }}
        >
          <HelpCircle size={13} aria-hidden="true" />
          Help
        </button>

        {/* Divider */}
        <div aria-hidden="true" style={{ width: 1, height: 22, background: "var(--bg-border)", margin: "0 2px" }} />

        {/* Notifications */}
        <button
          type="button"
          aria-label="Notifications"
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.15s",
            background: "var(--bg-elevated)",
            border: "1px solid var(--bg-border)",
            color: "var(--text-secondary)",
          }}
        >
          <Bell size={15} aria-hidden="true" />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 7,
              right: 7,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--danger)",
            }}
          />
        </button>

        {/* Divider */}
        <div aria-hidden="true" style={{ width: 1, height: 22, background: "var(--bg-border)", margin: "0 2px" }} />

        {/* User — avatar LEFT, name+role RIGHT (matches live site) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            aria-label={user?.name ?? "User avatar"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: "50%",
              fontSize: 12,
              fontWeight: 700,
              background: "var(--brand-muted)",
              color: "var(--brand)",
              border: "2px solid var(--brand-border)",
              letterSpacing: "0.02em",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
              {user?.name ?? "—"}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 20,
                background: badge.bg,
                color: badge.color,
                letterSpacing: "0.02em",
              }}
            >
              {ROLE_LABELS[role as UserRole]}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
