import { useEffect, useRef } from 'react'
import { MockSimulator } from '@/mock/simulator'
import { useTaskStore } from '@/stores/task-store'
import { useAgentStore } from '@/stores/agent-store'
import { useActivityStore } from '@/stores/activity-store'
import { useHistoryStore } from '@/stores/history-store'
import {
  SEED_TASKS,
  SEED_SUB_AGENTS,
  SEED_DECISIONS,
  SEED_EVENTS,
  SEED_NOTIFICATIONS,
  SEED_HISTORY,
} from '@/constants/mock-data'

export function useSimulator() {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Seed stores
    const taskStore = useTaskStore.getState()
    SEED_TASKS.forEach((t) => taskStore.addTask(t))

    const agentStore = useAgentStore.getState()
    SEED_SUB_AGENTS.forEach((a) => agentStore.addSubAgent(a))
    SEED_DECISIONS.forEach((d) => agentStore.addDecision(d))

    const activityStore = useActivityStore.getState()
    SEED_EVENTS.forEach((e) => activityStore.addEvent(e))
    SEED_NOTIFICATIONS.forEach((n) => activityStore.addNotification(n))

    const historyStore = useHistoryStore.getState()
    SEED_HISTORY.forEach((h) => historyStore.addEntry(h))

    // Start simulator
    const simulator = new MockSimulator()
    simulator.start()

    return () => simulator.stop()
  }, [])
}
