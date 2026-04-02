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

export type AgentLogEventType = 'tool_use' | 'text' | 'result' | 'error' | 'progress'

export interface AgentLog {
  id: string
  agentId: string
  taskId: string | null
  eventType: AgentLogEventType
  message: string
  toolName: string | null
  progressPct: number
  costUsd: number | null
  metadata: Record<string, unknown> | null
  timestamp: number  // epoch ms
}
