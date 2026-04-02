import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '@/stores/ui-store'
import type { ChatMessage } from '@/types'

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  role: 'user',
  content: 'Hello',
  timestamp: Date.now(),
  ...overrides,
})

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      isDrawerOpen: false,
      isModalOpen: false,
      isChatOpen: false,
      chatMessages: [],
    })
  })

  // --- drawer ---

  it('opens drawer', () => {
    useUIStore.getState().openDrawer()
    expect(useUIStore.getState().isDrawerOpen).toBe(true)
  })

  it('closes drawer', () => {
    useUIStore.getState().openDrawer()
    useUIStore.getState().closeDrawer()
    expect(useUIStore.getState().isDrawerOpen).toBe(false)
  })

  // --- modal ---

  it('opens modal', () => {
    useUIStore.getState().openModal()
    expect(useUIStore.getState().isModalOpen).toBe(true)
  })

  it('closes modal', () => {
    useUIStore.getState().openModal()
    useUIStore.getState().closeModal()
    expect(useUIStore.getState().isModalOpen).toBe(false)
  })

  // --- chat ---

  it('toggles chat open/closed', () => {
    expect(useUIStore.getState().isChatOpen).toBe(false)
    useUIStore.getState().toggleChat()
    expect(useUIStore.getState().isChatOpen).toBe(true)
    useUIStore.getState().toggleChat()
    expect(useUIStore.getState().isChatOpen).toBe(false)
  })

  // --- chatMessages ---

  it('adds a chat message', () => {
    useUIStore.getState().addChatMessage(makeMessage())
    expect(useUIStore.getState().chatMessages).toHaveLength(1)
    expect(useUIStore.getState().chatMessages[0].content).toBe('Hello')
  })

  it('appends messages in order', () => {
    useUIStore.getState().addChatMessage(makeMessage({ id: 'm1', content: 'first' }))
    useUIStore.getState().addChatMessage(makeMessage({ id: 'm2', content: 'second' }))
    const msgs = useUIStore.getState().chatMessages
    expect(msgs).toHaveLength(2)
    expect(msgs[0].content).toBe('first')
    expect(msgs[1].content).toBe('second')
  })
})
