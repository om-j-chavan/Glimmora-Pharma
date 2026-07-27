"use client";

import type { Inspection, ReadinessAction, Simulation, TrainingRecord } from "@prisma/client";
import dayjs from "@/lib/dayjs";

type FullInspection = Inspection & {
  actions: ReadinessAction[];
  simulations: Simulation[];
  trainingRecords: TrainingRecord[];
};

export interface ActivityTabProps {
  inspection: FullInspection;
}

type Tone = "neutral" | "active" | "done";
interface Event {
  id: string;
  at: Date;
  title: string;
  sub?: string;
  tone: Tone;
}

const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--text-muted)",
  active: "var(--brand)",
  done: "var(--success)",
};

/**
 * Activity timeline reconstructed from the records already loaded for this
 * inspection (creation, action completions, simulations, training). Every entry
 * carries a real timestamp from the underlying record — nothing is fabricated.
 * (The full cross-record audit trail lives in the Audit Trail module.)
 */
export function ActivityTab({ inspection }: ActivityTabProps) {
  const events: Event[] = [];

  events.push({
    id: `insp-created-${inspection.id}`,
    at: inspection.createdAt,
    title: "Inspection created",
    sub: `by ${inspection.createdBy}`,
    tone: "active",
  });

  if (inspection.status === "completed" && inspection.endDate) {
    events.push({
      id: `insp-completed-${inspection.id}`,
      at: inspection.endDate,
      title: "Inspection completed",
      sub: inspection.notes ?? undefined,
      tone: "done",
    });
  }

  for (const a of inspection.actions) {
    if (a.status === "Complete" && a.completedAt) {
      events.push({
        id: `action-${a.id}`,
        at: a.completedAt,
        title: `Completed: ${a.title}`,
        sub: a.completedBy ? `by ${a.completedBy}` : undefined,
        tone: "done",
      });
    }
  }

  for (const s of inspection.simulations) {
    const completed = s.status === "Completed";
    events.push({
      id: `sim-${s.id}`,
      at: s.createdAt,
      title: completed
        ? `Simulation scored: ${s.title}${typeof s.score === "number" ? ` (${s.score}%)` : ""}`
        : `Simulation scheduled: ${s.title}`,
      sub: s.participants ?? undefined,
      tone: completed ? "done" : "neutral",
    });
  }

  for (const t of inspection.trainingRecords) {
    const done = t.status === "completed";
    events.push({
      id: `training-${t.id}`,
      at: done && t.completedAt ? t.completedAt : t.createdAt,
      title: done
        ? `Training completed: ${t.userName}`
        : `Training assigned: ${t.userName}`,
      sub: `${t.userRole} · ${t.module}`,
      tone: done ? "done" : "neutral",
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (events.length === 0) {
    return (
      <div
        className="text-center py-10 rounded-2xl border border-dashed text-[12px]"
        style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
      >
        No activity recorded for this inspection yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
      <ol className="space-y-0 list-none p-0 m-0">
        {events.map((e, i) => (
          <li key={e.id} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <span className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: TONE_COLOR[e.tone] }} aria-hidden="true" />
              {i < events.length - 1 && <span className="w-0.5 flex-1 min-h-4 my-1" style={{ background: "var(--bg-border)" }} />}
            </div>
            <div className="pb-4 min-w-0 flex-1">
              <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{e.title}</p>
              {e.sub && <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{e.sub}</p>}
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{dayjs(e.at).format("DD MMM YYYY, HH:mm")}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
