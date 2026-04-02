import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  className?: string
  barClassName?: string
  showLabel?: boolean
}

export function ProgressBar({ value, className, barClassName, showLabel = true }: ProgressBarProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-1000 ease-in-out bg-status-running', barClassName)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      {showLabel && <span className="text-text-muted text-xs">{Math.round(value)}%</span>}
    </div>
  )
}
