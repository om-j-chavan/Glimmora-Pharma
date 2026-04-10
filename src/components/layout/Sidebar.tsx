import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard,
  Search,
  ClipboardList,
  Monitor,
  Map,
  Bot,
  FileText,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
  ChevronDown,
  Layers,
  FlaskConical,
  Cpu,
  SlidersHorizontal,
  CreditCard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { logout } from "@/store/auth.slice";

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
    label: "QMS & Compliance",
    icon: Layers,
    items: [
      { path: "/",              label: "Dashboard",      icon: LayoutDashboard },
      { path: "gap-assessment", label: "Gap Assessment", icon: Search },
      { path: "capa",           label: "CAPA Tracker",   icon: ClipboardList },
      { path: "evidence",       label: "Evidence",       icon: FileText },
    ],
  },
  {
    id: "validation",
    label: "Validation & Inspection",
    icon: FlaskConical,
    items: [
      { path: "csv-csa",    label: "CSV / CSA",  icon: Monitor },
      { path: "inspection", label: "Inspection", icon: Map },
      { path: "readiness",  label: "Readiness",  icon: ShieldCheck },
      { path: "fda-483",    label: "FDA 483",    icon: Building2 },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    icon: Cpu,
    items: [
      { path: "agi-console", label: "AGI Console", icon: Bot },
      { path: "governance",  label: "Governance",  icon: BarChart3 },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    icon: SlidersHorizontal,
    items: [
      { path: "settings", label: "Settings", icon: Settings },
      { path: "subscription", label: "Subscription", icon: CreditCard },
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
  const navigate = useNavigate();
  const location = useLocation();
  const activeSite = useActiveSite();
  const { allowedPaths, role } = useRole();
  const capas = useAppSelector((s) => s.capa.items);
  const openCapaCount = capas.filter((c) => c.status === "Open" || c.status === "In Progress").length;
  const { setupNeeded, completedCount, totalSteps } = useSetupStatus();
  const { tenantPlan } = useTenantConfig();

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set([getGroupForPath(location.pathname)])
  );

  // Auto-expand the group containing the active page on route change
  useEffect(() => {
    const active = getGroupForPath(location.pathname);
    setOpenGroups((prev) => {
      if (prev.has(active)) return prev;
      return new Set([...prev, active]);
    });
  }, [location.pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      if (item.path === "subscription") return role === "super_admin" || role === "customer_admin";
      if (item.path === "readiness") return true;
      return allowedPaths.includes(item.path);
    }),
  })).filter((g) => g.items.length > 0);

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  return (
    <aside
      aria-label="Application navigation"
      className="w-60 min-h-screen flex flex-col shrink-0"
      style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--bg-border)" }}
    >
      {/* ── Logo ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 16px 14px",
          borderBottom: "1px solid var(--bg-border)",
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
            background: "var(--brand-muted)",
            border: "1px solid var(--brand-border)",
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={16} style={{ color: "var(--brand)" }} aria-hidden="true" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--brand)", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
            Pharma Glimmora
          </div>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 11,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeSite?.name ?? "All sites"}
          </div>
        </div>
      </div>

      {/* ── Nav groups ── */}
      <nav aria-label="Main navigation" style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
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
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sidebar-accent)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                >
                  <group.icon size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: "left" }}>{group.label}</span>
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
                    {group.items.map((item) => (
                      <li key={item.path}>
                        <NavLink
                          to={item.path === "/" ? "/" : `/${item.path}`}
                          end={item.path === "/"}
                          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                          style={{ marginLeft: 0, marginRight: 8, paddingLeft: 10 }}
                          onClick={onNavigate}
                        >
                          {({ isActive }) => (
                            <>
                              <item.icon className="w-4 h-4" aria-hidden="true" />
                              {item.label}
                              {item.path === "capa" && openCapaCount > 0 && (
                                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#ef4444] text-white min-w-[18px] text-center">
                                  {openCapaCount}
                                </span>
                              )}
                              {item.path === "subscription" && tenantPlan === "trial" && (
                                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#f59e0b] text-white min-w-[18px] text-center">
                                  Trial
                                </span>
                              )}
                              {item.path === "settings" && setupNeeded && (
                                <span
                                  className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#0ea5e9] text-white min-w-[32px] text-center"
                                  aria-label={`Setup: ${completedCount} of ${totalSteps} complete`}
                                >
                                  {completedCount}/{totalSteps}
                                </span>
                              )}
                              {isActive && <span className="sr-only">(current page)</span>}
                            </>
                          )}
                        </NavLink>
                      </li>
                    ))}
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
            onClick={handleLogout}
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
          <span>© 2025 Glimmora International</span>
          <span>v2.0</span>
        </div>
      </div>
    </aside>
  );
}
