import { create } from 'zustand'
import type { AgentLog } from '@/types'

interface AgentLogState {
  /** All logs keyed by agentId for fast lookup */
  logsByAgent: Record<string, AgentLog[]>

  /** Push a single log entry (from WS) */
  addLog: (log: AgentLog) => void

  /** Bulk-load logs (from full_sync or REST fetch) */
  setLogs: (logs: AgentLog[]) => void

  /** Clear logs for a specific agent */
  clearAgent: (agentId: string) => void

  /** Get logs for a specific agent+task combo */
  getLogsForAgent: (agentId: string, taskId?: string) => AgentLog[]
}

const MAX_LOGS_PER_AGENT = 500

export const useAgentLogStore = create<AgentLogState>((set, get) => ({
  logsByAgent: {},

  addLog: (log) =>
    set((s) => {
      const existing = s.logsByAgent[log.agentId] || []
      const updated = [...existing, log].slice(-MAX_LOGS_PER_AGENT)
      return { logsByAgent: { ...s.logsByAgent, [log.agentId]: updated } }
    }),

  setLogs: (logs) =>
    set(() => {
      const grouped: Record<string, AgentLog[]> = {}
      for (const log of logs) {
        if (!grouped[log.agentId]) grouped[log.agentId] = []
        grouped[log.agentId].push(log)
      }
      return { logsByAgent: grouped }
    }),

  clearAgent: (agentId) =>
    set((s) => {
      const next = { ...s.logsByAgent }
      delete next[agentId]
      return { logsByAgent: next }
    }),

  getLogsForAgent: (agentId, taskId) => {
    const all = get().logsByAgent[agentId] || []
    if (!taskId) return all
    return all.filter((l) => l.taskId === taskId)
  },
}))
