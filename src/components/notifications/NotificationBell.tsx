import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useActivityStore } from '@/stores/activity-store'
import { formatTime } from '@/lib/utils'

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const notifications = useActivityStore((s) => s.notifications)
  const unreadCount = useActivityStore((s) => s.unreadCount)
  const markAllRead = useActivityStore((s) => s.markAllRead)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setIsOpen(!isOpen)
          if (!isOpen && unreadCount > 0) markAllRead()
        }}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover relative"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-status-failed rounded-full text-[10px] flex items-center justify-center text-white font-medium">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 w-80 bg-bg-card border border-border-default rounded-xl shadow-2xl z-50 animate-slide-in-up">
          <div className="px-4 py-3 border-b border-border-default">
            <span className="text-sm font-medium">通知</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-text-muted text-sm">暂无通知</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3 border-b border-border-default last:border-0 hover:bg-bg-hover transition-colors"
                >
                  <p className="text-sm">{n.message}</p>
                  <span className="text-text-muted text-xs">{formatTime(n.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
