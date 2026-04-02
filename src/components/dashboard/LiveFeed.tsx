import { useActivityStore } from '@/stores/activity-store'
import { formatTime } from '@/lib/utils'
import type { EventType } from '@/types'

const EVENT_DOT_COLORS: Record<EventType, string> = {
  running: 'bg-status-running',
  dispatch: 'bg-accent',
  done: 'bg-status-done',
  failed: 'bg-status-failed',
  review: 'bg-status-review',
  info: 'bg-text-muted',
}

export function LiveFeed() {
  const events = useActivityStore((s) => s.events)

  return (
    <div className="bg-bg-card rounded-xl border border-border-default">
      <div className="px-5 py-3 border-b border-border-default flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-status-running animate-pulse-dot" />
          <h3 className="font-medium text-sm">Live Activity</h3>
        </div>
        <span className="text-text-muted text-xs">auto-refresh</span>
      </div>
      <div className="divide-y divide-border-default max-h-48 overflow-y-auto">
        {events.map((event) => (
          <div key={event.id} className="animate-fade-in px-5 py-2.5 flex items-start gap-3 text-sm">
            <span className="text-text-muted text-xs whitespace-nowrap mt-0.5">{formatTime(event.timestamp)}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${EVENT_DOT_COLORS[event.type]} mt-1.5 shrink-0`} />
            <span>{event.message}</span>
          </div>
        ))}
        {events.length === 0 && (
          <div className="px-5 py-6 text-center text-text-muted text-sm">暂无活动</div>
        )}
      </div>
    </div>
  )
}
