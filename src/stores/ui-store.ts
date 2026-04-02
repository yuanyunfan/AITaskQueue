import { create } from 'zustand'
import type { ChatMessage } from '@/types'

type Theme = 'light' | 'dark'

interface UIState {
  isDrawerOpen: boolean
  isModalOpen: boolean
  isChatOpen: boolean
  chatMessages: ChatMessage[]
  theme: Theme

  /** Agent log panel state */
  isLogPanelOpen: boolean
  logPanelAgentId: string | null
  logPanelTaskId: string | null

  openDrawer: () => void
  closeDrawer: () => void
  openModal: () => void
  closeModal: () => void
  toggleChat: () => void
  addChatMessage: (message: ChatMessage) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void

  /** Open the agent log panel for a specific agent */
  openLogPanel: (agentId: string, taskId?: string) => void
  closeLogPanel: () => void
}

/** Apply dark/light class to <html> without transition (used on init) */
const syncThemeToDOM = (theme: Theme) => {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (theme === 'light') {
    html.classList.remove('dark')
  } else {
    html.classList.add('dark')
  }
}

/** Apply theme with smooth transition + persist to localStorage */
const applyTheme = (theme: Theme) => {
  if (typeof document === 'undefined') return
  const html = document.documentElement

  // Enable transition for user-initiated theme switch
  html.classList.add('theme-transitioning')
  syncThemeToDOM(theme)
  localStorage.setItem('theme', theme)

  // Remove transitioning class after animation completes
  setTimeout(() => html.classList.remove('theme-transitioning'), 300)
}

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark'

  let theme: Theme = 'dark'

  // Check localStorage first
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') {
    theme = stored
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    // Check system preference
    theme = 'light'
  }

  // Sync HTML class immediately (no transition on initial load)
  syncThemeToDOM(theme)
  return theme
}

export const useUIStore = create<UIState>((set) => ({
  isDrawerOpen: false,
  isModalOpen: false,
  isChatOpen: false,
  chatMessages: [],
  theme: getInitialTheme(),
  isLogPanelOpen: false,
  logPanelAgentId: null,
  logPanelTaskId: null,

  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
  toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),
  addChatMessage: (message) =>
    set((s) => ({ chatMessages: [...s.chatMessages, message] })),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => set((s) => {
    const newTheme = s.theme === 'dark' ? 'light' : 'dark'
    applyTheme(newTheme)
    return { theme: newTheme }
  }),

  openLogPanel: (agentId, taskId) =>
    set({ isLogPanelOpen: true, logPanelAgentId: agentId, logPanelTaskId: taskId ?? null }),
  closeLogPanel: () =>
    set({ isLogPanelOpen: false, logPanelAgentId: null, logPanelTaskId: null }),
}))
