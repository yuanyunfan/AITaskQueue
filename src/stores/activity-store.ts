import { create } from 'zustand'
import type { ActivityEvent, Notification } from '@/types'

interface ActivityState {
  events: ActivityEvent[]
  notifications: Notification[]
  unreadCount: number

  addEvent: (event: ActivityEvent) => void
  addNotification: (notification: Notification) => void
  markAllRead: () => void
}

export const useActivityStore = create<ActivityState>((set) => ({
  events: [],
  notifications: [],
  unreadCount: 0,

  addEvent: (event) =>
    set((s) => ({ events: [event, ...s.events].slice(0, 50) })),

  addNotification: (notification) =>
    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, 20),
      unreadCount: s.unreadCount + 1,
    })),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
}))
