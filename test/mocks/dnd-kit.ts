/**
 * Mock for @dnd-kit/sortable — TaskCard depends on useSortable.
 */
import { vi } from 'vitest'

export const useSortable = vi.fn(() => ({
  attributes: {},
  listeners: {},
  setNodeRef: vi.fn(),
  transform: null,
  transition: null,
  isDragging: false,
}))

export const SortableContext = ({ children }: { children: React.ReactNode }) => children
export const verticalListSortingStrategy = {}
export const arrayMove = vi.fn((arr: unknown[], from: number, to: number) => {
  const result = [...arr]
  const [removed] = result.splice(from, 1)
  result.splice(to, 0, removed)
  return result
})
