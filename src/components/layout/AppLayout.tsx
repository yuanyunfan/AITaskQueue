import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TaskDrawer } from '@/components/overlays/TaskDrawer'
import { NewTaskModal } from '@/components/overlays/NewTaskModal'
import { ChatPanel } from '@/components/overlays/ChatPanel'
import { useSimulator } from '@/hooks/use-simulator'
import { useBackend } from '@/hooks/use-backend'

function MockInit() {
  useSimulator()
  return null
}

export function AppLayout() {
  const { mode } = useBackend()

  return (
    <div className="flex min-h-screen bg-bg-primary text-text-primary">
      {mode === 'mock' && <MockInit />}
      <Sidebar />
      <main className="flex-1 ml-14 overflow-auto">
        <Outlet />
      </main>
      <TaskDrawer />
      <NewTaskModal />
      <ChatPanel />
    </div>
  )
}
