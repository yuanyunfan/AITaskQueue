/**
 * WebSocket connection manager with auto-reconnect.
 * Singleton instance — import { wsManager } from '@/lib/ws'
 */

type MessageHandler = (payload: Record<string, unknown>) => void

export type WsStatus = 'connecting' | 'connected' | 'disconnected'

export class WebSocketManager {
  private ws: WebSocket | null = null
  private url = ''
  private handlers = new Map<string, Set<MessageHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _status: WsStatus = 'disconnected'
  private _statusListeners = new Set<(status: WsStatus) => void>()

  get status() {
    return this._status
  }

  private setStatus(s: WsStatus) {
    this._status = s
    this._statusListeners.forEach((fn) => fn(s))
  }

  onStatusChange(fn: (status: WsStatus) => void) {
    this._statusListeners.add(fn)
    return () => this._statusListeners.delete(fn)
  }

  connect(url: string) {
    this.url = url
    this._connect()
  }

  disconnect() {
    this._cleanup()
    this.setStatus('disconnected')
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    }
  }

  onMessage(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
  }

  offMessage(type: string, handler: MessageHandler) {
    this.handlers.get(type)?.delete(handler)
  }

  // --- internal ---

  private _connect() {
    this._cleanup()
    this.setStatus('connecting')

    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.setStatus('connected')
      this.reconnectDelay = 1000 // reset backoff
      this._startHeartbeat()
    }

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        const type: string = data.type
        const payload = data.payload ?? data

        const handlers = this.handlers.get(type)
        if (handlers) {
          handlers.forEach((fn) => fn(payload))
        }
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.setStatus('disconnected')
      this._stopHeartbeat()
      this._scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror
    }
  }

  private _cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this._stopHeartbeat()
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }
      this.ws = null
    }
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      this._connect()
    }, this.reconnectDelay)
  }

  private _startHeartbeat() {
    this._stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.send('ping')
    }, 30000)
  }

  private _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

export const wsManager = new WebSocketManager()
