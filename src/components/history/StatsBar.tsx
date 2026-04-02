import { useHistoryStore } from '@/stores/history-store'
import { formatDuration } from '@/lib/utils'

export function StatsBar() {
  const getStats = useHistoryStore((s) => s.getStats)
  const stats = getStats()

  const cards = [
    { label: 'Today Total', value: String(stats.total) },
    { label: 'Success Rate', value: `${stats.successRate}%`, color: 'text-status-running' },
    { label: 'Avg Duration', value: formatDuration(stats.avgDuration) },
    { label: 'Failed & Retried', value: String(stats.failedCount), color: 'text-status-queued' },
  ]

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <div key={card.label} className="bg-bg-card rounded-xl p-4 border border-border-default">
          <div className="text-text-muted text-xs mb-1">{card.label}</div>
          <div className={`text-xl font-bold ${card.color || ''}`}>{card.value}</div>
        </div>
      ))}
    </div>
  )
}
