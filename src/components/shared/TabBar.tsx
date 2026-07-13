"use client";

import { useId } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { DURATION, EASE } from "@/lib/motion/tokens";

export interface Tab {
  id: string;
  label: string;
  Icon?: LucideIcon;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}

export function TabBar({ tabs, activeTab, onChange, ariaLabel }: TabBarProps) {
  // Unique per TabBar instance so multiple tab bars on one page don't share
  // (and cross-animate) the same shared-layout indicator.
  const indicatorId = useId();
  const reduced = usePrefersReducedMotion();

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-(--bg-border)">
      {tabs.map((t) => {
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={clsx(
              "relative inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold transition-colors duration-150 bg-transparent border-none cursor-pointer outline-none",
              active ? "text-(--brand)" : "text-(--text-muted) hover:text-(--text-secondary)",
            )}
          >
            {t.Icon && <t.Icon className="w-3.5 h-3.5" aria-hidden="true" />}
            {t.label}
            {/* Active-tab underline. `layoutId` makes framer slide it between tabs
                (position + width) when the active tab changes. Reduced motion →
                it jumps instantly (duration 0). */}
            {active && (
              <motion.span
                layoutId={`tabbar-indicator-${indicatorId}`}
                className="absolute inset-x-0 -bottom-px h-0.5 bg-(--brand) rounded-full"
                transition={reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE.standard }}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
