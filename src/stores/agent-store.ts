import { create } from 'zustand'
import type { MainAgent, SubAgent, DecisionLogEntry } from '@/types'

interface AgentState {
  mainAgent: MainAgent
  subAgents: SubAgent[]
  decisionLog: DecisionLogEntry[]

  updateMainAgent: (updates: Partial<MainAgent>) => void
  addSubAgent: (agent: SubAgent) => void
  updateSubAgent: (id: string, updates: Partial<SubAgent>) => void
  removeSubAgent: (id: string) => void
  addDecision: (entry: DecisionLogEntry) => void
  getIdleSubAgent: () => SubAgent | undefined
}

export const useAgentStore = create<AgentState>((set, get) => ({
  mainAgent: {
    status: 'active',
    uptimeSeconds: 9240,
    tasksDispatched: 12,
    currentDecision: '拆解 "竞品分析" 为子任务',
    model: 'GPT-4o',
    memoryMB: 128,
  },
  subAgents: [],
  decisionLog: [],

  updateMainAgent: (updates) =>
    set((s) => ({ mainAgent: { ...s.mainAgent, ...updates } })),

  addSubAgent: (agent) =>
    set((s) => ({ subAgents: [...s.subAgents, agent] })),

  updateSubAgent: (id, updates) =>
    set((s) => ({
      subAgents: s.subAgents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  removeSubAgent: (id) =>
    set((s) => ({ subAgents: s.subAgents.filter((a) => a.id !== id) })),

  addDecision: (entry) =>
    set((s) => ({ decisionLog: [entry, ...s.decisionLog].slice(0, 50) })),

  getIdleSubAgent: () => get().subAgents.find((a) => a.status === 'idle'),
}))
