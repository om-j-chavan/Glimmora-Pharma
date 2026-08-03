"use client";

/**
 * Role-based quick actions (Phase 5).
 *
 * Every row arriving here has already satisfied BOTH gates: the role's config listed
 * it (relevance) and its own permission clause passed (authorisation) — e.g.
 * "Register a system" requires `can("csv").canCreate`, which is the client mirror of
 * the `createSystem` server gate. So a shortcut is never shown that its target would
 * refuse.
 *
 * The panel renders NOTHING (not an empty card) when a role has no permitted
 * actions — which is the correct outcome for `viewer`, whose config declares none.
 */

import { memo } from "react";
import { Zap } from "lucide-react";
import { CardSection } from "@/components/shared";
import { ListRow } from "./primitives";
import type { DashboardWidgetProps } from "./types";

export const QuickActionsWidget = memo(function QuickActionsWidget({ dashboard }: DashboardWidgetProps) {
  if (dashboard.quickActions.length === 0) return null;

  return (
    <CardSection icon={Zap} iconColor="#f59e0b" title="Quick actions">
      <nav aria-label="Quick actions" className="space-y-0.5">
        {dashboard.quickActions.map((action) => (
          <ListRow
            key={action.key}
            icon={action.icon}
            iconColor="var(--brand)"
            title={action.label}
            subtitle={action.description}
            href={action.href}
            ariaLabel={`${action.label} — ${action.description}`}
          />
        ))}
      </nav>
    </CardSection>
  );
});
