"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Calendar, Users, Clock, CheckCircle2 } from "lucide-react";
import type { Inspection, Simulation, TrainingRecord } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { createSimulation, completeSimulation } from "@/actions/inspections";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

type InspectionWithTraining = Inspection & {
  simulations: Simulation[];
  trainingRecords: TrainingRecord[];
};

export interface TrainingPrismaTabProps {
  inspection: InspectionWithTraining;
  isAdmin: boolean;
}

const SIM_TYPES = [
  "Mock Inspection",
  "Table-Top Exercise",
  "Document Drill",
  "Front Room Practice",
  "Back Room Practice",
];

interface SimForm {
  title: string;
  type: string;
  duration: number;
  scheduledAt: string;
  participants: string;
}

const EMPTY_SIM_FORM: SimForm = {
  title: "",
  type: "Mock Inspection",
  duration: 180,
  scheduledAt: "",
  participants: "",
};

export function TrainingPrismaTab({ inspection, isAdmin }: TrainingPrismaTabProps) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [simForm, setSimForm] = useState<SimForm>(EMPTY_SIM_FORM);
  const [scheduling, setScheduling] = useState(false);

  const [completeTarget, setCompleteTarget] = useState<Simulation | null>(null);
  const [completeScore, setCompleteScore] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");
  const [completing, setCompleting] = useState(false);

  const simulations = inspection.simulations;
  const trainings = inspection.trainingRecords;

  async function handleSchedule() {
    if (!simForm.title.trim()) return;
    setScheduling(true);
    const result = await createSimulation({
      inspectionId: inspection.id,
      title: simForm.title.trim(),
      type: simForm.type,
      duration: simForm.duration,
      scheduledAt: simForm.scheduledAt || undefined,
      participants: simForm.participants || undefined,
    });
    setScheduling(false);
    if (!result.success) {
      console.error("[training] createSimulation failed:", result.error);
      return;
    }
    setScheduleOpen(false);
    setSimForm(EMPTY_SIM_FORM);
    router.refresh();
  }

  async function handleComplete() {
    if (!completeTarget) return;
    const score = parseInt(completeScore, 10);
    if (Number.isNaN(score) || score < 0 || score > 100) return;
    setCompleting(true);
    const result = await completeSimulation(completeTarget.id, score, completeNotes.trim() || undefined);
    setCompleting(false);
    if (!result.success) {
      console.error("[training] completeSimulation failed:", result.error);
      return;
    }
    setCompleteTarget(null);
    setCompleteScore("");
    setCompleteNotes("");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* ── Mock Simulations ── */}
      <section aria-label="Mock simulations">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Mock Simulations
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Schedule and score practice runs ahead of inspection day
            </p>
          </div>
          {isAdmin && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setScheduleOpen(true)}>
              Schedule simulation
            </Button>
          )}
        </div>

        {simulations.length === 0 ? (
          <div
            className="text-center py-10 rounded-xl border border-dashed"
            style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}
          >
            <Calendar className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              No simulations scheduled for this inspection yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {simulations.map((sim) => {
              const isComplete = sim.status === "Completed";
              return (
                <article
                  key={sim.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                  style={{
                    borderColor: isComplete ? "var(--success)" : "var(--bg-border)",
                    background: isComplete ? "var(--success-bg)" : "var(--bg-surface)",
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {sim.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      <span>{sim.type}</span>
                      {sim.duration !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" /> {sim.duration} min
                        </span>
                      )}
                      {sim.scheduledAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" aria-hidden="true" /> {dayjs(sim.scheduledAt).format("DD MMM YYYY")}
                        </span>
                      )}
                    </div>
                    {sim.participants && (
                      <p className="text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                        <Users className="w-3 h-3" aria-hidden="true" /> {sim.participants}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 ml-4">
                    {isComplete ? (
                      <div className="text-right">
                        <p className="text-[11px] font-medium inline-flex items-center gap-1" style={{ color: "var(--success)" }}>
                          <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Complete
                        </p>
                        {typeof sim.score === "number" && (
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            Score: {sim.score}%
                          </p>
                        )}
                      </div>
                    ) : isAdmin ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setCompleteTarget(sim);
                          setCompleteScore("");
                          setCompleteNotes("");
                        }}
                      >
                        Score &amp; complete
                      </Button>
                    ) : (
                      <span
                        className="text-[10px] px-2 py-1 rounded-full font-medium"
                        style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                      >
                        Scheduled
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Training Records ── */}
      <section aria-label="Training records">
        <div className="mb-4">
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Training Records
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Inspection-specific competency records — auto-completed by simulations
          </p>
        </div>
        {trainings.length === 0 ? (
          <div
            className="text-center py-8 rounded-xl border border-dashed text-[12px]"
            style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
          >
            No training records logged for this inspection yet.
          </div>
        ) : (
          <div className="space-y-2">
            {trainings.map((t) => {
              const done = t.status === "completed";
              return (
                <article
                  key={t.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  style={{
                    borderColor: "var(--bg-border)",
                    background: done ? "var(--success-bg)" : "var(--bg-surface)",
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {t.userName}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {t.userRole} · {t.module}
                    </p>
                  </div>
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: done ? "var(--success)" : "var(--warning)" }}
                  >
                    {done ? `✓ Done${typeof t.score === "number" ? ` · ${t.score}%` : ""}` : "Pending"}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Schedule simulation modal ── */}
      <Modal
        open={scheduleOpen}
        onClose={() => {
          setScheduleOpen(false);
          setSimForm(EMPTY_SIM_FORM);
        }}
        title="Schedule simulation"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="sim-title" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              Title *
            </label>
            <input
              id="sim-title"
              type="text"
              className="input w-full"
              value={simForm.title}
              onChange={(e) => setSimForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Mock FDA Inspection"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              Type *
            </label>
            <Dropdown
              value={simForm.type}
              onChange={(v) => setSimForm((p) => ({ ...p, type: v }))}
              width="w-full"
              options={SIM_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sim-dur" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                Duration (min)
              </label>
              <input
                id="sim-dur"
                type="number"
                className="input w-full"
                value={simForm.duration}
                onChange={(e) => setSimForm((p) => ({ ...p, duration: parseInt(e.target.value, 10) || 180 }))}
              />
            </div>
            <div>
              <label htmlFor="sim-date" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                Scheduled date
              </label>
              <input
                id="sim-date"
                type="date"
                className="input w-full"
                value={simForm.scheduledAt}
                onChange={(e) => setSimForm((p) => ({ ...p, scheduledAt: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label htmlFor="sim-parts" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              Participants
            </label>
            <input
              id="sim-parts"
              type="text"
              className="input w-full"
              value={simForm.participants}
              onChange={(e) => setSimForm((p) => ({ ...p, participants: e.target.value }))}
              placeholder="Dr. Priya, Rahul, ..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={Plus}
              loading={scheduling}
              disabled={!simForm.title.trim() || scheduling}
              onClick={handleSchedule}
            >
              Schedule
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Score & complete modal ── */}
      <Modal
        open={completeTarget !== null}
        onClose={() => {
          setCompleteTarget(null);
          setCompleteScore("");
          setCompleteNotes("");
        }}
        title="Score simulation"
      >
        {completeTarget && (
          <div className="space-y-4">
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{completeTarget.title}</strong> · {completeTarget.type}
            </p>
            <div>
              <label htmlFor="sim-score" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                Score (0–100) *
              </label>
              <input
                id="sim-score"
                type="number"
                min={0}
                max={100}
                className="input w-full"
                value={completeScore}
                onChange={(e) => setCompleteScore(e.target.value)}
                placeholder="e.g. 85"
              />
            </div>
            <div>
              <label htmlFor="sim-notes" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                Notes / feedback
              </label>
              <textarea
                id="sim-notes"
                rows={3}
                className="input w-full resize-none"
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="What went well, what to improve..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
              <Button variant="secondary" onClick={() => setCompleteTarget(null)}>Cancel</Button>
              <Button
                variant="primary"
                icon={CheckCircle2}
                loading={completing}
                disabled={!completeScore || completing}
                onClick={handleComplete}
              >
                Save &amp; complete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
