export type AgentStatus = 'active' | 'idle' | 'error'

export interface MainAgent {
  status: AgentStatus
  uptimeSeconds: number
  tasksDispatched: number
  currentDecision: string
  model: string
  memoryMB: number
}

export interface SubAgent {
  id: string
  status: AgentStatus
  currentTaskId?: string
  currentTaskTitle?: string
  progress: number
  completedCount: number
  runningMinutes: number
}

export interface DecisionLogEntry {
  id: string
  timestamp: number
  message: string
}
