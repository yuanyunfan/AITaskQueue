export type EventType = 'running' | 'dispatch' | 'done' | 'failed' | 'review' | 'info'

export interface ActivityEvent {
  id: string
  timestamp: number
  type: EventType
  message: string
}

export interface Notification {
  id: string
  timestamp: number
  message: string
  read: boolean
  taskId?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}
