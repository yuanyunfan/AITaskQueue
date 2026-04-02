import { useUIStore } from '@/stores/ui-store'
import { NotificationBell } from '@/components/notifications/NotificationBell'

interface PageHeaderProps {
  title: string
  children?: React.ReactNode
}

export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        {children}
        <button
          onClick={() => useUIStore.getState().openModal()}
          className="px-3 py-1.5 bg-accent hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
        >
          + New Task
        </button>
        <NotificationBell />
      </div>
    </div>
  )
}
