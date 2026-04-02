import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useTaskStore } from '@/stores/task-store'
import { useActivityStore } from '@/stores/activity-store'
import { useAgentStore } from '@/stores/agent-store'
import { generateId } from '@/lib/utils'
import { createTask } from '@/lib/api'
import type { QueueType, Priority } from '@/types'
import { cn } from '@/lib/utils'

const BACKEND_MODE = import.meta.env.VITE_BACKEND_MODE || 'mock'

export function NewTaskModal() {
  const isOpen = useUIStore((s) => s.isModalOpen)
  const closeModal = useUIStore((s) => s.closeModal)
  const addTask = useTaskStore((s) => s.addTask)
  const addEvent = useActivityStore((s) => s.addEvent)
  const addDecision = useAgentStore((s) => s.addDecision)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [queueType, setQueueType] = useState<QueueType>('auto')
  const [priority, setPriority] = useState<Priority>('p2')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!title.trim() || isSubmitting) return

    if (BACKEND_MODE === 'live') {
      setIsSubmitting(true)
      try {
        await createTask({
          title: title.trim(),
          description: description.trim() || undefined,
          queueType,
          priority,
        })
        setTitle('')
        setDescription('')
        setQueueType('auto')
        setPriority('p2')
        closeModal()
      } catch (err) {
        console.error('Failed to create task:', err)
      } finally {
        setIsSubmitting(false)
      }
    } else {
      const id = generateId()
      addTask({
        id,
        title: title.trim(),
        description: description.trim() || undefined,
        status: 'queued',
        queueType,
        priority,
        progress: 0,
        createdAt: Date.now(),
      })
      addEvent({
        id: generateId(),
        timestamp: Date.now(),
        type: 'info',
        message: `新任务入队: "${title.trim()}"`,
      })
      addDecision({
        id: generateId(),
        timestamp: Date.now(),
        message: `接收新任务 "${title.trim()}" → 分类: ${queueType === 'auto' ? '全自动' : queueType === 'semi' ? '半自动' : '人在loop'}, 优先级: ${priority.toUpperCase()}`,
      })
      setTitle('')
      setDescription('')
      setQueueType('auto')
      setPriority('p2')
      closeModal()
    }
  }

  const typeOptions: { value: QueueType; label: string; color: string }[] = [
    { value: 'auto', label: '🔴 全自动', color: 'queue-auto' },
    { value: 'semi', label: '🟡 半自动', color: 'queue-semi' },
    { value: 'human', label: '🔵 人在loop', color: 'queue-human' },
  ]

  const priorityOptions: { value: Priority; label: string; color: string }[] = [
    { value: 'p0', label: 'P0 紧急', color: 'priority-p0' },
    { value: 'p1', label: 'P1 高', color: 'priority-p1' },
    { value: 'p2', label: 'P2 中', color: 'priority-p2' },
    { value: 'p3', label: 'P3 低', color: 'priority-p3' },
  ]

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={closeModal}>
        <div className="bg-bg-card rounded-2xl border border-border-default w-[520px] p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold">New Task</h2>
            <button onClick={closeModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">任务名称 <span className="text-status-failed">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-bg-primary border border-border-default rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                placeholder="输入任务名称..."
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-bg-primary border border-border-default rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent resize-none h-20 placeholder:text-text-muted"
                placeholder="可选：补充任务的详细说明..."
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">类型</label>
              <div className="flex gap-2">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setQueueType(opt.value)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg border text-sm transition-colors',
                      queueType === opt.value
                        ? `bg-${opt.color}/20 border-${opt.color} text-${opt.color}`
                        : 'bg-bg-primary border-border-default text-text-secondary hover:bg-bg-hover'
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">优先级</label>
              <div className="flex gap-2">
                {priorityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPriority(opt.value)}
                    className={cn(
                      'px-4 py-2 rounded-lg border text-sm transition-colors',
                      priority === opt.value
                        ? `bg-${opt.color}/20 border-${opt.color} text-${opt.color}`
                        : 'bg-bg-primary border-border-default text-text-secondary hover:bg-bg-hover'
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            <button className="w-full py-2 rounded-lg border border-dashed border-border-default text-text-muted text-sm hover:bg-bg-hover hover:text-text-secondary transition-colors">
              🧠 让主 Agent 自动判断类型和优先级
            </button>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={closeModal} className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !title.trim()}
              className="px-4 py-2 rounded-lg text-sm bg-accent hover:bg-blue-600 font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Submit →
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
