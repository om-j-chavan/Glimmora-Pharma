"use client";

import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { getSeverityVariant } from "@/lib/badgeVariants";
import type { WorkItem, WorkSource } from "./workItem";

/** Source chip tone — Finding / CAPA / Deviation get distinct accents. */
const SOURCE_TONE: Record<WorkSource, "blue" | "purple" | "amber"> = {
  finding: "blue",
  capa: "purple",
  deviation: "amber",
};

/**
 * ONE shared work card for every worklist item (Gap Finding, CAPA action,
 * Deviation task) — the clean Finding-style card. Header "Source · Reference" +
 * a status chip + priority + one metadata line. NO readiness bar, NO conditions
 * checklist, NO per-category evidence dropdown. Clicking opens WorkItemModal.
 */
export function WorkItemCard({ item, onOpen }: { item: WorkItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-start gap-3 p-3 border-none cursor-pointer bg-transparent hover:bg-(--bg-hover)"
      style={{ borderBottom: "1px solid var(--bg-border)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={SOURCE_TONE[item.source]}>{item.sourceLabel}</Badge>
          <span className="font-mono text-[11.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>{item.reference}</span>
          <Badge variant={item.statusVariant}>{item.statusLabel}</Badge>
          {item.priority && <Badge variant={getSeverityVariant(item.priority, "generic")}>{item.priority}</Badge>}
        </div>
        <p className="text-[13px] font-medium mt-1 truncate" style={{ color: "var(--text-primary)" }}>{item.title}</p>
        {item.metaLine && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{item.metaLine}</p>
        )}
        {item.isRework && item.reworkReason && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--status-blocked, var(--danger))" }}>Returned: {item.reworkReason}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
    </button>
  );
}
