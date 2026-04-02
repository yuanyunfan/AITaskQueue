import { PageHeader } from '@/components/shared/PageHeader'
import { MainAgentPanel } from '@/components/agents/MainAgentPanel'
import { SubAgentCard } from '@/components/agents/SubAgentCard'
import { AgentLogPanel } from '@/components/agents/AgentLogPanel'
import { useAgentStore } from '@/stores/agent-store'

export function AgentsPage() {
  const subAgents = useAgentStore((s) => s.subAgents)

  return (
    <div className="p-6">
      <PageHeader title="Agent Monitor" />
      <MainAgentPanel />
      <h3 className="font-medium text-sm text-text-secondary mb-3">Sub Agents</h3>
      <div className="grid grid-cols-3 gap-4">
        {subAgents.map((agent) => (
          <SubAgentCard key={agent.id} agent={agent} />
        ))}
        {subAgents.length === 0 && (
          <div className="col-span-3 text-center text-text-muted py-8">暂无子 Agent</div>
        )}
      </div>

      {/* Agent log overlay panel */}
      <AgentLogPanel />
    </div>
  )
}
