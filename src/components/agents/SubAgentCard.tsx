import type { SubAgent } from '@/types'
import { ProgressBar } from '@/components/shared/ProgressBar'

interface SubAgentCardProps {
  agent: SubAgent
}

export function SubAgentCard({ agent }: SubAgentCardProps) {
  const isActive = agent.status === 'active'

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-4 hover:border-[#475569] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isActive ? 'bg-status-running/20' : 'bg-status-queued/20'}`}>🤖</div>
          <div>
            <span className="text-sm font-medium">{agent.id}</span>
            <span className={`flex items-center gap-1 text-xs ${isActive ? 'text-status-running' : 'text-text-muted'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-status-running animate-pulse-dot' : 'bg-status-paused'}`} />
              {isActive ? 'Running' : 'Idle'}
            </span>
          </div>
        </div>
        {isActive && (
          <button className="px-2 py-0.5 rounded text-xs bg-status-failed/20 text-status-failed hover:bg-status-failed/30 transition-colors">Stop</button>
        )}
      </div>
      <div className="space-y-2 text-sm">
        {isActive && agent.currentTaskTitle ? (
          <>
            <div className="text-text-secondary">当前任务</div>
            <div className="font-medium text-sm">{agent.currentTaskTitle}</div>
            <ProgressBar value={agent.progress} />
          </>
        ) : (
          <>
            <div className="text-text-secondary">状态</div>
            <div className="text-text-muted text-sm">等待新任务分配</div>
          </>
        )}
        <div className="flex justify-between text-text-muted text-xs mt-2">
          <span>已完成: {agent.completedCount} 任务</span>
          <span>{isActive ? `运行 ${agent.runningMinutes}min` : `空闲 ${agent.runningMinutes}min`}</span>
        </div>
      </div>
      <button className="w-full mt-3 px-2 py-1 rounded text-xs bg-bg-primary text-text-secondary hover:bg-bg-hover transition-colors">View Logs</button>
    </div>
  )
}
