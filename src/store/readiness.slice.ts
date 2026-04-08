import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ReadinessLane = "People" | "Process" | "Data" | "Systems" | "Documentation";
export type ReadinessBucket = "Immediate" | "31-60 days" | "61-90 days";
export type ReadinessStatus = "Not Started" | "In Progress" | "Complete" | "Overdue";
export type AGIRiskScore = "High" | "Medium" | "Low";
export type PlaybookType = "Front Room" | "Back Room" | "SME" | "DIL Handling";
export type SimulationStatus = "Scheduled" | "In Progress" | "Completed" | "Cancelled";

export interface ReadinessCard {
  id: string; lane: ReadinessLane; bucket: ReadinessBucket; action: string; owner: string;
  status: ReadinessStatus; agiRisk: AGIRiskScore; dueDate: string; notes?: string; tenantId: string;
}

export interface PlaybookStep { id: string; order: number; action: string; do: string[]; dont: string[]; }

export interface Playbook {
  id: string; type: PlaybookType; title: string; description: string;
  steps: PlaybookStep[]; templates: string[]; tenantId: string;
}

export interface Simulation {
  id: string; title: string; type: "Mock Inspection" | "DIL Drill" | "SME Q&A" | "Leadership Briefing";
  scheduledAt: string; duration: number; participants: string[];
  status: SimulationStatus; score?: number; notes?: string; tenantId: string;
}

export interface TrainingRecord { id: string; userId: string; module: string; completedAt: string; score?: number; tenantId: string; }

interface ReadinessState { cards: ReadinessCard[]; playbooks: Playbook[]; simulations: Simulation[]; training: TrainingRecord[]; }

import { MOCK_READINESS_CARDS, MOCK_PLAYBOOKS, MOCK_SIMULATIONS } from "@/mock";

const initialState: ReadinessState = { cards: MOCK_READINESS_CARDS, playbooks: MOCK_PLAYBOOKS, simulations: MOCK_SIMULATIONS, training: [] };

const readinessSlice = createSlice({
  name: "readiness",
  initialState,
  reducers: {
    addCard(state, { payload }: PayloadAction<ReadinessCard>) { state.cards.push(payload); },
    updateCard(state, { payload }: PayloadAction<{ id: string; patch: Partial<ReadinessCard> }>) { const c = state.cards.find((x) => x.id === payload.id); if (c) Object.assign(c, payload.patch); },
    removeCard(state, { payload }: PayloadAction<string>) { state.cards = state.cards.filter((c) => c.id !== payload); },
    addPlaybook(state, { payload }: PayloadAction<Playbook>) { state.playbooks.push(payload); },
    updatePlaybook(state, { payload }: PayloadAction<{ id: string; patch: Partial<Playbook> }>) { const p = state.playbooks.find((x) => x.id === payload.id); if (p) Object.assign(p, payload.patch); },
    addSimulation(state, { payload }: PayloadAction<Simulation>) { state.simulations.push(payload); },
    updateSimulation(state, { payload }: PayloadAction<{ id: string; patch: Partial<Simulation> }>) { const s = state.simulations.find((x) => x.id === payload.id); if (s) Object.assign(s, payload.patch); },
    addTraining(state, { payload }: PayloadAction<TrainingRecord>) { state.training.push(payload); },
  },
});

export const { addCard, updateCard, removeCard, addPlaybook, updatePlaybook, addSimulation, updateSimulation, addTraining } = readinessSlice.actions;
export default readinessSlice.reducer;
