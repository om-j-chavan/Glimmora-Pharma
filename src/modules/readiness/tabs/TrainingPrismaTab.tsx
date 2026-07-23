"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Calendar, Users, Clock, CheckCircle2, X } from "lucide-react";
import type { Inspection, Simulation, TrainingRecord } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { createSimulation, completeSimulation } from "@/actions/inspections";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { useErrorPopup } from "@/components/ui/ErrorPopup";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { StatusBadge } from "@/components/shared";
import { SIMULATION_STATUSES, TRAINING_RECORD_STATUSES } from "@/constants/statusTaxonomy";

type InspectionWithTraining = Inspection & {
  simulations: Simulation[];
  trainingRecords: TrainingRecord[];
};

/** A person who can be assigned to a simulation. */
export interface TeamMember {
  id: string;
  name: string;
  role: string;
}

export interface TrainingPrismaTabProps {
  inspection: InspectionWithTraining;
  isAdmin: boolean;
  /** Eligible participants for the simulation picker (tenant users). */
  teamMembers: TeamMember[];
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
  participantIds: string[];
}

const EMPTY_SIM_FORM: SimForm = {
  title: "",
  type: "Mock Inspection",
  duration: 90,
  scheduledAt: "",
  participantIds: [],
};

export function TrainingPrismaTab({ inspection, isAdmin, teamMembers }: TrainingPrismaTabProps) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [simForm, setSimForm] = useState<SimForm>(EMPTY_SIM_FORM);
  const [scheduling, setScheduling] = useState(false);

  const [completeTarget, setCompleteTarget] = useState<Simulation | null>(null);
  const [completeScore, setCompleteScore] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");
  const [completing, setCompleting] = useState(false);
  const [scoreError, setScoreError] = useState("");
  // User-facing error surfaced when a server action fails (replaces silent console.error).
  const { setError, errorPopup } = useErrorPopup();

  const simulations = inspection.simulations;
  const trainings = inspection.trainingRecords;

  const participantOptions = teamMembers.map((m) => ({ value: m.id, label: `${m.name} — ${m.role}` }));
  const nameById = (id: string) => teamMembers.find((m) => m.id === id)?.name ?? "";

  async function handleSchedule() {
    if (!simForm.title.trim()) return;
    setScheduling(true);
    // Serialize the selected people back to the comma-separated string the
    // `participants` column stores — preserves the existing API/data contract.
    const participants = simForm.participantIds.map(nameById).filter(Boolean).join(", ");
    const result = await createSimulation({
      inspectionId: inspection.id,
      title: simForm.title.trim(),
      type: simForm.type,
      duration: simForm.duration,
      scheduledAt: simForm.scheduledAt || undefined,
      participants: participants || undefined,
    });
    setScheduling(false);
    if (!result.success) {
      console.error("[training] createSimulation failed:", result.error);
      setError(result.error ?? "Could not schedule the simulation. Please try again.");
      return;
    }
    setScheduleOpen(false);
    setSimForm(EMPTY_SIM_FORM);
    router.refresh();
  }

  async function handleComplete() {
    if (!completeTarget) return;
    const score = parseInt(completeScore, 10);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      setScoreError("Enter a score between 0 and 100.");
      return;
    }
    setScoreError("");
    setCompleting(true);
    const result = await completeSimulation(completeTarget.id, score, completeNotes.trim() || undefined);
    setCompleting(false);
    if (!result.success) {
      console.error("[training] completeSimulation failed:", result.error);
      setError(result.error ?? "Could not save the score. Please try again.");
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
            className="text-center py-10 rounded-2xl border border-dashed"
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
                  className="flex items-center justify-between gap-4 p-4 rounded-lg border"
                  style={{
                    borderColor: isComplete ? "var(--success)" : "var(--bg-border)",
                    background: isComplete ? "var(--success-bg)" : "var(--bg-surface)",
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {sim.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      <span>{sim.type}</span>
                      {sim.duration !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" /> {sim.duration} min
                        </span>
                      )}
                      {sim.scheduledAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" aria-hidden="true" /> {dayjs(sim.scheduledAt).format("DD MMM YYYY, HH:mm")}
                        </span>
                      )}
                    </div>
                    {sim.participants && (
                      <p className="text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                        <Users className="w-3 h-3" aria-hidden="true" /> {sim.participants}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {isComplete ? (
                      <>
                        <StatusBadge taxonomy={SIMULATION_STATUSES} status={sim.status} />
                        {typeof sim.score === "number" && (
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            Score: {sim.score}%
                          </p>
                        )}
                      </>
                    ) : isAdmin ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setCompleteTarget(sim);
                          setCompleteScore("");
                          setCompleteNotes("");
                          setScoreError("");
                        }}
                      >
                        Score &amp; complete
                      </Button>
                    ) : (
                      <StatusBadge taxonomy={SIMULATION_STATUSES} status={sim.status} />
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
            Inspection-specific competency records
          </p>
        </div>
        {trainings.length === 0 ? (
          <div
            className="text-center py-8 rounded-2xl border border-dashed text-[12px]"
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
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border"
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
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <StatusBadge taxonomy={TRAINING_RECORD_STATUSES} status={t.status} />
                    {done && typeof t.score === "number" && (
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.score}%</p>
                    )}
                  </div>
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
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            id="sim-title"
            label="Title"
            required
            value={simForm.title}
            onChange={(e) => setSimForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Mock FDA Inspection"
          />

          <div>
            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">Type</label>
            <Dropdown
              value={simForm.type}
              onChange={(v) => setSimForm((p) => ({ ...p, type: v }))}
              width="w-full"
              size="sm"
              options={SIM_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              id="sim-dur"
              label="Duration (min)"
              type="number"
              min={15}
              step={15}
              value={simForm.duration}
              onChange={(e) => setSimForm((p) => ({ ...p, duration: parseInt(e.target.value, 10) || 90 }))}
            />
            <div>
              <label htmlFor="sim-date" className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">
                Scheduled date &amp; time
              </label>
              <input
                id="sim-date"
                type="datetime-local"
                className="input w-full"
                value={simForm.scheduledAt}
                onChange={(e) => setSimForm((p) => ({ ...p, scheduledAt: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1.5">Participants</label>
            {teamMembers.length === 0 ? (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                No eligible team members found for this tenant.
              </p>
            ) : (
              <>
                <Dropdown
                  multi
                  searchable
                  values={simForm.participantIds}
                  onChangeMulti={(vals) => setSimForm((p) => ({ ...p, participantIds: vals }))}
                  options={participantOptions}
                  placeholder="Select participants..."
                  searchPlaceholder="Search people..."
                  width="w-full"
                  size="sm"
                />
                {simForm.participantIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {simForm.participantIds.map((id) => {
                      const name = nameById(id);
                      if (!name) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => setSimForm((p) => ({ ...p, participantIds: p.participantIds.filter((x) => x !== id) }))}
                            aria-label={`Remove ${name}`}
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-pointer border-none bg-transparent"
                            style={{ color: "var(--brand)" }}
                          >
                            <X className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
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
          setScoreError("");
        }}
        title="Score simulation"
      >
        {completeTarget && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{completeTarget.title}</strong> · {completeTarget.type}
            </p>
            <Input
              id="sim-score"
              label="Score (0–100)"
              required
              type="number"
              min={0}
              max={100}
              value={completeScore}
              onChange={(e) => { setCompleteScore(e.target.value); if (scoreError) setScoreError(""); }}
              error={scoreError || undefined}
              placeholder="e.g. 85"
            />
            <Textarea
              id="sim-notes"
              label="Notes / feedback"
              rows={3}
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              placeholder="What went well, what to improve..."
            />
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

      {/* Error feedback — canonical action-failure surface */}
      {errorPopup}
    </div>
  );
}
