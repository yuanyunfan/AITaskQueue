import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { KanbanBoard } from '@/components/queue/KanbanBoard'
import { useTaskStore } from '@/stores/task-store'
import { cn } from '@/lib/utils'

// Project color mapping
const PROJECT_COLORS: Record<string, string> = {
  Finance: 'bg-green-500',
  AITaskQueue: 'bg-blue-500',
  VibeLancer: 'bg-purple-500',
  TrendingViz: 'bg-yellow-500',
  Raven: 'bg-red-500',
  StickiesSync: 'bg-cyan-500',
  MacTimer: 'bg-orange-500',
}

export function QueuePage() {
  const tasks = useTaskStore((s) => s.tasks)
  const [selectedProject, setSelectedProject] = useState<string | null>(null) // null = all

  // Extract unique projects from tasks
  const projects = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach((t) => { if (t.project) set.add(t.project) })
    return Array.from(set).sort()
  }, [tasks])

  // Count tasks per project
  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = { __all__: 0, __none__: 0 }
    tasks.forEach((t) => {
      if (!t.parentId) { // only count top-level tasks
        counts.__all__++
        if (t.project) {
          counts[t.project] = (counts[t.project] || 0) + 1
        } else {
          counts.__none__++
        }
      }
    })
    return counts
  }, [tasks])

  return (
    <div className="p-6">
      <PageHeader title="Task Queue" />

      {/* Project Filter Tabs */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedProject(null)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
            selectedProject === null
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary border border-border-default hover:bg-bg-hover'
          )}
        >
          全部 <span className="text-xs opacity-70">({projectCounts.__all__})</span>
        </button>

        {projects.map((p) => (
          <button
            key={p}
            onClick={() => setSelectedProject(p)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5',
              selectedProject === p
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary border border-border-default hover:bg-bg-hover'
            )}
          >
            <span className={`w-2 h-2 rounded-full ${PROJECT_COLORS[p] || 'bg-gray-500'}`} />
            {p} <span className="text-xs opacity-70">({projectCounts[p] || 0})</span>
          </button>
        ))}

        <button
          onClick={() => setSelectedProject('__none__')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5',
            selectedProject === '__none__'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary border border-border-default hover:bg-bg-hover'
          )}
        >
          <span className="w-2 h-2 rounded-full bg-gray-500" />
          独立任务 <span className="text-xs opacity-70">({projectCounts.__none__})</span>
        </button>
      </div>

      <KanbanBoard projectFilter={selectedProject} />
    </div>
  )
}
