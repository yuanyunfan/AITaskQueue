/**
 * REST API client for backend communication.
 * Used for mutations (create/update/delete) — state reads come via WebSocket.
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  // 204 No Content — no body to parse
  if (res.status === 204) {
    return undefined as T
  }
  return res.json()
}

// ---- Tasks ----

export interface TaskCreateDTO {
  title: string
  description?: string
  queueType: string
  priority: string
  estimatedMinutes?: number
}

export async function createTask(data: TaskCreateDTO) {
  return request('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTask(id: string, data: Record<string, unknown>) {
  return request(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteTask(id: string) {
  return request(`/tasks/${id}`, { method: 'DELETE' })
}

export async function pauseTask(id: string) {
  return request(`/tasks/${id}/pause`, { method: 'POST' })
}

export async function resumeTask(id: string) {
  return request(`/tasks/${id}/resume`, { method: 'POST' })
}

export async function approveTask(id: string) {
  return request(`/tasks/${id}/approve`, { method: 'POST' })
}

export async function rejectTask(id: string) {
  return request(`/tasks/${id}/reject`, { method: 'POST' })
}

export async function reorderTasks(queueType: string, taskIds: string[]) {
  return request('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ queueType, taskIds }),
  })
}

// ---- Chat ----

export async function sendChatMessage(content: string) {
  return request('/chat/messages', {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function listChatMessages() {
  return request<Array<Record<string, unknown>>>('/chat/messages')
}

// ---- Health ----

export async function checkHealth() {
  return request<{ status: string }>('/health')
}
