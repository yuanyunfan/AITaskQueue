import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { Task } from '@/types'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { useTaskStore } from '@/stores/task-store'
import { useUIStore } from '@/stores/ui-store'

const PROJECT_COLORS: Record<string, { bg: string; text: string }> = {
  Finance: { bg: 'bg-green-500/20', text: 'text-green-400' },
  AITaskQueue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  VibeLancer: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  TrendingViz: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  Raven: { bg: 'bg-red-500/20', text: 'text-red-400' },
  StickiesSync: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  MacTimer: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
}

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
      onClick={handleClick}
      className={`bg-bg-card rounded-lg p-3.5 border border-border-default cursor-pointer hover:bg-bg-hover transition-all ${isReview || isPaused ? 'border-l-2' : ''} ${isReview ? 'border-l-status-review' : ''} ${isPaused ? 'border-l-queue-human' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle — only this area triggers drag */}
        <div
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Card content — click opens drawer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
          </div>
          <p className="text-sm font-medium mb-1">{task.title}</p>

          {/* Project tag + subtask count */}
          <div className="flex items-center gap-2 mb-1">
            {task.project && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${PROJECT_COLORS[task.project]?.bg || 'bg-gray-500/20'} ${PROJECT_COLORS[task.project]?.text || 'text-gray-400'}`}>
                {task.project}
              </span>
            )}
            {task.children && task.children.length > 0 && (
              <span className="text-[10px] text-text-muted">
                📋 {task.children.filter(c => c.status === 'done').length}/{task.children.length}
              </span>
            )}
          </div>

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
            <p className="text-text-muted text-xs mt-1 line-clamp-2">{task.description}</p>
          )}

          {(task.status === 'running' || task.status === 'queued') && (
            <div className="flex items-center justify-between text-text-muted text-xs mt-1">
              <span>{task.assignedAgent || (task.estimatedMinutes ? `预计: ${task.estimatedMinutes}min` : '')}</span>
              {task.assignedAgent && <span>{task.estimatedMinutes ? `${task.estimatedMinutes}min` : ''}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
