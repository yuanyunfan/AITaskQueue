import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '@/types'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { useTaskStore } from '@/stores/task-store'
import { useUIStore } from '@/stores/ui-store'

interface TaskCardProps {
  task: Task
}

export function TaskCard({ task }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const openDrawer = useUIStore((s) => s.openDrawer)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleClick = () => {
    setSelectedTask(task.id)
    openDrawer()
  }

  const isReview = task.status === 'review'
  const isPaused = task.status === 'paused'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`bg-bg-card rounded-lg p-3.5 border border-border-default cursor-grab active:cursor-grabbing hover:bg-bg-hover transition-all ${isReview || isPaused ? 'border-l-2' : ''} ${isReview ? 'border-l-status-review' : ''} ${isPaused ? 'border-l-queue-human' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />
      </div>
      <p className="text-sm font-medium mb-2">{task.title}</p>

      {task.status === 'running' && (
        <ProgressBar value={task.progress} className="mb-2" />
      )}

      {isReview && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { status: 'done', completedAt: Date.now() }) }}
            className="flex-1 px-2 py-1 rounded text-xs bg-status-running/20 text-status-running hover:bg-status-running/30 transition-colors font-medium"
          >✓ 验收通过</button>
          <button
            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { status: 'running', progress: 0 }) }}
            className="flex-1 px-2 py-1 rounded text-xs bg-status-failed/20 text-status-failed hover:bg-status-failed/30 transition-colors font-medium"
          >✗ 打回</button>
        </div>
      )}

      {isPaused && task.description && (
        <>
          <p className="text-text-muted text-xs mb-3 line-clamp-2">{task.description}</p>
          <button
            onClick={(e) => { e.stopPropagation(); handleClick() }}
            className="w-full px-2 py-1.5 rounded text-xs bg-queue-human/20 text-queue-human hover:bg-queue-human/30 transition-colors font-medium"
          >开始讨论 →</button>
        </>
      )}

      {(task.status === 'running' || task.status === 'queued') && (
        <div className="flex items-center justify-between text-text-muted text-xs mt-1">
          <span>{task.assignedAgent || (task.estimatedMinutes ? `预计: ${task.estimatedMinutes}min` : '')}</span>
          {task.assignedAgent && <span>{task.estimatedMinutes ? `${task.estimatedMinutes}min` : ''}</span>}
        </div>
      )}
    </div>
  )
}
