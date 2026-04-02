import { describe, it, expect, beforeEach } from 'vitest'
import { useAgentStore } from '@/stores/agent-store'
import type { SubAgent, DecisionLogEntry } from '@/types'

const makeSubAgent = (overrides: Partial<SubAgent> = {}): SubAgent => ({
  id: 'sub-1',
  status: 'idle',
  progress: 0,
  completedCount: 0,
  runningMinutes: 0,
  ...overrides,
})

const makeDecision = (overrides: Partial<DecisionLogEntry> = {}): DecisionLogEntry => ({
  id: 'dec-1',
  timestamp: Date.now(),
  message: 'Test decision',
  ...overrides,
})

describe('agentStore', () => {
  beforeEach(() => {
    useAgentStore.setState({
      mainAgent: {
        status: 'active',
        uptimeSeconds: 0,
        tasksDispatched: 0,
        currentDecision: '',
        model: 'GPT-4o',
        memoryMB: 128,
      },
      subAgents: [],
      decisionLog: [],
    })
  })

  // --- mainAgent ---

  it('updates mainAgent fields', () => {
    useAgentStore.getState().updateMainAgent({ status: 'error', uptimeSeconds: 999 })
    const { mainAgent } = useAgentStore.getState()
    expect(mainAgent.status).toBe('error')
    expect(mainAgent.uptimeSeconds).toBe(999)
    expect(mainAgent.model).toBe('GPT-4o') // unchanged fields preserved
  })

  // --- subAgents ---

  it('adds a sub-agent', () => {
    useAgentStore.getState().addSubAgent(makeSubAgent())
    expect(useAgentStore.getState().subAgents).toHaveLength(1)
    expect(useAgentStore.getState().subAgents[0].id).toBe('sub-1')
  })

  it('updates a sub-agent', () => {
    useAgentStore.getState().addSubAgent(makeSubAgent())
    useAgentStore.getState().updateSubAgent('sub-1', { status: 'active', progress: 50 })
    const agent = useAgentStore.getState().subAgents[0]
    expect(agent.status).toBe('active')
    expect(agent.progress).toBe(50)
  })

  it('removes a sub-agent', () => {
    useAgentStore.getState().addSubAgent(makeSubAgent({ id: 'a' }))
    useAgentStore.getState().addSubAgent(makeSubAgent({ id: 'b' }))
    useAgentStore.getState().removeSubAgent('a')
    expect(useAgentStore.getState().subAgents).toHaveLength(1)
    expect(useAgentStore.getState().subAgents[0].id).toBe('b')
  })

  it('does nothing when removing non-existent sub-agent', () => {
    useAgentStore.getState().addSubAgent(makeSubAgent())
    useAgentStore.getState().removeSubAgent('non-existent')
    expect(useAgentStore.getState().subAgents).toHaveLength(1)
  })

  // --- getIdleSubAgent ---

  it('returns the first idle sub-agent', () => {
    useAgentStore.getState().addSubAgent(makeSubAgent({ id: 'a', status: 'active' }))
    useAgentStore.getState().addSubAgent(makeSubAgent({ id: 'b', status: 'idle' }))
    useAgentStore.getState().addSubAgent(makeSubAgent({ id: 'c', status: 'idle' }))
    expect(useAgentStore.getState().getIdleSubAgent()?.id).toBe('b')
  })

  it('returns undefined when no idle sub-agent exists', () => {
    useAgentStore.getState().addSubAgent(makeSubAgent({ status: 'active' }))
    expect(useAgentStore.getState().getIdleSubAgent()).toBeUndefined()
  })

  // --- decisionLog ---

  it('adds a decision to the log', () => {
    useAgentStore.getState().addDecision(makeDecision({ id: 'd1', message: 'first' }))
    useAgentStore.getState().addDecision(makeDecision({ id: 'd2', message: 'second' }))
    const log = useAgentStore.getState().decisionLog
    expect(log).toHaveLength(2)
    expect(log[0].id).toBe('d2') // newest first
  })

  it('caps decision log at 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      useAgentStore.getState().addDecision(makeDecision({ id: `d-${i}` }))
    }
    expect(useAgentStore.getState().decisionLog).toHaveLength(50)
    // newest entry (d-54) should be first
    expect(useAgentStore.getState().decisionLog[0].id).toBe('d-54')
  })
})
