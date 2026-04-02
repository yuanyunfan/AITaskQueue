import { describe, it, expect, beforeEach } from 'vitest'
import { useActivityStore } from '@/stores/activity-store'
import type { ActivityEvent, Notification } from '@/types'

const makeEvent = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id: 'evt-1',
  timestamp: Date.now(),
  type: 'info',
  message: 'Test event',
  ...overrides,
})

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'notif-1',
  timestamp: Date.now(),
  message: 'Test notification',
  read: false,
  ...overrides,
})

describe('activityStore', () => {
  beforeEach(() => {
    useActivityStore.setState({
      events: [],
      notifications: [],
      unreadCount: 0,
    })
  })

  // --- events ---

  it('adds an event', () => {
    useActivityStore.getState().addEvent(makeEvent())
    expect(useActivityStore.getState().events).toHaveLength(1)
  })

  it('prepends new events (newest first)', () => {
    useActivityStore.getState().addEvent(makeEvent({ id: 'e1', message: 'first' }))
    useActivityStore.getState().addEvent(makeEvent({ id: 'e2', message: 'second' }))
    expect(useActivityStore.getState().events[0].id).toBe('e2')
  })

  it('caps events at 50', () => {
    for (let i = 0; i < 55; i++) {
      useActivityStore.getState().addEvent(makeEvent({ id: `e-${i}` }))
    }
    expect(useActivityStore.getState().events).toHaveLength(50)
    expect(useActivityStore.getState().events[0].id).toBe('e-54')
  })

  // --- notifications ---

  it('adds a notification and increments unreadCount', () => {
    useActivityStore.getState().addNotification(makeNotification())
    expect(useActivityStore.getState().notifications).toHaveLength(1)
    expect(useActivityStore.getState().unreadCount).toBe(1)
  })

  it('increments unreadCount for each notification', () => {
    useActivityStore.getState().addNotification(makeNotification({ id: 'n1' }))
    useActivityStore.getState().addNotification(makeNotification({ id: 'n2' }))
    useActivityStore.getState().addNotification(makeNotification({ id: 'n3' }))
    expect(useActivityStore.getState().unreadCount).toBe(3)
  })

  it('caps notifications at 20', () => {
    for (let i = 0; i < 25; i++) {
      useActivityStore.getState().addNotification(makeNotification({ id: `n-${i}` }))
    }
    expect(useActivityStore.getState().notifications).toHaveLength(20)
    expect(useActivityStore.getState().unreadCount).toBe(25) // count keeps incrementing
  })

  // --- markAllRead ---

  it('marks all notifications as read and resets unreadCount', () => {
    useActivityStore.getState().addNotification(makeNotification({ id: 'n1' }))
    useActivityStore.getState().addNotification(makeNotification({ id: 'n2' }))
    expect(useActivityStore.getState().unreadCount).toBe(2)

    useActivityStore.getState().markAllRead()
    expect(useActivityStore.getState().unreadCount).toBe(0)
    expect(useActivityStore.getState().notifications.every((n) => n.read)).toBe(true)
  })

  it('markAllRead on empty notifications does not throw', () => {
    useActivityStore.getState().markAllRead()
    expect(useActivityStore.getState().unreadCount).toBe(0)
    expect(useActivityStore.getState().notifications).toHaveLength(0)
  })
})
