import { useEffect, useRef, useCallback } from 'react'
import type { Task, TaskStatus } from '@/types'
import {
  approveTask, rejectTask, pauseTask, resumeTask,
  deleteTask, unblockTask, blockTask, updateTask as apiUpdateTask,
} from '@/lib/api'
import { useTaskStore } from '@/stores/task-store'

const BACKEND_MODE = import.meta.env.VITE_BACKEND_MODE || 'mock'

interface ContextMenuProps {
  x: number
  y: number
  task: Task
  onClose: () => void
}

interface MenuItem {
  label: string
  icon: string
  action: () => Promise<void>
  danger?: boolean
}

function getMenuItems(
  task: Task,
  isLive: boolean,
  storeUpdate: (id: string, updates: Partial<Task>) => void,
  storeRemove: (id: string) => void,
  onClose: () => void,
): MenuItem[] {
  const items: MenuItem[] = []
  const status: TaskStatus = task.status

  const wrap = (fn: () => Promise<void> | void): (() => Promise<void>) => async () => {
    try {
      await fn()
    } catch (err) {
      console.error('Context menu action failed:', err)
    }
    onClose()
  }

  // Helper: execute live API or mock store action, fallback to store on API failure
  const liveOrMock = (apiFn: () => Promise<unknown>, mockFn: () => void): (() => Promise<void>) =>
    wrap(async () => {
      if (isLive) {
        try {
          await apiFn()
        } catch (err) {
          console.error('API call failed, falling back to local store:', err)
          mockFn()
        }
      } else {
        mockFn()
      }
    })

  if (status === 'blocked') {
    items.push({
      label: '加入队列',
      icon: '▶',
      action: liveOrMock(
        () => unblockTask(task.id),
        () => storeUpdate(task.id, { status: 'queued' }),
      ),
    })
  }

  if (status === 'queued') {
    items.push({
      label: '移出队列',
      icon: '⏹',
      action: liveOrMock(
        () => blockTask(task.id),
        () => storeUpdate(task.id, { status: 'blocked' }),
      ),
    })
    if (task.priority !== 'p0') {
      const priorities = ['p0', 'p1', 'p2', 'p3'] as const
      const currentIdx = priorities.indexOf(task.priority)
      const higher = priorities[currentIdx - 1]
      items.push({
        label: '提升优先级',
        icon: '⬆',
        action: liveOrMock(
          () => apiUpdateTask(task.id, { priority: higher }),
          () => storeUpdate(task.id, { priority: higher }),
        ),
      })
    }
    if (task.priority !== 'p3') {
      const priorities = ['p0', 'p1', 'p2', 'p3'] as const
      const currentIdx = priorities.indexOf(task.priority)
      const lower = priorities[currentIdx + 1]
      items.push({
        label: '降低优先级',
        icon: '⬇',
        action: liveOrMock(
          () => apiUpdateTask(task.id, { priority: lower }),
          () => storeUpdate(task.id, { priority: lower }),
        ),
      })
    }
  }

  if (status === 'running') {
    items.push({
      label: '暂停',
      icon: '⏸',
      action: liveOrMock(
        () => pauseTask(task.id),
        () => storeUpdate(task.id, { status: 'paused' }),
      ),
    })
  }

  if (status === 'paused') {
    items.push({
      label: '恢复',
      icon: '▶',
      action: liveOrMock(
        () => resumeTask(task.id),
        () => storeUpdate(task.id, { status: 'queued', progress: 0, assignedAgent: undefined }),
      ),
    })
    items.push({
      label: '移出队列',
      icon: '⏹',
      action: liveOrMock(
        () => blockTask(task.id),
        () => storeUpdate(task.id, { status: 'blocked' }),
      ),
    })
  }

  if (status === 'review') {
    items.push({
      label: '验收通过',
      icon: '✓',
      action: liveOrMock(
        () => approveTask(task.id),
        () => storeUpdate(task.id, { status: 'done', completedAt: Date.now() }),
      ),
    })
    items.push({
      label: '打回重做',
      icon: '✗',
      action: liveOrMock(
        () => rejectTask(task.id),
        () => storeUpdate(task.id, { status: 'running', progress: 0 }),
      ),
    })
  }

  // Delete is always available (except running tasks)
  if (status !== 'running') {
    items.push({
      label: '删除',
      icon: '🗑',
      danger: true,
      action: liveOrMock(
        () => deleteTask(task.id),
        () => storeRemove(task.id),
      ),
    })
  }

  return items
}

export function ContextMenu({ x, y, task, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const updateTask = useTaskStore((s) => s.updateTask)
  const removeTask = useTaskStore((s) => s.removeTask)
  const isLive = BACKEND_MODE === 'live'

  const items = getMenuItems(task, isLive, updateTask, removeTask, onClose)

  // Close on outside click
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    },
    [onClose],
  )

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleClickOutside, handleKeyDown])

  // Adjust position to avoid overflow
  const adjustedStyle = (): React.CSSProperties => {
    const menuWidth = 180
    const menuHeight = items.length * 36 + 8 // rough estimate
    const maxX = window.innerWidth - menuWidth - 8
    const maxY = window.innerHeight - menuHeight - 8
    return {
      position: 'fixed',
      left: Math.min(x, maxX),
      top: Math.min(y, maxY),
      zIndex: 100,
    }
  }

  if (items.length === 0) return null

  return (
    <div
      ref={ref}
      style={adjustedStyle()}
      className="w-[180px] bg-bg-card border border-border-default rounded-lg shadow-xl py-1 animate-context-menu"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.action}
          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
            item.danger
              ? 'text-status-failed hover:bg-status-failed/10'
              : 'text-text-primary hover:bg-bg-hover'
          }`}
        >
          <span className="w-4 text-center text-xs">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}
