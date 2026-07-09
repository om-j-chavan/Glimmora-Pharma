"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/Button";

/**
 * <PageLayout> — the shared header shell for every management page.
 *
 *   <PageLayout title="Sites" description="…" actions={[…]}>
 *     <DataTable … />
 *   </PageLayout>
 *
 * A page must not render without a description (it's required). Actions follow
 * one enforced rule: secondaries render left→right in given order, the single
 * primary is filled and rightmost; passing two primaries dev-warns. For
 * drill-downs pass a `breadcrumb` instead of a title. For tabbed pages, wrap
 * each tab's body in <TabSection> to give it its own description + primary
 * action (fixes tabs that shipped description-less).
 */

export interface PageAction {
  label: string;
  onClick: () => void;
  /** "primary" = the single filled, rightmost action. Everything else is a
   *  secondary rendered to its left. Defaults to "secondary" so a page never
   *  gets an accidental second primary. */
  variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
  icon?: LucideIcon;
  disabled?: boolean;
  /** Hover tooltip — e.g. the reason an action is disabled. */
  title?: string;
}

export interface PageBreadcrumb {
  parent: string;
  parentHref?: string;
  current: string;
}

export interface PageLayoutProps {
  /** Required unless a `breadcrumb` is given (drill-down pages). */
  title?: string;
  /** Optional Lucide icon rendered left of the title (plain-title mode only). */
  titleIcon?: LucideIcon;
  /** REQUIRED — a management page must explain itself in one line. */
  description: string;
  actions?: PageAction[];
  /** Extra custom content in the header's top-right cluster, left of the
   *  actions (e.g. a segmented view toggle). Right-aligned, consistent across
   *  page states. */
  headerRight?: ReactNode;
  /** Drill-down mode: renders "‹ Parent › Current" in place of the plain title. */
  breadcrumb?: PageBreadcrumb;
  children: ReactNode;
  className?: string;
}

const asButtonVariant = (v: PageAction["variant"]): ButtonVariant =>
  v === "primary" ? "primary"
  : v === "ghost" ? "ghost"
  : v === "danger" ? "danger"
  : v === "danger-ghost" ? "danger-ghost"
  : "secondary";

function ActionBar({ actions }: { actions: PageAction[] }) {
  // Partition preserving given order. The single primary renders rightmost;
  // secondaries to its left in order.
  const primaries = actions.filter((a) => a.variant === "primary");
  const secondaries = actions.filter((a) => a.variant !== "primary");
  if (process.env.NODE_ENV !== "production" && primaries.length > 1) {
    console.warn(
      `[PageLayout] ${primaries.length} primary actions passed (${primaries
        .map((p) => p.label)
        .join(", ")}). Exactly ONE primary is expected — the rightmost renders filled.`,
    );
  }
  const ordered = [...secondaries, ...primaries];
  if (ordered.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {ordered.map((a, i) => (
        <Button
          key={`${a.label}-${i}`}
          variant={asButtonVariant(a.variant)}
          size="sm"
          icon={a.icon}
          onClick={a.onClick}
          disabled={a.disabled}
          title={a.title}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

function Heading({ title, breadcrumb, titleIcon: TitleIcon }: { title?: string; breadcrumb?: PageBreadcrumb; titleIcon?: LucideIcon }) {
  if (breadcrumb) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <ChevronLeft className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        {breadcrumb.parentHref ? (
          <Link href={breadcrumb.parentHref} className="text-[15px] font-medium truncate hover:underline" style={{ color: "var(--text-muted)" }}>
            {breadcrumb.parent}
          </Link>
        ) : (
          <span className="text-[15px] font-medium truncate" style={{ color: "var(--text-muted)" }}>{breadcrumb.parent}</span>
        )}
        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <h1 className="text-[20px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{breadcrumb.current}</h1>
      </div>
    );
  }
  return (
    <h1 className="text-[20px] font-bold inline-flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
      {TitleIcon && <TitleIcon className="w-5 h-5" style={{ color: "var(--brand)" }} aria-hidden="true" />}
      {title}
    </h1>
  );
}

export function PageLayout({ title, titleIcon, description, actions = [], headerRight, breadcrumb, children, className }: PageLayoutProps) {
  if (process.env.NODE_ENV !== "production" && !title && !breadcrumb) {
    console.warn("[PageLayout] rendered without a title or breadcrumb.");
  }
  return (
    <div className={className}>
      {/* Header: title/breadcrumb left, headerRight + actions top-right;
          description one line under the title; divider under the whole header. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Heading title={title} breadcrumb={breadcrumb} titleIcon={titleIcon} />
          {description && <p className="text-[13px] mt-1 max-w-3xl" style={{ color: "var(--text-secondary)" }}>{description}</p>}
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {headerRight}
          <ActionBar actions={actions} />
        </div>
      </div>
      <div className="mt-4 mb-5 border-b" style={{ borderColor: "var(--bg-border)" }} />
      {children}
    </div>
  );
}

/**
 * <TabSection> — tab-scoped header content for a tabbed page. Renders a per-tab
 * description (required — this is the fix for description-less tabs) and an
 * optional per-tab primary action above the tab's body.
 */
export interface TabSectionProps {
  description: string;
  action?: PageAction;
  children: ReactNode;
}

export function TabSection({ description, action, children }: TabSectionProps) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <p className="text-[12px] max-w-3xl" style={{ color: "var(--text-secondary)" }}>{description}</p>
        {action && (
          <Button variant={asButtonVariant(action.variant ?? "primary")} size="sm" icon={action.icon} onClick={action.onClick} disabled={action.disabled} title={action.title}>
            {action.label}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
