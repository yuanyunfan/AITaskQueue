import { useHistoryStore } from '@/stores/history-store'

export function HistoryFilters() {
  const filters = useHistoryStore((s) => s.filters)
  const setFilter = useHistoryStore((s) => s.setFilter)

  return (
    <div className="flex items-center gap-2">
      <select
        value={filters.timeRange}
        onChange={(e) => setFilter('timeRange', e.target.value)}
        className="bg-bg-card border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none"
      >
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="week">This Week</option>
        <option value="month">This Month</option>
      </select>
      <select
        value={filters.queueType}
        onChange={(e) => setFilter('queueType', e.target.value)}
        className="bg-bg-card border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none"
      >
        <option value="all">All Types</option>
        <option value="auto">全自动</option>
        <option value="semi">半自动</option>
        <option value="human">人在loop</option>
      </select>
      <select
        value={filters.status}
        onChange={(e) => setFilter('status', e.target.value)}
        className="bg-bg-card border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none"
      >
        <option value="all">All Status</option>
        <option value="done">✅ Done</option>
        <option value="failed">🔴 Failed</option>
      </select>
    </div>
  )
}
