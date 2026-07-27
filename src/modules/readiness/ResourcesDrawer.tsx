"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle, Users, UserCheck, Shield, Calendar, ChevronUp, ChevronRight,
  ChevronDown, Clock, ClipboardList, BookOpen, type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { Playbook } from "@prisma/client";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { CardSection, DataTable, type Column } from "@/components/shared";
import { PlaybooksPrismaTab } from "./tabs/PlaybooksPrismaTab";

export interface ResourcesDrawerProps {
  open: boolean;
  onClose: () => void;
  playbooks: Playbook[];
  isAdmin: boolean;
}

/* ── Static reference content (inspection operating model) ── */

const FLOW_STEPS = [
  { time: "Day start", color: "#0ea5e9", front: "Receive inspector + opening meeting", back: "Review prior day notes + prepare documents" },
  { time: "During day", color: "#6366f1", front: "Answer questions + log all document requests", back: "Retrieve, review, approve documents for front room" },
  { time: "Midday", color: "#f59e0b", front: "Status update with back room lead", back: "Prioritise afternoon document requests" },
  { time: "Day end", color: "#10b981", front: "Daily debrief with inspector", back: "Overnight action list + risk assessment" },
  { time: "Evening", color: "#64748b", front: "—", back: "Prepare overnight responses + draft commitments" },
];

const RACI_DATA = [
  { activity: "Inspector greeting + escort", r: "QA Head", a: "QA Head", c: "Reg Affairs", i: "All" },
  { activity: "DIL document retrieval", r: "Evidence Lead", a: "Back Room Lead", c: "QC Director", i: "QA Head" },
  { activity: "Technical SME questions", r: "SME", a: "QA Head", c: "Back Room", i: "Front Room" },
  { activity: "483 observation response", r: "Reg Affairs", a: "QA Head", c: "Legal", i: "Leadership" },
  { activity: "Commitment sign-off", r: "QA Head", a: "Super Admin", c: "Reg Affairs", i: "Front Room" },
];

