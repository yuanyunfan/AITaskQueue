import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { generateId } from '@/lib/utils'

export function ChatPanel() {
  const isChatOpen = useUIStore((s) => s.isChatOpen)
  const toggleChat = useUIStore((s) => s.toggleChat)
  const chatMessages = useUIStore((s) => s.chatMessages)
  const addChatMessage = useUIStore((s) => s.addChatMessage)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSend = () => {
    if (!input.trim()) return
    addChatMessage({
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    })
    setInput('')

    // Simulate agent response
    setTimeout(() => {
      addChatMessage({
        id: generateId(),
        role: 'assistant',
        content: '收到你的消息。我正在处理当前的任务队列，有 3 个任务在运行中，2 个在等待分配。需要我调整优先级吗？',
        timestamp: Date.now(),
      })
    }, 1000)
  }

  if (!isChatOpen) {
    return (
      <button
        onClick={toggleChat}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-accent hover:bg-blue-600 flex items-center justify-center shadow-lg z-40 transition-colors"
      >
        <MessageCircle className="w-5 h-5 text-white" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-bg-card border border-border-default rounded-2xl shadow-2xl z-40 flex flex-col animate-slide-in-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <div>
            <span className="text-sm font-medium">Main Agent</span>
            <span className="flex items-center gap-1 text-xs text-status-running">
              <span className="w-1.5 h-1.5 rounded-full bg-status-running animate-pulse-dot" />Online
            </span>
          </div>
        </div>
        <button onClick={toggleChat} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center text-text-muted text-sm py-8">
            <p>👋 你好！我是任务编排 Agent。</p>
            <p className="mt-1">可以问我关于当前任务队列的任何问题。</p>
          </div>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
              msg.role === 'user'
                ? 'bg-accent text-white'
                : 'bg-bg-primary text-text-primary'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border-default">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            className="flex-1 bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
          />
          <button
            onClick={handleSend}
            className="w-9 h-9 rounded-lg bg-accent hover:bg-blue-600 flex items-center justify-center transition-colors"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}
