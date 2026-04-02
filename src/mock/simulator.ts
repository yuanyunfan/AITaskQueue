import { useTaskStore } from '@/stores/task-store'
import { useAgentStore } from '@/stores/agent-store'
import { useAgentLogStore } from '@/stores/agent-log-store'
import { useActivityStore } from '@/stores/activity-store'
import { useHistoryStore } from '@/stores/history-store'
import { generateId } from '@/lib/utils'

const RANDOM_TASK_NAMES = [
  '同步 Notion 笔记',
  '更新依赖版本',
  '清理 Docker 镜像',
  '检查 SSL 证书',
  '生成 API 测试报告',
  '抓取竞品价格数据',
  '整理会议纪要',
]

const RANDOM_TOOLS = ['Read', 'Write', 'Bash', 'Grep', 'Glob', 'Edit']

export class MockSimulator {
  private intervals: ReturnType<typeof setInterval>[] = []

  start() {
    // Tick progress every 2s
    this.intervals.push(
      setInterval(() => {
        const { tasks, updateTask } = useTaskStore.getState()
        tasks.forEach((t) => {
          if (t.status === 'running' && t.progress < 100) {
            const increment = Math.floor(Math.random() * 5) + 1
            const newProgress = Math.min(t.progress + increment, 100)
            updateTask(t.id, { progress: newProgress })

            // Sync sub-agent progress
            if (t.assignedAgent) {
              useAgentStore.getState().updateSubAgent(t.assignedAgent, {
                progress: newProgress,
              })

              // Generate a mock agent log entry
              const isToolUse = Math.random() > 0.4
              const toolName = RANDOM_TOOLS[Math.floor(Math.random() * RANDOM_TOOLS.length)]
              useAgentLogStore.getState().addLog({
                id: generateId(),
                agentId: t.assignedAgent,
                taskId: t.id,
                eventType: isToolUse ? 'tool_use' : 'text',
                message: isToolUse
                  ? `Calling tool: ${toolName}`
                  : '正在分析代码结构...',
                toolName: isToolUse ? toolName : null,
                progressPct: newProgress,
                costUsd: null,
                metadata: null,
                timestamp: Date.now(),
              })
            }
          }
        })
      }, 2000)
    )

    // Check completion every 5s
    this.intervals.push(
      setInterval(() => {
        const { tasks, updateTask } = useTaskStore.getState()
        tasks.forEach((t) => {
          if (t.status === 'running' && t.progress >= 100) {
            if (t.queueType === 'auto') {
              updateTask(t.id, { status: 'done', completedAt: Date.now() })
              useHistoryStore.getState().addFromTask({ ...t, status: 'done', completedAt: Date.now() })
              useActivityStore.getState().addEvent({
                id: generateId(),
                timestamp: Date.now(),
                type: 'done',
                message: `✅ "${t.title}" 执行完成`,
              })
            } else if (t.queueType === 'semi') {
              updateTask(t.id, { status: 'review' })
              useActivityStore.getState().addEvent({
                id: generateId(),
                timestamp: Date.now(),
                type: 'review',
                message: `"${t.title}" 完成，进入验收队列`,
              })
              useActivityStore.getState().addNotification({
                id: generateId(),
                timestamp: Date.now(),
                message: `"${t.title}" 等待验收`,
                read: false,
                taskId: t.id,
              })
            }

            // Free the sub-agent
            if (t.assignedAgent) {
              useAgentStore.getState().updateSubAgent(t.assignedAgent, {
                status: 'idle',
                currentTaskId: undefined,
                currentTaskTitle: undefined,
                progress: 0,
              })
            }
          }
        })
      }, 5000)
    )

    // Main agent dispatches every 8s
    this.intervals.push(
      setInterval(() => {
        const { tasks, updateTask } = useTaskStore.getState()
        const agentState = useAgentStore.getState()
        const idleAgent = agentState.getIdleSubAgent()
        const queuedTask = tasks.find((t) => t.status === 'queued')

        if (idleAgent && queuedTask) {
          updateTask(queuedTask.id, {
            status: 'running',
            assignedAgent: idleAgent.id,
            startedAt: Date.now(),
          })
          agentState.updateSubAgent(idleAgent.id, {
            status: 'active',
            currentTaskId: queuedTask.id,
            currentTaskTitle: queuedTask.title,
            progress: 0,
          })
          agentState.addDecision({
            id: generateId(),
            timestamp: Date.now(),
            message: `将 "${queuedTask.title}" 分配给 ${idleAgent.id}`,
          })
          useActivityStore.getState().addEvent({
            id: generateId(),
            timestamp: Date.now(),
            type: 'dispatch',
            message: `主 Agent 将 "${queuedTask.title}" 分配给 ${idleAgent.id}`,
          })
          agentState.updateMainAgent({
            tasksDispatched: agentState.mainAgent.tasksDispatched + 1,
          })
        }
      }, 8000)
    )

    // Random chaos every 15s
    this.intervals.push(
      setInterval(() => {
        const roll = Math.random()
        if (roll < 0.4) {
          // Add a new task
          const name = RANDOM_TASK_NAMES[Math.floor(Math.random() * RANDOM_TASK_NAMES.length)]
          const queueTypes = ['auto', 'semi'] as const
          const priorities = ['p1', 'p2', 'p3'] as const
          const newTask = {
            id: generateId(),
            title: name,
            status: 'queued' as const,
            queueType: queueTypes[Math.floor(Math.random() * queueTypes.length)],
            priority: priorities[Math.floor(Math.random() * priorities.length)],
            progress: 0,
            createdAt: Date.now(),
            estimatedMinutes: Math.floor(Math.random() * 10) + 2,
          }
          useTaskStore.getState().addTask(newTask)
          useActivityStore.getState().addEvent({
            id: generateId(),
            timestamp: Date.now(),
            type: 'info',
            message: `新任务入队: "${name}"`,
          })
          useAgentStore.getState().addDecision({
            id: generateId(),
            timestamp: Date.now(),
            message: `接收新任务 "${name}" → 分类: ${newTask.queueType === 'auto' ? '全自动' : '半自动'}, 优先级: ${newTask.priority.toUpperCase()}`,
          })
        }
      }, 15000)
    )

    // Uptime counter every 1s
    this.intervals.push(
      setInterval(() => {
        const { mainAgent, updateMainAgent } = useAgentStore.getState()
        updateMainAgent({ uptimeSeconds: mainAgent.uptimeSeconds + 1 })
      }, 1000)
    )
  }

  stop() {
    this.intervals.forEach(clearInterval)
    this.intervals = []
  }
}