export function ResourcesDrawer({ open, onClose, playbooks, isAdmin }: ResourcesDrawerProps) {
  const [view, setView] = useState<"playbooks" | "operating-model">("playbooks");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["war-room", "teams"]));
  const toggleSection = (k: string) =>
    setOpenSections((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <Drawer open={open} onClose={onClose} title="Resources" width="lg">
      {/* View switch */}
      <div className="inline-flex rounded-lg border p-0.5 mb-4" style={{ borderColor: "var(--bg-border)", background: "var(--bg-surface)" }}>
        {([
          { id: "playbooks", label: "Playbooks", Icon: BookOpen },
          { id: "operating-model", label: "Operating model", Icon: Shield },
        ] as const).map((t) => {
          const active = view === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium cursor-pointer border-none transition-colors"
              style={{ background: active ? "var(--brand-muted)" : "transparent", color: active ? "var(--brand)" : "var(--text-secondary)" }}
            >
              <t.Icon className="w-3.5 h-3.5" aria-hidden="true" /> {t.label}
            </button>
          );
        })}
      </div>

      {view === "playbooks" ? (
        <PlaybooksPrismaTab playbooks={playbooks} isAdmin={isAdmin} />
      ) : (
        <section aria-label="Inspection operating model" className="flex flex-col gap-3">
          <p className="text-[11px] rounded-lg px-3 py-2" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
            Reference template — a recommended operating model, not live team data.
          </p>

          <CollapsibleSection id="war-room" icon={AlertTriangle} iconColor="#f59e0b" title="War room model" isOpen={openSections.has("war-room")} onToggle={() => toggleSection("war-room")}>
            <div className={clsx("flex items-start gap-3 p-4 rounded-2xl border", "bg-(--brand-muted) border-(--brand)")}>
              <AlertTriangle className="w-4 h-4 text-[#0ea5e9] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>During an FDA inspection, two parallel teams operate. Front room faces the inspector. Back room coordinates evidence and responses.</p>
            </div>
          </CollapsibleSection>

          <CollapsibleSection id="teams" icon={Users} iconColor="#0ea5e9" title="Inspection teams" isOpen={openSections.has("teams")} onToggle={() => toggleSection("teams")}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CardSection icon={UserCheck} iconColor="#0ea5e9" title="Front room">
                {[{ role: "QA Head", resp: "Lead inspector contact" }, { role: "Regulatory Affairs", resp: "Document response" }, { role: "SME (on-call)", resp: "Technical questions" }, { role: "Scribe", resp: "Log all requests" }].map((r) => (
                  <div key={r.role} className="flex items-start gap-3 py-2.5 border-b last:border-0" style={{ borderColor: "var(--bg-border)" }}>
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-[#0ea5e9]" />
                    <div className="flex-1">
                      <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.role}</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.resp}</p>
                    </div>
                  </div>
                ))}
              </CardSection>
              <CardSection icon={Shield} iconColor="#6366f1" title="Back room">
                {[{ role: "Evidence Lead", resp: "Retrieve + review documents" }, { role: "CSV/Val Lead", resp: "System evidence support" }, { role: "QC Lab Director", resp: "Lab records and data" }, { role: "Legal/QP", resp: "Regulatory risk advice" }].map((r) => (
                  <div key={r.role} className="flex items-start gap-3 py-2.5 border-b last:border-0" style={{ borderColor: "var(--bg-border)" }}>
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-[#6366f1]" />
                    <div className="flex-1">
                      <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.role}</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.resp}</p>
                    </div>
                  </div>
                ))}
              </CardSection>
            </div>
          </CollapsibleSection>

          <CollapsibleSection id="day-flow" icon={Calendar} iconColor="#10b981" title="Inspection day flow" isOpen={openSections.has("day-flow")} onToggle={() => toggleSection("day-flow")}>
            <div className="space-y-0">
              {FLOW_STEPS.map((step, i) => (
                <div key={step.time} className="flex gap-4 items-stretch">
                  <div className="w-24 shrink-0 flex flex-col items-end justify-start pr-3 pt-3">
                    <span className="text-[11px] font-semibold" style={{ color: step.color }}>{step.time}</span>
                  </div>
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-3 h-3 rounded-full mt-3" style={{ background: step.color }} />
                    {i < FLOW_STEPS.length - 1 && <div className="w-0.5 flex-1 min-h-4" style={{ background: "var(--bg-border)" }} />}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 py-2">
                    <div className={clsx("rounded-lg p-2.5 text-[11px]", "bg-(--bg-surface) border border-(--bg-border)")}>
                      <p className="text-[10px] font-semibold text-[#0ea5e9] mb-1">FRONT ROOM</p>
                      <p style={{ color: "var(--text-secondary)" }}>{step.front}</p>
                    </div>
                    <div className={clsx("rounded-lg p-2.5 text-[11px]", "bg-(--bg-surface) border border-(--bg-border)")}>
                      <p className="text-[10px] font-semibold text-[#6366f1] mb-1">BACK ROOM</p>
                      <p style={{ color: "var(--text-secondary)" }}>{step.back}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection id="escalation" icon={ChevronUp} iconColor="#ef4444" title="Escalation path" isOpen={openSections.has("escalation")} onToggle={() => toggleSection("escalation")}>
            <div className={clsx("rounded-2xl border p-4", "bg-(--bg-surface) border-(--bg-border)")}>
              {["QA Head → Operations Head → Super Admin", "CSV Lead → IT/CDO → QA Head", "Reg Affairs → QA Head → Legal"].map((p) => (
                <div key={p} className="flex items-center gap-2 py-2 border-b last:border-0" style={{ borderColor: "var(--bg-border)" }}>
                  <ChevronRight className="w-3 h-3 text-[#ef4444] shrink-0" aria-hidden="true" /><span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{p}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection id="touchpoints" icon={Clock} iconColor="#f59e0b" title="Daily touchpoints" isOpen={openSections.has("touchpoints")} onToggle={() => toggleSection("touchpoints")}>
            <div className={clsx("rounded-2xl border p-4", "bg-(--bg-surface) border-(--bg-border)")}>
              {[{ time: "08:00", event: "Back room morning briefing" }, { time: "12:00", event: "Midday status check" }, { time: "17:00", event: "Front/back room debrief" }, { time: "20:00", event: "Overnight action review" }].map((t) => (
                <div key={t.time} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: "var(--bg-border)" }}>
                  <span className="text-[11px] font-mono font-semibold text-[#f59e0b] w-12 shrink-0">{t.time}</span>
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{t.event}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection id="raci" icon={ClipboardList} iconColor="#6366f1" title="RACI — key inspection activities" isOpen={openSections.has("raci")} onToggle={() => toggleSection("raci")}>
            <div className="card overflow-hidden">
              <DataTable
                ariaLabel="RACI matrix"
                caption="RACI matrix for key inspection activities"
                minWidth={600}
                data={RACI_DATA}
                rowKey={(r) => r.activity}
                columns={[
                  { key: "activity", header: "Activity", cellClassName: "text-[12px] font-medium", render: (r) => <span style={{ color: "var(--text-primary)" }}>{r.activity}</span> },
                  { key: "r", header: "R — Responsible", render: (r) => <Badge variant="blue">{r.r}</Badge> },
                  { key: "a", header: "A — Accountable", render: (r) => <Badge variant="red">{r.a}</Badge> },
                  { key: "c", header: "C — Consulted", render: (r) => <Badge variant="amber">{r.c}</Badge> },
                  { key: "i", header: "I — Informed", render: (r) => <Badge variant="gray">{r.i}</Badge> },
                ] satisfies Column<(typeof RACI_DATA)[number]>[]}
              />
            </div>
          </CollapsibleSection>
        </section>
      )}
    </Drawer>
  );
}

/* ── Collapsible section (moved out of ReadinessPage's Governance tab) ── */

interface CollapsibleSectionProps {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function CollapsibleSection({ id, icon: Icon, iconColor, title, isOpen, onToggle, children }: CollapsibleSectionProps) {
  const panelId = `res-panel-${id}`;
  const btnId = `res-btn-${id}`;
  return (
    <div>
      <button
        id={btnId}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex items-center justify-between cursor-pointer border transition-colors"
        style={{ padding: "14px 20px", borderRadius: "var(--radius-card)", borderWidth: 1, borderColor: "var(--bg-border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
      >
        <span className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 shrink-0" style={{ color: iconColor }} aria-hidden="true" />
          <span className="text-[13px] font-semibold">{title}</span>
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 transition-transform duration-200" style={{ color: "var(--text-secondary)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }} aria-hidden="true" />
      </button>
      <div id={panelId} role="region" aria-labelledby={btnId} className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
        <div className="overflow-hidden"><div className="pt-3">{children}</div></div>
      </div>
    </div>
  );
}
