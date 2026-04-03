import { useEffect, useRef, useMemo, useCallback } from 'react'
import { X, Terminal, ArrowDown } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useAgentLogStore } from '@/stores/agent-log-store'
import { useAgentStore } from '@/stores/agent-store'
import { fetchAgentLogs } from '@/lib/api'
import { formatTime } from '@/lib/utils'
import type { AgentLog } from '@/types'

const EVENT_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  tool_use: { icon: '🔧', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  text:     { icon: '💬', color: 'text-text-secondary', bg: 'bg-bg-primary' },
  result:   { icon: '✅', color: 'text-status-done', bg: 'bg-status-done/10' },
  error:    { icon: '❌', color: 'text-status-failed', bg: 'bg-status-failed/10' },
  progress: { icon: '📊', color: 'text-text-muted', bg: 'bg-bg-primary' },
}

const EMPTY_LOGS: AgentLog[] = []

function LogEntry({ log }: { log: AgentLog }) {
  const config = EVENT_CONFIG[log.eventType] || EVENT_CONFIG.progress

  return (
    <div className={`px-3 py-1.5 font-mono text-xs ${config.bg} border-b border-border-default/30`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 select-none">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${config.color}`}>
              {log.eventType === 'tool_use' && log.toolName
                ? log.toolName
                : log.eventType.toUpperCase()}
            </span>
            {log.progressPct > 0 && log.eventType !== 'result' && (
              <span className="text-text-muted">{log.progressPct}%</span>
            )}
            {log.costUsd != null && log.costUsd > 0 && (
              <span className="text-text-muted">${log.costUsd.toFixed(4)}</span>
            )}
            <span className="ml-auto text-text-muted shrink-0">
              {formatTime(log.timestamp)}
            </span>
          </div>
          {log.message && (
            <p className="text-text-secondary mt-0.5 break-words whitespace-pre-wrap leading-relaxed">
              {log.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function AgentLogPanel() {
  const isOpen = useUIStore((s) => s.isLogPanelOpen)
  const agentId = useUIStore((s) => s.logPanelAgentId)
  const taskId = useUIStore((s) => s.logPanelTaskId)
  const closeLogPanel = useUIStore((s) => s.closeLogPanel)

  const agent = useAgentStore((s) =>
    agentId ? s.subAgents.find((a) => a.id === agentId) : undefined,
  )

  // Subscribe to the raw array reference (stable — no filter in selector)
  const allLogs = useAgentLogStore((s) =>
    agentId ? (s.logsByAgent[agentId] ?? EMPTY_LOGS) : EMPTY_LOGS,
  )

  // Derive filtered logs outside the selector to avoid new-array-per-render
  const logs = useMemo(() => {
    if (!taskId) return allLogs
    return allLogs.filter((l) => l.taskId === taskId)
  }, [allLogs, taskId])

  const isLive = (import.meta.env.VITE_BACKEND_MODE || 'mock') === 'live'

  // REST fallback: fetch logs from API when panel opens and store is empty
  const fetchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isOpen || !agentId || !isLive) return
    // Only fetch once per panel open (keyed by agentId)
    if (fetchedRef.current === agentId) return
    if (allLogs.length > 0) return

    fetchedRef.current = agentId
    fetchAgentLogs(agentId, taskId ?? undefined)
      .then((data) => {
        const typedLogs = data as unknown as AgentLog[]
        if (typedLogs.length > 0) {
          // Merge fetched logs into store
          for (const log of typedLogs) {
            useAgentLogStore.getState().addLog(log)
          }
        }
      })
      .catch((err) => console.error('Failed to fetch agent logs:', err))
  }, [isOpen, agentId, taskId, isLive, allLogs.length])

  // Reset fetchedRef when panel closes
  const closeAndReset = useCallback(() => {
    fetchedRef.current = null
    closeLogPanel()
  }, [closeLogPanel])

  const scrollRef = useRef<HTMLDivElement>(null)
  const isAutoScroll = useRef(true)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isAutoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs.length])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    isAutoScroll.current = scrollHeight - scrollTop - clientHeight < 40
  }

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      isAutoScroll.current = true
    }
  }

  if (!isOpen || !agentId) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={closeAndReset} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[520px] bg-bg-card border-l border-border-default z-50 animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold">Agent 执行日志</h2>
            <span className="text-xs text-text-muted bg-bg-primary px-1.5 py-0.5 rounded">
              {agentId}
            </span>
            {agent?.currentTaskTitle && (
              <span className="text-xs text-text-secondary truncate max-w-[180px]">
                — {agent.currentTaskTitle}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-muted">{logs.length} 条</span>
            <button
              onClick={closeAndReset}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Log content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-bg-primary"
        >
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <Terminal className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">暂无执行日志</p>
              <p className="text-xs mt-1">Agent 开始执行任务后，日志将实时显示</p>
            </div>
          ) : (
            logs.map((log) => <LogEntry key={log.id} log={log} />)
          )}
        </div>

        {/* Footer — scroll-to-bottom button */}
        {logs.length > 10 && (
          <div className="shrink-0 border-t border-border-default px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              {agent?.status === 'active' && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-running animate-pulse-dot" />
                  执行中
                </span>
              )}
            </div>
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <ArrowDown className="w-3 h-3" />
              滚动到底部
            </button>
          </div>
        )}
      </div>
    </>
  )
}
