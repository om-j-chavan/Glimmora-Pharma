import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

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
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-(--bg-border)">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={activeTab === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className={clsx(
            "inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors duration-150 bg-transparent border-x-0 border-t-0 cursor-pointer outline-none",
            activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)",
          )}
        >
          {t.Icon && <t.Icon className="w-3.5 h-3.5" aria-hidden="true" />}
          {t.label}
        </button>
      ))}
    </div>
  );
}
