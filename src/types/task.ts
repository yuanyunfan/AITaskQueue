export type TaskStatus = 'blocked' | 'queued' | 'running' | 'done' | 'failed' | 'paused' | 'review'
export type QueueType = 'auto' | 'semi' | 'human'
export type Priority = 'p0' | 'p1' | 'p2' | 'p3'

export interface Task {
  id: string
  title: string
  description?: string
  project?: string | null
  parentId?: string | null
  status: TaskStatus
  queueType: QueueType
  priority: Priority
  progress: number // 0-100
  assignedAgent?: string // sub-agent id
  createdAt: number
  startedAt?: number
  completedAt?: number
  estimatedMinutes?: number
  result?: string
  children?: Task[] | null
}
