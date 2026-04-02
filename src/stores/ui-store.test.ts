import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
    // Reset localStorage
    localStorage.clear()
    
    // Reset document class
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('dark')
    
    useUIStore.setState({
      isDrawerOpen: false,
      isModalOpen: false,
      isChatOpen: false,
      chatMessages: [],
      theme: 'dark',
    })
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
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

  // --- theme ---

  describe('theme management', () => {
    it('defaults to dark theme', () => {
      expect(useUIStore.getState().theme).toBe('dark')
    })

    it('sets theme to light', () => {
      useUIStore.getState().setTheme('light')
      expect(useUIStore.getState().theme).toBe('light')
    })

    it('sets theme to dark', () => {
      useUIStore.getState().setTheme('dark')
      expect(useUIStore.getState().theme).toBe('dark')
    })

    it('applies dark class to html element when setting dark theme', () => {
      document.documentElement.classList.remove('dark')
      useUIStore.getState().setTheme('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('removes dark class from html element when setting light theme', () => {
      document.documentElement.classList.add('dark')
      useUIStore.getState().setTheme('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('persists theme to localStorage', () => {
      useUIStore.getState().setTheme('light')
      expect(localStorage.getItem('theme')).toBe('light')
      
      useUIStore.getState().setTheme('dark')
      expect(localStorage.getItem('theme')).toBe('dark')
    })

    it('toggles theme between dark and light', () => {
      useUIStore.getState().setTheme('dark')
      useUIStore.getState().toggleTheme()
      expect(useUIStore.getState().theme).toBe('light')
      
      useUIStore.getState().toggleTheme()
      expect(useUIStore.getState().theme).toBe('dark')
    })

    it('applies correct html class when toggling theme', () => {
      useUIStore.getState().setTheme('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      
      useUIStore.getState().toggleTheme()
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      
      useUIStore.getState().toggleTheme()
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('persists toggled theme to localStorage', () => {
      useUIStore.getState().setTheme('dark')
      useUIStore.getState().toggleTheme()
      expect(localStorage.getItem('theme')).toBe('light')
    })
  })
})
