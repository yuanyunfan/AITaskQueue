import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, QueueType } from '@/types'
import { QUEUE_LABELS, QUEUE_DOT_COLORS } from '@/constants/colors'
import { TaskCard } from './TaskCard'
import { ContextMenu } from './ContextMenu'

interface KanbanColumnProps {
  queueType: QueueType
  tasks: Task[]
}

interface ContextMenuState {
  x: number
  y: number
  task: Task
}

export function KanbanColumn({ queueType, tasks }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: queueType })
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent, task: Task) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, task })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  return (
    <div className="min-h-[400px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`w-2.5 h-2.5 rounded-full ${QUEUE_DOT_COLORS[queueType]}`} />
        <h3 className="font-medium text-sm">{QUEUE_LABELS[queueType]}</h3>
        <span className="text-text-muted text-xs bg-bg-card px-1.5 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div ref={setNodeRef}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} onContextMenu={(e) => handleContextMenu(e, task)}>
                <TaskCard task={task} />
              </div>
            ))}
          </div>
        </SortableContext>
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          task={contextMenu.task}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}
