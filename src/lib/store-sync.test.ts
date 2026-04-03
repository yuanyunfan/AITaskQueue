/**
 * store-sync tests — verifies WebSocket messages correctly update Zustand stores.
 *
 * Covers Bug#4: full_sync must include historyEntries and populate historyStore.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { initStoreSync } from '@/lib/store-sync'
import { useTaskStore } from '@/stores/task-store'
import { useAgentStore } from '@/stores/agent-store'
import { useActivityStore } from '@/stores/activity-store'
import { useHistoryStore } from '@/stores/history-store'
import { useUIStore } from '@/stores/ui-store'
import type { WebSocketManager } from '@/lib/ws'

// Create a minimal mock WebSocketManager
function createMockWS() {
  const handlers = new Map<string, Set<(payload: Record<string, unknown>) => void>>()

  const ws: Pick<WebSocketManager, 'onMessage' | 'offMessage'> = {
    onMessage(type: string, handler: (payload: Record<string, unknown>) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
    },
    offMessage(type: string, handler: (payload: Record<string, unknown>) => void) {
      handlers.get(type)?.delete(handler)
    },
  }

  function emit(type: string, payload: Record<string, unknown>) {
    handlers.get(type)?.forEach((h) => h(payload))
  }

  return { ws: ws as WebSocketManager, emit }
}

describe('store-sync', () => {
  let mockWS: ReturnType<typeof createMockWS>
  let cleanup: () => void

  beforeEach(() => {
    // Reset all stores
    useTaskStore.setState({ tasks: [], selectedTaskId: null })
    useAgentStore.setState({
      mainAgent: {
        status: 'idle',
        uptimeSeconds: 0,
        tasksDispatched: 0,
        memoryMB: 0,
        model: '',
        currentDecision: '',
      },
      subAgents: [],
      decisionLog: [],
    })
    useActivityStore.setState({ events: [], notifications: [], unreadCount: 0 })
    useHistoryStore.setState({ entries: [] })
    useUIStore.setState({ chatMessages: [] } as Record<string, unknown>)

    mockWS = createMockWS()
    cleanup = initStoreSync(mockWS.ws)
  })

  // ------------------------------------------------------------------
  // Full sync
  // ------------------------------------------------------------------

  it('full_sync populates taskStore with tasks', () => {
    mockWS.emit('state:full_sync', {
      tasks: [
        { id: 't1', title: 'Task 1', status: 'queued', queueType: 'auto', priority: 'p2', progress: 0, createdAt: 1000 },
      ],
    })
    expect(useTaskStore.getState().tasks).toHaveLength(1)
    expect(useTaskStore.getState().tasks[0].title).toBe('Task 1')
  })

  it('full_sync populates historyStore with historyEntries (Bug#4)', () => {
    mockWS.emit('state:full_sync', {
      historyEntries: [
        { id: 'h1', title: 'Done Task', queueType: 'auto', status: 'done', duration: 120, completedAt: Date.now() },
        { id: 'h2', title: 'Failed Task', queueType: 'semi', status: 'failed', duration: 60, completedAt: Date.now() },
      ],
    })
    expect(useHistoryStore.getState().entries).toHaveLength(2)
    expect(useHistoryStore.getState().entries[0].title).toBe('Done Task')
  })

  it('full_sync with empty historyEntries sets empty array', () => {
    // Pre-fill with data
    useHistoryStore.setState({ entries: [{ id: 'old', title: 'Old', queueType: 'auto', status: 'done', duration: 0, completedAt: 0 }] })
    mockWS.emit('state:full_sync', { historyEntries: [] })
    expect(useHistoryStore.getState().entries).toHaveLength(0)
  })

  it('full_sync without historyEntries field does not clear existing entries', () => {
    useHistoryStore.setState({ entries: [{ id: 'old', title: 'Old', queueType: 'auto', status: 'done', duration: 0, completedAt: 0 }] })
    mockWS.emit('state:full_sync', { tasks: [] })
    expect(useHistoryStore.getState().entries).toHaveLength(1)
  })

  it('full_sync populates activityStore events and notifications', () => {
    mockWS.emit('state:full_sync', {
      events: [{ id: 'e1', timestamp: 1000, type: 'info', message: 'Hello' }],
      notifications: [
        { id: 'n1', timestamp: 1000, message: 'Notify', read: false, taskId: 't1' },
      ],
    })
    expect(useActivityStore.getState().events).toHaveLength(1)
    expect(useActivityStore.getState().notifications).toHaveLength(1)
    expect(useActivityStore.getState().unreadCount).toBe(1)
  })

  it('full_sync populates agentStore', () => {
    mockWS.emit('state:full_sync', {
      mainAgent: { status: 'active', uptimeSeconds: 100, model: 'claude' },
      subAgents: [{ id: 'sub-01', status: 'idle', progress: 0, completedCount: 0, runningMinutes: 0 }],
      decisions: [{ id: 'd1', timestamp: 1000, message: 'Decision 1' }],
    })
    expect(useAgentStore.getState().mainAgent.status).toBe('active')
    expect(useAgentStore.getState().subAgents).toHaveLength(1)
    expect(useAgentStore.getState().decisionLog).toHaveLength(1)
  })

  // ------------------------------------------------------------------
  // Incremental task events
  // ------------------------------------------------------------------

  it('task:created adds a new task', () => {
    mockWS.emit('task:created', {
      id: 'new-01', title: 'New Task', status: 'blocked', queueType: 'auto', priority: 'p2', progress: 0, createdAt: Date.now(),
    })
    expect(useTaskStore.getState().tasks).toHaveLength(1)
  })

  it('task:updated updates existing task', () => {
    useTaskStore.setState({
      tasks: [{ id: 't1', title: 'Old', status: 'queued', queueType: 'auto', priority: 'p2', progress: 0, createdAt: 1000 }],
    })
    mockWS.emit('task:updated', {
      id: 't1', title: 'Updated', status: 'running', queueType: 'auto', priority: 'p2', progress: 50, createdAt: 1000,
    })
    expect(useTaskStore.getState().tasks[0].title).toBe('Updated')
    expect(useTaskStore.getState().tasks[0].status).toBe('running')
  })

  it('task:updated adds task if it does not exist', () => {
    mockWS.emit('task:updated', {
      id: 'unknown', title: 'Ghost', status: 'queued', queueType: 'auto', priority: 'p2', progress: 0, createdAt: 1000,
    })
    expect(useTaskStore.getState().tasks).toHaveLength(1)
    expect(useTaskStore.getState().tasks[0].id).toBe('unknown')
  })

  it('task:deleted removes task from store', () => {
    useTaskStore.setState({
      tasks: [{ id: 't1', title: 'Gone', status: 'queued', queueType: 'auto', priority: 'p2', progress: 0, createdAt: 1000 }],
    })
    mockWS.emit('task:deleted', { id: 't1' })
    expect(useTaskStore.getState().tasks).toHaveLength(0)
  })

  // ------------------------------------------------------------------
  // Incremental history events
  // ------------------------------------------------------------------

  it('history:entry_added adds a history entry', () => {
    mockWS.emit('history:entry_added', {
      id: 'h-new', title: 'Completed Task', queueType: 'semi', status: 'done', duration: 300, completedAt: Date.now(),
    })
    expect(useHistoryStore.getState().entries).toHaveLength(1)
  })

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  it('cleanup removes all handlers', () => {
    cleanup()
    // After cleanup, emitting should have no effect
    mockWS.emit('task:created', {
      id: 'after-cleanup', title: 'Nope', status: 'queued', queueType: 'auto', priority: 'p2', progress: 0, createdAt: 1000,
    })
    expect(useTaskStore.getState().tasks).toHaveLength(0)
  })
})
