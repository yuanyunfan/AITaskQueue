import { describe, it, expect, beforeEach } from 'vitest'
import { useHistoryStore } from '@/stores/history-store'
import type { HistoryEntry } from '@/stores/history-store'
import type { Task } from '@/types'

const now = Date.now()

const makeEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'h-1',
  title: 'Test Task',
  queueType: 'auto',
  status: 'done',
  duration: 120,
  completedAt: now,
  ...overrides,
})

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Task from store',
  status: 'done',
  queueType: 'semi',
  priority: 'p1',
  progress: 100,
  createdAt: now - 300_000,
  startedAt: now - 120_000,
  completedAt: now,
  result: 'All good',
  ...overrides,
})

describe('historyStore', () => {
  beforeEach(() => {
    useHistoryStore.setState({
      entries: [],
      filters: { timeRange: 'today', queueType: 'all', status: 'all' },
    })
  })

  // --- addEntry ---

  it('adds an entry', () => {
    useHistoryStore.getState().addEntry(makeEntry())
    expect(useHistoryStore.getState().entries).toHaveLength(1)
  })

  it('prepends new entries (newest first)', () => {
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h1' }))
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h2' }))
    expect(useHistoryStore.getState().entries[0].id).toBe('h2')
  })

  // --- addFromTask ---

  it('converts a completed task to a history entry', () => {
    useHistoryStore.getState().addFromTask(makeTask())
    const entry = useHistoryStore.getState().entries[0]
    expect(entry.id).toBe('task-1')
    expect(entry.title).toBe('Task from store')
    expect(entry.queueType).toBe('semi')
    expect(entry.status).toBe('done')
    expect(entry.duration).toBe(120) // (completedAt - startedAt) / 1000
    expect(entry.note).toBe('All good')
  })

  it('converts a failed task correctly', () => {
    useHistoryStore.getState().addFromTask(makeTask({ status: 'failed' }))
    expect(useHistoryStore.getState().entries[0].status).toBe('failed')
  })

  it('handles task with no startedAt/completedAt (duration=0)', () => {
    useHistoryStore.getState().addFromTask(
      makeTask({ startedAt: undefined, completedAt: undefined })
    )
    expect(useHistoryStore.getState().entries[0].duration).toBe(0)
  })

  // --- setFilter ---

  it('sets a single filter', () => {
    useHistoryStore.getState().setFilter('queueType', 'human')
    expect(useHistoryStore.getState().filters.queueType).toBe('human')
    expect(useHistoryStore.getState().filters.timeRange).toBe('today') // others unchanged
  })

  // --- getFilteredEntries ---

  it('filters by queueType', () => {
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h1', queueType: 'auto' }))
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h2', queueType: 'human' }))
    useHistoryStore.getState().setFilter('queueType', 'auto')
    expect(useHistoryStore.getState().getFilteredEntries()).toHaveLength(1)
    expect(useHistoryStore.getState().getFilteredEntries()[0].id).toBe('h1')
  })

  it('filters by status', () => {
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h1', status: 'done' }))
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h2', status: 'failed' }))
    useHistoryStore.getState().setFilter('status', 'failed')
    expect(useHistoryStore.getState().getFilteredEntries()).toHaveLength(1)
    expect(useHistoryStore.getState().getFilteredEntries()[0].id).toBe('h2')
  })

  it('filters by timeRange — excludes old entries', () => {
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000 - 1000
    useHistoryStore.getState().addEntry(makeEntry({ id: 'recent', completedAt: now }))
    useHistoryStore.getState().addEntry(makeEntry({ id: 'old', completedAt: twoDaysAgo }))
    useHistoryStore.getState().setFilter('timeRange', 'today')
    expect(useHistoryStore.getState().getFilteredEntries()).toHaveLength(1)
    expect(useHistoryStore.getState().getFilteredEntries()[0].id).toBe('recent')
  })

  it('returns all when filters are "all"', () => {
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h1', queueType: 'auto', status: 'done' }))
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h2', queueType: 'human', status: 'failed' }))
    const result = useHistoryStore.getState().getFilteredEntries()
    expect(result).toHaveLength(2)
  })

  // --- getStats ---

  it('computes stats correctly', () => {
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h1', status: 'done', duration: 100 }))
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h2', status: 'done', duration: 200 }))
    useHistoryStore.getState().addEntry(makeEntry({ id: 'h3', status: 'failed', duration: 60 }))
    const stats = useHistoryStore.getState().getStats()
    expect(stats.total).toBe(3)
    expect(stats.successRate).toBe(66.7) // 2/3 * 100, rounded to 1 decimal
    expect(stats.avgDuration).toBe(120) // (100+200+60)/3
    expect(stats.failedCount).toBe(1)
  })

  it('returns zero stats when no entries', () => {
    const stats = useHistoryStore.getState().getStats()
    expect(stats.total).toBe(0)
    expect(stats.successRate).toBe(0)
    expect(stats.avgDuration).toBe(0)
    expect(stats.failedCount).toBe(0)
  })
})
