import { useState } from "react";
import { Building2, MapPin, Users, BookOpen, Bot, Shield } from "lucide-react";
import { OrgTab } from "./tabs/OrgTab";
import { SitesTab } from "./tabs/SitesTab";
import { UsersTab } from "./tabs/UsersTab";
import { FrameworksTab } from "./tabs/FrameworksTab";
import { AGIPolicyTab } from "./tabs/AGIPolicyTab";
import { PermissionsTab } from "./tabs/PermissionsTab";
import { useRole } from "@/hooks/useRole";

const TABS = [
  { id: "org", label: "Organization", icon: Building2 },
  { id: "sites", label: "Sites", icon: MapPin },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "frameworks", label: "Frameworks", icon: BookOpen },
  { id: "agi", label: "AGI Policy", icon: Bot },
  { id: "permissions", label: "Permissions", icon: Shield },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsPage() {
  const [active, setActive] = useState<TabId>("org");
  const { role } = useRole();

  return (
    <div className="flex flex-col -m-3 sm:-m-4 lg:-m-5 h-full min-h-0">
      {/* Tab bar — pinned at top, never scrolls */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex shrink-0 border-b border-(--bg-border) bg-(--bg-base) px-3 sm:px-4 lg:px-5 overflow-x-auto"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-btn-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`tab-panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all duration-150 cursor-pointer whitespace-nowrap bg-transparent border-t-0 border-l-0 border-r-0 ${
              active === tab.id
                ? "text-(--brand) border-(--brand)"
                : "text-(--text-muted) border-transparent hover:text-(--text-secondary)"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — scrolls independently */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 lg:p-5">
        {TABS.map((tab) => (
          <section
            key={tab.id}
            role="tabpanel"
            id={`tab-panel-${tab.id}`}
            aria-labelledby={`tab-btn-${tab.id}`}
            tabIndex={0}
            hidden={active !== tab.id}
            className="focus:outline-none"
          >
            {tab.id === "org" && <OrgTab readOnly={role !== "super_admin" && role !== "customer_admin"} />}
            {tab.id === "sites" && <SitesTab readOnly={role !== "super_admin" && role !== "customer_admin"} />}
            {tab.id === "users" && <UsersTab readOnly={role !== "super_admin" && role !== "customer_admin"} />}
            {tab.id === "frameworks" && <FrameworksTab readOnly={role !== "super_admin" && role !== "customer_admin"} />}
            {tab.id === "agi" && <AGIPolicyTab readOnly={role !== "super_admin" && role !== "customer_admin" && role !== "it_cdo"} />}
            {tab.id === "permissions" && <PermissionsTab />}
          </section>
        ))}
      </div>
    </div>
  );
}
