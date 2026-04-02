import { useMemo } from 'react'
import { useTaskStore } from '@/stores/task-store'
import { useUIStore } from '@/stores/ui-store'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { QUEUE_COLORS, QUEUE_LABELS } from '@/constants/colors'

export function ActiveTasksTable() {
  const allTasks = useTaskStore((s) => s.tasks)
  const tasks = useMemo(() => allTasks.filter((t) => t.status !== 'done' && t.status !== 'queued'), [allTasks])
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const openDrawer = useUIStore((s) => s.openDrawer)
  const updateTask = useTaskStore((s) => s.updateTask)

  const handleClick = (taskId: string) => {
    setSelectedTask(taskId)
    openDrawer()
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border-default mb-6">
      <div className="px-5 py-3 border-b border-border-default">
        <h3 className="font-medium text-sm">Active Tasks</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-xs border-b border-border-default">
            <th className="text-left px-5 py-2.5 font-medium">Priority</th>
            <th className="text-left px-5 py-2.5 font-medium">Task</th>
            <th className="text-left px-5 py-2.5 font-medium">Type</th>
            <th className="text-left px-5 py-2.5 font-medium">Agent</th>
            <th className="text-left px-5 py-2.5 font-medium">Status</th>
            <th className="text-left px-5 py-2.5 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              onClick={() => handleClick(task.id)}
              className="border-b border-border-default last:border-0 hover:bg-bg-hover transition-colors cursor-pointer"
            >
              <td className="px-5 py-3"><PriorityBadge priority={task.priority} /></td>
              <td className="px-5 py-3">{task.title}</td>
              <td className="px-5 py-3">
                <span className={`text-xs ${QUEUE_COLORS[task.queueType]}`}>{QUEUE_LABELS[task.queueType]}</span>
              </td>
              <td className="px-5 py-3 text-text-secondary">{task.assignedAgent || '—'}</td>
              <td className="px-5 py-3"><StatusBadge status={task.status} /></td>
              <td className="px-5 py-3">
                {task.status === 'running' ? (
                  <ProgressBar value={task.progress} className="w-32" />
                ) : task.status === 'review' ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); updateTask(task.id, { status: 'done', completedAt: Date.now() }) }}
                      className="px-2 py-0.5 rounded text-xs bg-status-running/20 text-status-running hover:bg-status-running/30 transition-colors"
                    >✓ 验收</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); updateTask(task.id, { status: 'running', progress: 0 }) }}
                      className="px-2 py-0.5 rounded text-xs bg-status-failed/20 text-status-failed hover:bg-status-failed/30 transition-colors"
                    >✗ 打回</button>
                  </div>
                ) : task.status === 'paused' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleClick(task.id) }}
                    className="px-2 py-0.5 rounded text-xs bg-queue-human/20 text-queue-human hover:bg-queue-human/30 transition-colors"
                  >开始讨论 →</button>
                ) : null}
              </td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr><td colSpan={6} className="px-5 py-8 text-center text-text-muted">暂无活跃任务</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
