"use client";

import { useState } from "react";
import { Building2, MapPin, Users, BookOpen, Bot, Shield, CreditCard, Info, Settings, Bell } from "lucide-react";
import { OrgTab } from "./tabs/OrgTab";
import { SitesTab } from "./tabs/SitesTab";
import { UsersTab } from "./tabs/UsersTab";
import { FrameworksTab } from "./tabs/FrameworksTab";
import { AGIPolicyTab } from "./tabs/AGIPolicyTab";
import { PermissionsTab } from "./tabs/PermissionsTab";
import { SubscriptionTab } from "./tabs/SubscriptionTab";
import { NotificationsPage } from "@/modules/notifications/NotificationsPage";
import type { NotificationRow, NotificationFilterOptions, NotificationStats } from "@/lib/queries/notifications";
import { usePermissions } from "@/hooks/usePermissions";
import { PageLayout } from "@/components/layout/PageLayout";

const ALL_TABS = [
  { id: "org", label: "Organization", icon: Building2 },
  { id: "sites", label: "Sites", icon: MapPin },
  { id: "users", label: "Users & Roles", icon: Users },
  // Read-only plan view — customer_admin sees their own plan/caps/usage but
  // cannot change anything (tier/caps/dates/MFA are super_admin-only).
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "frameworks", label: "Frameworks", icon: BookOpen },
  { id: "agi", label: "AGI Policy", icon: Bot },
  // Notifications moved here from a standalone sidebar entry (navigation only) —
  // per-user, so visible to every role; the server route seeds its data.
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "permissions", label: "Permissions", icon: Shield },
] as const;

type TabId = (typeof ALL_TABS)[number]["id"];

interface NotificationsTabData {
  initialData: { rows: NotificationRow[]; total: number };
  options: NotificationFilterOptions;
  initialUnread: number;
  stats: NotificationStats;
}

// sites/users are accepted for the server route's call (consumed in a later
// phase — the page still reads them from Redux today) and intentionally ignored.
interface SettingsPageProps {
  sites?: unknown;
  users?: unknown;
  initialTab?: string;
  notifications?: NotificationsTabData;
}

export function SettingsPage({ initialTab, notifications }: SettingsPageProps = {}) {
  const initialActive: TabId =
    initialTab && ALL_TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "org";
  const [active, setActive] = useState<TabId>(initialActive);
  const { canManageSettings, role } = usePermissions();
  const readOnly = !canManageSettings;
  // Tab-level view gating. Both the tab bar and the panels below map over
  // visibleTabs, so excluding a tab here removes the tab button AND its rendered
  // panel (the data never reaches a denied role's DOM).
  //  - Permissions: a READ-ONLY view of the effective role matrix, shown to the
  //    two oversight identities (qa_head + customer_admin) plus super_admin.
  //    Editing stays disabled for everyone except super_admin (PermissionsTab
  //    enforces that itself). It is deliberately NOT an editable control for
  //    customer_admin: the matrix is client-side state and is not what authorizes
  //    anything — module access is enforced by the compiled role-sets in
  //    lib/permissions/roleSets.ts, the per-route requireRoleOrDeny gates, and
  //    the server action gates. Showing it read-only lets an admin AUDIT
  //    who-can-do-what without implying a control that would not be enforced.
  //  - Subscription: plan / user-site limits / billing term / retention is
  //    admin-tier info → customer_admin / super_admin only.
  const canViewPermissionsTab =
    role === "qa_head" || role === "customer_admin" || role === "super_admin";
  const visibleTabs = ALL_TABS.filter((t) => {
    if (t.id === "permissions") return canViewPermissionsTab;
    if (t.id === "subscription" && !canManageSettings) return false;
    return true;
  });

  return (
    <PageLayout
      title="Settings"
      titleIcon={Settings}
      description="Manage organization, users, sites, frameworks, and subscription."
      contentPadding={true}
      fillHeight
    >
      {/* Read-only banner for non-admin roles */}
      {readOnly && (
        <div className="flex items-start gap-2 px-5 py-3 border-b" style={{ background: "var(--brand-muted)", borderColor: "var(--brand-border)" }}>
          <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Settings can only be modified by <strong style={{ color: "var(--brand)" }}>Customer Admin</strong>.
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex shrink-0 border-b border-(--bg-border) bg-(--bg-base) overflow-x-auto"
      >
        {visibleTabs.map((tab) => (
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

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto min-h-0 py-3 sm:py-4 lg:py-5">
        {visibleTabs.map((tab) => (
          <section
            key={tab.id}
            role="tabpanel"
            id={`tab-panel-${tab.id}`}
            aria-labelledby={`tab-btn-${tab.id}`}
            tabIndex={0}
            hidden={active !== tab.id}
            className="focus:outline-none h-full"
          >
            {/* Company Details (Organisation) is Super-Admin-managed, so it is
                view-only on the tenant side — including for customer_admin, who
                can edit the other tabs. Regulatory Region moved to Super Admin.
                Server-side, the only writer of these fields is the super_admin
                updateTenant action, so this is enforcement, not just hiding. */}
            {tab.id === "org" && <OrgTab readOnly={readOnly || role === "customer_admin"} />}
            {tab.id === "sites" && <SitesTab readOnly={readOnly} />}
            {tab.id === "users" && <UsersTab readOnly={readOnly} />}
            {/* Subscription is inherently read-only — no readOnly prop / no controls.
                Customer-Admin-only view (defense-in-depth; visibleTabs already
                excludes it for other roles). */}
            {tab.id === "subscription" && canManageSettings && <SubscriptionTab />}
            {tab.id === "frameworks" && <FrameworksTab readOnly={readOnly} />}
            {tab.id === "agi" && <AGIPolicyTab readOnly={readOnly && role !== "it_cdo"} />}
            {/* Notifications — the existing module component, rendered from the
                server-seeded props. Per-user (not gated by settings-admin rights),
                so no readOnly. Lazy-rendered only when active so its table doesn't
                mount behind the other tabs. */}
            {tab.id === "notifications" && active === "notifications" && notifications && <NotificationsPage {...notifications} />}
            {tab.id === "permissions" && <PermissionsTab />}
          </section>
        ))}
      </div>
    </PageLayout>
  );
}