"use client";

import { useEffect, useState } from "react";
import { Building2, MapPin, Users, BookOpen, Bot, Shield, CreditCard, Settings } from "lucide-react";
import { OrgTab } from "./tabs/OrgTab";
import { SitesTab } from "./tabs/SitesTab";
import { UsersTab } from "./tabs/UsersTab";
import { FrameworksTab } from "./tabs/FrameworksTab";
import { AGIPolicyTab } from "./tabs/AGIPolicyTab";
import { PermissionsTab } from "./tabs/PermissionsTab";
import { SubscriptionTab } from "./tabs/SubscriptionTab";
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
  { id: "permissions", label: "Permissions", icon: Shield },
] as const;

type TabId = (typeof ALL_TABS)[number]["id"];

// sites/users are accepted for the server route's call (consumed in a later
// phase — the page still reads them from Redux today) and intentionally ignored.
interface SettingsPageProps {
  sites?: unknown;
  users?: unknown;
  initialTab?: string;
}

export function SettingsPage({ initialTab }: SettingsPageProps = {}) {
  const initialActive: TabId =
    initialTab && ALL_TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "org";
  const [active, setActive] = useState<TabId>(initialActive);

  // `initialTab` seeds the state above, which covers a cold load but NOT a
  // same-route `?tab=` push: the server component re-renders and hands down a
  // new prop, while `useState` keeps the first value. This syncs the two so a
  // deep link from elsewhere in Settings actually lands on its tab (used by the
  // Users tab's "Go to Sites" action). Fires only when the prop changes, so
  // clicking a tab by hand is never overridden.
  useEffect(() => {
    if (initialTab && ALL_TABS.some((t) => t.id === initialTab)) setActive(initialTab as TabId);
  }, [initialTab]);
  const { canManageSettings, role } = usePermissions();
  const readOnly = !canManageSettings;
  // Tab-level view gating. Both the tab bar and the panels below map over
  // visibleTabs, so excluding a tab here removes the tab button AND its rendered
  // panel (the data never reaches a denied role's DOM).
  //  - Permissions: a READ-ONLY view of the effective role matrix, now shown to
  //    the TENANT ADMIN identity (customer_admin) plus super_admin. qa_head was
  //    removed — reviewing the role matrix is an administration task, not a
  //    quality-oversight one, so it no longer belongs on a QA Head's settings.
  //    Editing stays disabled for everyone except super_admin (PermissionsTab
  //    enforces that itself). It is deliberately NOT an editable control for
  //    customer_admin: the matrix is client-side state and is not what authorizes
  //    anything — module access is enforced by the compiled role-sets in
  //    lib/permissions/roleSets.ts, the per-route requireRoleOrDeny gates, and
  //    the server action gates. Showing it read-only lets an admin AUDIT
  //    who-can-do-what without implying a control that would not be enforced.
  //    Because that enforcement is elsewhere, dropping qa_head here changes what
  //    a QA Head SEES, never what any role may do.
  //  - Subscription: plan / user-site limits / billing term / retention is
  //    admin-tier info → customer_admin / super_admin only.
  const canViewPermissionsTab =
    role === "customer_admin" || role === "super_admin";
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
            {tab.id === "permissions" && <PermissionsTab />}
          </section>
        ))}
      </div>
    </PageLayout>
  );
}