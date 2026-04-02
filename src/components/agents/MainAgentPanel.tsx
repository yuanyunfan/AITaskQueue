import { useAgentStore } from '@/stores/agent-store'
import { formatDuration, formatTime } from '@/lib/utils'

export function MainAgentPanel() {
  const mainAgent = useAgentStore((s) => s.mainAgent)
  const decisionLog = useAgentStore((s) => s.decisionLog)

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-xl">🧠</div>
          <div>
            <h3 className="font-medium">Main Agent <span className="text-text-muted text-sm font-normal">· Orchestrator</span></h3>
            <div className="flex items-center gap-4 text-text-muted text-xs mt-0.5">
              <span>Uptime: {formatDuration(mainAgent.uptimeSeconds)}</span>
              <span>Memory: {mainAgent.memoryMB}MB</span>
              <span>Model: {mainAgent.model}</span>
            </div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-running/20 text-status-running text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-status-running animate-pulse-dot" />Active
        </span>
      </div>
      <div className="bg-bg-primary rounded-lg p-4">
        <h4 className="text-xs font-medium text-text-muted mb-3 uppercase tracking-wider">Decision Log</h4>
        <div className="space-y-2 text-sm max-h-40 overflow-y-auto">
          {decisionLog.map((entry) => (
            <div key={entry.id} className="flex gap-3">
              <span className="text-text-muted text-xs whitespace-nowrap">{formatTime(entry.timestamp)}</span>
              <span>{entry.message}</span>
            </div>
          ))}
          {decisionLog.length === 0 && (
            <div className="text-text-muted text-center py-2">暂无决策记录</div>
          )}
        </div>
      </div>
    </div>
  )
}
