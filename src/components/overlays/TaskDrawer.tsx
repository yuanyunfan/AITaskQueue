import { useState } from 'react'
import { X, Trash2, Pencil, Check } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useTaskStore } from '@/stores/task-store'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { QUEUE_LABELS, QUEUE_COLORS, PRIORITY_LABELS, STATUS_LABELS } from '@/constants/colors'
import { formatTime } from '@/lib/utils'
import { approveTask, rejectTask, pauseTask, resumeTask, deleteTask, updateTask as apiUpdateTask, unblockTask, blockTask } from '@/lib/api'
import type { Priority, QueueType, TaskStatus } from '@/types'

const PROJECT_COLORS: Record<string, { bg: string; text: string }> = {
  Finance: { bg: 'bg-green-500/20', text: 'text-green-400' },
  AITaskQueue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  VibeLancer: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  TrendingViz: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  Raven: { bg: 'bg-red-500/20', text: 'text-red-400' },
  StickiesSync: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  MacTimer: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
}

const BACKEND_MODE = import.meta.env.VITE_BACKEND_MODE || 'mock'

export function TaskDrawer() {
  const isOpen = useUIStore((s) => s.isDrawerOpen)
  const closeDrawer = useUIStore((s) => s.closeDrawer)
  const task = useTaskStore((s) => s.selectedTaskId ? s.getTaskById(s.selectedTaskId) : undefined)
  const updateTask = useTaskStore((s) => s.updateTask)
  const removeTask = useTaskStore((s) => s.removeTask)

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState<TaskStatus>('blocked')
  const [editPriority, setEditPriority] = useState<Priority>('p2')
  const [editQueueType, setEditQueueType] = useState<QueueType>('auto')

  if (!isOpen || !task) return null

  const isLive = BACKEND_MODE === 'live'
  const canEdit = true // always allow editing
  const canDelete = task.status !== 'running'

  const startEditing = () => {
    setEditTitle(task.title)
    setEditDescription(task.description || '')
    setEditStatus(task.status)
    setEditPriority(task.priority)
    setEditQueueType(task.queueType)
    setIsEditing(true)
  }

  const saveEdit = async () => {
    const updates: Record<string, unknown> = {
      title: editTitle.trim() || task.title,
      description: editDescription.trim() || undefined,
      status: editStatus,
      priority: editPriority,
      queueType: editQueueType,
    }
    if (isLive) {
      try {
        await apiUpdateTask(task.id, updates)
        // Also update local store immediately for instant UI feedback
        updateTask(task.id, updates)
      } catch (err) {
        console.error('Failed to update task via API, falling back to local store:', err)
        updateTask(task.id, updates)
      }
    } else {
      updateTask(task.id, updates)
    }
    setIsEditing(false)
  }

  const handleDelete = async () => {
    if (isLive) {
      try {
        await deleteTask(task.id)
      } catch (err) {
        console.error('Failed to delete task via API, falling back to local store:', err)
        removeTask(task.id)
      }
    } else {
      removeTask(task.id)
    }
    closeDrawer()
  }

  const handleApprove = async () => {
    if (isLive) {
      try {
        await approveTask(task.id)
      } catch (err) {
        console.error('Failed to approve task via API, falling back to local store:', err)
        updateTask(task.id, { status: 'done', completedAt: Date.now() })
      }
    } else {
      updateTask(task.id, { status: 'done', completedAt: Date.now() })
    }
    closeDrawer()
  }

  const handleReject = async () => {
    if (isLive) {
      try {
        await rejectTask(task.id)
      } catch (err) {
        console.error('Failed to reject task via API, falling back to local store:', err)
        updateTask(task.id, { status: 'running', progress: 0 })
      }
    } else {
      updateTask(task.id, { status: 'running', progress: 0 })
    }
  }

  const handlePause = async () => {
    if (isLive) {
      try {
        await pauseTask(task.id)
      } catch (err) {
        console.error('Failed to pause task via API, falling back to local store:', err)
        updateTask(task.id, { status: 'paused' })
      }
    } else {
      updateTask(task.id, { status: 'paused' })
    }
  }

  const handleResume = async () => {
    if (isLive) {
      try {
        await resumeTask(task.id)
      } catch (err) {
        console.error('Failed to resume task via API, falling back to local store:', err)
        updateTask(task.id, { status: 'queued', progress: 0, assignedAgent: undefined })
      }
    } else {
      updateTask(task.id, { status: 'queued', progress: 0, assignedAgent: undefined })
    }
  }

  const handleUnblock = async () => {
    if (isLive) {
      try {
        await unblockTask(task.id)
      } catch (err) {
        console.error('Failed to unblock task via API, falling back to local store:', err)
        updateTask(task.id, { status: 'queued' })
      }
    } else {
      updateTask(task.id, { status: 'queued' })
    }
  }

  const handleBlock = async () => {
    if (isLive) {
      try {
        await blockTask(task.id)
      } catch (err) {
        console.error('Failed to block task via API, falling back to local store:', err)
        updateTask(task.id, { status: 'blocked' })
      }
    } else {
      updateTask(task.id, { status: 'blocked' })
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={closeDrawer} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-bg-card border-l border-border-default z-50 animate-slide-in-right overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">任务详情</h2>
            <div className="flex items-center gap-1">
              {canEdit && !isEditing && (
                <button onClick={startEditing} title="编辑" className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              {canDelete && (
                <button onClick={handleDelete} title="删除" className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-status-failed hover:bg-status-failed/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => { setIsEditing(false); closeDrawer() }} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {/* Title + Description */}
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-text-muted text-xs block mb-1">任务名称</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-text-muted text-xs block mb-1">描述</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent resize-none h-20"
                  />
                </div>
                <div>
                  <label className="text-text-muted text-xs block mb-1">状态</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['blocked', 'queued', 'running', 'paused', 'review', 'done', 'failed'] as TaskStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setEditStatus(s)}
                        className={`px-2.5 py-1 rounded text-xs border transition-colors ${editStatus === s ? 'bg-accent/20 border-accent text-accent' : 'bg-bg-primary border-border-default text-text-secondary hover:bg-bg-hover'}`}
                      >{STATUS_LABELS[s]}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-text-muted text-xs block mb-1">优先级</label>
                  <div className="flex gap-2">
                    {(['p0', 'p1', 'p2', 'p3'] as Priority[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setEditPriority(p)}
                        className={`px-3 py-1 rounded text-xs border transition-colors ${editPriority === p ? 'bg-accent/20 border-accent text-accent' : 'bg-bg-primary border-border-default text-text-secondary hover:bg-bg-hover'}`}
                      >{PRIORITY_LABELS[p]}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-text-muted text-xs block mb-1">队列类型</label>
                  <div className="flex gap-2">
                    {(['auto', 'semi', 'human'] as QueueType[]).map((q) => (
                      <button
                        key={q}
                        onClick={() => setEditQueueType(q)}
                        className={`flex-1 px-3 py-1 rounded text-xs border transition-colors ${editQueueType === q ? 'bg-accent/20 border-accent text-accent' : 'bg-bg-primary border-border-default text-text-secondary hover:bg-bg-hover'}`}
                      >{QUEUE_LABELS[q]}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-accent hover:bg-blue-600 text-white font-medium transition-colors flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5" /> 保存
                  </button>
                  <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover transition-colors">取消</button>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-base font-medium mb-1">{task.title}</h3>
                {task.description && <p className="text-text-secondary text-sm">{task.description}</p>}
              </div>
            )}

            {/* Info Grid */}
            {!isEditing && (
              <>
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
                    <span className="text-text-muted text-xs block mb-1">所属项目</span>
                    {task.project ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${PROJECT_COLORS[task.project]?.bg || 'bg-gray-500/20'} ${PROJECT_COLORS[task.project]?.text || 'text-gray-400'}`}>
                        {task.project}
                      </span>
                    ) : (
                      <span className="text-sm text-text-muted">独立任务</span>
                    )}
                  </div>
                </div>

                {/* Subtasks */}
                {task.children && task.children.length > 0 && (
                  <div>
                    <span className="text-text-muted text-xs block mb-2">
                      子任务 ({task.children.filter(c => c.status === 'done').length}/{task.children.length})
                    </span>
                    <div className="bg-bg-primary rounded-lg p-3 space-y-2">
                      {task.children.map((child) => (
                        <div key={child.id} className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${child.status === 'done' ? 'bg-status-done' : 'bg-status-queued'}`} />
                          <span className={`text-sm flex-1 ${child.status === 'done' ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                            {child.title}
                          </span>
                          <StatusBadge status={child.status} showDot={false} className="text-[10px]" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

                {/* Action Buttons */}
                {task.status === 'review' && (
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleApprove}
                      className="flex-1 px-4 py-2 rounded-lg text-sm bg-status-running/20 text-status-running hover:bg-status-running/30 transition-colors font-medium"
                    >✓ 验收通过</button>
                    <button
                      onClick={handleReject}
                      className="flex-1 px-4 py-2 rounded-lg text-sm bg-status-failed/20 text-status-failed hover:bg-status-failed/30 transition-colors font-medium"
                    >✗ 打回重做</button>
                  </div>
                )}

                {task.status === 'running' && (
                  <button
                    onClick={handlePause}
                    className="w-full px-4 py-2 rounded-lg text-sm bg-status-paused/20 text-text-secondary hover:bg-status-paused/30 transition-colors"
                  >⏸ 暂停任务</button>
                )}

                {task.status === 'paused' && (
                  <button
                    onClick={handleResume}
                    className="w-full px-4 py-2 rounded-lg text-sm bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                  >▶ 恢复任务</button>
                )}

                {task.status === 'blocked' && (
                  <button
                    onClick={handleUnblock}
                    className="w-full px-4 py-2 rounded-lg text-sm bg-status-running/20 text-status-running hover:bg-status-running/30 transition-colors font-medium"
                  >▶ 加入执行队列</button>
                )}

                {task.status === 'queued' && (
                  <button
                    onClick={handleBlock}
                    className="w-full px-4 py-2 rounded-lg text-sm bg-text-muted/20 text-text-muted hover:bg-text-muted/30 transition-colors"
                  >⏹ 移出队列 (Block)</button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
