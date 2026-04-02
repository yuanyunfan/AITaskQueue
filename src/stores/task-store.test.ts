import { describe, it, expect, beforeEach } from 'vitest'
import { useTaskStore } from '@/stores/task-store'
import type { Task } from '@/types'

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'test-1',
  title: 'Test Task',
  status: 'queued',
  queueType: 'auto',
  priority: 'p2',
  progress: 0,
  createdAt: Date.now(),
  ...overrides,
})

describe('taskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], selectedTaskId: null })
  })

  it('adds a task', () => {
    const task = makeTask()
    useTaskStore.getState().addTask(task)
    expect(useTaskStore.getState().tasks).toHaveLength(1)
    expect(useTaskStore.getState().tasks[0].id).toBe('test-1')
  })

  it('updates a task', () => {
    useTaskStore.getState().addTask(makeTask())
    useTaskStore.getState().updateTask('test-1', { status: 'running', progress: 50 })
    const task = useTaskStore.getState().getTaskById('test-1')
    expect(task?.status).toBe('running')
    expect(task?.progress).toBe(50)
  })

  it('removes a task', () => {
    useTaskStore.getState().addTask(makeTask())
    useTaskStore.getState().removeTask('test-1')
    expect(useTaskStore.getState().tasks).toHaveLength(0)
  })

  it('clears selectedTaskId when removing selected task', () => {
    useTaskStore.getState().addTask(makeTask())
    useTaskStore.getState().setSelectedTask('test-1')
    useTaskStore.getState().removeTask('test-1')
    expect(useTaskStore.getState().selectedTaskId).toBeNull()
  })

  it('filters tasks by queue type', () => {
    useTaskStore.getState().addTask(makeTask({ id: 'a1', queueType: 'auto' }))
    useTaskStore.getState().addTask(makeTask({ id: 's1', queueType: 'semi' }))
    useTaskStore.getState().addTask(makeTask({ id: 'a2', queueType: 'auto' }))
    expect(useTaskStore.getState().getTasksByQueue('auto')).toHaveLength(2)
    expect(useTaskStore.getState().getTasksByQueue('semi')).toHaveLength(1)
  })

  it('excludes done tasks from queue filter', () => {
    useTaskStore.getState().addTask(makeTask({ id: 'a1', queueType: 'auto', status: 'done' }))
    useTaskStore.getState().addTask(makeTask({ id: 'a2', queueType: 'auto', status: 'queued' }))
    expect(useTaskStore.getState().getTasksByQueue('auto')).toHaveLength(1)
  })

  it('counts status correctly', () => {
    useTaskStore.getState().addTask(makeTask({ id: '1', status: 'running' }))
    useTaskStore.getState().addTask(makeTask({ id: '2', status: 'running' }))
    useTaskStore.getState().addTask(makeTask({ id: '3', status: 'queued' }))
    useTaskStore.getState().addTask(makeTask({ id: '4', status: 'failed' }))
    useTaskStore.getState().addTask(makeTask({ id: '5', status: 'done', completedAt: Date.now() }))

    const counts = useTaskStore.getState().getStatusCounts()
    expect(counts.running).toBe(2)
    expect(counts.queued).toBe(1)
    expect(counts.failed).toBe(1)
    expect(counts.done24h).toBe(1)
  })
})
