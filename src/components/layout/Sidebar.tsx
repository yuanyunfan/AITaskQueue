import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Monitor, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './ThemeToggle'

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/queue', icon: ClipboardList, label: 'Queue' },
  { path: '/agents', icon: Monitor, label: 'Agents' },
  { path: '/history', icon: Clock, label: 'History' },
]

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <aside className="w-14 bg-bg-card border-r border-border-default flex flex-col items-center py-4 shrink-0 fixed h-full z-10">
      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center mb-8 text-sm font-bold text-white cursor-pointer" onClick={() => navigate('/')}>
        AI
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              title={label}
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-all',
                'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
                isActive && 'bg-bg-hover text-text-primary border-l-2 border-accent'
              )}
            >
              <Icon className="w-5 h-5" />
            </button>
          )
        })}
      </nav>

      <ThemeToggle />
    </aside>
  )
}
