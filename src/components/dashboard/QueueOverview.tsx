import { useTaskStore } from '@/stores/task-store'
import type { QueueType } from '@/types'
import { QUEUE_LABELS, QUEUE_DOT_COLORS } from '@/constants/colors'

export function QueueOverview() {
  const tasks = useTaskStore((s) => s.tasks)
  const queueTypes: QueueType[] = ['auto', 'semi', 'human']

  const queueCounts = queueTypes.map((type) => ({
    type,
    count: tasks.filter((t) => t.queueType === type && t.status !== 'done').length,
  }))
  const maxCount = Math.max(...queueCounts.map((q) => q.count), 1)

  return (
    <div className="bg-bg-card rounded-xl p-5 border border-border-default">
      <h3 className="font-medium text-sm mb-4">Queue Overview</h3>
      <div className="space-y-3">
        {queueCounts.map(({ type, count }) => (
          <div key={type}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${QUEUE_DOT_COLORS[type]}`} />
                <span className="text-sm">{QUEUE_LABELS[type]}</span>
              </div>
              <span className="text-text-muted text-sm">{count} tasks</span>
            </div>
            <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
              <div
                className={`h-full ${QUEUE_DOT_COLORS[type]} opacity-60 rounded-full transition-all duration-500`}
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
