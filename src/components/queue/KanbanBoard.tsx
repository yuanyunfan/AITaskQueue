import { useMemo, useCallback } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useTaskStore } from '@/stores/task-store'
import type { QueueType } from '@/types'
import { KanbanColumn } from './KanbanColumn'

const QUEUE_TYPES: QueueType[] = ['auto', 'semi', 'human']

interface KanbanBoardProps {
  projectFilter: string | null
}

export function KanbanBoard({ projectFilter }: KanbanBoardProps) {
  const tasks = useTaskStore((s) => s.tasks)
  const reorderInQueue = useTaskStore((s) => s.reorderInQueue)

  const tasksByQueue = useMemo(() => {
    let filtered = tasks.filter(t => !t.parentId) // exclude subtasks from kanban
    if (projectFilter === '__none__') {
      filtered = filtered.filter(t => !t.project)
    } else if (projectFilter) {
      filtered = filtered.filter(t => t.project === projectFilter)
    }
    const result: Record<QueueType, typeof filtered> = { auto: [], semi: [], human: [] }
    for (const t of filtered) {
      if (t.status !== 'done' && result[t.queueType]) {
        result[t.queueType].push(t)
      }
    }
    // Sort: running/queued first, then review/paused, then blocked at bottom
    const statusOrder: Record<string, number> = {
      running: 0, queued: 1, review: 2, paused: 3, failed: 4, blocked: 5,
    }
    for (const q of QUEUE_TYPES) {
      result[q].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9))
    }
    return result
  }, [tasks, projectFilter])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    for (const queueType of QUEUE_TYPES) {
      const queueTasks = tasksByQueue[queueType]
      const oldIndex = queueTasks.findIndex((t) => t.id === active.id)
      const newIndex = queueTasks.findIndex((t) => t.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(queueTasks, oldIndex, newIndex)
        reorderInQueue(queueType, reordered.map((t) => t.id))
        break
      }
    }
  }, [tasksByQueue, reorderInQueue])

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-3 gap-4">
        {QUEUE_TYPES.map((type) => (
          <KanbanColumn key={type} queueType={type} tasks={tasksByQueue[type]} />
        ))}
      </div>
      <p className="text-text-muted text-xs mt-4 text-center">💡 拖拽卡片调整优先级 · 右键菜单：暂停 / 取消 / 插队</p>
    </DndContext>
  )
}
