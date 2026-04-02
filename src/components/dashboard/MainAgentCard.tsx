import { useAgentStore } from '@/stores/agent-store'
import { formatDuration } from '@/lib/utils'

export function MainAgentCard() {
  const mainAgent = useAgentStore((s) => s.mainAgent)
  const subAgents = useAgentStore((s) => s.subAgents)
  const activeCount = subAgents.filter((a) => a.status === 'active').length

  return (
    <div className="col-span-2 bg-bg-card rounded-xl p-5 border border-border-default">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <span className="text-lg">🧠</span>
          </div>
          <div>
            <h3 className="font-medium text-sm">Main Agent · Orchestrator</h3>
            <span className="text-text-muted text-xs">Uptime: {formatDuration(mainAgent.uptimeSeconds)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-status-running animate-pulse-dot" />
          <span className="text-status-running text-sm font-medium">Active</span>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-text-secondary">
          <span>Tasks dispatched</span>
          <span className="text-text-primary">{mainAgent.tasksDispatched}</span>
        </div>
        <div className="flex justify-between text-text-secondary">
          <span>Active sub-agents</span>
          <span className="text-text-primary">{activeCount}</span>
        </div>
        <div className="flex justify-between text-text-secondary">
          <span>Current decision</span>
          <span className="text-text-primary">{mainAgent.currentDecision}</span>
        </div>
      </div>
    </div>
  )
}
