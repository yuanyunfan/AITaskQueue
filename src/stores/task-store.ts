import { create } from 'zustand'
import type { Task, QueueType } from '@/types'

interface TaskState {
  tasks: Task[]
  selectedTaskId: string | null

  // Actions
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void
  setSelectedTask: (id: string | null) => void
  reorderInQueue: (queueType: QueueType, taskIds: string[]) => void

  // Selectors
  getTasksByQueue: (type: QueueType) => Task[]
  getRunningTasks: () => Task[]
  getQueuedTasks: () => Task[]
  getStatusCounts: () => { running: number; queued: number; failed: number; done24h: number }
  getTaskById: (id: string) => Task | undefined
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTaskId: null,

  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),

  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  removeTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
    })),

  setSelectedTask: (id) => set({ selectedTaskId: id }),

  reorderInQueue: (queueType, taskIds) =>
    set((s) => {
      const queueTasks = s.tasks.filter((t) => t.queueType === queueType)
      const otherTasks = s.tasks.filter((t) => t.queueType !== queueType)
      const reordered = taskIds
        .map((id) => queueTasks.find((t) => t.id === id))
        .filter(Boolean) as Task[]
      return { tasks: [...otherTasks, ...reordered] }
    }),

  getTasksByQueue: (type) => get().tasks.filter((t) => t.queueType === type && t.status !== 'done'),
  getRunningTasks: () => get().tasks.filter((t) => t.status === 'running'),
  getQueuedTasks: () => get().tasks.filter((t) => t.status === 'queued'),
  getStatusCounts: () => {
    const tasks = get().tasks
    const now = Date.now()
    const h24 = 24 * 60 * 60 * 1000
    return {
      running: tasks.filter((t) => t.status === 'running').length,
      queued: tasks.filter((t) => t.status === 'queued').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      done24h: tasks.filter((t) => t.status === 'done' && t.completedAt && now - t.completedAt < h24).length,
    }
  },
  getTaskById: (id) => get().tasks.find((t) => t.id === id),
}))
