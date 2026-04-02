/**
 * Store sync bridge — connects WebSocket messages to Zustand store actions.
 *
 * When backend pushes a "task:updated" message, this bridge calls
 * taskStore.updateTask() so the UI reflects the change in real-time.
 */

import type { Task, MainAgent, SubAgent, DecisionLogEntry, ActivityEvent, Notification, ChatMessage } from '@/types'
import type { HistoryEntry } from '@/stores/history-store'
import type { WebSocketManager } from '@/lib/ws'
import { useTaskStore } from '@/stores/task-store'
import { useAgentStore } from '@/stores/agent-store'
import { useActivityStore } from '@/stores/activity-store'
import { useHistoryStore } from '@/stores/history-store'
import { useUIStore } from '@/stores/ui-store'

/**
 * Register all WS message handlers.
 * Returns a cleanup function that removes all handlers.
 */
export function initStoreSync(ws: WebSocketManager): () => void {
  const cleanups: Array<() => void> = []

  function on(type: string, handler: (payload: Record<string, unknown>) => void) {
    ws.onMessage(type, handler)
    cleanups.push(() => ws.offMessage(type, handler))
  }

  // ------------------------------------------------------------------
  // Full sync (on first connect)
  // ------------------------------------------------------------------
  on('state:full_sync', (payload) => {
    const data = payload as {
      tasks?: Task[]
      mainAgent?: Partial<MainAgent>
      subAgents?: SubAgent[]
      events?: ActivityEvent[]
      notifications?: Notification[]
      chatMessages?: ChatMessage[]
      decisions?: DecisionLogEntry[]
    }

    // Bulk-load tasks
    if (data.tasks) {
      useTaskStore.setState({ tasks: data.tasks })
    }

    // Main agent
    if (data.mainAgent) {
      useAgentStore.getState().updateMainAgent(data.mainAgent)
    }

    // Sub agents
    if (data.subAgents) {
      useAgentStore.setState({ subAgents: data.subAgents })
    }

    // Decisions
    if (data.decisions) {
      useAgentStore.setState({ decisionLog: data.decisions })
    }

    // Activity events
    if (data.events) {
      useActivityStore.setState({ events: data.events })
    }

    // Notifications
    if (data.notifications) {
      const unread = data.notifications.filter((n) => !n.read).length
      useActivityStore.setState({
        notifications: data.notifications,
        unreadCount: unread,
      })
    }

    // Chat messages
    if (data.chatMessages) {
      useUIStore.setState({ chatMessages: data.chatMessages })
    }
  })

  // ------------------------------------------------------------------
  // Task events
  // ------------------------------------------------------------------
  on('task:created', (payload) => {
    useTaskStore.getState().addTask(payload as unknown as Task)
  })

  on('task:updated', (payload) => {
    const task = payload as unknown as Task
    // Check if task exists — if not, add it; if yes, update
    const existing = useTaskStore.getState().getTaskById(task.id)
    if (existing) {
      useTaskStore.getState().updateTask(task.id, task)
    } else {
      useTaskStore.getState().addTask(task)
    }
  })

  on('task:deleted', (payload) => {
    const { id } = payload as { id: string }
    useTaskStore.getState().removeTask(id)
  })

  // ------------------------------------------------------------------
  // Agent events
  // ------------------------------------------------------------------
  on('agent:main_updated', (payload) => {
    useAgentStore.getState().updateMainAgent(payload as Partial<MainAgent>)
  })

  on('agent:sub_updated', (payload) => {
    const data = payload as Record<string, unknown>
    const id = data.id as string
    if (!id) return
    const existing = useAgentStore.getState().subAgents.find((a) => a.id === id)
    if (existing) {
      useAgentStore.getState().updateSubAgent(id, data as Partial<SubAgent>)
    } else if (data.status) {
      useAgentStore.getState().addSubAgent(data as unknown as SubAgent)
    }
  })

  on('agent:sub_created', (payload) => {
    useAgentStore.getState().addSubAgent(payload as unknown as SubAgent)
  })

  on('agent:sub_removed', (payload) => {
    const { id } = payload as { id: string }
    useAgentStore.getState().removeSubAgent(id)
  })

  on('agent:decision', (payload) => {
    useAgentStore.getState().addDecision(payload as unknown as DecisionLogEntry)
  })

  // ------------------------------------------------------------------
  // Activity events
  // ------------------------------------------------------------------
  on('activity:event', (payload) => {
    useActivityStore.getState().addEvent(payload as unknown as ActivityEvent)
  })

  on('activity:notification', (payload) => {
    useActivityStore.getState().addNotification(payload as unknown as Notification)
  })

  // ------------------------------------------------------------------
  // History events
  // ------------------------------------------------------------------
  on('history:entry_added', (payload) => {
    useHistoryStore.getState().addEntry(payload as unknown as HistoryEntry)
  })

  // ------------------------------------------------------------------
  // Chat events
  // ------------------------------------------------------------------
  on('chat:message', (payload) => {
    useUIStore.getState().addChatMessage(payload as unknown as ChatMessage)
  })

  // Return cleanup
  return () => {
    cleanups.forEach((fn) => fn())
  }
}
