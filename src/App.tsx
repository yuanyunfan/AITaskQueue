import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { QueuePage } from '@/pages/QueuePage'
import { AgentsPage } from '@/pages/AgentsPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'

export default function App() {
  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      if (e.key === 'Escape') {
        const ui = useUIStore.getState()
        if (ui.isModalOpen) ui.closeModal()
        else if (ui.isDrawerOpen) ui.closeDrawer()
        else if (ui.isChatOpen) ui.toggleChat()
      }

      if (e.key === 'n' && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        useUIStore.getState().openModal()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
