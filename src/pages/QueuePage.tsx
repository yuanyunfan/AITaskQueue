import { PageHeader } from '@/components/shared/PageHeader'
import { KanbanBoard } from '@/components/queue/KanbanBoard'

export function QueuePage() {
  return (
    <div className="p-6">
      <PageHeader title="Task Queue" />
      <KanbanBoard />
    </div>
  )
}
