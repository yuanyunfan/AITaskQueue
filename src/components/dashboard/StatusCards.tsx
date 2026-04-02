import { useTaskStore } from '@/stores/task-store'

export function StatusCards() {
  const getStatusCounts = useTaskStore((s) => s.getStatusCounts)
  const counts = getStatusCounts()

  const cards = [
    { label: 'Running', value: counts.running, color: 'bg-status-running', pulse: true },
    { label: 'Queued', value: counts.queued, color: 'bg-status-queued', pulse: false },
    { label: 'Failed', value: counts.failed, color: 'bg-status-failed', pulse: false },
    { label: 'Done (24h)', value: counts.done24h, color: 'bg-status-done', pulse: false },
  ]

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <div key={card.label} className="bg-bg-card rounded-xl p-4 border border-border-default">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${card.color} ${card.pulse ? 'animate-pulse-dot' : ''}`} />
            <span className="text-text-secondary text-sm">{card.label}</span>
          </div>
          <span className="text-2xl font-bold">{card.value}</span>
        </div>
      ))}
    </div>
  )
}
