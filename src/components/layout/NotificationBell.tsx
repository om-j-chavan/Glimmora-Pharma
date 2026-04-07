import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import {
  Bell, X, AlertTriangle, Clock, Search,
  ClipboardCheck, ShieldAlert, CheckCircle2,
  Database, FileWarning, FolderOpen,
  Download, BarChart3, Activity,
  CreditCard, Users, MapPin,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import {
  markRead, markAllRead, clearAll,
  type AppNotification, type NotificationType,
} from "@/store/notifications.slice";

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOTIF_CONFIG: Record<NotificationType, { icon: any; color: string; category: string }> = {
  finding_critical:         { icon: AlertTriangle,  color: "#ef4444", category: "Gap Assessment" },
  finding_overdue:          { icon: Clock,          color: "#ef4444", category: "Gap Assessment" },
  finding_assigned:         { icon: Search,         color: "#0ea5e9", category: "Gap Assessment" },
  capa_overdue:             { icon: Clock,          color: "#ef4444", category: "CAPA" },
  capa_pending_review:      { icon: ClipboardCheck, color: "#6366f1", category: "CAPA" },
  capa_assigned:            { icon: ClipboardCheck, color: "#0ea5e9", category: "CAPA" },
  capa_closed:              { icon: CheckCircle2,   color: "#10b981", category: "CAPA" },
  capa_di_gate:             { icon: ShieldAlert,    color: "#ef4444", category: "CAPA" },
  validation_overdue:       { icon: Database,       color: "#f59e0b", category: "CSV/CSA" },
  system_non_compliant:     { icon: Database,       color: "#ef4444", category: "CSV/CSA" },
  system_added:             { icon: Database,       color: "#10b981", category: "CSV/CSA" },
  fda483_deadline:          { icon: FileWarning,    color: "#f59e0b", category: "FDA 483" },
  fda483_deadline_critical: { icon: FileWarning,    color: "#ef4444", category: "FDA 483" },
  commitment_overdue:       { icon: FileWarning,    color: "#ef4444", category: "FDA 483" },
  observation_added:        { icon: FileWarning,    color: "#0ea5e9", category: "FDA 483" },
  evidence_missing:         { icon: FolderOpen,     color: "#f59e0b", category: "Evidence" },
  pack_exported:            { icon: Download,       color: "#10b981", category: "Evidence" },
  raid_critical:            { icon: AlertTriangle,  color: "#ef4444", category: "Governance" },
  raid_overdue:             { icon: Clock,          color: "#f59e0b", category: "Governance" },
  kpi_below_threshold:      { icon: BarChart3,      color: "#f59e0b", category: "Governance" },
  drift_critical:           { icon: Activity,       color: "#ef4444", category: "AGI" },
  drift_new:                { icon: Activity,       color: "#a78bfa", category: "AGI" },
  plan_limit_near:          { icon: CreditCard,     color: "#f59e0b", category: "Subscription" },
  plan_limit_reached:       { icon: CreditCard,     color: "#ef4444", category: "Subscription" },
  user_added:               { icon: Users,          color: "#10b981", category: "Settings" },
  site_added:               { icon: MapPin,         color: "#10b981", category: "Settings" },
};

const PRIORITY: Record<NotificationType, number> = {
  fda483_deadline_critical: 0, capa_di_gate: 1, finding_critical: 2, system_non_compliant: 3,
  capa_overdue: 4, raid_critical: 5, drift_critical: 6, fda483_deadline: 7, finding_overdue: 8,
  commitment_overdue: 9, validation_overdue: 10, capa_pending_review: 11, plan_limit_reached: 12,
  raid_overdue: 13, kpi_below_threshold: 14, plan_limit_near: 15, evidence_missing: 16,
  drift_new: 17, finding_assigned: 18, capa_assigned: 19, observation_added: 20,
  system_added: 21, user_added: 22, site_added: 23, pack_exported: 24, capa_closed: 25,
};

function sortNotifications(items: AppNotification[]) {
  return [...items].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    const pa = PRIORITY[a.type] ?? 99;
    const pb = PRIORITY[b.type] ?? 99;
    if (pa !== pb) return pa - pb;
    return dayjs(b.createdAt).diff(dayjs(a.createdAt));
  });
}

