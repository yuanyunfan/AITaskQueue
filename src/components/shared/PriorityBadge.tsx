import type { Priority } from '@/types'
import { PRIORITY_COLORS, PRIORITY_BG_COLORS, PRIORITY_LABELS } from '@/constants/colors'
import { cn } from '@/lib/utils'

interface PriorityBadgeProps {
  priority: Priority
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 rounded text-[10px] font-medium',
        PRIORITY_BG_COLORS[priority],
        PRIORITY_COLORS[priority],
        className
      )}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  )
}
