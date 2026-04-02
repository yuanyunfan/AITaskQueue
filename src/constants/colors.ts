import type { TaskStatus, QueueType, Priority } from '@/types'

export const STATUS_COLORS: Record<TaskStatus, string> = {
  blocked: 'text-text-muted',
  running: 'text-status-running',
  queued: 'text-status-queued',
  failed: 'text-status-failed',
  paused: 'text-status-paused',
  done: 'text-status-done',
  review: 'text-status-review',
}

export const STATUS_BG_COLORS: Record<TaskStatus, string> = {
  blocked: 'bg-text-muted',
  running: 'bg-status-running',
  queued: 'bg-status-queued',
  failed: 'bg-status-failed',
  paused: 'bg-status-paused',
  done: 'bg-status-done',
  review: 'bg-status-review',
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  blocked: 'Blocked',
  running: 'Running',
  queued: 'Queued',
  failed: 'Failed',
  paused: '暂停',
  done: 'Done',
  review: '等待验收',
}

export const QUEUE_COLORS: Record<QueueType, string> = {
  auto: 'text-queue-auto',
  semi: 'text-queue-semi',
  human: 'text-queue-human',
}

export const QUEUE_DOT_COLORS: Record<QueueType, string> = {
  auto: 'bg-queue-auto',
  semi: 'bg-queue-semi',
  human: 'bg-queue-human',
}

export const QUEUE_LABELS: Record<QueueType, string> = {
  auto: '全自动',
  semi: '半自动',
  human: '人在loop',
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  p0: 'text-priority-p0',
  p1: 'text-priority-p1',
  p2: 'text-priority-p2',
  p3: 'text-priority-p3',
}

export const PRIORITY_BG_COLORS: Record<Priority, string> = {
  p0: 'bg-priority-p0/20',
  p1: 'bg-priority-p1/20',
  p2: 'bg-priority-p2/20',
  p3: 'bg-priority-p3/20',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  p0: 'P0',
  p1: 'P1',
  p2: 'P2',
  p3: 'P3',
}