const CATEGORIES = ["All", "Gap Assessment", "CAPA", "CSV/CSA", "FDA 483", "Evidence", "Governance", "AGI", "Subscription", "Settings"];

export function NotificationBell() {
  const notifications = useAppSelector((s) => s.notifications.items);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";

  const [open, setOpen] = useState(false);
  const [activeCategory, setCategory] = useState("All");
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayed = sortNotifications(
    notifications.filter((n) => {
      if (activeCategory === "All") return true;
      return NOTIF_CONFIG[n.type]?.category === activeCategory;
    }),
  );

  return (
    <div ref={bellRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` \u2014 ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
          background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)",
        }}
      >
        <Bell size={15} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#ef4444] text-white text-[9px] font-bold flex items-center justify-center" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={clsx("absolute right-0 top-11 w-[calc(100vw-24px)] sm:w-80 max-w-80 rounded-xl border shadow-lg z-50 overflow-hidden", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-white border-[#e2e8f0]")}
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className={clsx("flex items-center justify-between px-4 py-3 border-b", isDark ? "border-[#1e3a5a]" : "border-[#f1f5f9]")}>
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button type="button" onClick={() => dispatch(markAllRead())} className="text-[10px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer">Mark all read</button>
              )}
              {notifications.length > 0 && (
                <button type="button" onClick={() => dispatch(clearAll())} className="text-[10px] hover:text-[#0ea5e9] border-none bg-transparent cursor-pointer" style={{ color: "var(--text-muted)" }}>Clear all</button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="opacity-40 hover:opacity-100 border-none bg-transparent cursor-pointer">
                <X className="w-3.5 h-3.5" style={{ color: "var(--text-primary)" }} />
              </button>
            </div>
          </div>

          {/* Category tabs */}
          <div className={clsx("flex gap-1 px-3 py-2 overflow-x-auto border-b", isDark ? "border-[#1e3a5a]" : "border-[#f1f5f9]")} style={{ scrollbarWidth: "none" }}>
            {CATEGORIES.map((cat) => {
              const catUnread = cat === "All" ? unreadCount : notifications.filter((n) => !n.read && NOTIF_CONFIG[n.type]?.category === cat).length;
              return (
                <button
                  key={cat} type="button" onClick={() => setCategory(cat)}
                  className={clsx(
                    "flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium border-none cursor-pointer transition-colors",
                    activeCategory === cat ? "bg-[#0ea5e9] text-white" : isDark ? "bg-[#071526] text-[#8899b8]" : "bg-[#f1f5f9] text-[#64748b]",
                  )}
                >
                  {cat}
                  {catUnread > 0 && <span className={clsx("ml-1 text-[9px] font-bold", activeCategory === cat ? "text-white opacity-80" : "text-[#0ea5e9]")}>{catUnread}</span>}
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {displayed.length === 0 && (
              <div className="p-6 text-center">
                <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: "#334155" }} aria-hidden="true" />
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No notifications</p>
              </div>
            )}
            {displayed.map((notif) => {
              const cfg = NOTIF_CONFIG[notif.type];
              if (!cfg) return null;
              const NotifIcon = cfg.icon;
              return (
                <div
                  key={notif.id}
                  className={clsx(
                    "flex items-start gap-3 px-4 py-3 border-b last:border-0 cursor-pointer transition-colors duration-150",
                    !notif.read && (isDark ? "bg-[rgba(14,165,233,0.04)]" : "bg-[#fafbff]"),
                    isDark ? "border-[#0f2039] hover:bg-[#071526]" : "border-[#f1f5f9] hover:bg-[#f8fafc]",
                  )}
                  onClick={() => { dispatch(markRead(notif.id)); if (notif.link) navigate(notif.link, { state: notif.linkState }); setOpen(false); }}
                  role="button"
                  aria-label={notif.title}
                >
                  <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: cfg.color + "18" }}>
                    <NotifIcon className="w-3.5 h-3.5" style={{ color: cfg.color }} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{notif.title}</p>
                      {!notif.read && <div className="w-2 h-2 rounded-full bg-[#0ea5e9] flex-shrink-0 mt-1" aria-label="Unread" />}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{notif.message}</p>
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{dayjs(notif.createdAt).fromNow()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
