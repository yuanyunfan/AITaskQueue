import { PageHeader } from '@/components/shared/PageHeader'
import { StatusCards } from '@/components/dashboard/StatusCards'
import { MainAgentCard } from '@/components/dashboard/MainAgentCard'
import { QueueOverview } from '@/components/dashboard/QueueOverview'
import { ActiveTasksTable } from '@/components/dashboard/ActiveTasksTable'
import { LiveFeed } from '@/components/dashboard/LiveFeed'

export function DashboardPage() {
  return (
    <div className="p-6 animate-page-enter">
      <PageHeader title="Dashboard" />
      <StatusCards />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MainAgentCard />
        <QueueOverview />
      </div>
      <ActiveTasksTable />
      <LiveFeed />
    </div>
  )
}
