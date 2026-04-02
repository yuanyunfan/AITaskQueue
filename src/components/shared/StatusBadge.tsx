import type { TaskStatus } from '@/types'
import { STATUS_COLORS, STATUS_BG_COLORS, STATUS_LABELS } from '@/constants/colors'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: TaskStatus
  showDot?: boolean
  className?: string
}

export function StatusBadge({ status, showDot = true, className }: StatusBadgeProps) {
  return (
    <span className={cn('flex items-center gap-1.5 text-xs', STATUS_COLORS[status], className)}>
      {showDot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            STATUS_BG_COLORS[status],
            status === 'running' && 'animate-pulse-dot'
          )}
        />
      )}
      {STATUS_LABELS[status]}
    </span>
  )
}
