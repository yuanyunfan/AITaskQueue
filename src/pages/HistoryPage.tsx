import { PageHeader } from '@/components/shared/PageHeader'
import { StatsBar } from '@/components/history/StatsBar'
import { HistoryFilters } from '@/components/history/HistoryFilters'
import { HistoryTable } from '@/components/history/HistoryTable'

export function HistoryPage() {
  return (
    <div className="p-6 animate-page-enter">
      <PageHeader title="History">
        <HistoryFilters />
      </PageHeader>
      <StatsBar />
      <HistoryTable />
    </div>
  )
}
