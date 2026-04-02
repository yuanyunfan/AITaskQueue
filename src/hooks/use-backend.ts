/**
 * useBackend — initializes either WebSocket-backed (live) or MockSimulator-backed (mock) mode.
 *
 * Set VITE_BACKEND_MODE=live in .env to connect to the FastAPI backend.
 * Default is 'mock' which runs the original frontend-only experience.
 */

import { useEffect, useRef, useState } from 'react'
import { wsManager, type WsStatus } from '@/lib/ws'
import { initStoreSync } from '@/lib/store-sync'

type BackendMode = 'live' | 'mock'

const BACKEND_MODE: BackendMode =
  (import.meta.env.VITE_BACKEND_MODE as BackendMode) || 'mock'

export function useBackend() {
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected')
  const cleanupRef = useRef<(() => void) | null>(null)
  const mode = BACKEND_MODE

  useEffect(() => {
    if (mode !== 'live') return

    // Connect WebSocket
    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      `ws://${window.location.host}/ws`

    // Register store sync handlers
    cleanupRef.current = initStoreSync(wsManager)

    // Track status
    const unsub = wsManager.onStatusChange(setWsStatus)

    // Connect
    wsManager.connect(wsUrl)

    return () => {
      wsManager.disconnect()
      cleanupRef.current?.()
      unsub()
    }
  }, [mode])

  return { mode, wsStatus }
}
