import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import dayjs from "dayjs";

export type ReadinessLane = "People" | "Process" | "Data" | "Systems" | "Documentation";
export type ReadinessBucket = "Immediate" | "31-60 days" | "61-90 days";
export type ReadinessStatus = "Not Started" | "In Progress" | "Complete" | "Overdue";
export type AGIRiskScore = "High" | "Medium" | "Low";
export type PlaybookType = "Front Room" | "Back Room" | "SME" | "DIL Handling";
export type SimulationStatus = "Scheduled" | "In Progress" | "Completed" | "Cancelled";
export type SimulationType = "Mock Inspection" | "DIL Drill" | "SME Q&A" | "QA Workshop" | "Back Room Drill" | "Leadership Briefing" | "SME Practice";

export interface ReadinessCard {
  id: string; lane: ReadinessLane; bucket: ReadinessBucket; action: string; owner: string;
  status: ReadinessStatus; agiRisk: AGIRiskScore; dueDate: string; notes?: string; tenantId: string;
  completedAt?: string;
  completedBy?: string;
  completedRole?: string;
  linkedSimulationType?: SimulationType | null;
  showSuggestion?: boolean;
  suggestionText?: string;
  suggestionDismissed?: boolean;
}

export interface PlaybookStep { id: string; order: number; action: string; do: string[]; dont: string[]; }

export interface Playbook {
  id: string; type: PlaybookType; title: string; description: string;
  steps: PlaybookStep[]; templates: string[]; tenantId: string;
}

export interface Simulation {
  id: string; title: string; type: SimulationType;
  scheduledAt: string; duration: number; participants: string[];
  status: SimulationStatus; score?: number; notes?: string; tenantId: string;
}

export interface TrainingRecord { id: string; userId: string; module: string; completedAt: string; score?: number; tenantId: string; }

export type InspectionAgency = "FDA" | "EMA" | "MHRA" | "WHO" | "Internal";
export type InspectionType = "announced" | "unannounced" | "follow_up" | "pre_approval";
export type InspectionStatus = "planning" | "preparation" | "active" | "completed" | "cancelled";

export interface Inspection {
  id: string;
  tenantId: string;
  title: string;
  siteId: string;
  siteName: string;
  agency: InspectionAgency;
  type: InspectionType;
  status: InspectionStatus;
  expectedDate?: string;
  startDate?: string;
  endDate?: string;
  readinessScore: number;
  totalActions: number;
  completedActions: number;
  linkedFDA483Id?: string;
  linkedFindings?: string[];
  inspectionLead: string;
  frontRoom?: string[];
  backRoom?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  completionOutcome?: string;
}

interface ReadinessState {
  inspections: Inspection[];
  activeInspectionId: string | null;
  cards: ReadinessCard[];
  playbooks: Playbook[];
  simulations: Simulation[];
  training: TrainingRecord[];
  score: number;
  complete: number;
  total: number;
}

import { MOCK_READINESS_CARDS, MOCK_PLAYBOOKS, MOCK_SIMULATIONS, MOCK_TRAINING_RECORDS, MOCK_INSPECTIONS } from "@/mock";

function calcScore(cards: ReadinessCard[]) {
  if (cards.length === 0) return { score: 0, complete: 0, total: 0 };
  let sum = 0;
  let complete = 0;
  for (const c of cards) {
    if (c.status === "Complete") {
      complete++;
      const wasOverdue = c.completedAt && c.dueDate
        ? dayjs(c.completedAt).isAfter(dayjs(c.dueDate))
        : false;
      sum += wasOverdue ? 0.5 : 1.0;
    }
  }
  return { score: Math.round((sum / cards.length) * 100), complete, total: cards.length };
}

const init = calcScore(MOCK_READINESS_CARDS);

const activeId = MOCK_INSPECTIONS.find((i) => i.status !== "completed" && i.status !== "cancelled")?.id ?? null;

const initialState: ReadinessState = {
  inspections: MOCK_INSPECTIONS,
  activeInspectionId: activeId,
  cards: MOCK_READINESS_CARDS,
  playbooks: MOCK_PLAYBOOKS,
  simulations: MOCK_SIMULATIONS,
  training: MOCK_TRAINING_RECORDS,
  score: init.score,
  complete: init.complete,
  total: init.total,
};

const readinessSlice = createSlice({
  name: "readiness",
  initialState,
  reducers: {
    addCard(state, { payload }: PayloadAction<ReadinessCard>) {
      state.cards.push(payload);
      const s = calcScore(state.cards);
      state.score = s.score; state.complete = s.complete; state.total = s.total;
    },
    updateCard(state, { payload }: PayloadAction<{ id: string; patch: Partial<ReadinessCard> }>) {
      const c = state.cards.find((x) => x.id === payload.id);
      if (c) Object.assign(c, payload.patch);
      const s = calcScore(state.cards);
      state.score = s.score; state.complete = s.complete; state.total = s.total;
    },
    removeCard(state, { payload }: PayloadAction<string>) {
      state.cards = state.cards.filter((c) => c.id !== payload);
      const s = calcScore(state.cards);
      state.score = s.score; state.complete = s.complete; state.total = s.total;
    },
    addPlaybook(state, { payload }: PayloadAction<Playbook>) { state.playbooks.push(payload); },
    updatePlaybook(state, { payload }: PayloadAction<{ id: string; patch: Partial<Playbook> }>) { const p = state.playbooks.find((x) => x.id === payload.id); if (p) Object.assign(p, payload.patch); },
    addSimulation(state, { payload }: PayloadAction<Simulation>) { state.simulations.push(payload); },
    updateSimulation(state, { payload }: PayloadAction<{ id: string; patch: Partial<Simulation> }>) { const s = state.simulations.find((x) => x.id === payload.id); if (s) Object.assign(s, payload.patch); },
    addTraining(state, { payload }: PayloadAction<TrainingRecord>) { state.training.push(payload); },
    removeTraining(state, { payload }: PayloadAction<{ userId: string; module: string; tenantId: string }>) {
      state.training = state.training.filter((t) => !(t.userId === payload.userId && t.module === payload.module && t.tenantId === payload.tenantId));
    },
    // Inspection management
    addInspection(state, { payload }: PayloadAction<Inspection>) {
      state.inspections.push(payload);
    },
    updateInspection(state, { payload }: PayloadAction<{ id: string; patch: Partial<Inspection> }>) {
      const insp = state.inspections.find((i) => i.id === payload.id);
      if (insp) Object.assign(insp, payload.patch, { updatedAt: new Date().toISOString() });
    },
    setActiveInspection(state, { payload }: PayloadAction<string>) {
      state.activeInspectionId = payload;
    },
    completeInspection(state, { payload }: PayloadAction<{ id: string; startDate?: string; endDate?: string; outcome?: string; linkedFDA483Id?: string }>) {
      const insp = state.inspections.find((i) => i.id === payload.id);
      if (insp) {
        insp.status = "completed";
        insp.startDate = payload.startDate;
        insp.endDate = payload.endDate;
        insp.completionOutcome = payload.outcome;
        insp.linkedFDA483Id = payload.linkedFDA483Id;
        insp.updatedAt = new Date().toISOString();
      }
    },
  },
});

export const {
  addCard, updateCard, removeCard, addPlaybook, updatePlaybook,
  addSimulation, updateSimulation, addTraining, removeTraining,
  addInspection, updateInspection, setActiveInspection, completeInspection,
} = readinessSlice.actions;
export default readinessSlice.reducer;
