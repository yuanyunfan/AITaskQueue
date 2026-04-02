import { X } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useTaskStore } from '@/stores/task-store'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { QUEUE_LABELS, QUEUE_COLORS } from '@/constants/colors'
import { formatTime } from '@/lib/utils'

export function TaskDrawer() {
  const isOpen = useUIStore((s) => s.isDrawerOpen)
  const closeDrawer = useUIStore((s) => s.closeDrawer)
  const task = useTaskStore((s) => s.selectedTaskId ? s.getTaskById(s.selectedTaskId) : undefined)
  const updateTask = useTaskStore((s) => s.updateTask)

  if (!isOpen || !task) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={closeDrawer} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-bg-card border-l border-border-default z-50 animate-slide-in-right overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">任务详情</h2>
            <button onClick={closeDrawer} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <h3 className="text-base font-medium mb-1">{task.title}</h3>
              {task.description && <p className="text-text-secondary text-sm">{task.description}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-text-muted text-xs block mb-1">状态</span>
                <StatusBadge status={task.status} />
              </div>
              <div>
                <span className="text-text-muted text-xs block mb-1">优先级</span>
                <PriorityBadge priority={task.priority} />
              </div>
              <div>
                <span className="text-text-muted text-xs block mb-1">队列类型</span>
                <span className={`text-sm ${QUEUE_COLORS[task.queueType]}`}>{QUEUE_LABELS[task.queueType]}</span>
              </div>
              <div>
                <span className="text-text-muted text-xs block mb-1">分配 Agent</span>
                <span className="text-sm">{task.assignedAgent || '未分配'}</span>
              </div>
            </div>

            {task.status === 'running' && (
              <div>
                <span className="text-text-muted text-xs block mb-2">进度</span>
                <ProgressBar value={task.progress} />
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>创建时间</span>
                <span className="text-text-primary">{formatTime(task.createdAt)}</span>
              </div>
              {task.startedAt && (
                <div className="flex justify-between text-text-secondary">
                  <span>开始时间</span>
                  <span className="text-text-primary">{formatTime(task.startedAt)}</span>
                </div>
              )}
              {task.estimatedMinutes && (
                <div className="flex justify-between text-text-secondary">
                  <span>预计耗时</span>
                  <span className="text-text-primary">{task.estimatedMinutes} min</span>
                </div>
              )}
            </div>

            {task.result && (
              <div className="bg-bg-primary rounded-lg p-3">
                <span className="text-text-muted text-xs block mb-1">执行结果</span>
                <p className="text-sm">{task.result}</p>
              </div>
            )}

            {task.status === 'review' && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { updateTask(task.id, { status: 'done', completedAt: Date.now() }); closeDrawer() }}
                  className="flex-1 px-4 py-2 rounded-lg text-sm bg-status-running/20 text-status-running hover:bg-status-running/30 transition-colors font-medium"
                >✓ 验收通过</button>
                <button
                  onClick={() => updateTask(task.id, { status: 'running', progress: 0 })}
                  className="flex-1 px-4 py-2 rounded-lg text-sm bg-status-failed/20 text-status-failed hover:bg-status-failed/30 transition-colors font-medium"
                >✗ 打回重做</button>
              </div>
            )}

            {task.status === 'running' && (
              <button
                onClick={() => updateTask(task.id, { status: 'paused' })}
                className="w-full px-4 py-2 rounded-lg text-sm bg-status-paused/20 text-text-secondary hover:bg-status-paused/30 transition-colors"
              >⏸ 暂停任务</button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
