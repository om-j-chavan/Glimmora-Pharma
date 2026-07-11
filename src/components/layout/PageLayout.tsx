"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { MotionDiv } from "@/components/motion/Motion";

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
  /** When false, the content goes FULL-BLEED to the shell edges — PageLayout
   *  cancels the app shell's page padding (p-3 sm:p-4 lg:p-5) so a tabbed page's
   *  tab bar / borders reach both edges; the header keeps its own gutter, and
   *  each tab panel re-adds its own padding. Default true (normal shell padding). */
  contentPadding?: boolean;
  /** When true, PageLayout fills the shell's available height as a flex column
   *  (h-full min-h-0) with a shrink-0 header, so a child panel wrapper marked
   *  `flex-1 min-h-0 overflow-y-auto` scrolls under a fixed header/tab bar.
   *  Default false (natural flow — the shell's <main> owns the scroll). */
  fillHeight?: boolean;
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

export function PageLayout({ title, titleIcon, description, actions = [], headerRight, breadcrumb, children, className, contentPadding = true, fillHeight = false }: PageLayoutProps) {
  if (process.env.NODE_ENV !== "production" && !title && !breadcrumb) {
    console.warn("[PageLayout] rendered without a title or breadcrumb.");
  }
  const fullBleed = !contentPadding;
  return (
    <MotionDiv
      variant="fadeUp"
      className={clsx(
        fillHeight && "flex flex-col h-full min-h-0",
        // Cancel the app shell's page padding (p-3 sm:p-4 lg:p-5) so tabbed pages
        // render full-bleed tab bars/borders. The header re-adds its gutter below.
        fullBleed && "-m-3 sm:-m-4 lg:-m-5",
        className,
      )}
    >
      {/* Header cluster — re-guttered when full-bleed; fixed (shrink-0) when the
          page fills height so only the child panel scrolls. Header/breadcrumb
          left, headerRight + actions top-right; description one line under the
          title; divider under the whole header. */}
      <div className={clsx(fillHeight && "shrink-0", fullBleed && "px-3 sm:px-4 lg:px-5 pt-3 sm:pt-4 lg:pt-5") || undefined}>
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
      </div>
      {fillHeight ? (
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      ) : (
        children
      )}
    </MotionDiv>
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
