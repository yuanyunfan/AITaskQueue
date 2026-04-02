import { useHistoryStore } from '@/stores/history-store'
import { formatTime, formatDuration } from '@/lib/utils'
import { QUEUE_COLORS, QUEUE_LABELS } from '@/constants/colors'

export function HistoryTable() {
  const getFilteredEntries = useHistoryStore((s) => s.getFilteredEntries)
  const entries = getFilteredEntries()

  return (
    <div className="bg-bg-card rounded-xl border border-border-default">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-xs border-b border-border-default">
            <th className="text-left px-5 py-3 font-medium">Time</th>
            <th className="text-left px-5 py-3 font-medium">Status</th>
            <th className="text-left px-5 py-3 font-medium">Task</th>
            <th className="text-left px-5 py-3 font-medium">Type</th>
            <th className="text-left px-5 py-3 font-medium">Duration</th>
            <th className="text-left px-5 py-3 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border-default last:border-0 hover:bg-bg-hover transition-colors cursor-pointer">
              <td className="px-5 py-3 text-text-muted">{formatTime(entry.completedAt)}</td>
              <td className="px-5 py-3">
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${entry.status === 'done' ? 'bg-status-done' : 'bg-status-failed'}`} />
                  {entry.status === 'done' ? 'Done' : 'Failed'}
                </span>
              </td>
              <td className="px-5 py-3">{entry.title}</td>
              <td className="px-5 py-3"><span className={`text-xs ${QUEUE_COLORS[entry.queueType]}`}>{QUEUE_LABELS[entry.queueType]}</span></td>
              <td className="px-5 py-3 text-text-muted">{formatDuration(entry.duration)}</td>
              <td className="px-5 py-3">
                {entry.note ? (
                  <span className={`text-xs ${entry.status === 'failed' ? 'text-status-failed' : 'text-status-running'}`}>{entry.note}</span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr><td colSpan={6} className="px-5 py-8 text-center text-text-muted">暂无历史记录</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
