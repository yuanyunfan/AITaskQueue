import { create } from 'zustand'
import type { Task, QueueType } from '@/types'

export interface HistoryEntry {
  id: string
  title: string
  queueType: QueueType
  status: 'done' | 'failed'
  duration: number // seconds
  completedAt: number
  note?: string
}

interface HistoryFilters {
  timeRange: 'today' | 'yesterday' | 'week' | 'month'
  queueType: QueueType | 'all'
  status: 'all' | 'done' | 'failed'
}

interface HistoryState {
  entries: HistoryEntry[]
  filters: HistoryFilters

  addEntry: (entry: HistoryEntry) => void
  addFromTask: (task: Task) => void
  setFilter: (key: keyof HistoryFilters, value: string) => void
  getFilteredEntries: () => HistoryEntry[]
  getStats: () => { total: number; successRate: number; avgDuration: number; failedCount: number }
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  filters: { timeRange: 'today', queueType: 'all', status: 'all' },

  addEntry: (entry) =>
    set((s) => ({ entries: [entry, ...s.entries] })),

  addFromTask: (task) => {
    const entry: HistoryEntry = {
      id: task.id,
      title: task.title,
      queueType: task.queueType,
      status: task.status === 'failed' ? 'failed' : 'done',
      duration: task.completedAt && task.startedAt
        ? Math.round((task.completedAt - task.startedAt) / 1000)
        : 0,
      completedAt: task.completedAt || Date.now(),
      note: task.result,
    }
    set((s) => ({ entries: [entry, ...s.entries] }))
  },

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  getFilteredEntries: () => {
    const { entries, filters } = get()
    const now = Date.now()
    const ranges: Record<string, number> = {
      today: 24 * 60 * 60 * 1000,
      yesterday: 48 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    }
    return entries.filter((e) => {
      if (now - e.completedAt > ranges[filters.timeRange]) return false
      if (filters.queueType !== 'all' && e.queueType !== filters.queueType) return false
      if (filters.status !== 'all' && e.status !== filters.status) return false
      return true
    })
  },

  getStats: () => {
    const entries = get().getFilteredEntries()
    const total = entries.length
    const done = entries.filter((e) => e.status === 'done').length
    const failedCount = entries.filter((e) => e.status === 'failed').length
    const avgDuration = total > 0
      ? Math.round(entries.reduce((sum, e) => sum + e.duration, 0) / total)
      : 0
    return {
      total,
      successRate: total > 0 ? Math.round((done / total) * 1000) / 10 : 0,
      avgDuration,
      failedCount,
    }
  },
}))
