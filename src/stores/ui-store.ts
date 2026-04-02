import { create } from 'zustand'
import type { ChatMessage } from '@/types'

interface UIState {
  isDrawerOpen: boolean
  isModalOpen: boolean
  isChatOpen: boolean
  chatMessages: ChatMessage[]

  openDrawer: () => void
  closeDrawer: () => void
  openModal: () => void
  closeModal: () => void
  toggleChat: () => void
  addChatMessage: (message: ChatMessage) => void
}

export const useUIStore = create<UIState>((set) => ({
  isDrawerOpen: false,
  isModalOpen: false,
  isChatOpen: false,
  chatMessages: [],

  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
  toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),
  addChatMessage: (message) =>
    set((s) => ({ chatMessages: [...s.chatMessages, message] })),
}))
