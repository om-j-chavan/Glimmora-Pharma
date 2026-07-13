"use client";

import clsx from "clsx";
import { Pencil, ArrowRight } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { GxPSystem } from "@/types/csv-csa";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { computeNextStep, type WorkflowTab } from "@/modules/csv-csa/detail/workflow";

/* Status indicator dot colour by validation status. */
const STATUS_DOT: Record<string, string> = {
  Validated: "#10b981",
  "In Progress": "#f59e0b",
  "Under Review": "#f59e0b",
  Overdue: "#ef4444",
  "Validation Failed": "#ef4444",
  "Not Started": "#94a3b8",
};

export interface SystemHeaderCardProps {
  system: GxPSystem;
  isDark: boolean;
  canEdit: boolean;
  onEdit: () => void;
  resolveUser: (id: string) => string;
  siteName: (id: string) => string;
  timezone: string;
  dateFormat: string;
  /** Navigate to a workflow tab (NEXT STEP block is clickable). */
  onNavigateTab: (tab: WorkflowTab) => void;
}

export function SystemHeaderCard({ system, isDark, canEdit, onEdit, resolveUser, siteName, timezone, dateFormat, onNavigateTab }: SystemHeaderCardProps) {
  const dot = STATUS_DOT[system.validationStatus] ?? "#94a3b8";
  const overdue = !!system.nextReview && dayjs.utc(system.nextReview).isBefore(dayjs()) && system.validationStatus !== "Not Started";
  const statusSource = system.statusManuallySet
    ? `manually attested${system.statusManuallySetByName ? ` by ${system.statusManuallySetByName}` : ""}${system.statusManuallySetAt ? ` on ${dayjs.utc(system.statusManuallySetAt).tz(timezone).format(dateFormat)}` : ""}`
    : "auto-derived from stages";
  const nextStep = computeNextStep(system);

  return (
    <div className={clsx("rounded-xl p-4 border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          {/* Reference anchor */}
          <p className="font-mono text-[16px] font-bold" style={{ color: "var(--brand)" }}>
            {system.reference ?? system.id.slice(0, 8)}
          </p>
          {/* Secondary line */}
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>{system.name}</span>
            <Badge variant="gray">{system.type}</Badge>
            <span>· {siteName(system.siteId)}</span>
            <span>· GAMP {system.gamp5Category}</span>
            <span>· {system.gxpRelevance}</span>
          </div>
          {/* Status line */}
          <div className="flex items-center gap-2 mt-1.5 text-[12px]">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} aria-hidden="true" />
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{system.validationStatus}</span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>· {statusSource}</span>
          </div>
          {/* Tertiary line */}
          <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>Owner: {resolveUser(system.owner)}</span>
            <span>Review due: {system.nextReview ? dayjs.utc(system.nextReview).tz(timezone).format(dateFormat) : "Not set"}{overdue && <span className="text-[#ef4444] font-medium"> (overdue)</span>}</span>
          </div>
        </div>
        {canEdit && <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>}
      </div>

      {/* NEXT STEP — clickable, navigates to the tab that resolves it */}
      <button type="button" onClick={() => onNavigateTab(nextStep.tab)}
        className="w-full text-left flex items-start gap-2 mt-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:brightness-105"
        style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}>
        <ArrowRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--brand)" }}>Next step</span>
          <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{nextStep.label}</span>
        </div>
      </button>
    </div>
  );
}
