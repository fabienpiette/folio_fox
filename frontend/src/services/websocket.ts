import { useAuthStore } from '@/stores/auth'

export class WebSocketService {
  private socket: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private listeners = new Map<string, Set<(data: unknown) => void>>()
  private pingInterval: NodeJS.Timeout | null = null

  constructor() {
    this.connect()
  }

  private connect() {
    const token = useAuthStore.getState().token
    if (!token) {
      console.warn('Cannot connect to WebSocket: No authentication token')
      return
    }

    try {
      // Use the correct WebSocket URL - let Vite proxy handle the connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/v1/ws`
      
      this.socket = new WebSocket(wsUrl)
      this.setupEventHandlers()
    } catch (error) {
      console.error('WebSocket connection error:', error)
      this.scheduleReconnect()
    }
  }

  private setupEventHandlers() {
    if (!this.socket) return

    this.socket.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
      this.emit('connected', { connected: true })
      
      // Send authentication token
      const token = useAuthStore.getState().token
      if (token) {
        this.send('auth', { token })
      }
      
      // Start ping interval to keep connection alive
      this.startPingInterval()
    }

    this.socket.onclose = (event) => {
      console.log('WebSocket disconnected:', event.reason)
      this.emit('disconnected', { connected: false, reason: event.reason })
      this.stopPingInterval()
      
      // Try to reconnect unless it was a normal closure
      if (event.code !== 1000) {
        this.scheduleReconnect()
      }
    }

    this.socket.onerror = (error) => {
      console.error('WebSocket connection error:', error)
      this.scheduleReconnect()
    }

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        const { type, data } = message
        
        // Handle special message types
        if (type === 'authenticated') {
          console.log('WebSocket authenticated:', data)
          this.emit('authenticated', data)
        } else if (type === 'auth_error') {
          console.error('WebSocket authentication failed:', data)
          useAuthStore.getState().logout()
        } else if (type === 'pong') {
          // Handle pong response - connection is alive
        } else {
          // Emit regular messages
          this.emit(type, data)
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }
  }
  
  private startPingInterval() {
    this.stopPingInterval()
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send('ping', { timestamp: Date.now() })
      }
    }, 30000) // Ping every 30 seconds
  }
  
  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max WebSocket reconnection attempts reached')
      return
    }

    setTimeout(() => {
      this.reconnectAttempts++
      console.log(`Attempting WebSocket reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      this.connect()
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts))
  }

  public subscribe(channel: string, callback: (data: unknown) => void) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set())
    }
    this.listeners.get(channel)!.add(callback)

    // Subscribe to the channel on the server
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send('subscribe', { channel })
    }

    // Return unsubscribe function
    return () => {
      const channelListeners = this.listeners.get(channel)
      if (channelListeners) {
        channelListeners.delete(callback)
        if (channelListeners.size === 0) {
          this.listeners.delete(channel)
          // Unsubscribe from the channel on the server
          if (this.socket?.readyState === WebSocket.OPEN) {
            this.send('unsubscribe', { channel })
          }
        }
      }
    }
  }

  public unsubscribe(channel: string) {
    this.listeners.delete(channel)
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send('unsubscribe', { channel })
    }
  }

  private emit(eventName: string, data: unknown) {
    const listeners = this.listeners.get(eventName)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error handling WebSocket event ${eventName}:`, error)
        }
      })
    }
  }

  public send(eventName: string, data: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type: eventName, data })
      this.socket.send(message)
    } else {
      console.warn('Cannot send WebSocket message: Not connected')
    }
  }

  public disconnect() {
    this.stopPingInterval()
    if (this.socket) {
      this.socket.close(1000, 'Client disconnect')
      this.socket = null
    }
    this.listeners.clear()
    this.reconnectAttempts = 0
  }

  public get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  public get connectionId(): string | null {
    // Standard WebSocket doesn't have a built-in ID, we could generate one if needed
    return this.socket ? `ws_${Date.now()}` : null
  }
}

// Singleton instance
let wsService: WebSocketService | null = null

export function getWebSocketService(): WebSocketService {
  if (!wsService) {
    wsService = new WebSocketService()
  }
  return wsService
}

export function destroyWebSocketService() {
  if (wsService) {
    wsService.disconnect()
    wsService = null
  }
}