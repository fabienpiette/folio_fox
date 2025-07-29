/**
 * WebSocket mock utilities for testing real-time functionality
 */

import { vi } from 'vitest'
import { WebSocketMessageType } from '@/types'

export class MockWebSocketServer {
  private clients: Set<MockWebSocket> = new Set()
  private messageHandlers: Map<string, (message: any) => void> = new Map()

  // Simulate server sending a message to all connected clients
  broadcast(message: WebSocketMessageType) {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        const event = new MessageEvent('message', {
          data: JSON.stringify(message)
        })
        client.dispatchEvent(event)
      }
    })
  }

  // Send message to specific client
  sendTo(clientId: string, message: WebSocketMessageType) {
    this.clients.forEach(client => {
      if (client.id === clientId && client.readyState === WebSocket.OPEN) {
        const event = new MessageEvent('message', {
          data: JSON.stringify(message)
        })
        client.dispatchEvent(event)
      }
    })
  }

  // Add a client connection
  addClient(client: MockWebSocket) {
    this.clients.add(client)
  }

  // Remove a client connection
  removeClient(client: MockWebSocket) {
    this.clients.delete(client)
  }

  // Get connected clients count
  getClientCount(): number {
    return this.clients.size
  }

  // Clean up all connections
  cleanup() {
    this.clients.forEach(client => {
      client.close()
    })
    this.clients.clear()
    this.messageHandlers.clear()
  }
}

export class MockWebSocket extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  public readyState = MockWebSocket.CONNECTING
  public id: string
  private server: MockWebSocketServer

  constructor(public url: string, server?: MockWebSocketServer) {
    super()
    this.id = Math.random().toString(36).substr(2, 9)
    this.server = server || mockWebSocketServer
    
    // Simulate connection establishment
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.server.addClient(this)
      this.dispatchEvent(new Event('open'))
    }, 10)
  }

  send = vi.fn((data: string) => {
    if (this.readyState === MockWebSocket.OPEN) {
      try {
        const message = JSON.parse(data)
        // Simulate server processing
        this.handleClientMessage(message)
      } catch (e) {
        console.warn('Invalid JSON message sent to WebSocket:', data)
      }
    } else {
      throw new Error('WebSocket is not open')
    }
  })

  close = vi.fn((code?: number, reason?: string) => {
    if (this.readyState === MockWebSocket.OPEN) {
      this.readyState = MockWebSocket.CLOSING
      setTimeout(() => {
        this.readyState = MockWebSocket.CLOSED
        this.server.removeClient(this)
        this.dispatchEvent(new CloseEvent('close', {
          code: code || 1000,
          reason: reason || 'Normal closure'
        }))
      }, 10)
    }
  })

  private handleClientMessage(message: any) {
    // Handle common WebSocket messages
    switch (message.type) {
      case 'authenticate':
        // Simulate successful authentication
        setTimeout(() => {
          this.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'authenticated',
              timestamp: new Date().toISOString(),
              data: {
                user_id: 1,
                username: 'testuser',
                permissions: ['read', 'write'],
                expires_at: new Date(Date.now() + 3600000).toISOString()
              }
            })
          }))
        }, 5)
        break

      case 'subscribe':
        // Acknowledge subscription
        setTimeout(() => {
          this.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'subscribed',
              timestamp: new Date().toISOString(),
              data: {
                channel: message.channel,
                success: true
              }
            })
          }))
        }, 5)
        break

      case 'heartbeat':
        // Respond to heartbeat
        setTimeout(() => {
          this.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString(),
              data: { pong: true }
            })
          }))
        }, 5)
        break
    }
  }
}

// Global mock server instance
export const mockWebSocketServer = new MockWebSocketServer()

// Helper functions for testing WebSocket events
export const simulateDownloadProgress = (downloadId: number, progress: number) => {
  mockWebSocketServer.broadcast({
    type: 'download_progress_update',
    timestamp: new Date().toISOString(),
    data: {
      download_id: downloadId,
      progress_percentage: progress,
      bytes_downloaded: Math.floor(progress * 1000000 / 100),
      download_speed_kbps: 500 + Math.random() * 1000,
      eta_seconds: progress < 100 ? Math.floor((100 - progress) * 60 / 100) : null,
      status: progress < 100 ? 'downloading' : 'completed'
    }
  })
}

export const simulateDownloadComplete = (downloadId: number) => {
  mockWebSocketServer.broadcast({
    type: 'download_completed',
    timestamp: new Date().toISOString(),
    data: {
      download_id: downloadId,
      file_path: `/downloads/completed/book-${downloadId}.epub`,
      file_size_bytes: 2048576,
      download_duration_seconds: 180,
      average_speed_kbps: 750,
      book_id: Math.floor(Math.random() * 1000) + 1
    }
  })
}

export const simulateDownloadFailed = (downloadId: number, error: string) => {
  mockWebSocketServer.broadcast({
    type: 'download_failed',
    timestamp: new Date().toISOString(),
    data: {
      download_id: downloadId,
      error_message: error,
      retry_count: 1,
      will_retry: true,
      next_retry_at: new Date(Date.now() + 300000).toISOString()
    }
  })
}

export const simulateSearchResults = (searchId: string, results: any[]) => {
  mockWebSocketServer.broadcast({
    type: 'search_results_stream',
    timestamp: new Date().toISOString(),
    data: {
      search_id: searchId,
      indexer_id: 1,
      indexer_name: 'Test Indexer',
      results
    }
  })
}

export const simulateSystemAlert = (level: 'info' | 'warning' | 'error' | 'critical', message: string) => {
  mockWebSocketServer.broadcast({
    type: 'system_alert',
    timestamp: new Date().toISOString(),
    data: {
      level,
      title: `System ${level.toUpperCase()}`,
      message,
      component: 'test',
      action_required: level === 'critical',
      auto_dismiss_seconds: level === 'info' ? 5 : undefined
    }
  })
}

// Mock the global WebSocket constructor
export const mockWebSocket = () => {
  global.WebSocket = MockWebSocket as any
  return mockWebSocketServer
}

// Clean up function for tests
export const cleanupWebSocketMocks = () => {
  mockWebSocketServer.cleanup()
}