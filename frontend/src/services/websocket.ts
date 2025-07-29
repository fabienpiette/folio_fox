import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/auth'

export class WebSocketService {
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private listeners = new Map<string, Set<(data: any) => void>>()

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
      this.socket = io({
        path: '/ws',
        transports: ['websocket'],
        auth: {
          token,
        },
        autoConnect: true,
      })

      this.setupEventHandlers()
    } catch (error) {
      console.error('WebSocket connection error:', error)
      this.scheduleReconnect()
    }
  }

  private setupEventHandlers() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
      this.emit('connected', { connected: true })
    })

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason)
      this.emit('disconnected', { connected: false, reason })
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        this.scheduleReconnect()
      }
    })

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error)
      this.scheduleReconnect()
    })

    // Handle authentication
    this.socket.on('authenticated', (data) => {
      console.log('WebSocket authenticated:', data)
      this.emit('authenticated', data)
    })

    this.socket.on('auth_error', (error) => {
      console.error('WebSocket authentication failed:', error)
      useAuthStore.getState().logout()
    })

    // Handle all message types
    this.socket.onAny((eventName: string, data: any) => {
      this.emit(eventName, data)
    })
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

  public subscribe(channel: string, callback: (data: any) => void) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set())
    }
    this.listeners.get(channel)!.add(callback)

    // Subscribe to the channel on the server
    if (this.socket?.connected) {
      this.socket.emit('subscribe', { channel })
    }

    // Return unsubscribe function
    return () => {
      const channelListeners = this.listeners.get(channel)
      if (channelListeners) {
        channelListeners.delete(callback)
        if (channelListeners.size === 0) {
          this.listeners.delete(channel)
          // Unsubscribe from the channel on the server
          if (this.socket?.connected) {
            this.socket.emit('unsubscribe', { channel })
          }
        }
      }
    }
  }

  public unsubscribe(channel: string) {
    this.listeners.delete(channel)
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe', { channel })
    }
  }

  private emit(eventName: string, data: any) {
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

  public send(eventName: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(eventName, data)
    } else {
      console.warn('Cannot send WebSocket message: Not connected')
    }
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.listeners.clear()
    this.reconnectAttempts = 0
  }

  public get connected(): boolean {
    return this.socket?.connected ?? false
  }

  public get connectionId(): string | null {
    return this.socket?.id ?? null
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