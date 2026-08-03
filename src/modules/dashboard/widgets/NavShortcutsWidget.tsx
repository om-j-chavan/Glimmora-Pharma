"use client";

/**
 * Role-based navigation shortcuts with live counts.
 *
 * THE FIX FOR THE AUDIT'S HEADLINE LEAK. The old "Quick links" block inside the risk
 * signals card hard-linked EVERY role to `/gap-assessment`, `/capa`, `/csv-csa` and
 * `/fda-483` **with live badge counts**, ignoring `CAPA_MODULE_VIEW_ROLES` entirely —
 * so a QC Lab Director, Operations Head or viewer got a clickable CAPA Tracker badge
 * for a module the Sidebar hides and the route redirects away from, and learned the
 * count on the way.
 *
 * Now each shortcut declares its own gate in the catalog and the resolver applies it,
 * so the badge disappears together with the link — the number is never disclosed for
 * a module the role cannot open.
 */

import { memo } from "react";
import { Compass } from "lucide-react";
import { CardSection } from "@/components/shared";
import { CountBadge, ListRow } from "./primitives";
import type { DashboardWidgetProps } from "./types";

export const NavShortcutsWidget = memo(function NavShortcutsWidget({
  data, dashboard,
}: DashboardWidgetProps) {
  if (dashboard.navShortcuts.length === 0) return null;

  return (
    <CardSection icon={Compass} iconColor="#0ea5e9" title="Go to">
      <nav aria-label="Module shortcuts" className="space-y-0.5">
        {dashboard.navShortcuts.map((shortcut) => {
          const count = shortcut.badge?.(data) ?? null;
          return (
            <ListRow
              key={shortcut.key}
              icon={shortcut.icon}
              title={shortcut.label}
              href={shortcut.href}
              badge={count !== null ? <CountBadge count={count} color={shortcut.badgeColor} /> : undefined}
              ariaLabel={count && count > 0 ? `${shortcut.label}, ${count} outstanding` : shortcut.label}
            />
          );
        })}
      </nav>
    </CardSection>
  );
});
