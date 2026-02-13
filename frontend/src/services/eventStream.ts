import type { WsInMessage, WsOutMessage } from './types'

type MessageHandler = (msg: WsInMessage) => void

export class WebSocketService {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnects = 10
  private _connected = false
  private pendingSubscriptions: Set<string> = new Set()

  connect(): void {
    if (this.ws) this.disconnect()

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('[WS] Connected')
      this.reconnectAttempts = 0
      this._connected = true
      // Re-subscribe to any active sessions after reconnect
      for (const sessionId of this.pendingSubscriptions) {
        this.send({ type: 'subscribe', sessionId })
      }
      this.notify({ type: 'session_status', sessionId: '', status: 'ready' } as WsInMessage)
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: WsInMessage = JSON.parse(event.data)
        this.notify(msg)
      } catch {
        console.error('[WS] Failed to parse message:', event.data)
      }
    }

    this.ws.onclose = () => {
      console.log('[WS] Disconnected')
      this._connected = false
      this.ws = null
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._connected = false
    this.reconnectAttempts = 0
    this.pendingSubscriptions.clear()
  }

  send(msg: WsOutMessage): void {
    // Track subscriptions so we can re-subscribe after reconnect
    if (msg.type === 'subscribe' && 'sessionId' in msg) {
      this.pendingSubscriptions.add(msg.sessionId)
    }
    if (msg.type === 'unsubscribe' && 'sessionId' in msg) {
      this.pendingSubscriptions.delete(msg.sessionId)
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  get isConnected(): boolean {
    return this._connected
  }

  private notify(msg: WsInMessage): void {
    for (const handler of this.handlers) {
      try {
        handler(msg)
      } catch (err) {
        console.error('[WS] Handler error:', err)
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnects) {
      console.log('[WS] Max reconnect attempts reached')
      return
    }
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000)
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.reconnectTimeout = setTimeout(() => this.connect(), delay)
  }
}

// Singleton
export const wsService = new WebSocketService()
