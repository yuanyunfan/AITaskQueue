import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useTaskStore } from '@/stores/task-store'
import { useUIStore } from '@/stores/ui-store'
import { useAgentStore } from '@/stores/agent-store'
import { TaskDrawer } from './TaskDrawer'
import { MockSimulator } from '@/mock/simulator'
import type { Task } from '@/types'

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'edit-test-1',
  title: 'Original Title',
  description: 'Original Desc',
  status: 'queued',
  queueType: 'auto',
  priority: 'p2',
  progress: 0,
  createdAt: Date.now(),
  ...overrides,
})

describe('TaskDrawer edit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useTaskStore.setState({ tasks: [], selectedTaskId: null })
    useUIStore.setState({ isDrawerOpen: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves title and status changes to the store', () => {
    // Setup: add task, select it, open drawer
    const task = makeTask()
    useTaskStore.getState().addTask(task)
    useTaskStore.getState().setSelectedTask('edit-test-1')
    useUIStore.getState().openDrawer()

    render(<TaskDrawer />)

    // Verify task detail is displayed
    expect(screen.getByText('Original Title')).toBeDefined()

    // Click edit button
    const editBtn = screen.getByTitle('编辑')
    fireEvent.click(editBtn)

    // Change title
    const titleInput = screen.getByDisplayValue('Original Title')
    fireEvent.change(titleInput, { target: { value: 'New Title' } })

    // Click save button
    const saveBtn = screen.getByText('保存')
    fireEvent.click(saveBtn)

    // Verify store was updated
    const updated = useTaskStore.getState().getTaskById('edit-test-1')
    expect(updated?.title).toBe('New Title')
  })

  it('saves status change to the store', () => {
    const task = makeTask({ status: 'queued' })
    useTaskStore.getState().addTask(task)
    useTaskStore.getState().setSelectedTask('edit-test-1')
    useUIStore.getState().openDrawer()

    render(<TaskDrawer />)

    // Click edit button
    const editBtn = screen.getByTitle('编辑')
    fireEvent.click(editBtn)

    // Click "Blocked" status button
    const blockedBtn = screen.getByText('Blocked')
    fireEvent.click(blockedBtn)

    // Click save
    const saveBtn = screen.getByText('保存')
    fireEvent.click(saveBtn)

    // Verify store was updated
    const updated = useTaskStore.getState().getTaskById('edit-test-1')
    expect(updated?.status).toBe('blocked')
  })

  it('edit survives simulator ticks without being overwritten', () => {
    // Setup: running task (simulator will try to update its progress)
    const task = makeTask({ id: 'sim-test-1', status: 'running', progress: 30 })
    useTaskStore.getState().addTask(task)
    useTaskStore.getState().setSelectedTask('sim-test-1')
    useUIStore.getState().openDrawer()

    // Add a sub-agent so simulator dispatch works
    useAgentStore.getState().addSubAgent({
      id: 'sub-01',
      status: 'active',
      currentTaskId: 'sim-test-1',
      currentTaskTitle: 'Original Title',
      progress: 30,
      completedCount: 0,
      runningMinutes: 0,
    })

    const simulator = new MockSimulator()
    simulator.start()

    render(<TaskDrawer />)

    // Click edit button
    const editBtn = screen.getByTitle('编辑')
    fireEvent.click(editBtn)

    // Change title
    const titleInput = screen.getByDisplayValue('Original Title')
    fireEvent.change(titleInput, { target: { value: 'User Edited Title' } })

    // Click save
    const saveBtn = screen.getByText('保存')
    fireEvent.click(saveBtn)

    // Verify immediately after save
    let updated = useTaskStore.getState().getTaskById('sim-test-1')
    expect(updated?.title).toBe('User Edited Title')

    // Advance timers: 2s (progress tick) + 5s (completion check) + 8s (dispatch)
    act(() => {
      vi.advanceTimersByTime(10000)
    })

    // Check again — title should STILL be the user's edit
    updated = useTaskStore.getState().getTaskById('sim-test-1')
    expect(updated?.title).toBe('User Edited Title')

    simulator.stop()
  })
})
